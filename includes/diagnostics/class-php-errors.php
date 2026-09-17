<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

final class PHP_Errors {
	public static function run(): array {
		$path = defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR . '/debug.log' : '';
		if ( ! $path || ! is_readable( $path ) ) {
			return Response::success( 'errors', 'not_applicable', [], [ 'available' => false, 'reason' => 'WP_DEBUG_LOG is unavailable or disabled.' ] );
		}
		$lines = file( $path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES );
		$lines = is_array( $lines ) ? array_slice( $lines, -100 ) : [];
		$findings = [];
		foreach ( $lines as $index => $line ) {
			if ( ! preg_match( '/(PHP\s+Fatal error|PHP\s+Parse error|PHP\s+Warning|PHP\s+Notice|PHP\s+Deprecated|Fatal error)/i', $line, $type ) ) {
				continue;
			}
			$safe = preg_replace( '#^[A-Z]:[^:]+|^/[^:]+#', '[path]', (string) $line );
			$severity = stripos( $type[1], 'fatal' ) !== false || stripos( $type[1], 'parse' ) !== false ? 'critical' : ( stripos( $type[1], 'warning' ) !== false ? 'high' : 'medium' );
			$findings[] = Response::finding( 'php-log-' . ( $index + 1 ), $severity, 'php', $type[1], 'An entry matching this PHP error type was observed in the debug log.', [ 'line' => sanitize_text_field( (string) $safe ) ], 'wp_debug_log' );
		}
		return Response::success( 'errors', empty( $findings ) ? 'ok' : 'warning', $findings, [ 'available' => true, 'entries_inspected' => count( $lines ), 'errors_found' => count( $findings ) ] );
	}
}

