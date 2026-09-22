<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

use WP_REST_Request;

final class Auth {
	private const RATE_LIMIT_PREFIX = 'aidb_auth_fail_';
	private const RATE_LIMIT_MAX     = 10;
	private const RATE_LIMIT_WINDOW  = 300;

	/** @return array{token:string,created_at:string} */
	public static function generate(): array {
		$token   = bin2hex( random_bytes( 32 ) );
		$settings = Plugin::settings();
		$settings['credential_hash']       = password_hash( $token, PASSWORD_DEFAULT );
		$settings['credential_created_at'] = gmdate( DATE_ATOM );
		$settings['credential_revoked_at'] = '';
		Plugin::update_settings( $settings );

		return [
			'token'      => $token,
			'created_at' => $settings['credential_created_at'],
		];
	}

	public static function revoke(): bool {
		$settings = Plugin::settings();
		$settings['credential_hash']       = '';
		$settings['credential_revoked_at'] = gmdate( DATE_ATOM );
		return Plugin::update_settings( $settings );
	}

	public static function authenticate( WP_REST_Request $request ): bool {
		$identifier = self::request_identifier( $request );
		if ( self::rate_limited( $identifier ) ) {
			return false;
		}

		$header = trim( $request->get_header( 'authorization' ) ?? '' );
		if ( ! preg_match( '/^Bearer\s+(.+)$/i', $header, $matches ) ) {
			self::record_failure( $identifier );
			return false;
		}

		$settings = Plugin::settings();
		$hash     = (string) ( $settings['credential_hash'] ?? '' );
		$revoked  = (string) ( $settings['credential_revoked_at'] ?? '' );
		$valid    = '' !== $hash && '' === $revoked && password_verify( $matches[1], $hash );

		if ( ! $valid ) {
			self::record_failure( $identifier );
			return false;
		}

		$settings['last_auth_success'] = gmdate( DATE_ATOM );
		Plugin::update_settings( $settings );
		return true;
	}

	public static function status(): array {
		$settings = Plugin::settings();
		return [
			'configured'          => ! empty( $settings['credential_hash'] ) && empty( $settings['credential_revoked_at'] ),
			'created_at'          => (string) ( $settings['credential_created_at'] ?? '' ),
			'revoked_at'          => (string) ( $settings['credential_revoked_at'] ?? '' ),
			'last_auth_success'   => (string) ( $settings['last_auth_success'] ?? '' ),
			'last_auth_failure'   => (string) ( $settings['last_auth_failure'] ?? '' ),
		];
	}

	private static function request_identifier( WP_REST_Request $request ): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		return hash( 'sha256', $ip . '|' . $request->get_route() );
	}

	private static function rate_limited( string $identifier ): bool {
		return (int) get_transient( self::RATE_LIMIT_PREFIX . $identifier ) >= self::RATE_LIMIT_MAX;
	}

	private static function record_failure( string $identifier ): void {
		$key   = self::RATE_LIMIT_PREFIX . $identifier;
	$count = (int) get_transient( $key ) + 1;
		set_transient( $key, $count, self::RATE_LIMIT_WINDOW );
		$settings                     = Plugin::settings();
		$settings['last_auth_failure'] = gmdate( DATE_ATOM );
		Plugin::update_settings( $settings );
	}
}

