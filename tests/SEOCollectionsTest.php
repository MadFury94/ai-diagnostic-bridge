<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\SEO_Collections;
use PHPUnit\Framework\TestCase;

final class SEOCollectionsTest extends TestCase {
	public function test_collection_bounds_are_rejected(): void {
		$this->assertSame(400, SEO_Collections::posts(0, 20)->get_error_data()['status']);
		$this->assertSame(400, SEO_Collections::issues(1, 51)->get_error_data()['status']);
	}

	public function test_site_result_has_determinable_indexability_shape(): void {
		$result = SEO_Collections::site();
		$this->assertTrue($result['success']);
		$this->assertArrayHasKey('indexability', $result['metadata']);
		$this->assertFalse($result['metadata']['indexability']['sitemap']['determinable']);
	}

	public function test_empty_page_has_stable_empty_items_and_pagination(): void {
		$result = SEO_Collections::posts(1000, 50);
		$this->assertTrue($result['success']);
		$this->assertSame([], $result['metadata']['items']);
		$this->assertSame(1000, $result['metadata']['pagination']['page']);
		$this->assertSame(50, $result['metadata']['pagination']['per_page']);
	}

	public function test_issue_aggregation_returns_stable_counts_without_raw_content(): void {
		$result = SEO_Collections::issues(1, 50);
		$this->assertTrue($result['success']);
		$this->assertArrayHasKey('issue_counts', $result['metadata']);
		$this->assertIsArray($result['metadata']['issue_counts']);
		$this->assertStringNotContainsString('fixture-secret', wp_json_encode($result));
	}
}
