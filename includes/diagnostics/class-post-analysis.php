<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

/** Read-only WordPress adapter used by the post analyzer and its fixtures. */
class Post_Analysis_Context {
	public function get(int $post_id): ?\WP_Post {
		$post = get_post($post_id);
		return $post instanceof \WP_Post ? $post : null;
	}

	public function meta(int $post_id, string $key): string {
		return (string) get_post_meta($post_id, $key, true);
	}

	public function featured_image_id(int $post_id): int { return (int) get_post_thumbnail_id($post_id); }
	public function attachment_id(string $url): int { return function_exists('attachment_url_to_postid') ? (int) attachment_url_to_postid($url) : 0; }
	public function attachment_url(int $attachment_id): string { return (string) wp_get_attachment_url($attachment_id); }
	public function attachment_filename(int $attachment_id): string { return $attachment_id > 0 ? sanitize_file_name((string) basename((string) get_attached_file($attachment_id))) : ''; }
	public function attachment_alt(int $attachment_id): string { return $attachment_id > 0 ? trim(wp_strip_all_tags((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true))) : ''; }
}

final class Post_Analysis {
	public static function run(int $post_id, ?Post_Analysis_Context $context = null, array $thresholds = [], array $known_titles = [], array $known_descriptions = []): array {
		$context ??= new Post_Analysis_Context();
		$post = $context->get($post_id);

		if (!$post instanceof \WP_Post || !in_array($post->post_type, ['post', 'page'], true) || 'publish' !== $post->post_status || '' !== (string) $post->post_password) {
			return SEO_Manager::run();
		}

		$title = trim(wp_strip_all_tags((string) $post->post_title));
		$slug = sanitize_title((string) $post->post_name);
		$excerpt = trim(wp_strip_all_tags((string) $post->post_excerpt));
		$content = trim(wp_strip_all_tags((string) $post->post_content));
		$words = preg_match_all('/\S+/u', $content, $matches);
		$title_findings = Title_Checks::findings($title, $slug, $known_titles, $thresholds);
		$description = SEO_Metadata::description($post->ID, $context);
		$description_findings = Meta_Description_Checks::findings($description['value'], $known_descriptions, $thresholds);
		$indexability = Indexability_Analysis::analyze($post, $context);
		$content_analysis = Content_Analysis::analyze((string) $post->post_content);
		$image_details = Image_Analysis::analyze((string) $post->post_content, (int) $post->ID, $context);
		$content_analysis['images'] = $image_details['observations'];

		return SEO_Manager::result(
			(int) $post->ID,
			[
				'title' => ['value' => $title, 'length' => self::length($title)],
				'slug' => ['value' => $slug, 'length' => self::length($slug)],
				'excerpt' => ['present' => '' !== $excerpt, 'length' => self::length($excerpt)],
				'content' => ['present' => '' !== $content, 'character_count' => self::length($content)],
				'word_count' => is_int($words) ? $words : 0,
				'meta_description' => ['available' => '' !== $description['value'], 'length' => self::length($description['value']), 'source' => $description['source']],
				'indexability' => $indexability['observations'],
				'headings' => $content_analysis['headings'],
				'images' => $content_analysis['images'],
				'links' => $content_analysis['links'],
			],
			array_merge($title_findings, $description_findings, $indexability['findings'], $content_analysis['findings'], $image_details['findings']),
			['post_type' => sanitize_key((string) $post->post_type)]
		);
	}

	private static function length(string $value): int {
		return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
	}
}

final class SEO_Metadata {
	private const DESCRIPTION_KEYS = [
		'yoast' => '_yoast_wpseo_metadesc',
		'rank_math' => 'rank_math_description',
		'aioseo' => '_aioseo_description',
	];

	public static function description(int $post_id, Post_Analysis_Context $context): array {
		foreach (self::DESCRIPTION_KEYS as $source => $key) {
			$value = trim(wp_strip_all_tags($context->meta($post_id, $key)));
			if ('' !== $value) {
				return ['value' => $value, 'source' => $source];
			}
		}

		return ['value' => '', 'source' => null];
	}
}

final class Indexability_Analysis {
	public static function analyze(\WP_Post $post, Post_Analysis_Context $context): array {
		$robots = '';
		foreach (['_yoast_wpseo_meta-robots-noindex', '_aioseo_robots_noindex', 'rank_math_robots'] as $key) {
			$value = $context->meta((int) $post->ID, $key);
			if ('' !== $value) {
				$robots = strtolower($value);
				break;
			}
		}
		$noindex = in_array($robots, ['1', 'yes', 'true', 'noindex'], true) || str_contains($robots, 'noindex');
		$canonical = '';
		foreach (['_yoast_wpseo_canonical', 'rank_math_canonical_url', '_aioseo_canonical_url'] as $key) {
			$value = trim($context->meta((int) $post->ID, $key));
			if ('' !== $value) {
				$canonical = esc_url_raw($value);
				break;
			}
		}
		$findings = [];
		if ($noindex) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-indexability-noindex', 'medium', 'seo-indexability', 'Post is marked noindex', 'A supported robots signal indicates that the public post should not be indexed.', ['signal' => 'noindex'], 'seo');
		}

		return [
			'observations' => [
				'status' => sanitize_key((string) $post->post_status),
				'public' => 'publish' === $post->post_status && '' === (string) $post->post_password,
				'password_protected' => '' !== (string) $post->post_password,
				'noindex' => $noindex,
				'canonical' => ['available' => '' !== $canonical, 'value' => $canonical],
				'sitemap' => ['determinable' => false, 'included' => null],
			],
			'findings' => $findings,
		];
	}
}

final class Content_Analysis {
	private const MAX_BYTES = 100000;

	public static function analyze(string $content): array {
		$content = substr($content, 0, self::MAX_BYTES);
		$document = new \DOMDocument('1.0', 'UTF-8');
		$previous = libxml_use_internal_errors(true);
		$document->loadHTML('<?xml encoding="UTF-8">' . $content, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
		libxml_clear_errors();
		libxml_use_internal_errors($previous);
		$findings = [];
		$headings = self::headings($document, $findings);
		$images = self::images($document, $findings);
		$links = self::links($document, $findings);
		return compact('headings', 'images', 'links', 'findings');
	}

	private static function headings(\DOMDocument $document, array &$findings): array {
		$nodes = $document->getElementsByTagName('*');
		$count = 0;
		$h1 = 0;
		$empty = 0;
		$long = 0;
		$jumps = 0;
		$previous = 0;
		foreach ($nodes as $node) {
			if (!preg_match('/^h([1-6])$/i', $node->nodeName, $match)) { continue; }
			$count++;
			$level = (int) $match[1];
			if (1 === $level) { $h1++; }
			$text = trim(wp_strip_all_tags((string) $node->textContent));
			if ('' === $text) { $empty++; }
			if (self::length($text) > 80) { $long++; }
			if ($previous > 0 && $level > $previous + 1) { $jumps++; }
			$previous = $level;
		}
		if (0 === $h1 && $count > 0) { $findings[] = self::finding('seo-heading-missing-h1', 'low', 'No H1 heading was observed.'); }
		if ($h1 > 1) { $findings[] = self::finding('seo-heading-multiple-h1', 'low', 'Multiple H1 headings were observed.', ['count' => $h1]); }
		if ($empty > 0) { $findings[] = self::finding('seo-heading-empty', 'low', 'Empty headings were observed.', ['count' => $empty]); }
		if ($long > 0) { $findings[] = self::finding('seo-heading-long', 'info', 'Unusually long headings were observed.', ['count' => $long]); }
		if ($jumps > 0) { $findings[] = self::finding('seo-heading-hierarchy-jump', 'low', 'Heading hierarchy jumps were observed.', ['count' => $jumps]); }
		return ['count' => $count, 'h1_count' => $h1, 'empty_count' => $empty, 'long_count' => $long, 'hierarchy_jump_count' => $jumps];
	}

	private static function images(\DOMDocument $document, array &$findings): array {
		$nodes = $document->getElementsByTagName('img');
		$missing = 0;
		$long = 0;
		foreach ($nodes as $node) {
			$alt = trim((string) $node->getAttribute('alt'));
			if ('' === $alt) { $missing++; }
			if (self::length($alt) > 125) { $long++; }
		}
		return ['count' => $nodes->length, 'missing_alt_count' => $missing, 'long_alt_count' => $long];
	}

	private static function links(\DOMDocument $document, array &$findings): array {
		$nodes = $document->getElementsByTagName('a');
		$missing = 0;
		$malformed = 0;
		$internal = 0;
		$external = 0;
		$seen = [];
		$duplicates = 0;
		$site_host = wp_parse_url(home_url('/'), PHP_URL_HOST);
		foreach ($nodes as $node) {
			$href = trim((string) $node->getAttribute('href'));
			if ('' === $href) { $missing++; continue; }
			$parsed = wp_parse_url($href);
			if (false === $parsed || (isset($parsed['scheme']) && !in_array(strtolower($parsed['scheme']), ['http', 'https', 'mailto', 'tel'], true))) { $malformed++; continue; }
			$key = strtolower($href);
			if (isset($seen[$key])) { $duplicates++; }
			$seen[$key] = true;
			if (isset($parsed['host']) && $site_host && strtolower((string) $parsed['host']) === strtolower((string) $site_host)) { $internal++; }
			elseif (isset($parsed['host'])) { $external++; }
		}
		if ($missing > 0) { $findings[] = self::finding('seo-link-missing-href', 'medium', 'Links without href values were observed.', ['count' => $missing]); }
		if ($malformed > 0) { $findings[] = self::finding('seo-link-malformed', 'low', 'Malformed link URLs were observed.', ['count' => $malformed]); }
		if ($duplicates > 0) { $findings[] = self::finding('seo-link-duplicate', 'low', 'Duplicate link URLs were observed.', ['count' => $duplicates]); }
		return ['count' => $nodes->length, 'internal_count' => $internal, 'external_count' => $external, 'missing_href_count' => $missing, 'malformed_count' => $malformed, 'duplicate_count' => $duplicates];
	}

	private static function finding(string $id, string $severity, string $message, array $evidence = []): array {
		return \BrianAzukaeme\AIDiagnosticBridge\Response::finding($id, $severity, 'seo-content', $message, $message, $evidence, 'seo');
	}

	private static function length(string $value): int { return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value); }
}

final class Image_Analysis {
	public static function analyze(string $content, int $post_id, Post_Analysis_Context $context): array {
		$document = new \DOMDocument('1.0', 'UTF-8');
		$previous = libxml_use_internal_errors(true);
		$document->loadHTML('<?xml encoding="UTF-8">' . substr($content, 0, 100000), LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
		libxml_clear_errors();
		libxml_use_internal_errors($previous);
		$items = [];
		$missing = 0;
		$long = 0;
		foreach ($document->getElementsByTagName('img') as $node) {
			$src = esc_url_raw(trim((string) $node->getAttribute('src')));
			$alt = trim((string) $node->getAttribute('alt'));
			$attachment_id = '' !== $src ? $context->attachment_id($src) : 0;
			$items[] = [
				'attachment_id' => $attachment_id,
				'url' => $src,
				'filename' => $attachment_id > 0 ? $context->attachment_filename($attachment_id) : ('' !== $src ? sanitize_file_name((string) basename((string) wp_parse_url($src, PHP_URL_PATH))) : ''),
				'alt_present' => '' !== $alt,
				'alt_length' => self::length($alt),
				'featured' => false,
			];
			if ('' === $alt) { $missing++; }
			if (self::length($alt) > 125) { $long++; }
		}
		$featured_id = $context->featured_image_id($post_id);
		if ($featured_id > 0 && !array_filter($items, static fn (array $item): bool => $item['attachment_id'] === $featured_id)) {
			$items[] = [
				'attachment_id' => $featured_id,
				'url' => esc_url_raw($context->attachment_url($featured_id)),
				'filename' => $context->attachment_filename($featured_id),
				'alt_present' => '' !== $context->attachment_alt($featured_id),
				'alt_length' => self::length($context->attachment_alt($featured_id)),
				'featured' => true,
			];
		}
		$findings = [];
		if ($missing > 0) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-image-missing-alt', 'medium', 'seo-image', 'Images without alt text were observed.', 'One or more content images have no alt text.', ['count' => $missing], 'seo');
		}
		if ($long > 0) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-image-long-alt', 'info', 'seo-image', 'Unusually long image alt text was observed.', 'One or more image alt values exceed the observation threshold.', ['count' => $long], 'seo');
		}
		return ['observations' => ['count' => count($items), 'missing_alt_count' => $missing, 'items' => $items], 'findings' => $findings];
	}

	private static function length(string $value): int { return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value); }
}

final class Meta_Description_Checks {
	public static function findings(string $description, array $known_descriptions = [], array $thresholds = []): array {
		$description = trim($description);
		$length = self::length($description);
		$minimum = self::threshold($thresholds['meta_min_length'] ?? 50, 1, 320);
		$maximum = self::threshold($thresholds['meta_max_length'] ?? 160, $minimum, 320);
		$evidence = ['length' => $length, 'min_length' => $minimum, 'max_length' => $maximum];
		$findings = [];

		if ('' === $description) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-meta-description-missing', 'medium', 'seo-meta', 'Meta description is missing', 'No supported meta description was observed.', $evidence, 'seo');
		} elseif ($length < $minimum) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-meta-description-short', 'low', 'seo-meta', 'Meta description is unusually short', 'The meta description is shorter than the configured observation threshold.', $evidence, 'seo');
		} elseif ($length > $maximum) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-meta-description-long', 'low', 'seo-meta', 'Meta description is unusually long', 'The meta description is longer than the configured observation threshold.', $evidence, 'seo');
		}

		$normalized = strtolower($description);
		$matches = count(array_keys(array_map(static fn ($value): string => strtolower(trim(wp_strip_all_tags((string) $value))), $known_descriptions), $normalized, true));
		if ('' !== $description && $matches > 1) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-meta-description-duplicate', 'low', 'seo-meta', 'Duplicate meta description observed', 'Another analyzed public post or page has the same meta description.', ['match_count' => $matches], 'seo');
		}

		return $findings;
	}

	private static function threshold($value, int $minimum, int $maximum): int {
		$value = filter_var($value, FILTER_VALIDATE_INT);
		return false === $value ? $minimum : max($minimum, min($maximum, $value));
	}

	private static function length(string $value): int {
		return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
	}
}

final class Title_Checks {
	public static function findings(string $title, string $slug, array $known_titles = [], array $thresholds = []): array {
		$title = trim($title);
		$slug = sanitize_title($slug);
		$length = self::length($title);
		$minimum = self::threshold($thresholds['min_length'] ?? 10, 1, 160);
		$maximum = self::threshold($thresholds['max_length'] ?? 60, $minimum, 160);
		$findings = [];
		$evidence = ['length' => $length, 'min_length' => $minimum, 'max_length' => $maximum];

		if ('' === $title) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-title-missing', 'medium', 'seo-title', 'Title is missing', 'The public post or page has no title.', $evidence, 'seo');
		} elseif ($length < $minimum) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-title-short', 'low', 'seo-title', 'Title is unusually short', 'The title is shorter than the configured observation threshold.', $evidence, 'seo');
		} elseif ($length > $maximum) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-title-long', 'low', 'seo-title', 'Title is unusually long', 'The title is longer than the configured observation threshold.', $evidence, 'seo');
		}

		$normalized_titles = array_map(static fn ($value): string => strtolower(trim(wp_strip_all_tags((string) $value))), $known_titles);
		if ('' !== $title && 1 < count(array_keys($normalized_titles, strtolower($title), true))) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-title-duplicate', 'low', 'seo-title', 'Duplicate title observed', 'Another analyzed public post or page has the same title.', ['match_count' => count(array_keys($normalized_titles, strtolower($title), true))], 'seo');
		}

		$title_slug = sanitize_title($title);
		if ('' !== $title && '' !== $slug && $title_slug !== $slug) {
			$findings[] = \BrianAzukaeme\AIDiagnosticBridge\Response::finding('seo-title-slug-mismatch', 'info', 'seo-title', 'Title and slug differ', 'The title-derived slug differs from the stored slug; this is an observation for review, not a ranking judgment.', ['title_slug' => $title_slug, 'slug' => $slug], 'seo');
		}

		return $findings;
	}

	private static function threshold($value, int $minimum, int $maximum): int {
		$value = filter_var($value, FILTER_VALIDATE_INT);
		return false === $value ? $minimum : max($minimum, min($maximum, $value));
	}

	private static function length(string $value): int {
		return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
	}
}
