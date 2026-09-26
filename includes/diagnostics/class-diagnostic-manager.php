<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Diagnostic_Manager {
	/** @var array<string, callable> */
	private const CHECKS = [
		'site'    => [ Site_Health::class, 'run' ],
		'health'  => [ self::class, 'health' ],
        'core-updates' => [ Core_Updates::class, 'run' ],
		'plugins' => [ Plugins::class, 'run' ],
		'themes'  => [ Themes::class, 'run' ],
		'errors'  => [ PHP_Errors::class, 'run' ],
		'rest-api' => [ REST_API_Check::class, 'run' ],
		'performance' => [ Performance::class, 'run' ],
		'security' => [ Security::class, 'run' ],
		'woocommerce' => [ WooCommerce::class, 'run' ],
	];

	public static function available_checks(): array {
		return array_keys( self::CHECKS );
	}

	public static function health(): array {
		return Site_Health::run( 'health' );
	}

	public static function run( array $checks ): array|\WP_Error {
		if ( ! array_is_list( $checks ) || count( $checks ) > 20 ) {
			return Response::error( 'invalid_checks', 'Checks must be a list of at most 20 supported check IDs.', 400 );
		}
		foreach ( $checks as $check ) {
			if ( ! is_string( $check ) || ! in_array( $check, self::available_checks(), true ) ) {
				return Response::error( 'invalid_checks', 'One or more requested diagnostic checks are not available.', 400 );
			}
		}
		$requested = array_values( array_unique( $checks ) );
		$unknown   = array_values( array_diff( $requested, self::available_checks() ) );
		if ( empty( $requested ) ) {
			$requested = [ 'site' ];
		}

		if ( ! empty( $unknown ) ) {
			return Response::error( 'invalid_checks', 'One or more requested diagnostic checks are not available.', 400 );
		}

		$results = [];
		foreach ( $requested as $check ) {
			$results[ $check ] = call_user_func( self::CHECKS[ $check ] );
		}

		return [
			'success' => true,
			'plugin'  => [ 'name' => 'AI Diagnostic Bridge', 'version' => \BrianAzukaeme\AIDiagnosticBridge\Plugin::version() ],
			'checks'  => $results,
			'metadata' => [ 'requested' => $requested, 'timestamp' => gmdate( DATE_ATOM ) ],
		];
	}
}

