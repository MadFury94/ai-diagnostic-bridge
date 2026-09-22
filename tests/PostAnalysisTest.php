<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Post_Analysis;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Post_Analysis_Context;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Title_Checks;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Meta_Description_Checks;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\SEO_Metadata;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Indexability_Analysis;
use PHPUnit\Framework\TestCase;

final class PostAnalysisFixture extends Post_Analysis_Context {
	public function __construct(private readonly ?\WP_Post $post, private readonly array $meta = []) {}
	public function get(int $post_id): ?\WP_Post { return $this->post; }
	public function meta(int $post_id, string $key): string { return (string) ($this->meta[$key] ?? ''); }
}

final class PostAnalysisTest extends TestCase {
	public function test_title_checks_are_configurable_and_bounded(): void {
		$findings = Title_Checks::findings('A', 'a', ['A', 'A'], ['min_length' => 5, 'max_length' => 20]);
		$ids = array_column($findings, 'id');

		$this->assertContains('seo-title-short', $ids);
		$this->assertContains('seo-title-duplicate', $ids);
		$this->assertNotContains('seo-title-long', $ids);
		$this->assertStringNotContainsString('A', wp_json_encode($findings[0]['evidence']));
	}

	public function test_title_slug_observation_is_informational_only(): void {
		$findings = Title_Checks::findings('A sufficiently long public title', 'different-slug', [], ['min_length' => 5, 'max_length' => 60]);
		$this->assertSame(['info'], array_column($findings, 'severity'));
	}

	public function test_supported_metadata_reader_and_meta_description_checks(): void {
		$context = new PostAnalysisFixture(null, ['rank_math_description' => 'A sufficiently descriptive summary for a public fixture post.']);
		$metadata = SEO_Metadata::description(12, $context);
		$this->assertSame('rank_math', $metadata['source']);
		$this->assertStringContainsString('descriptive summary', $metadata['value']);

		$findings = Meta_Description_Checks::findings($metadata['value'], [$metadata['value'], $metadata['value']], ['meta_min_length' => 10, 'meta_max_length' => 160]);
		$this->assertContains('seo-meta-description-duplicate', array_column($findings, 'id'));
		$this->assertNotContains('seo-meta-description-missing', array_column($findings, 'id'));
	}

	public function test_missing_meta_description_is_medium_and_raw_value_is_not_in_evidence(): void {
		$findings = Meta_Description_Checks::findings('', [], ['meta_min_length' => 10, 'meta_max_length' => 160]);
		$this->assertSame('medium', $findings[0]['severity']);
		$this->assertSame('seo-meta-description-missing', $findings[0]['id']);
		$this->assertSame(['length' => 0, 'min_length' => 10, 'max_length' => 160], $findings[0]['evidence']);
	}

	public function test_indexability_reports_supported_noindex_and_canonical_signals(): void {
		$post = new \WP_Post((object) [
			'ID' => 14,
			'post_type' => 'page',
			'post_status' => 'publish',
			'post_password' => '',
		]);
		$context = new PostAnalysisFixture($post, [
			'_yoast_wpseo_meta-robots-noindex' => '1',
			'_yoast_wpseo_canonical' => 'https://example.test/public-page/',
		]);
		$result = Indexability_Analysis::analyze($post, $context);

		$this->assertTrue($result['observations']['noindex']);
		$this->assertTrue($result['observations']['canonical']['available']);
		$this->assertFalse($result['observations']['sitemap']['determinable']);
		$this->assertSame('seo-indexability-noindex', $result['findings'][0]['id']);
	}

	public function test_content_analysis_reports_heading_image_and_link_issues_without_raw_markup(): void {
		$post = new \WP_Post((object) [
			'ID' => 15, 'post_type' => 'post', 'post_status' => 'publish', 'post_password' => '',
			'post_title' => 'Content fixture', 'post_name' => 'content-fixture', 'post_content' => '<h2>Section</h2><img src="https://example.test/a.jpg"><a href="/one">One</a><a href="/one">Again</a><a>Missing</a>',
		]);
		$result = Post_Analysis::run(15, new PostAnalysisFixture($post));
		$ids = array_column($result['findings'], 'id');
		$this->assertContains('seo-heading-missing-h1', $ids);
		$this->assertContains('seo-image-missing-alt', $ids);
		$this->assertContains('seo-link-missing-href', $ids);
		$this->assertContains('seo-link-duplicate', $ids);
		$this->assertSame(1, $result['metadata']['observations']['images']['missing_alt_count']);
		$this->assertStringNotContainsString('example.test/a.jpg', wp_json_encode($result));
	}

	public function test_image_analysis_reports_attachment_and_featured_fields(): void {
		$post = new \WP_Post((object) [
			'ID' => 16, 'post_type' => 'post', 'post_status' => 'publish', 'post_password' => '',
			'post_title' => 'Image fixture', 'post_name' => 'image-fixture', 'post_content' => '<img src="https://example.test/photo.jpg" alt="A photo">',
		]);
		$context = new PostAnalysisFixture($post);
		$result = \BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Image_Analysis::analyze($post->post_content, 16, $context);
		$this->assertSame(1, $result['observations']['count']);
		$this->assertFalse($result['observations']['featured_image']['present']);
		$this->assertSame('photo.jpg', $result['observations']['items'][0]['filename']);
		$this->assertTrue($result['observations']['items'][0]['alt_present']);
		$this->assertSame(0, $result['observations']['items'][0]['attachment_id']);
	}

	public function test_public_post_returns_bounded_observations(): void {
		$post = new \WP_Post((object) [
			'ID' => 12,
			'post_type' => 'post',
			'post_status' => 'publish',
			'post_password' => '',
			'post_title' => 'A public fixture post',
			'post_name' => 'public-fixture-post',
			'post_excerpt' => 'Short summary',
			'post_content' => 'One two three four.',
		]);
		$result = Post_Analysis::run(12, new PostAnalysisFixture($post));

		$this->assertSame('warning', $result['check']['status']);
		$this->assertSame(12, $result['metadata']['post']['id']);
		$this->assertSame('post', $result['metadata']['post_type']);
		$this->assertSame('A public fixture post', $result['metadata']['observations']['title']['value']);
		$this->assertSame('public-fixture-post', $result['metadata']['observations']['slug']['value']);
		$this->assertSame(4, $result['metadata']['observations']['word_count']);
		$this->assertFalse($result['metadata']['observations']['meta_description']['available']);
		$this->assertStringNotContainsString('One two three four', wp_json_encode($result));
	}

	public function test_missing_or_non_public_post_is_not_applicable_without_content(): void {
		$post = new \WP_Post((object) [
			'ID' => 13,
			'post_type' => 'post',
			'post_status' => 'private',
			'post_password' => '',
			'post_title' => 'Private title',
			'post_content' => 'Private content',
		]);
		$result = Post_Analysis::run(13, new PostAnalysisFixture($post));

		$this->assertSame('not_applicable', $result['check']['status']);
		$this->assertSame([], $result['findings']);
		$this->assertNull($result['metadata']['post']);
		$this->assertStringNotContainsString('Private content', wp_json_encode($result));
	}
}
