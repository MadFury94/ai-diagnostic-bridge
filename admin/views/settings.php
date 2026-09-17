<?php

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
	<?php endif; ?>
	<?php if ( false !== $token ) : ?>
		<div class="notice notice-warning"><p><strong><?php echo esc_html__( 'New API credential (shown once):', 'ai-diagnostic-bridge' ); ?></strong></p><p><code style="user-select:all"><?php echo esc_html( (string) $token ); ?></code></p></div>
	<?php endif; ?>
	<table class="form-table" role="presentation">
		<tr><th scope="row">Plugin version</th><td><?php echo esc_html( \BrianAzukaeme\AIDiagnosticBridge\Plugin::version() ); ?></td></tr>
		<tr><th scope="row">REST namespace</th><td><code>/wp-json/ai-diagnostic/v1/</code></td></tr>
		<tr><th scope="row">Credential status</th><td><?php echo ! empty( $status['configured'] ) ? esc_html__( 'Configured', 'ai-diagnostic-bridge' ) : esc_html__( 'Not configured', 'ai-diagnostic-bridge' ); ?></td></tr>
		<tr><th scope="row">Last successful request</th><td><?php echo esc_html( $status['last_auth_success'] ?: 'Never' ); ?></td></tr>
		<tr><th scope="row">Last failed authentication</th><td><?php echo esc_html( $status['last_auth_failure'] ?: 'Never' ); ?></td></tr>
	</table>
	<h2><?php echo esc_html__( 'Credential management', 'ai-diagnostic-bridge' ); ?></h2>
	<p><?php echo esc_html__( 'Keep this credential in your Cloudflare Worker or other server-side secret store. Do not place it in a browser application.', 'ai-diagnostic-bridge' ); ?></p>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block;margin-right:8px">
		<input type="hidden" name="action" value="aidb_generate" />
		<?php wp_nonce_field( 'aidb_generate' ); ?>
		<?php submit_button( empty( $status['configured'] ) ? __( 'Generate credential', 'ai-diagnostic-bridge' ) : __( 'Regenerate credential', 'ai-diagnostic-bridge' ), 'primary', 'submit', false ); ?>
	</form>
	<?php if ( ! empty( $status['configured'] ) ) : ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block">
		<input type="hidden" name="action" value="aidb_revoke" />
		<?php wp_nonce_field( 'aidb_revoke' ); ?>
		<?php submit_button( __( 'Revoke credential', 'ai-diagnostic-bridge' ), 'secondary', 'submit', false ); ?>
	</form>
	<?php endif; ?>
</div>
