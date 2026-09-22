<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Tests;

use BrianAzukaeme\AIDiagnosticBridge\Diagnostics\SEO_Manager;
use PHPUnit\Framework\TestCase;

final class SEOManagerTest extends TestCase {
	public function test_empty_analysis_returns_stable_not_applicable_contract(): void {
		$result = SEO_Manager::run();

		$this->assertSame('not_applicable', $result['check']['status']);
		$this->assertSame([], $result['findings']);
		$this->assertSame(
			[
				'contract',
				'contract_version',
				'post',
				'observations',
				'available',
			],
			array_keys($result['metadata'])
		);
		$this->assertSame('seo_post_analysis', $result['metadata']['contract']);
		$this->assertSame(1, $result['metadata']['contract_version']);
		$this->assertFalse($result['metadata']['available']);
		$this->assertNull($result['metadata']['post']);
		$this->assertSame(
			[
				'title',
				'slug',
				'excerpt',
				'content',
				'word_count',
				'meta_description',
				'indexability',
				'headings',
				'images',
				'links',
			],
			array_keys($result['metadata']['observations'])
		);
	}

	public function test_info_findings_do_not_elevate_seo_status(): void {
		$finding = \BrianAzukaeme\AIDiagnosticBridge\Response::finding(
			'seo-title-observation',
			'info',
			'seo',
			'Title observed',
			'The title was observed.',
			[],
			'seo'
		);

		$result = SEO_Manager::result(12, [], [ $finding ]);

		$this->assertSame('ok', $result['check']['status']);
		$this->assertSame(12, $result['metadata']['post']['id']);
		$this->assertSame([ $finding ], $result['findings']);
	}
}
