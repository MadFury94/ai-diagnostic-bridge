<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Plugin;
use PHPUnit\Framework\TestCase;

final class LifecycleTest extends TestCase {
	public function test_activation_deactivation_and_reactivation_are_clean_and_preserve_only_plugin_settings(): void {
		if ( ! defined( 'DB_DIR' ) || ! str_starts_with( basename( DB_DIR ), 'aidb-tests-' ) ) {
			$this->markTestSkipped( 'Use the isolated tests/local-bootstrap.php database.' );
		}

		delete_option( 'aidb_settings' );
		$errors = [];
		$handler = static function ( int $severity, string $message ) use ( &$errors ): bool {
			$errors[] = [ 'severity' => $severity, 'message' => $message ];
			return true;
		};
		set_error_handler( $handler, E_WARNING | E_NOTICE | E_USER_WARNING | E_USER_NOTICE );
		try {
			Plugin::activate();
			$activated = Plugin::settings();
			$this->assertNotEmpty( $activated );
			$this->assertSame( '', $activated['credential_hash'] );
			$this->assertSame( 100, $activated['log_retention'] );

			Plugin::deactivate();
			$deactivated = Plugin::settings();
			$this->assertSame( $activated, $deactivated, 'Deactivation should not orphan or mutate plugin settings.' );

			Plugin::activate();
			$this->assertSame( $activated, Plugin::settings(), 'Re-activation should preserve the existing settings contract.' );
		} finally {
			restore_error_handler();
		}

		$this->assertSame( [], $errors, 'Lifecycle should not emit PHP notices or warnings.' );
		$this->assertSame( $activated, get_option( 'aidb_settings' ) );
	}
}
