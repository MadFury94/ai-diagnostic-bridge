<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

final class PHP_Errors {
 public static function run(): array {
  return self::inspect(defined('WP_DEBUG') && WP_DEBUG, defined('WP_DEBUG_LOG') ? WP_DEBUG_LOG : false, defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : '');
 }

 private static function inspect(bool $debug, $logging, string $content_dir): array {
  $path = '';
  if ($debug) {
   if (in_array(strtolower((string) $logging), ['true', '1'], true)) {
    $path = $content_dir ? $content_dir . '/debug.log' : '';
   } elseif (is_string($logging)) {
    $path = $logging;
   }
  }
  // Read only a configured local regular file, never a stream wrapper.
  if (!$path || str_contains($path, '://') || !is_file($path) || !is_readable($path)) {
   return self::unavailable();
  }
  $handle = @fopen($path, 'rb');
  if (false === $handle) { return self::unavailable(); }
  try {
   $stat = fstat($handle);
   $offset = max(0, (int) ($stat['size'] ?? 0) - 65536);
   if (0 !== fseek($handle, $offset)) { return self::unavailable(); }
   $text = stream_get_contents($handle, 65536);
   if (false === $text) { return self::unavailable(); }
  } finally { fclose($handle); }
  $bytes = strlen($text);
  if ($offset > 0) {
   // Discard a potentially partial first line from the bounded tail.
   $newline = strpos($text, "\n");
   $text = false === $newline ? '' : substr($text, $newline + 1);
  }
  $lines = array_values(array_filter(preg_split('/\r\n|\n|\r/', $text), static fn ($line) => '' !== trim($line)));
  $truncated = $offset > 0 || count($lines) > 100;
  $lines = array_slice($lines, -100);
  $findings = [];
  foreach ($lines as $index => $line) {
   if (!preg_match('/(?:PHP\s+)?(Fatal error|Parse error|Warning|Notice|Deprecated):/i', $line, $type)) { continue; }
   $kind = strtolower($type[1]);
   $severity = in_array($kind, ['fatal error', 'parse error'], true) ? 'critical' : ('warning' === $kind ? 'high' : 'medium');
   $evidence = ['type' => $kind];
   if (preg_match('/^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2} UTC)\]/', $line, $timestamp)) {
    $evidence['timestamp'] = $timestamp[1];
   }
   if (preg_match('/ in (.+?)(?: on line |:)(\d+)\s*$/', $line, $location)) {
    $normalized = str_replace('\\', '/', $location[1]);
    $evidence['file'] = '[path]';
    if (preg_match('#(?:^|/)(wp-content/(?:plugins|themes)/[A-Za-z0-9_./-]+\.php)$#', $normalized, $relative) && !str_contains($relative[1], '..')) {
     $evidence['file'] = $relative[1];
    }
    $evidence['line_number'] = (int) $location[2];
   }
   // Raw messages may contain arbitrary credentials or private data.
   $findings[] = Response::finding('php-log-' . ($index + 1), $severity, 'php', 'PHP ' . $kind, 'An entry matching this PHP error type was observed in the debug log.', $evidence, 'wp_debug_log');
  }
  return Response::success('errors', empty($findings) ? 'ok' : 'warning', $findings, ['available' => true, 'entries_inspected' => count($lines), 'errors_found' => count($findings), 'bytes_read' => $bytes, 'truncated' => $truncated]);
 }

 private static function unavailable(): array {
  return Response::success('errors', 'not_applicable', [], ['available' => false, 'reason' => 'WP_DEBUG_LOG is unavailable or disabled.']);
 }
}
