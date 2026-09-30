<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Security {
	public static function run(): array {
		$findings = array();
		if ( ! is_ssl() ) {
			$findings[] = Response::finding( 'security-no-https', 'high', 'security', 'HTTPS is not enabled', 'The current WordPress request is not using HTTPS.', array(), 'WordPress' );
		}
		if ( defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY ) {
			$findings[] = Response::finding( 'debug-display-enabled', 'medium', 'security', 'Debug errors may be displayed publicly', 'WP_DEBUG_DISPLAY is enabled.', array(), 'WordPress' );
		}
		return Response::success(
			'security',
			empty( $findings ) ? 'ok' : 'warning',
			$findings,
			array(
				'https'         => is_ssl(),
				'debug_display' => defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY,
			)
		);
	}
}
