<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Diagnostic_Manager {
	/** @var array<string, callable> */
	private const CHECKS = array(
		'site'         => array( Site_Health::class, 'run' ),
		'health'       => array( self::class, 'health' ),
		'core-updates' => array( Core_Updates::class, 'run' ),
		'plugins'      => array( Plugins::class, 'run' ),
		'themes'       => array( Themes::class, 'run' ),
		'errors'       => array( PHP_Errors::class, 'run' ),
		'rest-api'     => array( REST_API_Check::class, 'run' ),
		'performance'  => array( Performance::class, 'run' ),
		'security'     => array( Security::class, 'run' ),
		'woocommerce'  => array( WooCommerce::class, 'run' ),
	);

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
			$requested = array( 'site' );
		}

		if ( ! empty( $unknown ) ) {
			return Response::error( 'invalid_checks', 'One or more requested diagnostic checks are not available.', 400 );
		}

		$results = array();
		foreach ( $requested as $check ) {
			$results[ $check ] = call_user_func( self::CHECKS[ $check ] );
		}

		return array(
			'success'  => true,
			'plugin'   => array(
				'name'    => 'AI Diagnostic Bridge',
				'version' => \BrianAzukaeme\AIDiagnosticBridge\Plugin::version(),
			),
			'checks'   => $results,
			'metadata' => array(
				'requested' => $requested,
				'timestamp' => gmdate( DATE_ATOM ),
			),
		);
	}
}
