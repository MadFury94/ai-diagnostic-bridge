<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\PHP_Errors;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\REST_API_Check;
use PHPUnit\Framework\TestCase;

final class CoreDiagnosticsTest extends TestCase {
 private string $fixture;

 protected function setUp(): void {
  $this->fixture = tempnam(sys_get_temp_dir(), 'aidb-log-');
 }

 protected function tearDown(): void {
  if (is_file($this->fixture)) { unlink($this->fixture); }
 }

 private function inspect(bool $debug = true, $logging = null, string $content = ''): array {
  // Constants cannot be redefined: exercise the same configuration reader used by run().
  return (new \ReflectionMethod(PHP_Errors::class, 'inspect'))->invoke(null, $debug, $logging ?? $this->fixture, $content);
 }

 public function test_disabled_logging_does_not_read_existing_logs(): void {
  file_put_contents($this->fixture, 'PHP Fatal error: secret');
  foreach ([[false, $this->fixture], [true, false], [true, ''], [false, true]] as [$debug, $logging]) {
   $result = $this->inspect($debug, $logging);
   $this->assertSame('not_applicable', $result['check']['status']);
   $this->assertFalse($result['metadata']['available']);
   $this->assertSame([], $result['findings']);
  }
 }

 public function test_missing_directory_and_stream_logs_are_unavailable(): void {
  foreach ([$this->fixture . '.missing', dirname($this->fixture), 'php://memory'] as $path) {
   $result = $this->inspect(true, $path);
   $this->assertFalse($result['metadata']['available']);
   $this->assertStringNotContainsString($path, wp_json_encode($result));
  }
 }

 public function test_default_and_custom_log_paths_are_resolved(): void {
  $directory = $this->fixture . '-dir';
  mkdir($directory);
  try {
   file_put_contents($directory . '/debug.log', 'PHP Warning: fixture');
   foreach ([true, 1, 'true', '1'] as $setting) {
    $result = $this->inspect(true, $setting, $directory);
    $this->assertSame(1, $result['metadata']['errors_found']);
   }
   file_put_contents($this->fixture, 'PHP Notice: custom');
   $this->assertSame('notice', $this->inspect()['findings'][0]['evidence']['type']);
  } finally {
   unlink($directory . '/debug.log');
   rmdir($directory);
  }
 }

 public function test_types_paths_and_secret_exclusion(): void {
  $secret = 'fixture-sensitive-value';
  $lines = [
   '[21-Sep-2026 12:00:00 UTC] PHP Fatal error: Authorization: Bearer ' . $secret . ' in /home/private/site/wp-content/plugins/example/main.php on line 12',
   'PHP Parse error: DB_PASSWORD=' . $secret . ' in C:\\private\\site\\wp-content\\themes\\example\\functions.php on line 9',
   'PHP Warning: Cookie=' . $secret . ' in /home/private/wp-config.php on line 2',
   'PHP Notice: api_key=' . $secret . ' in /private/wp-content/plugins/../wp-config.php on line 3',
   'PHP Deprecated: SQL SELECT password=' . $secret,
   '#0 /private/path stack trace ' . $secret,
  ];
  file_put_contents($this->fixture, implode("\n", $lines));
  $result = $this->inspect();
  $this->assertSame(['critical', 'critical', 'high', 'medium', 'medium'], array_column($result['findings'], 'severity'));
  $evidence = array_column($result['findings'], 'evidence');
  $this->assertSame('wp-content/plugins/example/main.php', $evidence[0]['file']);
  $this->assertSame('wp-content/themes/example/functions.php', $evidence[1]['file']);
  $this->assertSame('[path]', $evidence[2]['file']);
  $this->assertSame('[path]', $evidence[3]['file']);
  $this->assertSame(12, $evidence[0]['line_number']);
  $this->assertSame('21-Sep-2026 12:00:00 UTC', $evidence[0]['timestamp']);
  foreach ([$secret, '/home/private', 'C:\\private', 'wp-config.php', 'SELECT password'] as $excluded) {
   $this->assertStringNotContainsString($excluded, wp_json_encode($result));
  }
 }

 public function test_empty_and_unrecognized_logs_are_ok(): void {
  foreach (['', "Ordinary text\n#0 stack trace\n"] as $text) {
   file_put_contents($this->fixture, $text);
   $result = $this->inspect();
   $this->assertSame('ok', $result['check']['status']);
   $this->assertSame([], $result['findings']);
   $this->assertTrue($result['metadata']['available']);
  }
 }

 public function test_tail_is_bounded_by_bytes_and_lines(): void {
  file_put_contents($this->fixture, str_repeat('x', 70000) . "\n" . str_repeat("PHP Notice: recent\n", 120));
  $result = $this->inspect();
  $this->assertSame(65536, $result['metadata']['bytes_read']);
  $this->assertSame(100, $result['metadata']['entries_inspected']);
  $this->assertCount(100, $result['findings']);
  $this->assertTrue($result['metadata']['truncated']);
  file_put_contents($this->fixture, 'PHP Fatal error: ' . str_repeat('x', 70000));
  $result = $this->inspect();
  $this->assertSame([], $result['findings']);
  $this->assertTrue($result['metadata']['truncated']);
 }

 public function test_runtime_uses_wordpress_debug_configuration(): void {
  $expected = $this->inspect(defined('WP_DEBUG') && WP_DEBUG, defined('WP_DEBUG_LOG') ? WP_DEBUG_LOG : false, WP_CONTENT_DIR);
  $this->assertSame($expected, PHP_Errors::run());
 }

 public function test_rest_status_restrictions_and_namespace_names(): void {
  foreach ([200 => 'ok', 301 => 'warning', 401 => 'warning', 403 => 'warning', 500 => 'warning'] as $code => $status) {
   $mock = function ($pre, $args, $url) use ($code) {
    $this->assertSame(rest_url(), $url);
    $this->assertSame(5, $args['timeout']);
    $this->assertSame(4096, $args['limit_response_size']);
    $this->assertSame(0, $args['redirection']);
    return ['response' => ['code' => $code], 'headers' => ['Set-Cookie' => 'fixture-secret'], 'body' => 'fixture-secret'];
   };
   add_filter('pre_http_request', $mock, 10, 3);
   try { $result = REST_API_Check::run(); }
   finally { remove_filter('pre_http_request', $mock, 10); }
   $this->assertSame($status, $result['check']['status']);
   $this->assertSame($code, $result['metadata']['http_status']);
   $this->assertContains('ai-diagnostic/v1', $result['metadata']['namespaces']);
   $this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
  }
 }

 public function test_rest_transport_failure_does_not_expose_error_details(): void {
  $mock = static fn () => new \WP_Error('fixture-secret', 'Password=fixture-secret /private/config', ['secret' => 'fixture-secret']);
  add_filter('pre_http_request', $mock);
  try { $result = REST_API_Check::run(); }
  finally { remove_filter('pre_http_request', $mock); }
  $this->assertSame('error', $result['check']['status']);
  $this->assertSame('request_failed', $result['findings'][0]['evidence']['error']);
  $this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
  $this->assertStringNotContainsString('/private', wp_json_encode($result));
 }
}
