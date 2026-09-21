<?php

declare(strict_types=1);

// WordPress' PHPUnit bootstrap loads the plugin under test. This fallback is
// useful when running the contract tests from a normal WordPress installation
// where the plugin is present but not activated for the test bootstrap.
if ( defined( 'WP_TESTS_DIR' ) ) {
	require_once WP_TESTS_DIR . '/includes/functions.php';
	tests_add_filter(
		'muplugins_loaded',
		static function (): void {
			require dirname( __DIR__ ) . '/ai-diagnostic-bridge.php';
		}
	);
	require WP_TESTS_DIR . '/includes/bootstrap.php';
} else {
	$plugin_file = dirname( __DIR__ ) . '/ai-diagnostic-bridge.php';
	if ( defined( 'ABSPATH' ) && file_exists( $plugin_file ) ) {
		require_once $plugin_file;
	}
}
