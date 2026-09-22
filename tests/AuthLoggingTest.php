<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Activity_Log;
use BrianAzukaeme\AIDiagnosticBridge\Admin\Admin;
use BrianAzukaeme\AIDiagnosticBridge\Auth;
use BrianAzukaeme\AIDiagnosticBridge\Plugin;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

final class AuthLoggingTest extends TestCase {
	private string $token;
	private static int $client = 0;

	protected function setUp(): void {
		// These tests mutate credentials: refuse the existing local site database.
		if ( ! defined( 'DB_DIR' ) || ! str_starts_with( basename( DB_DIR ), 'aidb-tests-' ) ) {
			$this->markTestSkipped( 'Use the isolated tests/local-bootstrap.php database.' );
		}
		$_SERVER['REMOTE_ADDR'] = '192.0.2.' . ++self::$client;
		wp_set_current_user( 0 );
		Plugin::update_settings( [ 'logging_enabled' => true, 'log_retention' => 100 ] );
		Activity_Log::clear();
		$this->token = Auth::generate()['token'];
		rest_get_server();
	}

	private function dispatch( ?string $authorization = null, string $route = 'woocommerce', string $method = 'GET', array $body = [] ) {
		$request = new WP_REST_Request( $method, '/ai-diagnostic/v1/' . $route );
		if ( null !== $authorization ) {
			$request->set_header( 'Authorization', $authorization );
		}
		if ( $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_do_request( $request );
	}

	private function entries(): array {
		return get_option( 'aidb_activity_log', [] );
	}

	public function test_valid_token_logs_one_success_without_secrets(): void {
		$response = $this->dispatch( 'Bearer ' . $this->token );
		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['success'] );
		$this->assertCount( 1, $this->entries() );
		$entry = $this->entries()[0];
		$this->assertSame( [ 'timestamp', 'endpoint', 'success', 'duration_ms', 'authenticated' ], array_keys( $entry ) );
		$this->assertSame( 'woocommerce', $entry['endpoint'] );
		$this->assertTrue( $entry['success'] );
		$this->assertTrue( $entry['authenticated'] );
		$this->assertIsInt( $entry['duration_ms'] );
		$this->assertGreaterThanOrEqual( 0, $entry['duration_ms'] );
		$this->assertNotFalse( strtotime( $entry['timestamp'] ) );
		$this->assertNotEmpty( Auth::status()['last_auth_success'] );
		$this->assertTrue( password_verify( $this->token, Plugin::settings()['credential_hash'] ) );
		$this->assertFalse( str_contains( wp_json_encode( [ Plugin::settings(), $this->entries(), $response->get_data() ] ), $this->token ), 'Raw credential must not be persisted or returned.' );
	}

	public function test_missing_malformed_and_invalid_tokens_log_failures(): void {
		foreach ( [ null, '', 'Basic test', 'Bearer ', 'Bearer invalid-fixture' ] as $header ) {
			$response = $this->dispatch( $header );
			$this->assertSame( 401, $response->get_status() );
			$this->assertSame( 'unauthorized', $response->get_data()['code'] );
			$this->assertFalse( $this->entries()[0]['success'] );
			$this->assertFalse( $this->entries()[0]['authenticated'] );
		}
		$this->assertCount( 5, $this->entries() );
		$this->assertNotEmpty( Auth::status()['last_auth_failure'] );
		$this->assertStringNotContainsString( 'invalid-fixture', wp_json_encode( $this->entries() ) );
	}

	public function test_regeneration_and_revocation_invalidate_credentials(): void {
		$replacement = Auth::generate()['token'];
		$this->assertSame( 401, $this->dispatch( 'Bearer ' . $this->token )->get_status() );
		$this->assertSame( 200, $this->dispatch( 'Bearer ' . $replacement )->get_status() );
		Auth::revoke();
		$this->assertFalse( Auth::status()['configured'] );
		$this->assertSame( '', Plugin::settings()['credential_hash'] );
		$this->assertSame( 401, $this->dispatch( 'Bearer ' . $replacement )->get_status() );
		$this->assertFalse( str_contains( wp_json_encode( [ Plugin::settings(), $this->entries() ] ), $replacement ) );
	}

	public function test_rate_limit_blocks_valid_token_until_expiry(): void {
		for ( $i = 0; $i < 10; ++$i ) {
			$this->assertSame( 401, $this->dispatch()->get_status() );
		}
		$this->assertSame( 401, $this->dispatch( 'Bearer ' . $this->token )->get_status() );
		$this->assertCount( 11, $this->entries() );
		$this->assertFalse( $this->entries()[0]['authenticated'] );
		$key = 'aidb_auth_fail_' . hash( 'sha256', $_SERVER['REMOTE_ADDR'] . '|/ai-diagnostic/v1/woocommerce' );
		$timeout = (int) get_option( '_transient_timeout_' . $key );
		$this->assertGreaterThan( time(), $timeout );
		$this->assertLessThanOrEqual( time() + 300, $timeout );
		update_option( '_transient_timeout_' . $key, time() - 1 );
		$this->assertSame( 200, $this->dispatch( 'Bearer ' . $this->token )->get_status() );
	}

	public function test_combined_routes_log_once_and_reject_unknown_checks(): void {
		foreach ( [ 'GET', 'POST' ] as $method ) {
			$response = $this->dispatch( 'Bearer ' . $this->token, 'diagnostic', $method, [ 'checks' => [ 'woocommerce', 'plugins' ], 'secret' => 'body-marker' ] );
			$this->assertSame( 200, $response->get_status() );
			$this->assertCount( 2, $response->get_data()['checks'] );
			$this->assertSame( 'diagnostic', $this->entries()[0]['endpoint'] );
			$this->assertTrue( $this->entries()[0]['success'] );
		}
		$this->assertCount( 2, $this->entries() );
		$response = $this->dispatch( 'Bearer ' . $this->token, 'diagnostic', 'POST', [ 'checks' => [ 'unknown-check' ] ] );
		$this->assertSame( 400, $response->get_status() );
		$this->assertFalse( $this->entries()[0]['success'] );
		$this->assertTrue( $this->entries()[0]['authenticated'] );
		$this->assertCount( 3, $this->entries() );
		$this->assertStringNotContainsString( 'body-marker', wp_json_encode( $this->entries() ) );
	}

	public function test_permission_probes_and_unrelated_routes_do_not_add_entries(): void {
		$request = new WP_REST_Request( 'GET', '/ai-diagnostic/v1/woocommerce' );
		$request->set_header( 'Authorization', 'Bearer ' . $this->token );
		rest_do_request( $request );
		\BrianAzukaeme\AIDiagnosticBridge\REST_API::permission( $request );
		rest_do_request( new WP_REST_Request( 'GET', '/unrelated/v1/missing' ) );
		$this->assertCount( 1, $this->entries() );
	}

	public function test_disabled_logging_does_not_append_entries(): void {
		$settings = Plugin::settings();
		$settings['logging_enabled'] = false;
		Plugin::update_settings( $settings );
		$this->assertSame( 200, $this->dispatch( 'Bearer ' . $this->token )->get_status() );
		$this->assertSame( 401, $this->dispatch()->get_status() );
		$this->assertSame( [], $this->entries() );
	}

	public function test_retention_keeps_newest_entries_and_clamps_bounds(): void {
		foreach ( [ 1 => 10, 12 => 12, 999 => 500 ] as $configured => $expected ) {
			Activity_Log::clear();
			$settings = Plugin::settings();
			$settings['log_retention'] = $configured;
			Plugin::update_settings( $settings );
			for ( $i = 0; $i <= $expected; ++$i ) {
				Activity_Log::record( 'test-' . $i, true, -1, true );
			}
			$this->assertCount( $expected, $this->entries() );
			$this->assertSame( 'test-' . $expected, $this->entries()[0]['endpoint'] );
			$this->assertSame( 'test-1', $this->entries()[$expected - 1]['endpoint'] );
			$this->assertSame( 0, $this->entries()[0]['duration_ms'] );
		}
	}

	public function test_non_admin_cannot_manage_credentials_or_render_settings(): void {
		$user_id = wp_insert_user( [ 'user_login' => 'aidb-test-' . bin2hex( random_bytes( 5 ) ), 'user_pass' => bin2hex( random_bytes( 20 ) ), 'role' => 'subscriber' ] );
		$this->assertIsInt( $user_id );
		wp_set_current_user( $user_id );
		$settings = Plugin::settings();
		$die_handler = static fn () => static function (): void { throw new \RuntimeException( 'admin-denied' ); };
		add_filter( 'wp_die_handler', $die_handler );
		try {
			foreach ( [ 'generate', 'revoke', 'render' ] as $method ) {
				try {
					Admin::$method();
					$this->fail( 'Non-admin access was not rejected.' );
				} catch ( \RuntimeException $error ) {
					$this->assertSame( 'admin-denied', $error->getMessage() );
				}
			}
			$this->assertSame( $settings, Plugin::settings() );
		} finally {
			remove_filter( 'wp_die_handler', $die_handler );
			wp_set_current_user( 0 );
		}
	}
}
