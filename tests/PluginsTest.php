<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Plugins;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Plugins_Context;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Plugin_Updates;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Plugin_Vulnerability_Source;
use PHPUnit\Framework\TestCase;

final class Plugins_Fixture_Context extends Plugins_Context {
	public array $plugins = [];
	public array $enabled = [];
	public array $network = [];
	public mixed $state = false;
	public function installed(): array { return $this->plugins; }
	public function active(): array { return $this->enabled; }
	public function network_active(): array { return $this->network; }
	public function updates(): mixed { return $this->state; }
	public function vulnerabilities( string $slug ): array { return [ 'status' => 'available', 'advisories' => [] ]; }
}

final class Plugins_Source_Context extends Plugins_Context {
	public function installed(): array { return [ 'alpha/main.php' => [ 'Name' => 'Alpha', 'Version' => '1.0.0' ], 'beta/main.php' => [ 'Name' => 'Beta', 'Version' => '1.0.0' ], 'gamma/main.php' => [ 'Name' => 'Gamma', 'Version' => '1.0.0' ], 'failure/main.php' => [ 'Name' => 'Failure', 'Version' => '1.0.0' ] ]; }
	public function active(): array { return [ 'alpha/main.php', 'beta/main.php', 'gamma/main.php', 'failure/main.php' ]; }
	public function network_active(): array { return []; }
	public function updates(): mixed { return false; }
}

final class PluginsTest extends TestCase {
	private function fixture( string $installed = '1.2.3', string $available = '1.3.0' ): Plugins_Fixture_Context {
		$context = new Plugins_Fixture_Context();
		$context->plugins = [ 'example/main.php' => [ 'Name' => 'Example', 'Version' => $installed ] ];
		$context->enabled = [ 'example/main.php' ];
		$context->state = (object) [ 'last_checked' => time(), 'checked' => [ 'example/main.php' => $installed ], 'response' => [ 'example/main.php' => (object) [ 'new_version' => $available ] ] ];
		return $context;
	}
	public function test_minor_update_uses_core_evidence_and_low_severity(): void {
		$result = Plugins::run( $this->fixture() );
		$this->assertSame( 'plugin-update-available', $result['findings'][0]['id'] );
		$this->assertSame( 'low', $result['findings'][0]['severity'] );
		$this->assertSame( '1.2.3', $result['findings'][0]['evidence']['installed_version'] );
		$this->assertSame( '1.3.0', $result['findings'][0]['evidence']['available_version'] );
		$this->assertSame( 'minor', $result['findings'][0]['evidence']['version_jump'] );
		$this->assertSame( 'wordpress_update_plugins', $result['findings'][0]['source'] );
	}
	public function test_major_update_is_a_medium_review_signal_for_inactive_plugins_too(): void {
		$context = $this->fixture( '1.2.3', '2.0.0' );
		$context->enabled = [];
		$result = Plugins::run( $context );
		$this->assertSame( 'medium', $result['findings'][0]['severity'] );
		$this->assertSame( 'major', $result['findings'][0]['evidence']['version_jump'] );
		$this->assertSame( 'warning', $result['check']['status'] );
		$this->assertFalse( $result['metadata']['plugins'][0]['active'] );
	}
	public function test_equal_downgrade_missing_and_stale_metadata_never_invent_updates(): void {
		foreach ( [ '1.2.3', '1.0.0', '', 'not-a-version' ] as $available ) {
			$this->assertSame( [], Plugins::run( $this->fixture( '1.2.3', $available ) )['findings'] );
		}
		$context = $this->fixture();
		$context->state = false;
		$this->assertSame( 'unknown', Plugins::run( $context )['metadata']['plugins'][0]['update']['status'] );
		$context = $this->fixture();
		$context->state->checked['example/main.php'] = '0.9';
		$this->assertSame( [], Plugins::run( $context )['findings'] );
		$this->assertSame( 'stale', Plugins::run( $context )['metadata']['plugins'][0]['update']['status'] );
	}
	public function test_patch_and_network_activation_are_preserved(): void {
		$context = $this->fixture( '1.2.3', '1.2.4' );
		$context->enabled = [];
		$context->network = [ 'example/main.php' => time() ];
		$result = Plugins::run( $context );
		$this->assertSame( 'patch', $result['findings'][0]['evidence']['version_jump'] );
		$this->assertTrue( $result['metadata']['plugins'][0]['network_active'] );
		$this->assertCount( 1, $result['findings'] );
	}
	public function test_no_update_response_is_explicit_and_download_credentials_are_excluded(): void {
		$context = $this->fixture();
		$context->state->response['example/main.php']->package = 'https://example.com/download?token=private-value';
		$this->assertStringNotContainsString( 'private-value', wp_json_encode( Plugins::run( $context ) ) );
		$context->state->no_update = $context->state->response;
		$context->state->response = [];
		$this->assertSame( 'no_update_reported', Plugins::run( $context )['metadata']['plugins'][0]['update']['status'] );
		$this->assertNull( Plugin_Updates::version( '<script>1.0</script>' ) );
	}
	public function test_successful_results_use_transients_but_failures_are_never_cached(): void {
		Plugin_Vulnerability_Source::reset_cache();
		foreach ( [ 'alpha', 'beta', 'gamma', 'failure' ] as $slug ) { delete_transient( Plugin_Vulnerability_Source::transient_key( $slug ) ); }
		$requests = 0;
		$filter = static function ( $preempt, $args, $url ) use ( &$requests ) {
			if ( ! str_contains( $url, 'wpvulnerability.net/plugin/' ) ) { return $preempt; }
			++$requests;
			if ( str_contains( $url, '/failure/' ) ) { return new \WP_Error( 'timeout' ); }
			$advisories = str_contains( $url, '/alpha/' ) ? [ [ 'uuid' => 'cache-test-advisory', 'operator' => [ 'min_version' => null, 'max_version' => '2.0.0', 'max_operator' => 'lt' ], 'source' => [ [ 'id' => 'CVE-2025-1234', 'link' => 'https://www.cve.org/CVERecord?id=CVE-2025-1234' ] ], 'impact' => [ 'cvss3' => [ 'severity' => 'high', 'score' => 7.5 ] ] ] ] : [];
			return [ 'response' => [ 'code' => 200 ], 'body' => wp_json_encode( [ 'error' => 0, 'updated' => time(), 'data' => [ 'vulnerability' => $advisories ] ] ) ];
		};
		add_filter( 'pre_http_request', $filter, 10, 3 );
		$context = new Plugins_Source_Context();
		$cold_started = microtime( true );
		$cold = Plugins::run( $context );
		$cold_elapsed = microtime( true ) - $cold_started;
		$this->assertSame( 4, $requests );
		Plugin_Vulnerability_Source::reset_cache();
		$warm_started = microtime( true );
		$warm = Plugins::run( $context );
		$warm_elapsed = microtime( true ) - $warm_started;
		$this->assertSame( 5, $requests );
		$this->assertLessThan( 1.0, $warm_elapsed );
		$this->assertGreaterThanOrEqual( 0.0, $cold_elapsed );
		foreach ( [ 'alpha', 'beta', 'gamma' ] as $slug ) {
			$item = array_values( array_filter( $warm['metadata']['plugins'], static fn ( $plugin ): bool => $plugin['slug'] === $slug ) )[0];
			$this->assertTrue( $item['vulnerability']['served_from_cache'] );
			$this->assertNotNull( $item['vulnerability']['checked_at'] );
		}
		$cached_finding = array_values( array_filter( $warm['findings'], static fn ( $finding ): bool => 'plugin-known-vulnerability' === $finding['id'] ) )[0];
		$this->assertTrue( $cached_finding['evidence']['served_from_cache'] );
		$this->assertNotNull( $cached_finding['evidence']['checked_at'] );
		$expired = Plugin_Vulnerability_Source::transient_key( 'gamma' );
		set_transient( $expired, [ 'status' => 'available', 'advisories' => [], 'checked_at_unix' => time() - 1000 ], -1 );
		Plugin_Vulnerability_Source::reset_cache();
		Plugins::run( $context );
		$this->assertSame( 7, $requests );
		remove_filter( 'pre_http_request', $filter, 10 );
	}
}
