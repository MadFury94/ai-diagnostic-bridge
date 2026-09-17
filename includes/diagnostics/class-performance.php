<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Performance {
	public static function run(): array {
		$autoload = 0;
		global $wpdb;
		if ( is_object( $wpdb ) ) {
			$autoload = (int) $wpdb->get_var( "SELECT COALESCE(SUM(LENGTH(option_value)),0) FROM {$wpdb->options} WHERE autoload IN ('yes','on','auto')" );
		}
		$findings = [];
		if ( $autoload > 1048576 ) {
			$findings[] = Response::finding( 'large-autoloaded-options', 'medium', 'performance', 'Autoloaded options are large', 'The measured autoloaded options exceed 1 MB.', [ 'bytes' => $autoload ], 'wordpress_database' );
		}
		return Response::success( 'performance', empty( $findings ) ? 'ok' : 'warning', $findings, [ 'scope' => 'WordPress-side indicators', 'memory_limit' => sanitize_text_field( (string) ini_get( 'memory_limit' ) ), 'memory_usage_bytes' => memory_get_usage( true ), 'persistent_object_cache' => wp_using_ext_object_cache(), 'autoloaded_options_bytes' => $autoload, 'active_plugin_count' => count( (array) get_option( 'active_plugins', [] ) ) ] );
	}
}

