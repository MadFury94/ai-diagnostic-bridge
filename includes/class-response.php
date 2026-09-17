<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

use WP_Error;

final class Response {
	public static function success( string $check_id, string $status, array $findings = [], array $metadata = [] ): array {
		return [
			'success' => true,
			'plugin'  => [
				'name'    => 'AI Diagnostic Bridge',
				'version' => Plugin::version(),
			],
			'check'   => [
				'id'        => sanitize_key( $check_id ),
				'status'    => self::status( $status ),
				'timestamp' => gmdate( DATE_ATOM ),
			],
			'findings' => array_values( $findings ),
			'metadata' => $metadata,
		];
	}

	public static function error( string $code, string $message, int $status = 400 ): WP_Error {
		return new WP_Error(
			sanitize_key( $code ),
			$message,
			[
				'status'  => $status,
				'success' => false,
				'plugin'  => [
					'name'    => 'AI Diagnostic Bridge',
					'version' => Plugin::version(),
				],
			]
		);
	}

	public static function finding( string $id, string $severity, string $category, string $title, string $message, array $evidence = [], string $source = 'wordpress' ): array {
		return [
			'id'       => sanitize_key( $id ),
			'severity' => self::severity( $severity ),
			'category' => sanitize_key( $category ),
			'title'    => wp_strip_all_tags( $title ),
			'message'  => wp_strip_all_tags( $message ),
			'evidence' => $evidence,
			'source'   => sanitize_key( $source ),
		];
	}

	private static function status( string $status ): string {
		$allowed = [ 'ok', 'warning', 'error', 'not_applicable', 'unknown' ];
		return in_array( $status, $allowed, true ) ? $status : 'unknown';
	}

	private static function severity( string $severity ): string {
		$allowed = [ 'critical', 'high', 'medium', 'low', 'info' ];
		return in_array( $severity, $allowed, true ) ? $severity : 'info';
	}
}

