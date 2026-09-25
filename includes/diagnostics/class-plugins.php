<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

/** WordPress reads are isolated so version/identity edge cases can be tested. */
class Plugins_Context {
	public function installed(): array {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return get_plugins();
	}
	public function active(): array { return (array) get_option( 'active_plugins', [] ); }
	public function network_active(): array { return is_multisite() ? (array) get_site_option( 'active_sitewide_plugins', [] ) : []; }
	public function updates(): mixed { return get_site_transient( 'update_plugins' ); }
	public function vulnerabilities( string $slug ): array { return Plugin_Vulnerability_Source::fetch( $slug ); }
}

final class Plugins {
	public static function run( ?Plugins_Context $context = null ): array {
		$context ??= new Plugins_Context();

		$all      = $context->installed();
		$active   = $context->active();
		$network  = $context->network_active();
		$updates  = $context->updates();
		$findings = [];
		$items    = [];
		$vulnerability_lookups = 0;
		$max_vulnerability_lookups = 10;

		foreach ( $all as $file => $plugin ) {
			$slug       = dirname( $file );
			$slug       = '.' === $slug ? sanitize_key( basename( $file, '.php' ) ) : sanitize_key( $slug );
			$is_active  = in_array( $file, $active, true );
			$is_network = isset( $network[ $file ] );
			$installed  = sanitize_text_field( (string) ( $plugin['Version'] ?? '' ) );
			$update     = Plugin_Updates::inspect( $file, $installed, $updates );
			$vulnerability = $vulnerability_lookups < $max_vulnerability_lookups ? $context->vulnerabilities( $slug ) : [ 'status' => 'budget_exhausted', 'advisories' => [] ];
			++$vulnerability_lookups;
			$matched = Plugin_Vulnerability_Matcher::evaluate( $slug, $installed, (array) ( $vulnerability['advisories'] ?? [] ) );
			foreach ( $matched['findings'] as &$vulnerability_finding ) {
				$vulnerability_finding['evidence']['checked_at'] = $vulnerability['checked_at'] ?? null;
				$vulnerability_finding['evidence']['cache_age_seconds'] = isset( $vulnerability['cache_age_seconds'] ) ? (int) $vulnerability['cache_age_seconds'] : null;
				$vulnerability_finding['evidence']['served_from_cache'] = (bool) ( $vulnerability['cached'] ?? false );
			}
			unset( $vulnerability_finding );
			$items[]    = [
				'name'          => sanitize_text_field( (string) ( $plugin['Name'] ?? '' ) ),
				'slug'          => $slug,
				'version'       => $installed,
				'active'        => $is_active || $is_network,
				'network_active' => $is_network,
				'author'        => sanitize_text_field( wp_strip_all_tags( (string) ( $plugin['Author'] ?? '' ) ) ),
				'update'        => $update,
				'vulnerability' => [ 'status' => 'available' === ( $vulnerability['status'] ?? '' ) ? $matched['status'] : ( $vulnerability['status'] ?? 'unavailable' ), 'feed_updated' => $vulnerability['feed_updated'] ?? null, 'checked_at' => $vulnerability['checked_at'] ?? null, 'cache_age_seconds' => isset( $vulnerability['cache_age_seconds'] ) ? (int) $vulnerability['cache_age_seconds'] : null, 'served_from_cache' => (bool) ( $vulnerability['cached'] ?? false ), 'unverifiable_advisories' => (int) ( $vulnerability['unverifiable_advisories'] ?? 0 ) + $matched['unverifiable_advisories'] ],
			];
			$findings = array_merge( $findings, $matched['findings'] );

			if ( 'available' === $update['status'] ) {
				$findings[] = Response::finding(
					'plugin-update-available',
					'major' === $update['version_jump'] ? 'medium' : 'low',
					'plugins',
					'Plugin update is available',
					'WordPress reports a newer plugin version. Review its changelog and test compatibility before upgrading; a version-number jump does not establish a breaking change.',
					[
						'plugin' => $slug,
						'installed_version' => $installed,
						'available_version' => $update['available_version'],
						'version_jump' => $update['version_jump'],
						'last_checked' => $update['last_checked'],
					],
					'wordpress_update_plugins'
				);
			}

			if ( ! $is_active && ! $is_network ) {
				$findings[] = Response::finding( 'inactive-plugin-' . $slug, 'info', 'plugins', 'Inactive plugin installed', 'A plugin is installed but not active.', [ 'plugin' => $slug ], 'plugin_inventory' );
			}
		}

		// Informational inventory notes (such as an intentionally inactive
		// plugin) should not make the entire diagnostic look unhealthy. Reserve
		// warning status for findings that need investigation.
		$needs_attention = false;
		foreach ( $findings as $finding ) {
			if ( in_array( $finding['severity'] ?? 'info', [ 'critical', 'high', 'medium' ], true ) ) {
				$needs_attention = true;
				break;
			}
		}

		return Response::success( 'plugins', $needs_attention ? 'warning' : 'ok', $findings, [ 'plugins' => $items, 'total' => count( $items ), 'vulnerability_lookup_limit' => $max_vulnerability_lookups ] );
	}
}

/** Reads the same site transient used by get_plugin_updates()/wp-admin. */
final class Plugin_Updates {
	public static function version( mixed $version ): ?string {
		return is_string( $version ) && strlen( $version ) <= 80 && preg_match( '/^[0-9]+(?:\.[0-9A-Za-z]+)*(?:[-+][0-9A-Za-z.-]+)?$/D', $version ) ? $version : null;
	}

	public static function inspect( string $file, string $installed, mixed $state ): array {
		$result = [ 'status' => 'unknown', 'available_version' => null, 'version_jump' => null, 'last_checked' => null ];
		if ( ! is_object( $state ) ) { return $result; }
		if ( isset( $state->last_checked ) && is_numeric( $state->last_checked ) && (int) $state->last_checked > 0 ) {
			$result['last_checked'] = gmdate( DATE_ATOM, (int) $state->last_checked );
		}
		$installed = self::version( $installed );
		if ( null === $installed ) { return $result; }
		$checked = isset( $state->checked ) && is_array( $state->checked ) ? ( $state->checked[ $file ] ?? null ) : null;
		if ( null !== $checked && ( ! is_string( $checked ) || $checked !== $installed ) ) {
			$result['status'] = 'stale';
			return $result;
		}
		$response = isset( $state->response ) && is_array( $state->response ) ? ( $state->response[ $file ] ?? null ) : null;
		$available = is_object( $response ) ? self::version( $response->new_version ?? null ) : null;
		if ( null !== $available && version_compare( $available, $installed, '>' ) ) {
			$result['status'] = 'available';
			$result['available_version'] = $available;
			$result['version_jump'] = self::jump( $installed, $available );
		} elseif ( isset( $state->no_update ) && is_array( $state->no_update ) && isset( $state->no_update[ $file ] ) && $checked === $installed ) {
			$result['status'] = 'no_update_reported';
		}
		return $result;
	}

	private static function jump( string $installed, string $available ): string {
		preg_match( '/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/', $installed, $from );
		preg_match( '/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/', $available, $to );
		foreach ( [ 1 => 'major', 2 => 'minor', 3 => 'patch' ] as $index => $label ) {
			if ( (int) ( $to[ $index ] ?? 0 ) > (int) ( $from[ $index ] ?? 0 ) ) { return $label; }
			if ( (int) ( $to[ $index ] ?? 0 ) < (int) ( $from[ $index ] ?? 0 ) ) { return 'other'; }
		}
		return 'other';
	}
}
