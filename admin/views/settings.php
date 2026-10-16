<?php
/**
 * Render credential settings in the scope supplied by Admin::render().
 *
 * @package AIDiagnosticBridge
 * @var mixed $token One-time transient value, or false when absent.
 * @var array{configured:bool,created_at:string,revoked_at:string,last_auth_success:string,last_auth_failure:string} $status Credential status from Auth::status().
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$notice = isset( $_GET['aidb_notice'] ) ? sanitize_key( wp_unslash( $_GET['aidb_notice'] ) ) : '';
?>
<div class="wrap">
	<h1><?php echo esc_html__( 'AI Diagnostic Bridge', 'ai-diagnostic-bridge' ); ?></h1>
	<?php if ( 'generated' === $notice ) : ?>
		<div class="notice notice-success"><p><?php echo esc_html__( 'Credential generated. Copy it now; it will not be shown again.', 'ai-diagnostic-bridge' ); ?></p></div>
	<?php elseif ( 'revoked' === $notice ) : ?>
		<div class="notice notice-success"><p><?php echo esc_html__( 'Credential revoked.', 'ai-diagnostic-bridge' ); ?></p></div>
	<?php elseif ( 'log_saved' === $notice ) : ?>
		<div class="notice notice-success"><p>Log setting saved. The next scheduled check will use the selected log.</p></div>
	<?php endif; ?>
	<?php if ( false !== $token ) : ?>
		<div class="notice notice-warning"><p><strong><?php echo esc_html__( 'New API credential (shown once):', 'ai-diagnostic-bridge' ); ?></strong></p><p><code style="user-select:all"><?php echo esc_html( (string) $token ); ?></code></p></div>
	<?php endif; ?>
	<table class="form-table" role="presentation">
		<tr><th scope="row">Plugin version</th><td><?php echo esc_html( \BrianAzukaeme\AIDiagnosticBridge\Plugin::version() ); ?></td></tr>
		<tr><th scope="row">REST namespace</th><td><code>/wp-json/ai-diagnostic/v1/</code></td></tr>
		<tr><th scope="row">Credential status</th><td><?php echo ! empty( $status['configured'] ) ? esc_html__( 'Configured', 'ai-diagnostic-bridge' ) : esc_html__( 'Not configured', 'ai-diagnostic-bridge' ); ?></td></tr>
		<tr><th scope="row">Last successful request</th><td><?php echo esc_html( $status['last_auth_success'] ? $status['last_auth_success'] : 'Never' ); ?></td></tr>
		<tr><th scope="row">Last failed authentication</th><td><?php echo esc_html( $status['last_auth_failure'] ? $status['last_auth_failure'] : 'Never' ); ?></td></tr>
	</table>
	<h2>Database error log setup</h2>
	<?php
	$log_messages = array(
		'readable' => 'A readable log is selected. The monitor can inspect it for supported recent database errors.',
		'not_configured' => 'No supported log configuration was found. Select an existing log below, or ask your host to configure a private error log readable by WordPress.',
		'missing' => 'The selected file could not be found or inspected. It may not exist yet, or hosting restrictions may prevent access. Check the path and logging configuration.',
		'unreadable' => 'The selected log exists, but WordPress cannot read it. Ask your host to grant the site access to this file.',
		'invalid' => 'The configured destination is not a supported absolute local file path.',
	);
	?>
	<p role="status"><strong><?php echo esc_html( $log_messages[ $log_setup['state'] ] ?? 'Log status unavailable.' ); ?></strong></p>
	<p>Source: <?php echo esc_html( $log_setup['source'] ); ?></p>
	<?php if ( '' !== $log_setup['path'] ) : ?><p>Selected path: <code><?php echo esc_html( $log_setup['path'] ); ?></code></p><?php endif; ?>
	<p>Automatic detection uses configured WordPress logging, then configured PHP file logging. A readable file does not prove that errors are currently being recorded or that its format is supported. Paths are shown only to administrators; raw logs are not sent to the dashboard.</p>
	<?php if ( defined( 'AIDB_OPERATIONAL_LOG_PATH' ) ) : ?>
		<p>This setting is controlled by <code>AIDB_OPERATIONAL_LOG_PATH</code> in your server configuration.</p>
	<?php else : ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-wp-router-ignore="true">
		<input type="hidden" name="action" value="aidb_save_log" />
		<?php wp_nonce_field( 'aidb_save_log' ); ?>
		<p><label for="aidb-log-path">Full path to an existing error log (optional override)</label></p>
		<input class="large-text" type="text" id="aidb-log-path" name="operational_log_path" maxlength="2048" autocomplete="off" spellcheck="false" value="<?php echo esc_attr( (string) ( \BrianAzukaeme\AIDiagnosticBridge\Plugin::settings()['operational_log_path'] ?? '' ) ); ?>" />
		<p class="description">Leave blank to use automatic detection. Use a private log outside the public website directory where possible. This saves the path for this site only.</p>
		<?php submit_button( 'Save and check log' ); ?>
	</form>
	<?php endif; ?>
	<p>This setup reads an existing log. It does not enable debug mode, create log files, or display errors to visitors. Cron and Action Scheduler monitoring work independently of this setting.</p>
	<h2><?php echo esc_html__( 'Credential management', 'ai-diagnostic-bridge' ); ?></h2>
	<p><?php echo esc_html__( 'Keep this credential in your Cloudflare Worker or other server-side secret store. Do not place it in a browser application.', 'ai-diagnostic-bridge' ); ?></p>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-wp-router-ignore="true" style="display:inline-block;margin-right:8px">
		<input type="hidden" name="action" value="aidb_generate" />
		<?php wp_nonce_field( 'aidb_generate' ); ?>
		<?php submit_button( empty( $status['configured'] ) ? __( 'Generate credential', 'ai-diagnostic-bridge' ) : __( 'Regenerate credential', 'ai-diagnostic-bridge' ), 'primary', 'submit', false ); ?>
	</form>
	<?php if ( ! empty( $status['configured'] ) ) : ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-wp-router-ignore="true" style="display:inline-block">
		<input type="hidden" name="action" value="aidb_revoke" />
		<?php wp_nonce_field( 'aidb_revoke' ); ?>
		<?php submit_button( __( 'Revoke credential', 'ai-diagnostic-bridge' ), 'secondary', 'submit', false ); ?>
	</form>
	<?php endif; ?>
</div>
