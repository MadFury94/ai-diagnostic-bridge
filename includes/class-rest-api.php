<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Diagnostic_Manager;
use WP_REST_Request;
use WP_REST_Server;

final class REST_API {
	public static function register(): void {
		$routes = [
			'site'    => [ 'callback' => [ self::class, 'site' ] ],
			'health'  => [ 'callback' => [ self::class, 'health' ] ],
			'plugins' => [ 'callback' => [ self::class, 'plugins' ] ],
			'themes'  => [ 'callback' => [ self::class, 'themes' ] ],
		];

		foreach ( $routes as $route => $args ) {
			register_rest_route( 'ai-diagnostic/v1', '/' . $route, [
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => $args['callback'],
				'permission_callback' => [ self::class, 'permission' ],
			] );
		}

		register_rest_route( 'ai-diagnostic/v1', '/diagnostic', [
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ self::class, 'diagnostic_get' ],
				'permission_callback' => [ self::class, 'permission' ],
			],
			[
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => [ self::class, 'diagnostic_post' ],
				'permission_callback' => [ self::class, 'permission' ],
			],
		] );
	}

	public static function permission( WP_REST_Request $request ) {
		if ( Auth::authenticate( $request ) ) {
			return true;
		}

		return Response::error( 'unauthorized', 'Authentication required.', 401 );
	}

	public static function site(): array { return Diagnostic_Manager::run( [ 'site' ] )['checks']['site']; }
	public static function health(): array { return Diagnostic_Manager::run( [ 'health' ] )['checks']['health']; }
	public static function plugins(): array { return Diagnostic_Manager::run( [ 'plugins' ] )['checks']['plugins']; }
	public static function themes(): array { return Diagnostic_Manager::run( [ 'themes' ] )['checks']['themes']; }

	public static function diagnostic_get( WP_REST_Request $request ): array {
		$checks = $request->get_param( 'checks' );
		return Diagnostic_Manager::run( self::normalize_checks( $checks ) );
	}

	public static function diagnostic_post( WP_REST_Request $request ): array {
		$body   = $request->get_json_params();
		$checks = is_array( $body ) && array_key_exists( 'checks', $body ) ? $body['checks'] : $request->get_param( 'checks' );
		return Diagnostic_Manager::run( self::normalize_checks( $checks ) );
	}

	private static function normalize_checks( $checks ): array {
		if ( is_string( $checks ) ) {
			$checks = explode( ',', $checks );
		}

		return is_array( $checks ) ? array_slice( array_map( 'sanitize_key', $checks ), 0, 20 ) : [];
	}
}
