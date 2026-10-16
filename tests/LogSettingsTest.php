<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Log_Settings;
use BrianAzukaeme\AIDiagnosticBridge\Plugin;
use BrianAzukaeme\AIDiagnosticBridge\Auth;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Operations;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Operations_Context;
use PHPUnit\Framework\TestCase;

final class LogSettingsTest extends TestCase {
	private string $file;
	private array $settings;
	protected function setUp(): void {
		if ( ! defined( 'DB_DIR' ) || ! str_starts_with( basename( DB_DIR ), 'aidb-tests-' ) ) { $this->markTestSkipped( 'Isolated database required.' ); }
		$this->settings = Plugin::settings();
		$this->file = tempnam( sys_get_temp_dir(), 'aidb-log-setup-' );
		wp_set_current_user( 1 );
	}
	protected function tearDown(): void {
		if ( isset( $this->file ) ) { unlink( $this->file ); Plugin::update_settings( $this->settings ); }
		wp_set_current_user( 0 );
	}
	public function test_saving_existing_log_connects_detector_without_changing_credentials(): void {
		$token = Auth::generate();
		$hash = Plugin::settings()['credential_hash'];
		file_put_contents( $this->file, '[' . gmdate( 'd-M-Y H:i:s' ) . " UTC] WordPress database error Commands out of sync; PRIVATE SQL\n" );
		$this->assertTrue( Log_Settings::save_path( $this->file ) );
		$this->assertSame( $hash, Plugin::settings()['credential_hash'] );
		$this->assertSame( 'Saved plugin setting', Log_Settings::current()['source'] );
		$this->assertSame( $this->file, ( new Operations_Context() )->log_path() );
		$result = Operations::run();
		$this->assertSame( 'fail', $result['metadata']['sources']['database_log']['status'] );
		$this->assertStringNotContainsString( $this->file, json_encode( $result ) );
		$this->assertStringNotContainsString( 'PRIVATE SQL', json_encode( $result ) );
		$this->assertStringNotContainsString( $token['token'], json_encode( $result ) );
	}
	public function test_invalid_paths_preserve_previous_setting_and_anonymous_cannot_save(): void {
		$this->assertTrue( Log_Settings::save_path( $this->file ) );
		foreach ( array( 'https://example.com/error.log', 'php://memory', 'relative.log', sys_get_temp_dir(), $this->file . '-missing', "//server/share/error.log", "C:\\log\0.txt" ) as $path ) {
			$this->assertInstanceOf( \WP_Error::class, Log_Settings::save_path( $path ) );
			$this->assertSame( $this->file, Log_Settings::current()['path'] );
		}
		wp_set_current_user( 0 );
		$this->assertInstanceOf( \WP_Error::class, Log_Settings::save_path( '' ) );
		$this->assertSame( $this->file, Log_Settings::current()['path'] );
	}
	public function test_clearing_override_restores_detection_and_missing_saved_log_is_visible(): void {
		$this->assertTrue( Log_Settings::save_path( $this->file ) );
		$settings = Plugin::settings(); $settings['operational_log_path'] = $this->file . '-missing'; Plugin::update_settings( $settings );
		$this->assertSame( 'missing', Log_Settings::current()['state'] );
		$this->assertSame( '', ( new Operations_Context() )->log_path() );
		$this->assertTrue( Log_Settings::save_path( '' ) );
		$this->assertNotSame( 'Saved plugin setting', Log_Settings::current()['source'] );
	}
	public function test_php_configured_logging_is_detected_without_enabling_debug(): void {
		$settings = Plugin::settings(); unset( $settings['operational_log_path'] ); Plugin::update_settings( $settings );
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) { $this->markTestSkipped( 'WordPress logging takes precedence in this environment.' ); }
		$old_path = ini_get( 'error_log' ); $old_enabled = ini_get( 'log_errors' );
		try {
			ini_set( 'log_errors', '1' ); ini_set( 'error_log', $this->file );
			$this->assertSame( 'PHP logging configuration', Log_Settings::current()['source'] );
			$this->assertSame( 'readable', Log_Settings::current()['state'] );
		} finally { ini_set( 'error_log', $old_path ); ini_set( 'log_errors', $old_enabled ); }
	}
	public function test_admin_setup_renders_nonce_and_escapes_saved_paths(): void {
		require_once ABSPATH . 'wp-admin/includes/template.php';
		$settings = Plugin::settings(); $settings['operational_log_path'] = '"><script>private-path</script>'; Plugin::update_settings( $settings );
		ob_start();
		\BrianAzukaeme\AIDiagnosticBridge\Admin\Admin::render();
		$html = ob_get_clean();
		$this->assertStringContainsString( 'Database error log setup', $html );
		$this->assertStringContainsString( 'aidb_save_log', $html );
		$this->assertStringContainsString( '_wpnonce', $html );
		$this->assertStringNotContainsString( '<script>private-path</script>', $html );
	}
}
