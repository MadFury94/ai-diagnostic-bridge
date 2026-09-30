# AI Diagnostic Bridge

AI Diagnostic Bridge is a read-only WordPress plugin for deterministic support and SEO evidence. It reports structured observations and findings; it does not edit posts, change settings, install or update plugins, or call an AI provider. Version 0.1.6 requires WordPress 6.5+ and PHP 8.1+.

## Installation

1. Download or clone this repository.
2. Copy the `ai-diagnostic-bridge` directory into `wp-content/plugins/`.
3. Activate **AI Diagnostic Bridge** in WordPress admin.
4. Open **Settings -> AI Diagnostic Bridge** and generate a credential.
5. Copy the credential immediately into a server-side secret store such as a Cloudflare Worker. It is displayed once and is never returned by the REST API.
6. Send authenticated requests with `Authorization: Bearer <credential>`.

The plugin can also be installed from a packaged release ZIP. Do not put the credential in browser JavaScript, source control, or a public configuration file.

## REST API

The namespace is `/wp-json/ai-diagnostic/v1/`. Every plugin route requires the diagnostic Bearer credential. Unauthenticated requests return HTTP 401.

Core checks:

- `GET /site`
- `GET /health`
- `GET /plugins`
- `GET /themes`
- `GET /errors`
- `GET /rest-api`
- `GET /performance`
- `GET /security`
- `GET /woocommerce`

SEO checks:

- `GET /seo/post/{id}` for one explicitly requested public post or page
- `GET /seo/posts?page=1&per_page=20`
- `GET /seo/issues?page=1&per_page=20`
- `GET /seo/site`
- `GET /images/issues?page=1&per_page=20`
- `GET /links/issues?page=1&per_page=20`

Collection `page` is limited to 1-1000 and `per_page` to 1-50. Diagnostic check lists contain at most 20 entries and only allow exact registered IDs.

Combined checks can be requested with GET:

```bash
curl -H 'Authorization: Bearer YOUR_TOKEN' \
  'https://example.com/wp-json/ai-diagnostic/v1/diagnostic?checks=health,plugins,woocommerce'
```

POST accepts a JSON object:

```bash
curl -X POST -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{"checks":["health","plugins"]}' \
  'https://example.com/wp-json/ai-diagnostic/v1/diagnostic'
```

Responses use a stable envelope with `success`, `plugin`, `check`, `findings`, and `metadata`. Findings contain bounded evidence rather than raw post bodies, credentials, customer data, action arguments, or PHP log lines.

Deterministic finding coverage includes SEO title/meta/indexability, headings, images, links, plugin updates and known vulnerabilities, WordPress core updates, and `builder-plugin-inactive`. The builder check currently covers Elementor and Elementor Pro: it reports inactive dependencies when published pages contain recognized builder content, and reports site-wide Elementor Pro header/footer templates when Pro is inactive. It does not claim who caused a deactivation.

## Security model

REST authentication uses a generated 256-bit random token. WordPress stores only a password hash; the raw token is displayed once through the admin screen. Revoke and regenerate invalidate the previous credential. Failed authentication is rate-limited per client and route for five minutes after ten failures. Activity logging records only endpoint, result, duration, timestamp, and authentication outcome; request headers, bodies, query values, and response contents are excluded.

Admin credential actions require `manage_options` and WordPress nonces. Admin-rendered values are escaped. Diagnostic input is allowlisted and bounded, and no request value selects a PHP function, file, SQL query, shell command, hook, or arbitrary class.

The plugin's vulnerability lookup uses the public keyless WPVulnerability feed. It has no API token. Successful clean and matching results are cached per slug for four hours in WordPress transients; failures are never cached as clean. Update findings use WordPress core's existing update transient and never perform updates.

## AI boundary

The plugin supplies deterministic evidence only. It has no AI provider integration and never asks an AI system to write to WordPress. A future dashboard may interpret verified findings and draft support guidance, but any repair remains a separate, human-reviewed action.

## Tests

Run the local WordPress suite with the disposable environment:

```bash
.tools/php/php.exe -d auto_prepend_file=tests/local-bootstrap.php .tools/phpunit.phar -c phpunit.xml.dist
```

The verified 2026-09-30 result is **84 tests, 820 assertions, and one expected WooCommerce-absent skip**, with no failures or errors. Before this pass, the suite had 84 tests, 812 assertions, and two errors caused by misspelled class references in the Elementor tests. Worker tests passed 37/37 before and after; Worker type-checking, the dashboard production build, and syntax checks for all 42 project PHP files passed.

Development analysis tools are installed through the committed Composer lockfile:

```bash
composer install
composer lint
composer analyse
```

PHPCS runs the full WordPress Coding Standards ruleset on the 26 shipped PHP files. PHPStan runs at level 5 with WordPress/WooCommerce definitions and a 3 GB memory allowance. The T11.3 analysis and safe-fix pass is complete, **but neither static gate is clean**: PHPCS decreased from 2,526 errors/487 warnings on committed source to 210 errors/8 warnings, and the first complete framework-aware PHPStan run decreased from 12 findings to 6. Both commands still exit nonzero; no findings are hidden by a baseline or disabled rules. Remaining documentation, file-organization, and behavioral review items are listed in [QUALITY-REPORT.md](QUALITY-REPORT.md), with full portable reports in `quality/`.

## Troubleshooting and limitations

- A 401 means the Bearer credential is missing, malformed, revoked, or rate-limited. Generate a new credential in the admin screen and wait for the rate-limit window if needed.
- A `not_applicable` result can mean an optional component is not installed or its required API is unavailable; it is not a claim that the site is broken.
- WooCommerce present behavior is covered by automated fixtures. Manual break/repair exercises were separately verified against Anbe's live WooCommerce installation. SQLite has a known stock-reservation limitation in the disposable test environment.
- Error-log reads require `WP_DEBUG` and `WP_DEBUG_LOG`; raw log messages are intentionally withheld.
- Optional bounded internal-link verification is not implemented. Ordinary link analysis classifies links and never crawls or makes unbounded internal requests.
- Vulnerability data depends on the availability and coverage of the public WPVulnerability feed. A timeout, malformed response, or incomplete advisory remains unknown and cannot create a clean or vulnerability claim.
- The plugin does not detect general non-security update bugs, and it does not prove exploitation, compatibility, checkout success, or search-engine indexing.

Project implementation status and evidence are tracked in [PLAN.md](PLAN.md), [PROGRESS.md](PROGRESS.md), and [SUPPORT-JOURNAL.md](SUPPORT-JOURNAL.md).

