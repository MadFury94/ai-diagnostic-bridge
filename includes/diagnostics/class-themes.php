<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Themes {
	public static function run(): array {
		$theme     = wp_get_theme();
		$parent    = $theme->parent();
		$findings  = [];
		$stylesheet = $theme->get_stylesheet();

		if ( ! $theme->exists() ) {
			$findings[] = Response::finding( 'active-theme-missing', 'critical', 'themes', 'Active theme is unavailable', 'WordPress could not resolve the active theme.', [], 'theme_inventory' );
		}

		return Response::success(
			'themes',
			empty( $findings ) ? 'ok' : 'error',
			$findings,
			[
				'active_theme' => [
					'name'       => sanitize_text_field( (string) $theme->get( 'Name' ) ),
					'version'    => sanitize_text_field( (string) $theme->get( 'Version' ) ),
					'theme_uri'  => esc_url_raw( (string) $theme->get( 'ThemeURI' ) ),
					'author'     => sanitize_text_field( wp_strip_all_tags( (string) $theme->get( 'Author' ) ) ),
					'directory'  => $stylesheet,
					'stylesheet' => $stylesheet,
					'parent'     => $parent ? sanitize_text_field( (string) $parent->get( 'Name' ) ) : null,
					'is_child'   => (bool) $parent,
				],
			]
		);
	}
}

