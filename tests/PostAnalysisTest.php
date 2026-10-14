<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Post_Analysis;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Post_Analysis_Context;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Title_Checks;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Meta_Description_Checks;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\SEO_Metadata;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Indexability_Analysis;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Accessibility_Analysis;
use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Content_Analysis;
use PHPUnit\Framework\TestCase;

final class PostAnalysisFixture extends Post_Analysis_Context {
	public function __construct(private readonly ?\WP_Post $post, private readonly array $meta = [], private readonly array $active = []) {}
	public function get(int $post_id): ?\WP_Post { return $this->post; }
	public function meta(int $post_id, string $key): string { return (string) ($this->meta[$key] ?? ''); }
	public function active_plugins(): array { return $this->active; }
}

final class PostAnalysisTest extends TestCase {
	public function test_elementor_content_requires_active_elementor_plugin(): void {
		$post = new \WP_Post((object) [ 'ID' => 91, 'post_type' => 'page', 'post_status' => 'publish', 'post_password' => '', 'post_title' => 'Builder page', 'post_name' => 'builder-page', 'post_content' => '' ]);
		$context = new PostAnalysisFixture($post, [ '_elementor_data' => '[{"elType":"section"}]', '_elementor_edit_mode' => 'builder' ], []);
		$result = Post_Analysis::run(91, $context);
		$finding = array_values(array_filter($result['findings'], static fn (array $item): bool => 'builder-plugin-inactive' === $item['id']))[0] ?? null;
		$this->assertNotNull($finding);
		$this->assertSame('high', $finding['severity']);
		$this->assertSame(['_elementor_data', '_elementor_edit_mode'], $finding['evidence']['meta_keys']);
		$active = new PostAnalysisFixture($post, [ '_elementor_data' => '[{"elType":"section"}]' ], ['elementor/elementor.php']);
		$this->assertNotContains('builder-plugin-inactive', array_column(Post_Analysis::run(91, $active)['findings'], 'id'));
	}
	public function test_elementor_pro_widget_requires_active_elementor_pro_plugin(): void {
		$post = new \WP_Post((object) [ 'ID' => 92, 'post_type' => 'page', 'post_status' => 'publish', 'post_password' => '', 'post_title' => 'Pro builder page', 'post_name' => 'pro-builder-page', 'post_content' => '' ]);
		$data = wp_json_encode([['elType' => 'widget', 'widgetType' => 'form']]);
		$inactive = new PostAnalysisFixture($post, ['_elementor_data' => $data], ['elementor/elementor.php']);
		$findings = Post_Analysis::run(92, $inactive)['findings'];
		$pro = array_values(array_filter($findings, static fn (array $item): bool => 'elementor-pro/elementor-pro.php' === ($item['evidence']['required_plugin'] ?? '')))[0] ?? null;
		$this->assertNotNull($pro);
		$this->assertSame('Elementor Pro is inactive; site-wide components may be missing', $pro['title']);
		$this->assertSame(['form'], $pro['evidence']['pro_widget_types']);
		$active = new PostAnalysisFixture($post, ['_elementor_data' => $data], ['elementor/elementor.php', 'elementor-pro/elementor-pro.php']);
		$this->assertNotContains('elementor-pro/elementor-pro.php', array_column(array_column(Post_Analysis::run(92, $active)['findings'], 'evidence'), 'required_plugin'));
	}
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
		$missing_alt = array_values( array_filter( $result['findings'], static fn ( array $finding ): bool => 'seo-image-missing-alt' === $finding['id'] ) )[0] ?? null;
		$this->assertContains( 'accessibility', $missing_alt['categories'] ?? [] );
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

	public function test_title_and_meta_edge_cases_are_evidence_bounded(): void {
		$title_findings = Title_Checks::findings('', '', [''], ['min_length' => 5, 'max_length' => 12]);
		$this->assertContains('seo-title-missing', array_column($title_findings, 'id'));
		$this->assertContains('seo-title-duplicate', array_column(Title_Checks::findings('Same title', 'same-title', ['Same title', 'Same title'], ['min_length' => 5, 'max_length' => 60]), 'id'));
		$this->assertContains('seo-title-long', array_column(Title_Checks::findings('This title is definitely too long', 'this-title-is-definitely-too-long', [], ['min_length' => 5, 'max_length' => 12]), 'id'));
		$this->assertContains('seo-title-slug-mismatch', array_column(Title_Checks::findings('A valid public title', 'different-slug', [], ['min_length' => 5, 'max_length' => 60]), 'id'));

		$this->assertContains('seo-meta-description-missing', array_column(Meta_Description_Checks::findings('   ', [], ['meta_min_length' => 10, 'meta_max_length' => 30]), 'id'));
		$this->assertContains('seo-meta-description-short', array_column(Meta_Description_Checks::findings('short', [], ['meta_min_length' => 10, 'meta_max_length' => 30]), 'id'));
		$this->assertContains('seo-meta-description-long', array_column(Meta_Description_Checks::findings(str_repeat('long ', 10), [], ['meta_min_length' => 10, 'meta_max_length' => 30]), 'id'));
		$this->assertContains('seo-meta-description-duplicate', array_column(Meta_Description_Checks::findings('Repeated description', ['Repeated description', 'Repeated description'], ['meta_min_length' => 5, 'meta_max_length' => 60]), 'id'));
		$this->assertStringNotContainsString('Repeated description', wp_json_encode(Meta_Description_Checks::findings('Repeated description', ['Repeated description', 'Repeated description'], ['meta_min_length' => 5, 'meta_max_length' => 60])));
	}

	public function test_password_protected_posts_are_excluded_without_leaking_content(): void {
		$post = new \WP_Post((object) [
			'ID' => 17, 'post_type' => 'post', 'post_status' => 'publish', 'post_password' => 'secret',
			'post_title' => 'Protected title', 'post_name' => 'protected-title', 'post_content' => 'Protected body marker',
		]);
		$result = Post_Analysis::run(17, new PostAnalysisFixture($post));
		$this->assertSame('not_applicable', $result['check']['status']);
		$this->assertSame([], $result['findings']);
		$this->assertStringNotContainsString('Protected body marker', wp_json_encode($result));
		$this->assertStringNotContainsString('Protected title', wp_json_encode($result));
	}

	public function test_malformed_markup_and_heading_structure_are_graceful(): void {
		$result = \BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Content_Analysis::analyze('<h2><span>Unclosed<h1>First</h1><h1>Second</h1><h4></h4><a href="/broken">link');
		$ids = array_column($result['findings'], 'id');
		$this->assertContains('seo-heading-multiple-h1', $ids);
		$this->assertContains('seo-heading-empty', $ids);
		$this->assertContains('seo-heading-hierarchy-jump', $ids);
		$hierarchy = array_values( array_filter( $result['findings'], static fn ( array $finding ): bool => 'seo-heading-hierarchy-jump' === $finding['id'] ) )[0] ?? null;
		$this->assertContains( 'accessibility', $hierarchy['categories'] ?? [] );
		$this->assertIsInt($result['links']['count']);
		$this->assertIsInt($result['images']['count']);
	}

	public function test_accessibility_markup_findings_fire_for_each_markup_violation(): void {
		$html = '<html><body><img src="https://example.test/IMG_1234.jpg" alt="IMG_1234.jpg"><input type="email"><textarea></textarea><select><option>Choose</option></select><div id="duplicate"></div><span id="duplicate"></span><a href="/shop">Click here</a></body></html>';
		$ids = array_column( Accessibility_Analysis::site_markup( $html )['findings'], 'id' );
		$this->assertContains( 'a11y-alt-text-unhelpful', $ids );
		$this->assertContains( 'a11y-form-input-no-label', $ids );
		$this->assertContains( 'a11y-missing-lang-attribute', $ids );
		$this->assertContains( 'a11y-duplicate-id', $ids );
		$this->assertContains( 'a11y-nondescriptive-link-text', $ids );
		$fixed = '<html lang="en"><body><img src="https://example.test/IMG_1234.jpg" alt="Red summer dress"><label for="email">Email</label><input id="email" type="email"><label>Message<textarea></textarea></label><label for="size">Size</label><select id="size"><option>Choose</option></select><div id="one"></div><span id="two"></span><a href="/shop">Shop the summer collection</a></body></html>';
		$this->assertSame( [], Accessibility_Analysis::site_markup( $fixed )['findings'] );
	}

	public function test_checkout_unlabelled_controls_are_high_and_existing_seo_findings_are_also_accessibility_tagged(): void {
		$checkout = Content_Analysis::analyze( '<h2>Checkout</h2><input type="text">', true );
		$form = array_values( array_filter( $checkout['findings'], static fn ( array $finding ): bool => 'a11y-form-input-no-label' === $finding['id'] ) )[0] ?? null;
		$this->assertNotNull( $form );
		$this->assertSame( 'high', $form['severity'] );
		$heading = array_values( array_filter( $checkout['findings'], static fn ( array $finding ): bool => 'seo-heading-missing-h1' === $finding['id'] ) )[0] ?? null;
		$this->assertContains( 'accessibility', $heading['categories'] ?? [] );
	}

	public function test_local_wordpress_post_fixture_clears_accessibility_findings_after_markup_is_fixed(): void {
		$post = new \WP_Post((object) [
			'ID' => 93, 'post_type' => 'page', 'post_status' => 'publish', 'post_password' => '',
			'post_title' => 'Checkout', 'post_name' => 'checkout',
			'post_content' => '<h2>Checkout</h2><img src="https://example.test/IMG_1234.jpg" alt="IMG_1234.jpg"><input type="email"><div id="same"></div><span id="same"></span><a href="/shop">Read more</a>',
		]);
		$broken = Post_Analysis::run( 93, new PostAnalysisFixture( $post ) );
		$broken_ids = array_column( $broken['findings'], 'id' );
		$this->assertContains( 'a11y-alt-text-unhelpful', $broken_ids );
		$this->assertContains( 'a11y-form-input-no-label', $broken_ids );
		$this->assertContains( 'a11y-duplicate-id', $broken_ids );
		$this->assertContains( 'a11y-nondescriptive-link-text', $broken_ids );
		$post->post_content = '<h1>Checkout</h1><img src="https://example.test/IMG_1234.jpg" alt="Red summer dress"><label for="email">Email</label><input id="email" type="email"><div id="one"></div><span id="two"></span><a href="/shop">Shop the summer collection</a>';
		$fixed_ids = array_column( Post_Analysis::run( 93, new PostAnalysisFixture( $post ) )['findings'], 'id' );
		$this->assertNotContains( 'a11y-alt-text-unhelpful', $fixed_ids );
		$this->assertNotContains( 'a11y-form-input-no-label', $fixed_ids );
		$this->assertNotContains( 'a11y-duplicate-id', $fixed_ids );
		$this->assertNotContains( 'a11y-nondescriptive-link-text', $fixed_ids );
	}
}
