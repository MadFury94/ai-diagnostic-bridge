<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

final class Activity_Log {
	private const OPTION_KEY = 'aidb_activity_log';

	public static function record( string $endpoint, bool $success, int $duration_ms, bool $authenticated ): void {
		$settings = Plugin::settings();
		if ( empty( $settings['logging_enabled'] ) ) {
			return;
		}

		$entries   = get_option( self::OPTION_KEY, [] );
		$entries   = is_array( $entries ) ? $entries : [];
		$retention = max( 10, min( 500, absint( $settings['log_retention'] ?? 100 ) ) );
		array_unshift(
			$entries,
			[
				'timestamp'      => gmdate( DATE_ATOM ),
				'endpoint'       => sanitize_text_field( $endpoint ),
				'success'        => $success,
				'duration_ms'    => max( 0, $duration_ms ),
				'authenticated'  => $authenticated,
			]
		);

		update_option( self::OPTION_KEY, array_slice( $entries, 0, $retention ), false );
	}

	public static function clear(): void {
		delete_option( self::OPTION_KEY );
	}
}

