<?php
/**
 * Plugin Name: AI Diagnostic Bridge
 * Description: Secure diagnostic API for WordPress support, troubleshooting and SEO analysis.
 * Version: 0.1.5
 * Author: Brian Azukaeme
 * Text Domain: ai-diagnostic-bridge
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AI_DIAGNOSTIC_BRIDGE_VERSION', '0.1.5' );
define( 'AI_DIAGNOSTIC_BRIDGE_FILE', __FILE__ );
define( 'AI_DIAGNOSTIC_BRIDGE_DIR', plugin_dir_path( __FILE__ ) );

require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/class-response.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/class-activity-log.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/class-auth.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-site-health.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-plugins.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-plugin-vulnerability-matcher.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-plugin-vulnerability-source.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-themes.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-php-errors.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-rest-api-check.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-performance.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-security.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-woocommerce.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-seo-manager.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-post-analysis.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-image-issues.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-link-issues.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-seo-collections.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/diagnostics/class-diagnostic-manager.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/class-rest-api.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'admin/class-admin.php';
require_once AI_DIAGNOSTIC_BRIDGE_DIR . 'includes/class-plugin.php';

register_activation_hook(
	__FILE__,
	static function (): void {
		Plugin::activate();
	}
);

register_deactivation_hook(
	__FILE__,
	static function (): void {
		Plugin::deactivate();
	}
);

add_action(
	'plugins_loaded',
	static function (): void {
		Plugin::instance()->boot();
	}
);
