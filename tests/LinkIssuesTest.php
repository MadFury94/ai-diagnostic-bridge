<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Link_Issues;
use PHPUnit\Framework\TestCase;

final class LinkIssuesTest extends TestCase {
	public function test_pagination_bounds_are_rejected(): void {
		$this->assertSame(400, Link_Issues::run(0, 20)->get_error_data()['status']);
		$this->assertSame(400, Link_Issues::run(1, 51)->get_error_data()['status']);
	}

	public function test_collection_returns_items_and_pagination_shape(): void {
		$result = Link_Issues::run(1, 1);
		$this->assertTrue($result['success']);
		$this->assertArrayHasKey('items', $result['metadata']);
		$this->assertSame(['page', 'per_page', 'total', 'pages'], array_keys($result['metadata']['pagination']));
	}

	public function test_internal_link_classification_does_not_crawl_or_hang_on_slow_urls(): void {
		$calls = 0;
		$filter = static function ($pre) use (&$calls) { ++$calls; return new \WP_Error('should_not_crawl'); };
		add_filter('pre_http_request', $filter);
		try {
			$result = \BrianAzukaeme\AIDiagnosticBridge\Diagnostics\Content_Analysis::analyze('<a href="http://127.0.0.1/slow">slow internal link</a>');
		} finally {
			remove_filter('pre_http_request', $filter);
		}
		$this->assertSame(0, $calls, 'Ordinary link analysis must not perform an unbounded internal request.');
		$this->assertSame(1, $result['links']['internal_count']);
	}
}
