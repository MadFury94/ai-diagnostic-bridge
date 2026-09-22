<?php

declare(strict_types=1);

namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;

use BrianAzukaeme\AIDiagnosticBridge\Response;

/**
 * Shared contract for explicit SEO analysis requests.
 *
 * The manager does not inspect posts. Individual analyzers will supply the
 * observation values and findings through this contract in later tasks.
 */
final class SEO_Manager {
	private const CONTRACT = 'seo_post_analysis';
	private const CONTRACT_VERSION = 1;

	/** @var list<string> */
	private const OBSERVATION_KEYS = [
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
	];

	/**
	 * Return a clean result when there is no requested public post/page.
	 */
	public static function run(?int $post_id = null): array {
		if ( null === $post_id || $post_id < 1 ) {
			return self::result(null, [], [], [ 'available' => false ]);
		}

		return self::result($post_id, [], [], [ 'available' => true ]);
	}

	/**
	 * Build the stable outer response used by every future SEO analyzer.
	 *
	 * Raw post content is deliberately not accepted as a top-level contract
	 * value. Later analyzers add bounded observations such as counts and safe
	 * metadata through the named observation slots.
	 *
	 * @param array<string,mixed> $observations
	 * @param list<array<string,mixed>> $findings
	 * @param array<string,mixed> $metadata
	 */
	public static function result(?int $post_id, array $observations, array $findings, array $metadata = []): array {
		$normalized_observations = array_fill_keys(self::OBSERVATION_KEYS, null);
		foreach (self::OBSERVATION_KEYS as $key) {
			if (array_key_exists($key, $observations)) {
				$normalized_observations[$key] = $observations[$key];
			}
		}

		$metadata = array_merge(
			[
				'contract' => self::CONTRACT,
				'contract_version' => self::CONTRACT_VERSION,
				'post' => null === $post_id ? null : [ 'id' => max(0, $post_id) ],
				'observations' => $normalized_observations,
				'available' => null !== $post_id && $post_id > 0,
			],
			$metadata
		);
		// Keep the contract keys stable even when an analyzer supplies metadata.
		$metadata['contract'] = self::CONTRACT;
		$metadata['contract_version'] = self::CONTRACT_VERSION;
		$metadata['post'] = null === $post_id ? null : [ 'id' => max(0, $post_id) ];
		$metadata['observations'] = $normalized_observations;
		$metadata['available'] = null !== $post_id && $post_id > 0;

		$has_actionable_finding = (bool) array_filter(
			$findings,
			static fn (array $finding): bool => 'info' !== ($finding['severity'] ?? 'info')
		);

		return Response::success(
			'seo',
			$has_actionable_finding ? 'warning' : (null === $post_id ? 'not_applicable' : 'ok'),
			array_values($findings),
			$metadata
		);
	}
}
