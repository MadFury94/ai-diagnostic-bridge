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
}
