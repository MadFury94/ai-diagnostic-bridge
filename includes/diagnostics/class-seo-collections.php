<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class SEO_Collections {
	public static function posts( int $page = 1, int $per_page = 20 ): array|\WP_Error {
		$query = self::query( $page, $per_page );
		if ( $query instanceof \WP_Error ) {
			return $query; }
		$items = array();
		foreach ( (array) $query->posts as $id ) {
			$result  = Post_Analysis::run( (int) $id );
			$items[] = array_merge(
				self::identity( (int) $id ),
				array(
					'check'    => $result['check'],
					'findings' => $result['findings'],
					'metadata' => $result['metadata'],
				)
			);
		}
		return self::collection( 'seo-posts', $items, $query );
	}

	public static function issues( int $page = 1, int $per_page = 20 ): array|\WP_Error {
		$query = self::query( $page, $per_page );
		if ( $query instanceof \WP_Error ) {
			return $query; }
		$counts = array();
		$items  = array();
		foreach ( (array) $query->posts as $id ) {
			$result = Post_Analysis::run( (int) $id );
			foreach ( $result['findings'] as $finding ) {
				$key            = (string) ( $finding['id'] ?? 'unknown' );
				$counts[ $key ] = ( $counts[ $key ] ?? 0 ) + 1;
			}
			if ( ! empty( $result['findings'] ) ) {
				$items[] = array_merge( self::identity( (int) $id ), array( 'findings' => $result['findings'] ) ); }
		}
		ksort( $counts );
		return self::collection( 'seo-issues', $items, $query, array( 'issue_counts' => $counts ) );
	}

	public static function site(): array {
		$public   = '1' === (string) get_option( 'blog_public', '1' );
		$findings = $public ? array() : array( Response::finding( 'seo-site-not-public', 'medium', 'seo-indexability', 'Site discourages search indexing', 'WordPress is configured to discourage search engines from indexing the site.', array(), 'seo' ) );
		$findings = array_merge( $findings, self::builder_site_findings() );
		return Response::success(
			'seo-site',
			empty( $findings ) ? 'ok' : 'warning',
			$findings,
			array(
				'indexability' => array(
					'public'  => $public,
					'sitemap' => array(
						'determinable' => false,
						'included'     => null,
					),
				),
			)
		);
	}

	/** Detect site-wide Elementor Pro templates whose dependency is inactive. */
	private static function builder_site_findings(): array {
		if ( in_array( 'elementor-pro/elementor-pro.php', (array) get_option( 'active_plugins', array() ), true ) ) {
			return array(); }
		$query = new \WP_Query(
			array(
				'post_type'      => 'elementor_library',
				'post_status'    => 'publish',
				'posts_per_page' => 50,
				'fields'         => 'ids',
				'no_found_rows'  => false,
				'meta_query'     => array(
					'relation' => 'OR',
					array(
						'key'   => '_elementor_template_type',
						'value' => 'header',
					),
					array(
						'key'   => '_elementor_template_type',
						'value' => 'footer',
					),
				),
			)
		);
		if ( empty( $query->posts ) ) {
			return array(); }
		$types = array();
		foreach ( (array) $query->posts as $id ) {
			$type = sanitize_key( (string) get_post_meta( (int) $id, '_elementor_template_type', true ) );
			if ( in_array( $type, array( 'header', 'footer' ), true ) ) {
				$types[] = $type; }
		}
		$types = array_values( array_unique( $types ) );
		return array(
			Response::finding(
				'builder-plugin-inactive',
				'high',
				'builder',
				'Elementor Pro is inactive; site-wide components may be missing',
				'Elementor Pro site templates are published while Elementor Pro is inactive. Headers and footers may be missing across public pages until the plugin is restored.',
				array(
					'builder'             => 'elementor-pro',
					'required_plugin'     => 'elementor-pro/elementor-pro.php',
					'scope'               => 'site-wide',
					'affected_components' => $types,
					'template_count'      => count( $query->posts ),
					'cause'               => 'not_determined',
					'cause_note'          => 'The diagnostic confirms the dependency is inactive but cannot determine whether a user action, update, or hosting event caused it.',
				),
				'builder_site_templates'
			),
		);
	}

	private static function query( int $page, int $per_page ): \WP_Query|\WP_Error {
		if ( $page < 1 || $page > 1000 || $per_page < 1 || $per_page > 50 ) {
			return Response::error( 'invalid_pagination', 'Page must be 1-1000 and per_page must be 1-50.', 400 ); }
		return new \WP_Query(
			array(
				'post_type'           => array( 'post', 'page' ),
				'post_status'         => 'publish',
				'posts_per_page'      => $per_page,
				'paged'               => $page,
				'fields'              => 'ids',
				'no_found_rows'       => false,
				'ignore_sticky_posts' => true,
			)
		);
	}

	/** @return array{post_id:int,title:string,post_type:string} */
	private static function identity( int $post_id ): array {
		$post = get_post( $post_id );
		return array(
			'post_id'   => $post_id,
			'title'     => $post instanceof \WP_Post ? trim( wp_strip_all_tags( (string) $post->post_title ) ) : '',
			'post_type' => $post instanceof \WP_Post ? (string) $post->post_type : '',
		);
	}

	private static function collection( string $id, array $items, \WP_Query $query, array $metadata = array() ): array {
		$total                  = (int) $query->found_posts;
		$metadata['items']      = $items;
		$metadata['pagination'] = array(
			'page'     => (int) $query->get( 'paged' ),
			'per_page' => (int) $query->get( 'posts_per_page' ),
			'total'    => $total,
			'pages'    => (int) ceil( $total / max( 1, (int) $query->get( 'posts_per_page' ) ) ),
		);
		return Response::success( $id, empty( $items ) ? 'ok' : 'warning', array(), $metadata );
	}
}
