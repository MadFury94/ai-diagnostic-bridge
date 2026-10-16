<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Admin;

use BrianAzukaeme\AIDiagnosticBridge\Auth;
use BrianAzukaeme\AIDiagnosticBridge\Plugin;

final class Admin {
	public static function register(): void {
		add_options_page( 'AI Diagnostic Bridge', 'AI Diagnostic Bridge', 'manage_options', 'ai-diagnostic-bridge', array( self::class, 'render' ) );
		self::register_actions();
	}

	public static function register_actions(): void {
		add_action( 'admin_post_aidb_generate', array( self::class, 'generate' ) );
		add_action( 'admin_post_aidb_revoke', array( self::class, 'revoke' ) );
		add_action( 'admin_post_aidb_save_log', array( self::class, 'save_log' ) );
	}

	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'ai-diagnostic-bridge' ) );
		}

		$token = get_transient( 'aidb_new_token_' . get_current_user_id() );
		if ( false !== $token ) {
			delete_transient( 'aidb_new_token_' . get_current_user_id() );
		}

		$status = Auth::status();
		$log_setup = \BrianAzukaeme\AIDiagnosticBridge\Log_Settings::current();
		include AI_DIAGNOSTIC_BRIDGE_DIR . 'admin/views/settings.php';
	}

	public static function save_log(): void {
		self::verify_request( 'aidb_save_log' );
		if ( ! isset( $_POST['operational_log_path'] ) || ! is_string( $_POST['operational_log_path'] ) ) {
			wp_die( 'A log path field is required; leave it blank for automatic detection.', 'Log configuration', array( 'response' => 400, 'back_link' => true ) );
		}
		$path = wp_unslash( $_POST['operational_log_path'] );
		$result = \BrianAzukaeme\AIDiagnosticBridge\Log_Settings::save_path( $path );
		if ( is_wp_error( $result ) ) {
			wp_die( esc_html( $result->get_error_message() ), 'Log configuration', array( 'response' => 400, 'back_link' => true ) );
		}
		wp_safe_redirect( add_query_arg( array( 'page' => 'ai-diagnostic-bridge', 'aidb_notice' => 'log_saved' ), admin_url( 'options-general.php' ) ) );
		exit;
	}

	public static function generate(): void {
		self::verify_request( 'aidb_generate' );
		$result = Auth::generate();
		set_transient( 'aidb_new_token_' . get_current_user_id(), $result['token'], MINUTE_IN_SECONDS );
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => 'ai-diagnostic-bridge',
					'aidb_notice' => 'generated',
				),
				admin_url( 'options-general.php' )
			)
		);
		exit;
	}

	public static function revoke(): void {
		self::verify_request( 'aidb_revoke' );
		Auth::revoke();
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => 'ai-diagnostic-bridge',
					'aidb_notice' => 'revoked',
				),
				admin_url( 'options-general.php' )
			)
		);
		exit;
	}

	private static function verify_request( string $action ): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to perform this action.', 'ai-diagnostic-bridge' ) );
		}
		check_admin_referer( $action );
	}
}
