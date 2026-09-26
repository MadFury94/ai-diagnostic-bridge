<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Core_Updates {
	public static function run(): array {
		$current = sanitize_text_field((string) get_bloginfo('version'));
		$updates = function_exists('get_core_updates') ? get_core_updates(['dismissed' => false]) : false;
		$findings = [];
		$available = null;
		if (is_array($updates)) {
			foreach ($updates as $update) {
				$version = sanitize_text_field((string) ($update->current ?? ''));
				if ($version !== '' && version_compare($version, $current, '>')) { $available = $update; break; }
			}
		}
		if ($available) {
			$version = sanitize_text_field((string) ($available->current ?? ''));
			$type = sanitize_key((string) ($available->response ?? ''));
			$major = (int) explode('.', $version)[0] !== (int) explode('.', $current)[0];
			$severity = $major ? 'high' : ('security' === $type ? 'high' : 'medium');
			$findings[] = Response::finding('wordpress-core-update-available', $severity, 'wordpress', 'WordPress core update is available', 'WordPress reports a newer core version. Review the official release notes and take a backup before updating.', [
				'installed_version' => $current, 'available_version' => $version, 'release_type' => $type ?: 'maintenance', 'version_jump' => $major ? 'major' : 'minor', 'official_releases_url' => 'https://wordpress.org/download/releases/',
			], 'wordpress_core_updates');
		}
		return Response::success('core-updates', empty($findings) ? 'ok' : 'warning', $findings, [ 'current_version' => $current, 'available_version' => $available ? sanitize_text_field((string) ($available->current ?? '')) : null, 'checked_at' => gmdate(DATE_ATOM) ]);
	}
}
