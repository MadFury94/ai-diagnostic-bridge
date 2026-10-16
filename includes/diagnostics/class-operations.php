<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

/** Read-only observations. No jobs are run and no log configuration is changed. */
class Operations_Context {
	public function log_path(): string {
		$log = \BrianAzukaeme\AIDiagnosticBridge\Log_Settings::current();
		return 'readable' === $log['state'] ? $log['path'] : '';
	}
	public function cron(): array {
		// Read the current format without invoking _get_cron_array's legacy upgrade.
		$cron = get_option( 'cron', array( 'version' => 2 ) );
		if ( ! is_array( $cron ) || 2 !== ( $cron['version'] ?? null ) ) {
			throw new \RuntimeException( 'Unsupported cron format' );
		}
		unset( $cron['version'] );
		return $cron;
	}
	public function actions( string $status, int $now ): ?array {
		if ( ! function_exists( 'as_get_scheduled_actions' ) || ! did_action( 'action_scheduler_init' ) ) {
			return null;
		}
		return as_get_scheduled_actions( array( 'status' => $status, 'date' => $now - 300, 'date_compare' => '<=', 'per_page' => 101, 'orderby' => 'date', 'order' => 'ASC' ) );
	}
}

final class Operations {
	public static function run( ?Operations_Context $context = null ): array {
		$context ??= new Operations_Context();
		$now = time();
		$sources = array();
		$readers = array(
			'database_log' => fn () => self::database_log( $context->log_path(), $now ),
			'wp_cron' => fn () => self::cron_snapshot( $context->cron(), $now ),
			'action_scheduler' => function () use ( $context, $now ) {
				$pending = $context->actions( 'pending', $now );
				$running = $context->actions( 'in-progress', $now );
				return null === $pending || null === $running ? self::unknown( 'scheduler_unavailable' ) : self::action_snapshot( $pending + $running, $now, count( $pending ) > 100 || count( $running ) > 100 );
			},
		);
		foreach ( $readers as $source => $read ) {
			global $wpdb;
			$old_error = $wpdb->last_error;
			$old_suppress = $wpdb->suppress_errors( true );
			$wpdb->last_error = '';
			try {
				$sources[ $source ] = $read();
				if ( '' !== $wpdb->last_error ) {
					$sources[ $source ] = self::unknown( 'query_failed' );
				}
			} catch ( \Throwable $error ) {
				$sources[ $source ] = self::unknown( 'source_unavailable' );
			} finally {
				$wpdb->last_error = $old_error;
				$wpdb->suppress_errors( $old_suppress );
			}
		}
		return Response::success( 'operations', 'ok', array(), array( 'contract_version' => 1, 'observed_at' => $now, 'sources' => $sources ) );
	}
	private static function unknown( string $reason ): array {
		return array( 'status' => 'unknown', 'reason' => $reason );
	}
	public static function database_log( string $path, int $now ): array {
		if ( '' === $path || str_contains( $path, '://' ) || ! is_file( $path ) || ! is_readable( $path ) ) {
			return self::unknown( 'log_unavailable' );
		}
		$handle = @fopen( $path, 'rb' );
		if ( false === $handle ) { return self::unknown( 'log_unavailable' ); }
		try {
			$stat = fstat( $handle );
			if ( false === $stat ) { return self::unknown( 'log_unavailable' ); }
			$offset = max( 0, (int) ( $stat['size'] ?? 0 ) - 65536 );
			if ( 0 !== fseek( $handle, $offset ) ) { return self::unknown( 'log_unavailable' ); }
			$text = stream_get_contents( $handle, 65536 );
			if ( false === $text ) { return self::unknown( 'log_unavailable' ); }
		} finally { fclose( $handle ); }
		if ( $offset > 0 ) {
			$newline = strpos( $text, "\n" );
			$text = false === $newline ? '' : substr( $text, $newline + 1 );
		}
		$count = 0; $scheduler_count = 0; $latest = 0; $uncertain = false;
		foreach ( preg_split( '/\r\n|\n|\r/', $text ) as $line ) {
			if ( ! preg_match( '/WordPress database error\s+Commands out of sync\b/i', $line ) ) { continue; }
			if ( ! preg_match( '/^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2} UTC)\]/', $line, $match ) ) { $uncertain = true; continue; }
			$date = \DateTimeImmutable::createFromFormat( '!d-M-Y H:i:s T', $match[1] );
			$errors = \DateTimeImmutable::getLastErrors();
			if ( false === $date || ( false !== $errors && ( $errors['warning_count'] || $errors['error_count'] ) ) || $date->getTimestamp() > $now ) { $uncertain = true; continue; }
			$timestamp = $date->getTimestamp();
			if ( $timestamp < $now - 900 ) { continue; }
			++$count;
			$latest = max( $latest, $timestamp );
			// Only attribute context from the call-chain suffix, never from SQL values.
			$parts = explode( ' made by ', $line, 2 );
			if ( isset( $parts[1] ) && preg_match( '/\b(?:ActionScheduler_[A-Za-z_]+|wp_cron|spawn_cron)\b/', $parts[1] ) ) { ++$scheduler_count; }
		}
		return array( 'status' => $count > 0 ? 'fail' : ( $uncertain || $offset > 0 ? 'unknown' : 'pass' ), 'reason' => $count > 0 ? 'recent_database_errors' : ( $uncertain || $offset > 0 ? 'log_coverage_incomplete' : 'no_recent_matches' ), 'count' => $count, 'scheduler_count' => $scheduler_count, 'latest_at' => $latest, 'window_seconds' => 900, 'truncated' => $offset > 0, 'log_id' => hash( 'sha256', $stat['dev'] . '|' . $stat['ino'] ), 'bytes_read' => strlen( $text ) );
	}
	public static function cron_snapshot( array $cron, int $now ): array {
		$items = array(); $visited = 0; $truncated = false;
		ksort( $cron, SORT_NUMERIC );
		foreach ( $cron as $timestamp => $hooks ) {
			if ( ! is_numeric( $timestamp ) || ! is_array( $hooks ) ) { return self::unknown( 'cron_format_invalid' ); }
			if ( (int) $timestamp > $now - 300 ) { continue; }
			foreach ( $hooks as $hook => $events ) {
				if ( ! is_array( $events ) ) { return self::unknown( 'cron_format_invalid' ); }
				foreach ( $events as $key => $event ) {
					if ( ++$visited > 100 ) { $truncated = true; break 3; }
					$items[] = array( 'due' => (int) $timestamp, 'identity' => hash( 'sha256', $timestamp . '|' . $hook . '|' . $key ) );
				}
			}
		}
		return self::queue_snapshot( $items, $truncated );
	}
	public static function action_snapshot( array $actions, int $now, bool $truncated = false ): array {
		$items = array();
		foreach ( $actions as $id => $action ) {
			$date = $action->get_schedule()->get_date();
			if ( ! $date instanceof \DateTimeInterface ) { return self::unknown( 'schedule_unavailable' ); }
			$due = $date->getTimestamp();
			if ( $due <= $now - 300 ) { $items[] = array( 'due' => $due, 'identity' => hash( 'sha256', 'action|' . $id . '|' . $due ) ); }
		}
		return self::queue_snapshot( $items, $truncated );
	}
	private static function queue_snapshot( array $items, bool $truncated ): array {
		usort( $items, static fn ( $a, $b ) => array( $a['due'], $a['identity'] ) <=> array( $b['due'], $b['identity'] ) );
		return array( 'status' => 'observed', 'count' => min( 100, count( $items ) ), 'truncated' => $truncated || count( $items ) > 100, 'oldest_due' => $items[0]['due'] ?? 0, 'fingerprint' => $items[0]['identity'] ?? '', 'scope' => 'site-wide' );
	}
}
