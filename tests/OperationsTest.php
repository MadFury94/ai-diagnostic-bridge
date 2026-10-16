<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Operations;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Operations_Context;
use PHPUnit\Framework\TestCase;

final class OperationsTest extends TestCase {
	private string $fixture;
	protected function setUp(): void { $this->fixture = tempnam( sys_get_temp_dir(), 'aidb-operations-' ); }
	protected function tearDown(): void { unlink( $this->fixture ); }
	public function test_fresh_signature_counts_without_exposing_queries_or_blame(): void {
		$now = time();
		$stamp = gmdate( 'd-M-Y H:i:s', $now - 60 ) . ' UTC';
		file_put_contents( $this->fixture, "[$stamp] WordPress database error Commands out of sync; secret SQL customer@example.com made by ActionScheduler_DBStore->query_actions\n[$stamp] WordPress database error Commands out of sync; SQL ActionScheduler_DBStore made by unrelated_plugin\n" );
		$result = Operations::database_log( $this->fixture, $now );
		$this->assertSame( 'fail', $result['status'] );
		$this->assertSame( 2, $result['count'] );
		$this->assertSame( 1, $result['scheduler_count'] );
		$this->assertSame( $now - 60, $result['latest_at'] );
		$this->assertStringNotContainsString( 'secret', json_encode( $result ) );
		$this->assertStringNotContainsString( 'customer', json_encode( $result ) );
	}
	public function test_old_entries_do_not_alert_and_unknown_dates_do_not_clear(): void {
		$now = time();
		$stamp = gmdate( 'd-M-Y H:i:s', $now - 901 ) . ' UTC';
		file_put_contents( $this->fixture, "[$stamp] WordPress database error Commands out of sync\n" );
		$this->assertSame( 'pass', Operations::database_log( $this->fixture, $now )['status'] );
		foreach ( array( '', '[31-Feb-2026 12:00:00 UTC] ', '[' . gmdate( 'd-M-Y H:i:s', $now + 3600 ) . ' UTC] ' ) as $prefix ) {
			file_put_contents( $this->fixture, $prefix . "WordPress database error Commands out of sync\n" );
			$this->assertSame( 'unknown', Operations::database_log( $this->fixture, $now )['status'] );
		}
	}
	public function test_bounded_tail_and_unavailable_file_are_unknown_not_healthy(): void {
		file_put_contents( $this->fixture, str_repeat( 'x', 70000 ) );
		$result = Operations::database_log( $this->fixture, time() );
		$this->assertSame( 'unknown', $result['status'] );
		$this->assertTrue( $result['truncated'] );
		$this->assertSame( 'unknown', Operations::database_log( '', time() )['status'] );
		$this->assertSame( 'unknown', Operations::database_log( 'php://memory', time() )['status'] );
	}
	public function test_cron_is_read_only_bounded_and_does_not_reveal_hook_arguments(): void {
		$now = time();
		$cron = array( $now - 600 => array( 'private_hook' => array( 'private_argument_hash' => array( 'args' => array( 'secret' ) ) ) ), $now + 500 => array( 'future_hook' => array( 'key' => array() ) ) );
		$result = Operations::cron_snapshot( $cron, $now );
		$this->assertSame( 1, $result['count'] );
		$this->assertSame( $now - 600, $result['oldest_due'] );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $result['fingerprint'] );
		$this->assertStringNotContainsString( 'private', json_encode( $result ) );
		$this->assertSame( 0, Operations::cron_snapshot( array(), $now )['count'] );
		$many = array( $now - 600 => array( 'hook' => array_fill( 0, 102, array() ) ) );
		$this->assertTrue( Operations::cron_snapshot( $many, $now )['truncated'] );
	}
	public function test_adapter_failure_is_isolated_and_does_not_leak_error(): void {
		$context = new class extends Operations_Context {
			public function log_path(): string { return ''; }
			public function cron(): array { throw new \RuntimeException( 'private database credential' ); }
			public function actions( string $status, int $now ): ?array { return array(); }
		};
		$result = Operations::run( $context );
		$this->assertSame( 'unknown', $result['metadata']['sources']['wp_cron']['status'] );
		$this->assertSame( 'observed', $result['metadata']['sources']['action_scheduler']['status'] );
		$this->assertStringNotContainsString( 'credential', json_encode( $result ) );
	}
	public function test_pending_and_running_actions_use_identity_not_task_contents(): void {
		$now = time();
		$action = new class( $now ) {
			public function __construct( private int $now ) {}
			public function get_schedule(): object { return new class( $this->now ) {
				public function __construct( private int $now ) {}
				public function get_date(): \DateTimeImmutable { return new \DateTimeImmutable( '@' . ( $this->now - 600 ) ); }
			}; }
		};
		$result = Operations::action_snapshot( array( 27 => $action ), $now );
		$this->assertSame( $now - 600, $result['oldest_due'] );
		$this->assertSame( 1, $result['count'] );
		$this->assertNotSame( $result['fingerprint'], Operations::action_snapshot( array( 28 => $action ), $now )['fingerprint'] );
	}
}
