<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Plugins {
	public static function run(): array {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$all      = get_plugins();
		$active   = (array) get_option( 'active_plugins', [] );
		$network  = is_multisite() ? (array) get_site_option( 'active_sitewide_plugins', [] ) : [];
		$findings = [];
		$items    = [];

		foreach ( $all as $file => $plugin ) {
			$slug       = dirname( $file );
			$slug       = '.' === $slug ? sanitize_key( basename( $file, '.php' ) ) : sanitize_key( $slug );
			$is_active  = in_array( $file, $active, true );
			$is_network = isset( $network[ $file ] );
			$items[]    = [
				'name'          => sanitize_text_field( (string) ( $plugin['Name'] ?? '' ) ),
				'slug'          => $slug,
				'version'       => sanitize_text_field( (string) ( $plugin['Version'] ?? '' ) ),
				'active'        => $is_active || $is_network,
				'network_active' => $is_network,
				'author'        => sanitize_text_field( wp_strip_all_tags( (string) ( $plugin['Author'] ?? '' ) ) ),
			];

			if ( ! $is_active && ! $is_network ) {
				$findings[] = Response::finding( 'inactive-plugin-' . $slug, 'info', 'plugins', 'Inactive plugin installed', 'A plugin is installed but not active.', [ 'plugin' => $slug ], 'plugin_inventory' );
			}
		}

		return Response::success( 'plugins', empty( $findings ) ? 'ok' : 'warning', $findings, [ 'plugins' => $items, 'total' => count( $items ) ] );
	}
}

