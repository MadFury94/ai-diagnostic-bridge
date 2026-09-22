<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

final class Link_Issues {
	public static function run(int $page = 1, int $per_page = 20): array|\WP_Error {
		if ($page < 1 || $page > 1000 || $per_page < 1 || $per_page > 50) {
			return Response::error('invalid_pagination', 'Page must be 1-1000 and per_page must be 1-50.', 400);
		}
		$query = new \WP_Query([
			'post_type' => ['post', 'page'],
			'post_status' => 'publish',
			'posts_per_page' => $per_page,
			'paged' => $page,
			'fields' => 'ids',
			'no_found_rows' => false,
			'ignore_sticky_posts' => true,
		]);
		$items = [];
		foreach ((array) $query->posts as $post_id) {
			$post = get_post((int) $post_id);
			if (!$post instanceof \WP_Post) { continue; }
			$analysis = Content_Analysis::analyze((string) $post->post_content);
			$link_findings = array_values(array_filter($analysis['findings'], static fn (array $finding): bool => str_starts_with($finding['id'] ?? '', 'seo-link-')));
			$links = $analysis['links'];
			if (0 === $links['count'] && empty($link_findings)) { continue; }
			$items[] = [
				'post_id' => (int) $post->ID,
				'post_type' => sanitize_key((string) $post->post_type),
				'links' => $links,
				'findings' => $link_findings,
			];
		}
		$total = (int) $query->found_posts;
		return Response::success('links', empty($items) ? 'ok' : 'warning', [], [
			'items' => $items,
			'pagination' => ['page' => $page, 'per_page' => $per_page, 'total' => $total, 'pages' => (int) ceil($total / $per_page)],
		]);
	}
}
