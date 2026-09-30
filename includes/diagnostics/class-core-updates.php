<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Core_Updates {
	public static function run(): array {
		$current   = sanitize_text_field( (string) get_bloginfo( 'version' ) );
		$updates   = function_exists( 'get_core_updates' ) ? get_core_updates( array( 'dismissed' => false ) ) : false;
		$findings  = array();
		$available = null;
		if ( is_array( $updates ) ) {
			foreach ( $updates as $update ) {
				$version = sanitize_text_field( (string) ( $update->current ?? '' ) );
				if ( '' !== $version && version_compare( $version, $current, '>' ) ) {
					$available = $update;
					break; }
			}
		}
		if ( $available ) {
			$version         = sanitize_text_field( (string) ( $available->current ?? '' ) );
			$type            = sanitize_key( (string) ( $available->response ?? '' ) );
			$current_major   = (int) explode( '.', $current )[0];
			$available_major = (int) explode( '.', $version )[0];
			$major           = $current_major !== $available_major;
			$severity        = $major ? 'high' : ( 'security' === $type ? 'high' : 'medium' );
			$findings[]      = Response::finding(
				'wordpress-core-update-available',
				$severity,
				'WordPress',
				'WordPress core update is available',
				'WordPress reports a newer core version. Review the official release notes and take a backup before updating.',
				array(
					'installed_version'     => $current,
					'available_version'     => $version,
					'release_type'          => $type ? $type : 'maintenance',
					'version_jump'          => $major ? 'major' : 'minor',
					'official_releases_url' => 'https://wordpress.org/download/releases/',
				),
				'wordpress_core_updates'
			);
		}
		return Response::success(
			'core-updates',
			empty( $findings ) ? 'ok' : 'warning',
			$findings,
			array(
				'current_version'   => $current,
				'available_version' => $available ? sanitize_text_field( (string) ( $available->current ?? '' ) ) : null,
				'checked_at'        => gmdate( DATE_ATOM ),
			)
		);
	}
}
