<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Plugin;
use BrianAzukaeme\AIDiagnosticBridge\Response;
use PHPUnit\Framework\TestCase;

final class ResponseTest extends TestCase {
	public function test_success_response_has_stable_contract(): void {
		$response = Response::success( 'health', 'ok', [], [ 'https' => true ] );

		$this->assertTrue( $response['success'] );
		$this->assertSame( 'AI Diagnostic Bridge', $response['plugin']['name'] );
		$this->assertSame( Plugin::version(), $response['plugin']['version'] );
		$this->assertSame( 'health', $response['check']['id'] );
		$this->assertSame( 'ok', $response['check']['status'] );
		$this->assertNotEmpty( $response['check']['timestamp'] );
		$this->assertSame( [], $response['findings'] );
		$this->assertSame( [ 'https' => true ], $response['metadata'] );
	}

	public function test_invalid_status_is_normalized_to_unknown(): void {
		$response = Response::success( 'health', 'unexpected-status' );

		$this->assertSame( 'unknown', $response['check']['status'] );
	}

	public function test_finding_has_stable_fields_and_allowed_severity(): void {
		$finding = Response::finding(
			'debug-enabled',
			'medium',
			'configuration',
			'<strong>Debug mode</strong> is enabled',
			'WP_DEBUG is enabled.',
			[ 'wp_debug' => true ],
			'wordpress'
		);

		$this->assertSame(
			[ 'id', 'severity', 'category', 'title', 'message', 'evidence', 'source' ],
			array_keys( $finding )
		);
		$this->assertSame( 'debug-enabled', $finding['id'] );
		$this->assertSame( 'medium', $finding['severity'] );
		$this->assertSame( 'configuration', $finding['category'] );
		$this->assertSame( 'Debug mode is enabled', $finding['title'] );
		$this->assertSame( 'wordpress', $finding['source'] );
	}

	public function test_invalid_finding_severity_becomes_info(): void {
		$finding = Response::finding( 'example', 'urgent', 'test', 'Title', 'Message' );

		$this->assertSame( 'info', $finding['severity'] );
	}

	public function test_error_response_is_safe_and_does_not_include_credentials(): void {
		$secret = 'do-not-return-this-token';
		$error = Response::error( 'unauthorized', 'Authentication required.', 401 );

		$this->assertSame( 'unauthorized', $error->get_error_code() );
		$this->assertSame( 401, $error->get_error_data()['status'] );
		$this->assertStringNotContainsString( $secret, wp_json_encode( $error->get_error_messages() ) );
	}
}
