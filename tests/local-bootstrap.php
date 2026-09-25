<?php

declare(strict_types=1);

// Use the disposable local installation with an isolated database snapshot.
$local_wordpress = dirname( __DIR__ ) . '/local-wp2/wp-load.php';
if ( ! is_file( $local_wordpress ) ) {
	throw new RuntimeException( 'Complete the local-wp2 installation before running local contract tests.' );
}

$test_database_dir = sys_get_temp_dir() . '/aidb-tests-' . bin2hex( random_bytes( 8 ) );
if ( ! mkdir( $test_database_dir, 0700 ) ) {
	throw new RuntimeException( 'Unable to create the temporary test database directory.' );
}
define( 'DB_DIR', $test_database_dir );
define( 'DB_FILE', 'tests.sqlite' );
$cleanup_test_database = static function () use ( $test_database_dir ): void {
	global $wpdb;
	if ( isset( $wpdb ) ) {
		$wpdb->close();
	}
	foreach ( [ 'tests.sqlite', 'tests.sqlite-journal', 'tests.sqlite-wal', 'tests.sqlite-shm', '.htaccess', 'index.php' ] as $name ) {
		$file = $test_database_dir . '/' . $name;
		if ( is_file( $file ) ) {
			unlink( $file );
		}
	}
	rmdir( $test_database_dir );
};
// Queue cleanup behind WordPress' shutdown hook instead of closing SQLite
// before WooCommerce's shutdown callbacks have finished using it.
register_shutdown_function( static function () use ( $cleanup_test_database ): void {
	register_shutdown_function( $cleanup_test_database );
} );
$source_database = new SQLite3( dirname( __DIR__ ) . '/local-wp2/wp-content/database/.ht.sqlite', SQLITE3_OPEN_READONLY );
$test_database = new SQLite3( $test_database_dir . '/' . DB_FILE );
if ( ! $source_database->backup( $test_database ) ) {
	throw new RuntimeException( 'Unable to snapshot the local test database.' );
}
$source_database->close();
$test_database->close();

define( 'WP_USE_THEMES', false );
define( 'DISABLE_WP_CRON', true );
$_SERVER['HTTP_HOST'] = '127.0.0.1:8085';
$_SERVER['SERVER_NAME'] = '127.0.0.1';
$_SERVER['SERVER_PORT'] = '8085';
$_SERVER['REQUEST_URI'] = '/';
$_SERVER['SERVER_PROTOCOL'] = 'HTTP/1.1';

// Prevent the installed plugin copy from masking changes in the source checkout.
// This filter affects this process only; it does not change stored activation state.
$GLOBALS['wp_filter']['option_active_plugins'][10][] = [
	'function' => static function ( $plugins ): array {
		return array_values( array_diff( (array) $plugins, [ 'ai-diagnostic-bridge/ai-diagnostic-bridge.php' ] ) );
	},
	'accepted_args' => 1,
];

require_once $local_wordpress;
require_once __DIR__ . '/bootstrap.php';
\BrianAzukaeme\AIDiagnosticBridge\Plugin::instance()->boot();

$loaded_response = new ReflectionClass( \BrianAzukaeme\AIDiagnosticBridge\Response::class );
if ( realpath( $loaded_response->getFileName() ) !== realpath( dirname( __DIR__ ) . '/includes/class-response.php' ) ) {
	throw new RuntimeException( 'Contract tests must load the plugin source checkout.' );
}
