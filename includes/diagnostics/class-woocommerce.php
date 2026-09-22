<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

/** Read-only WooCommerce API adapter; overridden by fixtures in tests. */
class WooCommerce_Context {
 public function available(): bool { return class_exists('WooCommerce') || defined('WC_VERSION'); }
 public function version(): string { return defined('WC_VERSION') ? (string) WC_VERSION : ''; }
 public function database_version(): string { return (string) get_option('woocommerce_db_version', ''); }
 public function database_update_needed(): ?bool { return is_callable(['WC_Install', 'needs_db_update']) ? \WC_Install::needs_db_update() : null; }
 public function currency(): string { return function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : ''; }
 public function page_id(string $page): int { return function_exists('wc_get_page_id') ? (int) wc_get_page_id($page) : 0; }
 public function page_valid(int $id): bool { return $id > 0 && 'page' === get_post_type($id) && 'publish' === get_post_status($id); }
 public function gateways(): ?array {
  $wc = function_exists('WC') ? WC() : null;
  if (!is_object($wc) || !is_callable([$wc, 'payment_gateways'])) { return null; }
  $manager = $wc->payment_gateways();
  return is_object($manager) && is_callable([$manager, 'payment_gateways']) ? $manager->payment_gateways() : null;
 }
 public function shipping_enabled(): ?bool { return function_exists('wc_shipping_enabled') ? wc_shipping_enabled() : null; }
 public function zone_ids(): ?array {
  if (!class_exists('WC_Data_Store') || !class_exists('WC_Shipping_Zone')) { return null; }
  $store = \WC_Data_Store::load('shipping-zone');
  if (!is_callable([$store, 'get_zones'])) { return null; }
  return array_map(static fn ($zone) => (int) $zone->zone_id, $store->get_zones());
 }
 public function shipping_methods(int $zone): array { return (new \WC_Shipping_Zone($zone))->get_shipping_methods(true); }
 public function action_ids(string $status): ?array {
  if (!function_exists('as_get_scheduled_actions') || !did_action('action_scheduler_init')) { return null; }
  $args = ['status' => $status, 'per_page' => 101, 'orderby' => 'date', 'order' => 'ASC'];
  if ('pending' === $status) { $args['date'] = time() - 300; $args['date_compare'] = '<='; }
  return as_get_scheduled_actions($args, 'ids');
 }
 public function hpos_enabled(): ?bool {
  $class = '\Automattic\WooCommerce\Utilities\OrderUtil';
  return is_callable([$class, 'custom_orders_table_usage_is_enabled']) ? $class::custom_orders_table_usage_is_enabled() : null;
 }
}

final class WooCommerce {
 public static function run(?WooCommerce_Context $context = null): array {
  $context ??= new WooCommerce_Context();
  if (!$context->available()) { return Response::success('woocommerce', 'not_applicable', [], ['installed' => false]); }
  $metadata = ['installed' => true];
  $findings = [];
  $add = static function (string $id, string $severity, string $title, array $evidence = []) use (&$findings): void {
   $findings[] = Response::finding($id, $severity, 'woocommerce', $title, $title . '.', $evidence, 'woocommerce');
  };
  $read = static function (string $section, callable $callback) use ($add) {
   try { return $callback(); }
   catch (\Throwable $error) {
    $add('woocommerce-' . $section . '-unavailable', 'medium', 'A WooCommerce diagnostic section could not be read');
    return null;
   }
  };
  $version = $read('version', fn () => $context->version());
  $db_version = $read('database-version', fn () => $context->database_version());
  $safe_version = static fn ($value) => is_string($value) && preg_match('/^\d+\.\d+(?:\.\d+)?(?:[-.][A-Za-z0-9]+)*$/D', $value) ? $value : '';
  $metadata['version'] = $safe_version($version);
  $metadata['database_version'] = $safe_version($db_version);
  $metadata['database_update_needed'] = $read('database-update', fn () => $context->database_update_needed());
  if (true === $metadata['database_update_needed']) {
   $add('woocommerce-database-update-needed', 'medium', 'WooCommerce reports a pending database update');
  }
  $currency = $read('currency', fn () => $context->currency());
  $metadata['currency'] = is_string($currency) && preg_match('/^[A-Z]{3}$/D', $currency) ? $currency : '';
  foreach (['cart', 'checkout', 'shop'] as $page) {
   $id = $read($page . '-page', fn () => $context->page_id($page));
   $metadata[$page . '_page_id'] = max(0, (int) $id);
   $valid = null === $id ? null : $read($page . '-status', fn () => $context->page_valid($id));
   $metadata['pages'][$page] = ['id' => $metadata[$page . '_page_id'], 'published_page' => $valid];
   if (false === $valid) { $add('woocommerce-' . $page . '-page-invalid', 'medium', 'A configured WooCommerce page is missing or not published', ['page' => $page]); }
  }
  $gateways = $read('gateways', fn () => $context->gateways());
  $metadata['payment_gateway_count'] = is_array($gateways) ? count($gateways) : null;
  $metadata['enabled_payment_gateway_count'] = is_array($gateways) ? count(array_filter($gateways, static fn ($gateway) => is_object($gateway) && 'yes' === ($gateway->enabled ?? 'no'))) : null;
  if (0 === $metadata['enabled_payment_gateway_count']) { $add('woocommerce-no-enabled-gateways', 'info', 'No enabled payment gateways were observed'); }
  $shipping = $read('shipping', static function () use ($context): array {
   $enabled = $context->shipping_enabled();
   $zones = $enabled === false ? [] : $context->zone_ids();
   $count = null;
   if (is_array($zones) && $enabled !== false) {
    $count = 0;
    // Include the rest-of-world zone (0) even when no custom zones exist.
    foreach (array_unique(array_merge([0], array_slice($zones, 0, 100))) as $zone) { $count += count($context->shipping_methods((int) $zone)); }
   }
   return ['enabled' => $enabled, 'zone_count' => is_array($zones) ? count($zones) : null, 'enabled_method_count' => $count, 'truncated' => is_array($zones) && count($zones) > 100];
  });
  $metadata['shipping'] = $shipping;
  if (is_array($shipping) && true === $shipping['enabled'] && 0 === $shipping['enabled_method_count']) { $add('woocommerce-no-shipping-methods', 'info', 'Shipping is enabled but no enabled zone methods were observed'); }
  $metadata['scheduled_actions'] = ['scope' => 'site-wide', 'overdue_grace_seconds' => 300];
  foreach (['failed' => 'failed', 'pending' => 'overdue'] as $status => $key) {
   $ids = $read('actions-' . $key, fn () => $context->action_ids($status));
   $count = is_array($ids) ? count($ids) : null;
   $metadata['scheduled_actions'][$key] = ['count' => null === $count ? null : min(100, $count), 'truncated' => null !== $count && $count > 100];
   if (null !== $count && $count > 0) { $add('woocommerce-actions-' . $key, 'medium', 'Site-wide scheduled actions need review', ['status' => $key, 'observed_count' => min(100, $count)]); }
  }
  $metadata['hpos_enabled'] = $read('hpos', fn () => $context->hpos_enabled());
  $warning = (bool) array_filter($findings, static fn ($finding) => 'info' !== $finding['severity']);
  return Response::success('woocommerce', $warning ? 'warning' : 'ok', $findings, $metadata);
 }
}
