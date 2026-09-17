<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

final class Plugin {
	private const OPTION_KEY = 'aidb_settings';
	private static ?self $instance = null;
	private bool $booted = false;

	private function __construct() {}

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public static function activate(): void {
		if ( version_compare( PHP_VERSION, '8.1', '<' ) || version_compare( get_bloginfo( 'version' ), '6.5', '<' ) ) {
			deactivate_plugins( plugin_basename( AI_DIAGNOSTIC_BRIDGE_FILE ) );
			wp_die( esc_html__( 'AI Diagnostic Bridge requires PHP 8.1+ and WordPress 6.5+.', 'ai-diagnostic-bridge' ) );
		}

		if ( false === get_option( self::OPTION_KEY, false ) ) {
			add_option(
				self::OPTION_KEY,
				[
					'credential_hash'       => '',
					'credential_created_at' => '',
					'credential_revoked_at' => '',
					'last_auth_success'    => '',
					'last_auth_failure'    => '',
					'logging_enabled'      => true,
					'log_retention'        => 100,
				]
			);
		}
	}

	public static function deactivate(): void {
		// Deactivation intentionally preserves credentials and diagnostic history.
	}

	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;
		add_action( 'rest_api_init', [ REST_API::class, 'register' ] );
		add_action( 'admin_menu', [ \BrianAzukaeme\AIDiagnosticBridge\Admin\Admin::class, 'register' ] );
		add_action( 'init', [ \BrianAzukaeme\AIDiagnosticBridge\Admin\Admin::class, 'register_actions' ] );
		do_action( 'aidb_loaded', $this );
	}

	public static function settings(): array {
		$settings = get_option( self::OPTION_KEY, [] );
		return is_array( $settings ) ? $settings : [];
	}

	public static function update_settings( array $settings ): bool {
		return update_option( self::OPTION_KEY, $settings, false );
	}

	public static function version(): string {
		return AI_DIAGNOSTIC_BRIDGE_VERSION;
	}
}
