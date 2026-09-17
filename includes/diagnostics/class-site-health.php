<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Site_Health {
	public static function run( string $check_id = 'site' ): array {
		$memory_limit = ini_get( 'memory_limit' );
		$site_url     = get_site_url();
		$home_url     = get_home_url();
		$https        = is_ssl() || 0 === strpos( strtolower( $home_url ), 'https://' );
		$theme        = wp_get_theme();
		$permalink    = get_option( 'permalink_structure', '' );
		$findings     = [];

		if ( ! $https ) {
			$findings[] = Response::finding( 'site-not-https', 'high', 'security', 'HTTPS is not detected', 'The site URL does not indicate an HTTPS connection.', [ 'home_url' => $home_url ], 'wordpress' );
		}

		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$findings[] = Response::finding( 'debug-enabled', 'medium', 'configuration', 'WordPress debug mode is enabled', 'WP_DEBUG is enabled on this installation.', [ 'wp_debug' => true ], 'wordpress' );
		}

		if ( '' === (string) $permalink ) {
			$findings[] = Response::finding( 'plain-permalinks', 'low', 'configuration', 'Plain permalinks are enabled', 'The installation has no custom permalink structure configured.', [ 'permalink_structure' => '' ], 'wordpress' );
		}

		return Response::success(
			$check_id,
			empty( $findings ) ? 'ok' : 'warning',
			$findings,
			[
				'site' => [
					'url'                  => esc_url_raw( $site_url ),
					'home_url'             => esc_url_raw( $home_url ),
					'wp_version'           => get_bloginfo( 'version' ),
					'php_version'          => PHP_VERSION,
					'database_version'     => self::database_version(),
					'multisite'            => is_multisite(),
					'https'                => $https,
					'permalink_structure'  => sanitize_text_field( (string) $permalink ),
					'timezone'             => wp_timezone_string(),
					'locale'               => get_locale(),
					'memory_limit'         => sanitize_text_field( (string) $memory_limit ),
					'max_upload_size'      => size_format( wp_max_upload_size() ),
					'max_post_size'        => sanitize_text_field( (string) ini_get( 'post_max_size' ) ),
					'active_theme'         => $theme->get( 'Name' ),
					'active_theme_version' => $theme->get( 'Version' ),
					'active_plugin_count'  => count( (array) get_option( 'active_plugins', [] ) ),
					'debug'               => defined( 'WP_DEBUG' ) && WP_DEBUG,
					'cron_disabled'        => defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON,
				],
			]
		);
	}

	private static function database_version(): string {
		global $wpdb;
		if ( ! is_object( $wpdb ) || ! method_exists( $wpdb, 'db_version' ) ) {
			return '';
		}

		return sanitize_text_field( (string) $wpdb->db_version() );
	}
}
