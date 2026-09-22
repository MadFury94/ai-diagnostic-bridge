<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Diagnostic_Manager;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Post_Analysis;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Image_Issues;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Link_Issues;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\SEO_Collections;
use WP_REST_Request;
use WP_REST_Server;

final class REST_API {
	/** @var \WeakMap<WP_REST_Request, array>|null */
	private static ?\WeakMap $requests = null;

	public static function register(): void {
		add_filter( 'rest_request_before_callbacks', [ self::class, 'start_activity' ], 10, 3 );
		add_filter( 'rest_request_after_callbacks', [ self::class, 'finish_activity' ], 10, 3 );
		$routes = [
			'site'    => [ 'callback' => [ self::class, 'site' ] ],
			'health'  => [ 'callback' => [ self::class, 'health' ] ],
			'plugins' => [ 'callback' => [ self::class, 'plugins' ] ],
			'themes'  => [ 'callback' => [ self::class, 'themes' ] ],
			'errors'  => [ 'callback' => [ self::class, 'errors' ] ],
			'rest-api' => [ 'callback' => [ self::class, 'rest_api' ] ],
			'performance' => [ 'callback' => [ self::class, 'performance' ] ],
			'security' => [ 'callback' => [ self::class, 'security' ] ],
			'woocommerce' => [ 'callback' => [ self::class, 'woocommerce' ] ],
		];

		foreach ( $routes as $route => $args ) {
			register_rest_route( 'ai-diagnostic/v1', '/' . $route, [
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => $args['callback'],
				'permission_callback' => [ self::class, 'permission' ],
				'aidb_endpoint'       => $route,
			] );
		}

		register_rest_route( 'ai-diagnostic/v1', '/seo/post/(?P<id>\\d+)', [
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => [ self::class, 'seo_post' ],
			'permission_callback' => [ self::class, 'permission' ],
			'aidb_endpoint'       => 'seo/post',
			'args'                => [
				'id' => [
					'required' => true,
					'validate_callback' => static fn ( $value ): bool => is_numeric( $value ) && (int) $value > 0,
				],
			],
		] );
		register_rest_route( 'ai-diagnostic/v1', '/images/issues', [
			'methods' => WP_REST_Server::READABLE,
			'callback' => [ self::class, 'image_issues' ],
			'permission_callback' => [ self::class, 'permission' ],
			'aidb_endpoint' => 'images/issues',
			'args' => [
				'page' => [ 'default' => 1, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 1000 ],
				'per_page' => [ 'default' => 20, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 50 ],
			],
		] );
		register_rest_route( 'ai-diagnostic/v1', '/links/issues', [
			'methods' => WP_REST_Server::READABLE,
			'callback' => [ self::class, 'link_issues' ],
			'permission_callback' => [ self::class, 'permission' ],
			'aidb_endpoint' => 'links/issues',
			'args' => [
				'page' => [ 'default' => 1, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 1000 ],
				'per_page' => [ 'default' => 20, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 50 ],
			],
		] );
		foreach ( ['seo/posts' => 'seo_posts', 'seo/issues' => 'seo_issues'] as $route => $callback ) {
			register_rest_route( 'ai-diagnostic/v1', '/' . $route, [
				'methods' => WP_REST_Server::READABLE,
				'callback' => [ self::class, $callback ],
				'permission_callback' => [ self::class, 'permission' ],
				'aidb_endpoint' => $route,
				'args' => [
					'page' => [ 'default' => 1, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 1000 ],
					'per_page' => [ 'default' => 20, 'validate_callback' => static fn ($value): bool => is_numeric($value) && (int) $value >= 1 && (int) $value <= 50 ],
				],
			] );
		}
		register_rest_route( 'ai-diagnostic/v1', '/seo/site', [ 'methods' => WP_REST_Server::READABLE, 'callback' => [ self::class, 'seo_site' ], 'permission_callback' => [ self::class, 'permission' ], 'aidb_endpoint' => 'seo/site' ] );

		register_rest_route( 'ai-diagnostic/v1', '/diagnostic', [
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ self::class, 'diagnostic_get' ],
				'aidb_endpoint'       => 'diagnostic',
				'permission_callback' => [ self::class, 'permission' ],
			],
			[
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => [ self::class, 'diagnostic_post' ],
				'aidb_endpoint'       => 'diagnostic',
				'permission_callback' => [ self::class, 'permission' ],
			],
		] );
	}

	public static function permission( WP_REST_Request $request ) {
		$authenticated = Auth::authenticate( $request );
		if ( isset( self::$requests[ $request ] ) ) {
			$context = self::$requests[ $request ];
			$context['authenticated'] = $authenticated;
			self::$requests[ $request ] = $context;
		}

		if ( $authenticated ) {
			return true;
		}

		return Response::error( 'unauthorized', 'Authentication required.', 401 );
	}

	public static function start_activity( $response, array $handler, WP_REST_Request $request ) {
		if ( ( $handler['permission_callback'] ?? null ) === [ self::class, 'permission' ] && isset( $handler['aidb_endpoint'] ) ) {
			self::$requests ??= new \WeakMap();
			self::$requests[ $request ] = [
				'endpoint' => $handler['aidb_endpoint'],
				'started' => hrtime( true ),
				'authenticated' => false,
			];
		}
		return $response;
	}

	public static function finish_activity( $response, array $handler, WP_REST_Request $request ) {
		if ( ! isset( self::$requests[ $request ] ) ) {
			return $response;
		}
		$context = self::$requests[ $request ];
		unset( self::$requests[ $request ] );
		$normalized = rest_ensure_response( $response );
		$success = ! is_wp_error( $normalized );
		if ( $success ) {
			$data = $normalized->get_data();
			$success = $normalized->get_status() < 400 && ( ! is_array( $data ) || ( $data['success'] ?? true ) !== false );
		}
		Activity_Log::record(
			$context['endpoint'],
			$success,
			(int) round( ( hrtime( true ) - $context['started'] ) / 1000000 ),
			$context['authenticated']
		);
		return $response;
	}

	public static function site(): array { return Diagnostic_Manager::run( [ 'site' ] )['checks']['site']; }
	public static function health(): array { return Diagnostic_Manager::run( [ 'health' ] )['checks']['health']; }
	public static function plugins(): array { return Diagnostic_Manager::run( [ 'plugins' ] )['checks']['plugins']; }
	public static function themes(): array { return Diagnostic_Manager::run( [ 'themes' ] )['checks']['themes']; }
	public static function errors(): array { return Diagnostic_Manager::run( [ 'errors' ] )['checks']['errors']; }
	public static function rest_api(): array { return Diagnostic_Manager::run( [ 'rest-api' ] )['checks']['rest-api']; }
	public static function performance(): array { return Diagnostic_Manager::run( [ 'performance' ] )['checks']['performance']; }
	public static function security(): array { return Diagnostic_Manager::run( [ 'security' ] )['checks']['security']; }
	public static function woocommerce(): array { return Diagnostic_Manager::run( [ 'woocommerce' ] )['checks']['woocommerce']; }
	public static function seo_post( WP_REST_Request $request ): array {
		return Post_Analysis::run( (int) $request['id'] );
	}
	public static function image_issues( WP_REST_Request $request ): array|\WP_Error {
		return Image_Issues::run( (int) $request->get_param('page'), (int) $request->get_param('per_page') );
	}
	public static function link_issues( WP_REST_Request $request ): array|\WP_Error {
		return Link_Issues::run( (int) $request->get_param('page'), (int) $request->get_param('per_page') );
	}
	public static function seo_posts( WP_REST_Request $request ): array|\WP_Error { return SEO_Collections::posts((int) $request->get_param('page'), (int) $request->get_param('per_page')); }
	public static function seo_issues( WP_REST_Request $request ): array|\WP_Error { return SEO_Collections::issues((int) $request->get_param('page'), (int) $request->get_param('per_page')); }
	public static function seo_site(): array { return SEO_Collections::site(); }

	public static function diagnostic_get( WP_REST_Request $request ): array|\WP_Error {
		$checks = $request->has_param( 'checks' ) ? $request->get_param( 'checks' ) : [];
		return self::run_checks( $checks );
	}

	public static function diagnostic_post( WP_REST_Request $request ): array|\WP_Error {
		if ( $request->is_json_content_type() && '' !== $request->get_body() ) {
			$body = json_decode( $request->get_body() );
			if ( ! $body instanceof \stdClass ) {
				return Response::error( 'invalid_body', 'The JSON body must be an object.', 400 );
			}
			if ( property_exists( $body, 'checks' ) ) {
				return self::run_checks( $body->checks );
			}
		}
		return self::diagnostic_get( $request );
	}

	private static function run_checks( $checks ): array|\WP_Error {
		if ( is_string( $checks ) ) {
			if ( strlen( $checks ) > 1024 ) {
				return Response::error( 'invalid_checks', 'Checks exceeds the supported input limit.', 400 );
			}
			$checks = explode( ',', $checks );
		}
		if ( ! is_array( $checks ) ) {
			return Response::error( 'invalid_checks', 'Checks must be a list or a comma-separated string of supported check IDs.', 400 );
		}
		return Diagnostic_Manager::run( $checks );
	}
}
