<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\WooCommerce;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\WooCommerce_Context;
use PHPUnit\Framework\TestCase;

final class WooCommerceFixture extends WooCommerce_Context {
 public bool $present = true;
 public bool $db_update = false;
 public bool $valid_pages = true;
 public ?array $gateway_data = [];
 public ?bool $shipping = true;
 public ?array $zones = [1, 2];
 public array $visited_zones = [];
 public array $methods = [];
 public array $actions = ['failed' => [], 'pending' => []];
 public bool $throw_gateways = false;
 public function available(): bool { return $this->present; }
 public function version(): string { return '10.1.2'; }
 public function database_version(): string { return '10.1.0'; }
 public function database_update_needed(): ?bool { return $this->db_update; }
 public function currency(): string { return 'NGN'; }
 public function page_id(string $page): int { return ['cart' => 1, 'checkout' => 2, 'shop' => 3][$page]; }
 public function page_valid(int $id): bool { return $this->valid_pages; }
 public function gateways(): ?array {
  if ($this->throw_gateways) { throw new \RuntimeException('fixture-secret /private/config'); }
  return $this->gateway_data;
 }
 public function shipping_enabled(): ?bool { return $this->shipping; }
 public function zone_ids(): ?array { return $this->zones; }
 public function shipping_methods(int $zone): array { $this->visited_zones[] = $zone; return $this->methods[$zone] ?? []; }
 public function action_ids(string $status): ?array { return $this->actions[$status]; }
 public function hpos_enabled(): ?bool { return true; }
}

final class WooCommerceTest extends TestCase {
 public function test_absent_woocommerce_does_not_read_apis(): void {
  $context = $this->createMock(WooCommerce_Context::class);
  $context->method('available')->willReturn(false);
  foreach (['version', 'gateways', 'zone_ids', 'action_ids'] as $method) { $context->expects($this->never())->method($method); }
  $result = WooCommerce::run($context);
  $this->assertSame('not_applicable', $result['check']['status']);
  $this->assertSame(['installed' => false], $result['metadata']);
 }

 public function test_configured_store_returns_only_safe_facts(): void {
  $context = new WooCommerceFixture();
  $context->gateway_data = [(object) ['enabled' => 'yes', 'settings' => ['api_key' => 'fixture-secret']], (object) ['enabled' => 'no', 'customer' => 'fixture-secret']];
  $context->methods = [0 => [(object) ['enabled' => 'yes', 'settings' => 'fixture-secret']], 1 => [(object) ['enabled' => 'yes']]];
  $result = WooCommerce::run($context);
  $data = $result['metadata'];
  $this->assertSame('ok', $result['check']['status']);
  $this->assertSame('NGN', $data['currency']);
  $this->assertSame(2, $data['payment_gateway_count']);
  $this->assertSame(1, $data['enabled_payment_gateway_count']);
  $this->assertSame(2, $data['shipping']['enabled_method_count']);
  $this->assertSame([0, 1, 2], $context->visited_zones);
  $this->assertTrue($data['hpos_enabled']);
  $this->assertFalse($data['database_update_needed']);
  $this->assertSame([], $result['findings']);
  $this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
  $this->assertSame(['installed', 'version', 'database_version', 'database_update_needed', 'currency', 'cart_page_id', 'pages', 'checkout_page_id', 'shop_page_id', 'payment_gateway_count', 'enabled_payment_gateway_count', 'shipping', 'scheduled_actions', 'hpos_enabled'], array_keys($data));
 }

 public function test_missing_configuration_and_actions_raise_findings(): void {
  $context = new WooCommerceFixture();
  $context->valid_pages = false;
  $context->db_update = true;
  $context->actions = ['failed' => [1, 2], 'pending' => [3]];
  $result = WooCommerce::run($context);
  $ids = array_column($result['findings'], 'id');
  $this->assertSame('warning', $result['check']['status']);
  foreach (['woocommerce-cart-page-invalid', 'woocommerce-checkout-page-invalid', 'woocommerce-shop-page-invalid', 'woocommerce-database-update-needed', 'woocommerce-actions-failed', 'woocommerce-actions-overdue'] as $id) { $this->assertContains($id, $ids); }
  $this->assertSame(2, $result['metadata']['scheduled_actions']['failed']['count']);
  $this->assertSame('site-wide', $result['metadata']['scheduled_actions']['scope']);
 }

 public function test_empty_gateways_and_shipping_are_informational(): void {
  $result = WooCommerce::run(new WooCommerceFixture());
  $this->assertSame('ok', $result['check']['status']);
  $this->assertSame(['info', 'info'], array_column($result['findings'], 'severity'));
 }

 public function test_disabled_shipping_does_not_scan_zones(): void {
  $context = new WooCommerceFixture();
  $context->shipping = false;
  $result = WooCommerce::run($context);
  $this->assertSame([], $context->visited_zones);
  $this->assertFalse($result['metadata']['shipping']['enabled']);
  $this->assertNotContains('woocommerce-no-shipping-methods', array_column($result['findings'], 'id'));
 }

 public function test_missing_optional_apis_are_unknown_not_zero(): void {
  $context = new WooCommerceFixture();
  $context->gateway_data = null;
  $context->shipping = null;
  $context->zones = null;
  $context->actions = ['failed' => null, 'pending' => null];
  $result = WooCommerce::run($context);
  $this->assertNull($result['metadata']['payment_gateway_count']);
  $this->assertNull($result['metadata']['shipping']['enabled_method_count']);
  $this->assertNull($result['metadata']['scheduled_actions']['failed']['count']);
  $this->assertSame([], $result['findings']);
 }

 public function test_scans_are_bounded_and_raw_action_data_is_excluded(): void {
  $context = new WooCommerceFixture();
  $context->zones = range(1, 150);
  $context->actions['failed'] = array_fill(0, 101, 'fixture-secret');
  $result = WooCommerce::run($context);
  $this->assertCount(101, $context->visited_zones);
  $this->assertTrue($result['metadata']['shipping']['truncated']);
  $this->assertSame(100, $result['metadata']['scheduled_actions']['failed']['count']);
  $this->assertTrue($result['metadata']['scheduled_actions']['failed']['truncated']);
  $this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
 }

 public function test_third_party_exception_does_not_leak_or_abort_other_checks(): void {
  $context = new WooCommerceFixture();
  $context->throw_gateways = true;
  $result = WooCommerce::run($context);
  $this->assertSame('warning', $result['check']['status']);
  $this->assertNull($result['metadata']['payment_gateway_count']);
  $this->assertTrue($result['metadata']['hpos_enabled']);
  $this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
  $this->assertStringNotContainsString('/private', wp_json_encode($result));
 }

 public function test_real_adapter_gracefully_handles_missing_woocommerce(): void {
  if (class_exists('WooCommerce') || defined('WC_VERSION')) { $this->markTestSkipped('This case requires WooCommerce absent.'); }
  $context = new WooCommerce_Context();
  $this->assertFalse($context->available());
  $this->assertNull($context->gateways());
  $this->assertNull($context->zone_ids());
  $this->assertSame('not_applicable', WooCommerce::run()['check']['status']);
 }
}
