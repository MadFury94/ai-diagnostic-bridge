# AI Diagnostic Bridge

Standalone WordPress plugin project for secure, deterministic WordPress support and SEO diagnostics. The plugin is the evidence layer in a future `React → Cloudflare Worker → Cloudflare AI → WordPress` architecture; it contains no AI provider integration and does not automatically change WordPress.

Implementation is tracked in [PLAN.md](PLAN.md). Version `0.1.5` includes the authenticated REST foundation, admin credential-management screen, and initial core diagnostics.

## Support purpose and project journal

This project also supports Brian's preparation for an Automattic Happiness Engineer application from January 2027 onward. [Application context](APPLICATION-CONTEXT.md) explains Jen's guidance and the separate Missus project. The [support evidence journal](SUPPORT-JOURNAL.md) records problems, verified AI corrections, before/after results, customer explanations, and remaining practice. Current tests and local API results are evidence of progress, not a claim of a finished AI product or measured customer time savings.

## Tests

The `tests/` directory contains PHPUnit tests for the stable response envelope, allowed status and severity values, finding fields, and safe error responses. Run them inside a WordPress PHPUnit environment with PHPUnit installed:

```bash
phpunit -c phpunit.xml.dist
```

The tests require WordPress so the plugin sanitization helpers and `WP_Error` implementation are available. They do not call external APIs or expose stored credentials.

For the disposable Windows setup in `local-wp2`, use the command in [LOCAL-WORDPRESS-SETUP.md](LOCAL-WORDPRESS-SETUP.md) with `--bootstrap tests/local-bootstrap.php`. This tests the plugin source checkout against the installed WordPress runtime and a temporary SQLite database snapshot. The snapshot is removed on shutdown; credential tests do not change the local site's token or log. This is not the official WordPress fixture framework. Verified on 2026-09-21: **40 tests, 629 assertions passed** on PHP 8.3.33 and PHPUnit 10.5.64.

## Combined diagnostic input

Authenticated `GET /ai-diagnostic/v1/diagnostic` accepts `checks` as a comma-separated string or an indexed list. `POST` supports a JSON object such as `{"checks":["health","plugins"]}`; JSON `checks` takes precedence over query/form values. Comma-separated strings remain supported in JSON as well.

Supported IDs are `site`, `health`, `plugins`, `themes`, `errors`, `rest-api`, `performance`, `security`, and `woocommerce`. IDs must match exactly. Duplicate IDs run once, in first-occurrence order. Omitted checks or an empty list default to `site`; explicit null, empty strings, non-string members, objects, nested lists, and unknown IDs return HTTP 400. Lists are limited to 20 entries before deduplication, and comma-separated input to 1,024 bytes. Oversized input is rejected rather than truncated. JSON bodies must be objects; WordPress rejects malformed JSON with its standard `rest_invalid_json` error. Unknown fields are ignored and cannot select executable code.

## PHP log and REST diagnostics

The `/errors` check reads only when `WP_DEBUG` and `WP_DEBUG_LOG` enable logging. It supports the default file and configured custom local files, following [WordPress debug settings](https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/). Missing or disabled logs return `not_applicable`.

Reads are bounded to the last 65,536 bytes and 100 nonempty lines; metadata reports bytes read and truncation. A potentially partial first line is discarded. Findings expose error type, a recognized timestamp, and a line number/location where parsed. Recognized plugin/theme PHP paths are normalized to `wp-content/...`; other paths become `[path]`. Raw messages and stack traces are excluded because they may contain credentials or private data. This replaces the earlier raw `evidence.line` field with structured evidence; error text is intentionally unavailable through the API.

The REST check uses a five-second timeout and 4,096-byte response limit. It does not follow redirects; redirects, authentication restrictions, and server errors report warnings. Transport failures report a generic error without the upstream message, code, or response contents. Namespace metadata contains registered namespace names.

## WooCommerce diagnostics

Without WooCommerce loaded, `/woocommerce` returns `not_applicable`. When available, it reports version/currency, database-update-needed status, configured page IDs/publication validity, configured and enabled gateway counts, shipping summaries, scheduled-action summaries, and HPOS enabled state. HPOS state is a configuration fact, not proof that all extensions are compatible. Database health reports WooCommerce's update flag, not a full integrity check.

`payment_gateway_count` now counts configured gateways; `enabled_payment_gateway_count` reports enabled ones. It does not evaluate checkout availability or create a customer session; WooCommerce documents that its [checkout availability API is unsuitable for REST contexts](https://woocommerce.github.io/code-reference/classes/WC-Payment-Gateways.html).

Shipping includes the rest-of-world zone (0) plus at most 100 custom zones, with truncation indicated. Empty gateway/shipping configurations are informational because free-order or virtual-product stores may use them. Missing/unpublished configured pages are warnings.

Action Scheduler summaries are explicitly **site-wide**, not attributed solely to WooCommerce. Failed actions and pending actions overdue by more than five minutes are queried through the [Action Scheduler API](https://actionscheduler.org/api/) as IDs only. Each query reads at most 101 IDs, reports at most 100, and indicates truncation; IDs and action arguments are never returned. Missing APIs yield null counts rather than an assumed zero. Extension exceptions produce generic findings without exception details.

WooCommerce-present behavior is covered by fixtures; the local HTTP test covers WooCommerce absent. A real WooCommerce-present integration check remains for final validation.

## Activity logging

Matched diagnostic requests record one entry in the `aidb_activity_log` option: timestamp, registered endpoint name, request success, elapsed milliseconds, and authentication result. Combined checks produce one entry for the combined request. A successful request may still contain health warnings; `success` describes request execution, not site health. Missing, invalid, revoked, and rate-limited credentials are recorded as unsuccessful and unauthenticated. Headers, tokens, request bodies, query parameters, and response contents are not logged.

Logging follows `aidb_settings.logging_enabled` and retains the newest `log_retention` entries (default 100, clamped to 10–500). Dashboard controls remain pending. Requests blocked upstream by WordPress authentication, before reaching the route callbacks, and unmatched routes are outside this log. Hooks follow WordPress's [REST callback lifecycle](https://developer.wordpress.org/reference/hooks/rest_request_after_callbacks/); later permission probes do not add log entries.
