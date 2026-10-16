<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge;

/** Administrator-only configuration; paths never form part of diagnostic evidence. */
final class Log_Settings {
	public static function absolute_local_path( string $path ): bool {
		return strlen( $path ) <= 2048 && ! preg_match( '/[\x00-\x1f\x7f]/', $path )
			&& ! str_contains( $path, '://' ) && ! str_starts_with( $path, '\\\\' ) && ! str_starts_with( $path, '//' )
			&& ( str_starts_with( $path, '/' ) || (bool) preg_match( '/^[A-Za-z]:[\\\\\/]/', $path ) );
	}
	public static function inspect( string $path, string $source ): array {
		$state = '' === $path ? 'not_configured' : ( ! self::absolute_local_path( $path ) ? 'invalid' : ( ! @is_file( $path ) ? 'missing' : ( ! @is_readable( $path ) ? 'unreadable' : 'readable' ) ) );
		return array( 'path' => $path, 'source' => $source, 'state' => $state );
	}
	public static function current(): array {
		if ( defined( 'AIDB_OPERATIONAL_LOG_PATH' ) ) {
			return self::inspect( (string) AIDB_OPERATIONAL_LOG_PATH, 'Server configuration' );
		}
		$saved = Plugin::settings()['operational_log_path'] ?? '';
		if ( is_string( $saved ) && '' !== $saved ) {
			return self::inspect( $saved, 'Saved plugin setting' );
		}
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
			$path = in_array( strtolower( (string) WP_DEBUG_LOG ), array( '1', 'true' ), true ) ? WP_CONTENT_DIR . '/debug.log' : (string) WP_DEBUG_LOG;
			return self::inspect( $path, 'WordPress logging configuration' );
		}
		$path = (string) ini_get( 'error_log' );
		if ( in_array( strtolower( (string) ini_get( 'log_errors' ) ), array( '1', 'on', 'true' ), true ) && self::absolute_local_path( $path ) ) {
			return self::inspect( $path, 'PHP logging configuration' );
		}
		return self::inspect( '', 'No supported logging configuration detected' );
	}
	public static function save_path( string $path ): true|\WP_Error {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error( 'forbidden', 'Only administrators can configure the log.' );
		}
		if ( defined( 'AIDB_OPERATIONAL_LOG_PATH' ) ) {
			return new \WP_Error( 'locked', 'The log path is controlled by server configuration.' );
		}
		$path = trim( $path );
		if ( '' !== $path && 'readable' !== self::inspect( $path, 'Saved plugin setting' )['state'] ) {
			return new \WP_Error( 'invalid_log', 'Enter the full path to an existing readable local log file. URLs, directories and missing files are not accepted.' );
		}
		$settings = Plugin::settings();
		$settings['operational_log_path'] = $path;
		Plugin::update_settings( $settings );
		if ( ( Plugin::settings()['operational_log_path'] ?? null ) !== $path ) {
			return new \WP_Error( 'save_failed', 'The log setting could not be saved.' );
		}
		return true;
	}
}
