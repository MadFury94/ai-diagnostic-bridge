<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class SEO_Collections {
	public static function posts(int $page = 1, int $per_page = 20): array|\WP_Error {
		$query = self::query($page, $per_page);
		if ($query instanceof \WP_Error) { return $query; }
		$items = [];
		foreach ((array) $query->posts as $id) {
			$result = Post_Analysis::run((int) $id);
			$items[] = array_merge(self::identity((int) $id), ['check' => $result['check'], 'findings' => $result['findings'], 'metadata' => $result['metadata']]);
		}
		return self::collection('seo-posts', $items, $query);
	}

	public static function issues(int $page = 1, int $per_page = 20): array|\WP_Error {
		$query = self::query($page, $per_page);
		if ($query instanceof \WP_Error) { return $query; }
		$counts = [];
		$items = [];
		foreach ((array) $query->posts as $id) {
			$result = Post_Analysis::run((int) $id);
			foreach ($result['findings'] as $finding) {
				$key = (string) ($finding['id'] ?? 'unknown');
				$counts[$key] = ($counts[$key] ?? 0) + 1;
			}
			if (!empty($result['findings'])) { $items[] = array_merge(self::identity((int) $id), ['findings' => $result['findings']]); }
		}
		ksort($counts);
		return self::collection('seo-issues', $items, $query, ['issue_counts' => $counts]);
	}

	public static function site(): array {
		$public = '1' === (string) get_option('blog_public', '1');
		return Response::success('seo-site', $public ? 'ok' : 'warning', $public ? [] : [Response::finding('seo-site-not-public', 'medium', 'seo-indexability', 'Site discourages search indexing', 'WordPress is configured to discourage search engines from indexing the site.', [], 'seo')], [
			'indexability' => ['public' => $public, 'sitemap' => ['determinable' => false, 'included' => null]],
		]);
	}

	private static function query(int $page, int $per_page): \WP_Query|\WP_Error {
		if ($page < 1 || $page > 1000 || $per_page < 1 || $per_page > 50) { return Response::error('invalid_pagination', 'Page must be 1-1000 and per_page must be 1-50.', 400); }
		return new \WP_Query(['post_type' => ['post', 'page'], 'post_status' => 'publish', 'posts_per_page' => $per_page, 'paged' => $page, 'fields' => 'ids', 'no_found_rows' => false, 'ignore_sticky_posts' => true]);
	}

	/** @return array{post_id:int,title:string,post_type:string} */
	private static function identity(int $post_id): array {
		$post = get_post($post_id);
		return [
			'post_id' => $post_id,
			'title' => $post instanceof \WP_Post ? trim(wp_strip_all_tags((string) $post->post_title)) : '',
			'post_type' => $post instanceof \WP_Post ? (string) $post->post_type : '',
		];
	}

	private static function collection(string $id, array $items, \WP_Query $query, array $metadata = []): array {
		$total = (int) $query->found_posts;
		$metadata['items'] = $items;
		$metadata['pagination'] = ['page' => (int) $query->get('paged'), 'per_page' => (int) $query->get('posts_per_page'), 'total' => $total, 'pages' => (int) ceil($total / max(1, (int) $query->get('posts_per_page')))];
		return Response::success($id, empty($items) ? 'ok' : 'warning', [], $metadata);
	}
}
