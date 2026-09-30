# T11.3 coding standards and static analysis — 2026-09-30

The requested analysis and safe-fix pass is complete. **The static-analysis gates are not clean:** PHPCS and PHPStan both still exit 1 for the findings retained below. No suppressions, ignored rules, or PHPStan baseline were added.

## Scope and tools

PHPCS uses the complete `WordPress` ruleset on all 26 shipped PHP files: the plugin bootstrap, uninstall script, `admin/`, and `includes/`. PHPStan uses the same scope at **level 5**, with PHP 8.1 as its target. Tests, dependencies, disposable WordPress installations, and generated assets are outside this production analysis scope. All project PHP files are syntax-checked and the full existing test suites are run separately.

Composer locks PHPCS 3.13.6, WordPress Coding Standards 3.4.1, PHPStan 2.2.16, the WordPress extension 2.0.4, WordPress stubs 7.1.0, and WooCommerce stubs 11.1.2. These are development dependencies. The stubs describe those API versions; this is not runtime compatibility proof for every supported WordPress/WooCommerce version. The local test runtime is PHP 8.3.33 and PHPUnit 10.5.64.

The unfinished workspace already contained Composer tooling, formatting changes, and reports. Its old PHPStan report had 332 errors without WordPress definitions and was not a meaningful framework-aware result. Installed the WordPress extension and WooCommerce stubs, added a constants-only bootstrap and template-scope documentation, and limited analysis to one worker. Runs with 256 MB and 1 GB were incomplete due to memory exhaustion; the complete runs used `--memory-limit=3G`.

## Before and after

| Check | Before | After |
| --- | --- | --- |
| PHPCS, fresh copy of committed `c6aa4b9` versus final tree | 2,526 errors, 487 warnings | 210 errors, 8 warnings; 0 fixable |
| PHPCS, resumed unfinished working tree | 230 errors, 9 warnings | 210 errors, 8 warnings |
| PHPStan, first complete framework-aware run versus final run | 12 findings | 6 findings |
| Full local WordPress PHPUnit suite | 84 tests, 812 assertions, 2 errors, 1 skip; exit 1 | 84 tests, 820 assertions, 0 errors/failures, 1 skip; exit 0 |
| Full Worker Vitest suite | 37 passed | 37 passed |

The one PHP skip is the expected WooCommerce-absent case on this WooCommerce-present disposable installation. The final PHP run took 15.954 seconds; this is test runtime, not investigation time or time saved. Worker TypeScript checking, the dashboard TypeScript/Vite production build, Composer validation, and syntax checks across all **42 project PHP files** also passed. There is no separate dashboard test script.

The saved earlier PHPCS report recorded 3,046 errors and 462 warnings. Its original invocation/environment was not preserved, so it is historical evidence, not the baseline used for the fresh committed-source comparison above. Portable evidence is in [quality/phpcs-before-summary.json](quality/phpcs-before-summary.json), [quality/phpcs.json](quality/phpcs.json), [quality/phpstan-first-complete.json](quality/phpstan-first-complete.json), and [quality/phpstan.json](quality/phpstan.json). The final reports retain every outstanding location and rule identifier.

## Safe changes

- Retained and reviewed the prior WordPress formatting pass: whitespace, indentation, array syntax, multiline layout, and equivalent standalone increment syntax. Reran PHPCBF and applied remaining straightforward comparison/ternary/assignment formatting.
- Expanded short ternaries without changing truthiness or evaluating URL sanitization twice; separated a cache assignment from its return.
- Removed two redundant null fallbacks for a key guaranteed by the private Elementor Pro definition and its branch condition.
- Removed an unused by-reference parameter from a private image-count helper and its sole call site.
- Corrected SEO response parameter documentation, documented the admin template's actual include scope, and supplied plugin constants for analysis without booting WordPress.
- Fixed four misspelled `PostAnalysis::run()` references in two existing tests to use the imported `Post_Analysis` class. Fixed the Pro test's nested array extraction: `array_column()` does not interpret dotted paths. The repaired tests now execute eight previously unreachable assertions. These are real test defects, not production repairs.

## Retained findings and review decisions

### PHPStan: 6 findings

| Location | Finding | Review decision |
| --- | --- | --- |
| `includes/diagnostics/class-woocommerce.php`, `database_update_needed()`, `gateways()`, `hpos_enabled()` | Five always-true/redundant checks against the installed WooCommerce stub version | Keep optional-API guards. Removing them can change behavior on absent, older, or partially initialized WooCommerce installations. Review the supported runtime matrix before simplifying. |
| `includes/diagnostics/class-seo-manager.php`, `result()` | `array_values()` has no effect under its documented list input | Keep defensive reindexing pending review of the public response contract. Removing it changes JSON shape for a keyed array supplied by a caller outside the documented contract. |

These are review items, not confirmed production bugs. No runtime guards were removed and no types were weakened to force a zero result.

### PHPCS: 210 errors and 8 warnings

Of the errors, **194 concern documentation**: 129 missing function comments, 26 class comments, 24 file comments, 7 missing parameter tags, 5 missing short descriptions, and 3 property comments. Writing substantive API documentation is left as explicit editorial debt; placeholder comments were not generated merely to silence sniffs.

There are **14 file-organization findings**: 11 additional classes in files and 3 class/filename mismatches in the plugin inventory, post analysis, and WooCommerce adapter files. Splitting these requires reviewing bootstrap includes and consumers. The remaining **2 naming errors** concern native DOM properties `nodeName` and `textContent`; renaming those would break DOM access.

All eight warnings remain visible for review:

| Location | Count | Review |
| --- | --- | --- |
| `admin/views/settings.php`, `aidb_notice` | 2 | Display-only sanitized GET notice without a nonce. Credential mutations independently require capabilities and nonces. Review notice spoofing/UX before changing the redirect flow. |
| `includes/diagnostics/class-performance.php`, autoload query | 2 | Direct SQL and no cache. The query is fixed and reads the WordPress options table; caching changes diagnostic freshness. Review cost/freshness before changing it. |
| `includes/diagnostics/class-php-errors.php`, log reader | 3 | Suppressed `fopen()` errors and native `fopen()`/`fclose()`. The reader validates a local regular file, handles open failure, and reads a bounded tail. Replacing it with WP_Filesystem or removing suppression changes error/privacy and filesystem behavior. |
| `includes/diagnostics/class-seo-collections.php`, builder template lookup | 1 | Potentially slow `meta_query`. Review on a representative database before changing this evidence query. |

No production bug was confirmed by this pass. The test defects are recorded separately in SUPPORT-JOURNAL.md; style debt is not presented as a support incident. No live WordPress changes or Worker deployment were performed.

## Reproduce

With PHP and Composer on PATH:

```sh
composer install
composer lint
composer analyse
composer test:php
```

`composer lint` and `composer analyse` currently return nonzero for the documented retained findings. The PHP tests require the disposable local WordPress/SQLite setup and `.tools/phpunit.phar` described in [LOCAL-WORDPRESS-SETUP.md](LOCAL-WORDPRESS-SETUP.md).

The commands actually used in this Windows workspace were:

```powershell
.tools/php/php.exe vendor/bin/phpcs
.tools/php/php.exe vendor/bin/phpcbf
.tools/php/php.exe vendor/bin/phpstan analyse --memory-limit=3G --no-progress
.tools/php/php.exe -d auto_prepend_file=tests/local-bootstrap.php .tools/phpunit.phar -c phpunit.xml.dist --no-progress
npm --prefix worker test
npm --prefix worker run check
npm --prefix dashboard run build
```

Configuration follows the [WordPress PHPStan extension](https://github.com/szepeviktor/phpstan-wordpress) and [PHPStan configuration reference](https://phpstan.org/config-reference). See `phpcs.xml.dist`, `phpstan.neon.dist`, and the locked Composer dependencies for exact settings.
