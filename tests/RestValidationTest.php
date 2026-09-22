<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Activity_Log;
use BrianAzukaeme\AIDiagnosticBridge\Auth;
use BrianAzukaeme\AIDiagnosticBridge\Plugin;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Diagnostic_Manager;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

final class RestValidationTest extends TestCase {
	private string $token;
	private static int $client = 0;

	protected function setUp(): void {
		if ( ! defined( 'DB_DIR' ) || ! str_starts_with( basename( DB_DIR ), 'aidb-tests-' ) ) {
			$this->markTestSkipped( 'Use the isolated local test bootstrap.' );
		}
		$_SERVER['REMOTE_ADDR'] = '198.51.100.' . ++self::$client;
		wp_set_current_user( 0 );
		Plugin::update_settings( [ 'logging_enabled' => true, 'log_retention' => 100 ] );
		Activity_Log::clear();
		$this->token = Auth::generate()['token'];
		rest_get_server();
	}

	private function request( string $method = 'GET', string $route = 'diagnostic', bool $authenticated = true ): WP_REST_Request {
		$request = new WP_REST_Request( $method, '/ai-diagnostic/v1/' . $route );
		if ( $authenticated ) {
			$request->set_header( 'Authorization', 'Bearer ' . $this->token );
		}
		return $request;
	}

	public function test_invalid_checks_are_rejected_in_query_and_json(): void {
		$cases = [ null, true, false, 123, 1.5, '', 'health,', 'health,,plugins', 'HEALTH', 'he!alth', ' health', 'unknown', '../wp-config.php', 'phpinfo', [ null ], [ true ], [ 1 ], [ [ 'health' ] ], [ 'key' => 'health' ], (object) [ '0' => 'health' ], [ 'health', 'unknown' ], array_fill( 0, 21, 'health' ), str_repeat( 'a', 1025 ) ];
		foreach ( [ 'GET', 'POST' ] as $method ) {
			foreach ( $cases as $checks ) {
				$request = $this->request( $method );
				if ( 'GET' === $method ) {
					$request->set_query_params( [ 'checks' => $checks ] );
				} else {
					$request->set_header( 'Content-Type', 'application/json' );
					$request->set_body( wp_json_encode( [ 'checks' => $checks ] ) );
				}
				$response = rest_do_request( $request );
				$this->assertSame( 400, $response->get_status() );
				$this->assertSame( 'invalid_checks', $response->get_data()['code'] );
				$this->assertArrayNotHasKey( 'checks', $response->get_data() );
				$this->assertFalse( str_contains( wp_json_encode( $response->get_data() ), $this->token ) );
				$entry = get_option( 'aidb_activity_log' )[0];
				$this->assertFalse( $entry['success'] );
				$this->assertTrue( $entry['authenticated'] );
			}
		}
	}

	public function test_json_body_must_be_an_object_and_malformed_json_is_safe(): void {
		foreach ( [ '[]', '["health"]', 'null', 'true', '42', '"health"', '{"checks":' ] as $body ) {
			$request = $this->request( 'POST' );
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( $body );
			$response = rest_do_request( $request );
			$this->assertSame( 400, $response->get_status() );
			$this->assertContains( $response->get_data()['code'], [ 'invalid_body', 'rest_invalid_json' ] );
			$this->assertArrayNotHasKey( 'checks', $response->get_data() );
		}
	}

	public function test_valid_transport_forms_deduplicate_and_preserve_order(): void {
		foreach ( [ 'GET', 'POST' ] as $method ) {
			foreach ( [ 'woocommerce,plugins,woocommerce', [ 'woocommerce', 'plugins', 'woocommerce' ], array_fill( 0, 20, 'woocommerce' ) ] as $checks ) {
				$request = $this->request( $method );
				if ( 'GET' === $method ) {
					$request->set_query_params( [ 'checks' => $checks ] );
				} else {
					$request->set_header( 'Content-Type', 'application/json' );
					$request->set_body( wp_json_encode( [ 'checks' => $checks ] ) );
				}
				$response = rest_do_request( $request );
				$this->assertSame( 200, $response->get_status() );
				$data = $response->get_data();
				$expected = is_array( $checks ) && 20 === count( $checks ) ? [ 'woocommerce' ] : [ 'woocommerce', 'plugins' ];
				$this->assertSame( $expected, array_keys( $data['checks'] ) );
				$this->assertSame( $expected, $data['metadata']['requested'] );
				foreach ( $data['checks'] as $id => $result ) {
					$this->assertTrue( $result['success'] );
					$this->assertSame( $id, $result['check']['id'] );
					$this->assertArrayHasKey( 'findings', $result );
				}
			}
		}
	}

	public function test_omitted_and_empty_lists_use_site_default(): void {
		foreach ( [ null, '{}', '{"checks":[]}' ] as $body ) {
			$request = $this->request( null === $body ? 'GET' : 'POST' );
			if ( null !== $body ) {
				$request->set_header( 'Content-Type', 'application/json' );
				$request->set_body( $body );
			}
			$response = rest_do_request( $request );
			$this->assertSame( 200, $response->get_status() );
			$this->assertSame( [ 'site' ], array_keys( $response->get_data()['checks'] ) );
		}
	}

	public function test_json_checks_take_precedence_over_query_and_form_parameters(): void {
		$request = $this->request( 'POST' );
		$request->set_query_params( [ 'checks' => 'plugins' ] );
		$request->set_body_params( [ 'checks' => 'health' ] );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( '{"checks":["woocommerce"]}' );
		$response = rest_do_request( $request );
		$this->assertSame( [ 'woocommerce' ], array_keys( $response->get_data()['checks'] ) );
		$request = $this->request( 'POST' );
		$request->set_query_params( [ 'checks' => 'plugins' ] );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( '{"checks":null}' );
		$this->assertSame( 400, rest_do_request( $request )->get_status() );
	}

	public function test_every_registered_diagnostic_requires_authentication(): void {
		foreach ( array_merge( Diagnostic_Manager::available_checks(), [ 'diagnostic' ] ) as $route ) {
			$this->assertSame( 401, rest_do_request( $this->request( 'GET', $route, false ) )->get_status() );
		}
		$request = $this->request( 'POST', 'diagnostic', false );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( '{"checks":[["bad"]]}' );
		$this->assertSame( 401, rest_do_request( $request )->get_status() );
	}

	public function test_unsupported_methods_and_routes_do_not_run_diagnostics(): void {
		foreach ( [ [ 'DELETE', 'diagnostic' ], [ 'PUT', 'diagnostic' ], [ 'POST', 'health' ], [ 'GET', 'unknown' ] ] as [ $method, $route ] ) {
			$this->assertSame( 404, rest_do_request( $this->request( $method, $route ) )->get_status() );
		}
		$this->assertSame( [], get_option( 'aidb_activity_log', [] ) );
	}

	public function test_manager_defends_direct_callers_without_sanitizing_ids(): void {
		foreach ( [ [ [ 'health' ] ], [ 'he!alth' ], [ 'x' => 'health' ], array_fill( 0, 21, 'health' ) ] as $checks ) {
			$result = Diagnostic_Manager::run( $checks );
			$this->assertInstanceOf( \WP_Error::class, $result );
			$this->assertSame( 400, $result->get_error_data()['status'] );
		}
	}
}
