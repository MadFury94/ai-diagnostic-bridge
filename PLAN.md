# AI Diagnostic Bridge — Implementation Plan

## Objective

Build a standalone WordPress plugin named **AI Diagnostic Bridge** (`0.1.0`) that exposes authenticated, deterministic WordPress and SEO diagnostics to a future Cloudflare Worker and AI diagnostic agent.

The plugin will provide observed facts and deterministic findings only. It will not call an AI provider, execute arbitrary code, modify WordPress content or settings, or expose a general-purpose command interface.

## Project boundaries

- PHP 8.1+ and WordPress 6.5+.
- WordPress REST API only; no external PHP framework.
- Namespaced, object-oriented PHP with WordPress coding conventions.
- Standalone plugin directory/repository: `ai-diagnostic-bridge/`.
- No React admin dashboard in version 0.1.0.
- Diagnostics run only through explicitly requested authenticated endpoints or an optional admin test screen.
- No automatic AI suggestions or content/settings changes.
- No customer, payment, credential, cookie, salt, database-secret, or `wp-config.php` disclosure.

## Delivery phases

### Phase 1 — Repository and plugin foundation

Create the standalone repository with:

```text
ai-diagnostic-bridge/
├── ai-diagnostic-bridge.php
├── README.md
├── readme.txt
├── uninstall.php
├── .gitignore
├── includes/
│   ├── class-plugin.php
│   ├── class-auth.php
│   ├── class-rest-api.php
│   ├── class-response.php
│   ├── class-activity-log.php
│   ├── diagnostics/
│   │   ├── class-diagnostic-manager.php
│   │   ├── class-site-health.php
│   │   ├── class-php-errors.php
│   │   ├── class-plugins.php
│   │   ├── class-themes.php
│   │   ├── class-rest-api-check.php
│   │   ├── class-woocommerce.php
│   │   ├── class-performance.php
│   │   └── class-security.php
│   └── seo/
│       ├── class-seo-manager.php
│       ├── class-post-analysis.php
│       ├── class-link-analysis.php
│       ├── class-image-analysis.php
│       └── class-indexability.php
├── admin/
│   ├── class-admin.php
│   └── views/settings.php
└── tests/
    ├── bootstrap.php
    ├── unit/
    └── fixtures/
```

Use the namespace `BrianAzukaeme\AIDiagnosticBridge`. The bootstrap file should define plugin constants, load classes, register activation/deactivation hooks, and start the plugin on `plugins_loaded`. Activation should create only the minimum options needed for credentials and logging.

### Phase 2 — Authentication and activity logging

Implement `class-auth.php` with a site-specific credential workflow:

1. Generate at least 32 bytes of cryptographically secure random data.
2. Display the raw credential only once after generation or regeneration.
3. Store only a one-way hash plus creation and revocation metadata.
4. Accept the credential through an HTTPS-only `Authorization: Bearer` header; optionally support a documented fallback header for infrastructure that strips Authorization.
5. Compare with `hash_equals()` against the stored hash.
6. Reject missing, malformed, revoked, or invalid credentials with a generic 401 response.
7. Record last successful authentication and last failed authentication timestamps without logging secrets.
8. Add a lightweight transient-based rate limit keyed by a privacy-safe client identifier. Do not treat this as a replacement for Cloudflare/WAF rate limiting.

Implement `class-activity-log.php` using a bounded option or small custom table only if justified. Store endpoint/check, result, duration, authentication result, and timestamp. Add retention controls and never store request bodies or credentials.

All diagnostic REST permission callbacks must authenticate first. WordPress nonces apply to same-origin admin actions; external API calls use the site credential and must not receive a credential through public JavaScript.

### Phase 3 — Response contract and REST controller

Implement `class-response.php` so every response includes:

```json
{
  "success": true,
  "plugin": {"name": "AI Diagnostic Bridge", "version": "0.1.0"},
  "site": {"url": "https://example.com", "wp_version": "6.x", "php_version": "8.x"},
  "check": {"id": "health", "status": "ok", "timestamp": "2026-01-01T00:00:00+00:00"},
  "findings": [],
  "metadata": {}
}
```

Findings must use stable IDs, severity (`critical`, `high`, `medium`, `low`, `info`), category, factual title/message, evidence, and source. Keep observed facts separate from inferred associations in fields such as `observation` and `association`; do not label an inference as fact.

Register namespace `/ai-diagnostic/v1` in `class-rest-api.php`. Use an allowlist for all combined diagnostic checks and sanitize every query/body value. Add:

- `GET /site`
- `GET /health`
- `GET /errors`
- `GET /plugins`
- `GET /themes`
- `GET /rest-api`
- `GET /performance`
- `GET /woocommerce`
- `GET /seo/site`
- `GET /seo/posts`
- `GET /seo/post/(?P<id>\d+)`
- `GET /seo/issues`
- `GET /images/issues`
- `GET /links/issues`
- `GET /diagnostic`
- `POST /diagnostic`

`POST /diagnostic` accepts only an allowlisted `checks` array, validates pagination and limits, runs only the selected modules, and returns a combined response. `GET /diagnostic` may use a safe default scope or require an explicit allowlisted scope; it must never interpret request values as PHP functions, SQL, shell commands, file paths, or hooks.

### Phase 4 — Core deterministic diagnostics

Implement each module behind a common manager interface returning normalized findings and metadata.

**Site health**: WordPress/PHP/database versions where safely available, site/home URLs, multisite and HTTPS status, permalink structure, timezone, locale, memory/upload/post limits, active theme, active plugin count, debug flags, cron status, and REST availability. Redact paths and never expose configuration contents.

**PHP errors**: Read only available `WP_DEBUG_LOG` data when enabled, with bounded bytes/lines and normalized `wp-content/...` paths. Parse fatal errors, warnings, notices, deprecations, and recognizable WordPress errors. Return timestamp, type, safe message, file/line when available, frequency, source, and a cautious plugin/theme association.

**Plugins**: Use WordPress plugin APIs to return name, slug, version, active/network-active state, author, update availability where available, and deterministic observations such as outdated or inactive plugins. Never deactivate or modify anything.

**Themes**: Return active theme, version, parent/child relationship, directory/stylesheet metadata, and update availability. Redact absolute paths.

**REST API check**: Perform bounded internal checks using WordPress APIs and report availability, status, namespaces, authentication requirements, and obvious errors without weakening restrictions.

**WooCommerce**: Detect availability first. Return `not_applicable` if absent. If present, report version, active/database health where available, currency, gateway/shipping method counts, configured cart/checkout/shop pages, scheduled-action health, and safe compatibility/error indicators. Never return customer/order/payment data or secrets.

**Performance**: Report WordPress-side indicators only: memory limits/usage, object/persistent cache, page-cache indicators, autoloaded-option size, cron indicators, safe database health indicators, active plugin count, and media statistics where practical. Do not claim Core Web Vitals or full frontend performance measurement.

**Security**: Report deterministic hardening observations (HTTPS, debug exposure, update status, user-facing REST restrictions where detectable) without changing security settings or exposing secrets.

### Phase 5 — SEO analysis

Create reusable analyzers that operate only during explicit requests.

For public posts/pages, inspect title, slug, excerpt, content-derived headings and links, supported SEO-plugin metadata (Yoast, Rank Math, AIOSEO where documented), canonical/noindex signals, featured image, image alt text, word count, and detectable schema markers.

Use configurable thresholds for title/meta-description length. Report missing/empty, unusually short/long, and duplicate titles/descriptions without presenting a threshold as a ranking guarantee. Heading analysis must count H1s, detect missing/multiple H1s, hierarchy jumps, empty headings, and unusually long headings.

Image analysis must identify attachment ID, URL, filename, alt presence/length, and featured-image status. Link analysis must classify internal/external links, detect missing hrefs and malformed URLs, identify duplicates, and optionally verify a bounded set of internal links with short timeouts. Never launch a site-wide crawl during a normal request.

Indexability analysis must report post status, password/private visibility, noindex/robots metadata, canonical URL, and sitemap inclusion only where determinable. Never claim Google indexing.

Implement pagination for `/seo/posts`, `/images/issues`, and `/links/issues` with bounded `page` and `per_page`, returning `items` and `{page, per_page, total, pages}`. `/seo/post/{id}` returns post data only for an explicitly authenticated request and only for the requested public post/page; private content remains excluded unless a future, separately approved scope is introduced.

`/seo/issues` aggregates stable issue types and severity counts, preserving evidence and post IDs. It must not generate AI recommendations or alter metadata.

### Phase 6 — Admin settings screen

Add a small Settings → AI Diagnostic Bridge screen using capability checks, admin URLs, nonces, sanitization, and escaped output. Show plugin/version, namespace, credential status (never the stored credential), generation/revocation/regeneration actions, last successful/failed authentication, logging status/retention, and available modules. Show a one-time credential notice after generation and require explicit confirmation for revocation/regeneration.

### Phase 7 — Tests and quality gates

Add PHPUnit-compatible tests with WordPress test bootstrap when available, plus isolated fixtures/mocks for environments without a full WordPress install. Cover:

- valid, invalid, missing, revoked, regenerated credentials
- rate-limit behavior and permission callbacks
- response shape and sensitive-data exclusion
- site, plugin, theme, REST, performance, and health diagnostics
- WooCommerce present/absent behavior
- PHP log parsing and path normalization
- title/meta, headings, images, links, and indexability analyzers
- SEO aggregation and collection pagination
- invalid/unknown combined checks
- no arbitrary function/file/SQL execution paths

Run `php -l` across all PHP files, PHPUnit if configured, WordPress coding standards/static checks if available, and a manual REST smoke test against a disposable WordPress site. Fix all syntax, activation, permission, and response-contract errors before release.

### Phase 8 — Documentation and release

Document installation, activation, credential handling, HTTPS/proxy requirements, all endpoints, request/response examples, pagination, rate limiting, module behavior, privacy boundaries, logging retention, and troubleshooting. Include an **AI Architecture** section describing:

```text
React dashboard → Cloudflare Worker → Cloudflare AI → WordPress Diagnostic Bridge
```

State clearly that the plugin supplies observed evidence only; the AI layer performs interpretation, and future changes require human review and controlled approval endpoints.

## Acceptance checklist

- Plugin activates cleanly on WordPress 6.5+/PHP 8.1+.
- Namespace and all documented routes register.
- Unauthenticated requests fail with 401; valid credentials succeed; revoked credentials fail.
- Credential hashes, API keys, cookies, salts, database credentials, customer/payment data, and private content are excluded.
- Combined diagnostics accept only allowlisted checks.
- Core, WooCommerce, performance, security, and SEO modules return deterministic structured JSON.
- Collection endpoints paginate without loading unbounded records.
- No diagnostics run on ordinary frontend requests.
- No AI API, arbitrary execution, automatic content changes, or settings changes exist in 0.1.0.
- PHP syntax, unit, WordPress coding, and REST smoke checks pass.

## Known version 0.1.0 limitations

- No browser-based performance/Core Web Vitals measurement.
- No background queue for very large SEO/media scans; requests use strict limits and pagination.
- Error-log availability depends on `WP_DEBUG_LOG` and hosting permissions.
- Update availability and some WooCommerce health details depend on WordPress/WooCommerce APIs and installed extensions.
- Internal link verification is bounded and cannot guarantee that every external or dynamic URL is healthy.
- Future change proposal/approval endpoints are reserved architecturally and are not implemented.

## Installation instructions for the completed plugin

1. Copy the standalone `ai-diagnostic-bridge` directory into `wp-content/plugins/` on a disposable test site.
2. Activate **AI Diagnostic Bridge** in WordPress Admin → Plugins.
3. Open Settings → AI Diagnostic Bridge.
4. Generate a credential and store the displayed value in a secrets manager; it will not be displayed again.
5. Put the site behind HTTPS and configure the Cloudflare Worker to keep the credential server-side.
6. Test an authenticated endpoint, then revoke and regenerate the credential to verify lifecycle behavior.

Example request:

```bash
curl -sS \
  -H "Authorization: Bearer $AI_DIAGNOSTIC_TOKEN" \
  "https://example.com/wp-json/ai-diagnostic/v1/site"
```

Example combined request:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $AI_DIAGNOSTIC_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"checks":["health","errors","plugins","woocommerce","performance"]}' \
  "https://example.com/wp-json/ai-diagnostic/v1/diagnostic"
```

## Resumable task checklist

Use this section as the implementation tracker. Complete tasks in order unless a dependency is explicitly marked optional. Each task should leave the repository in a runnable state. Update the status marker and the handoff notes after every work session.

Status values: `[ ]` not started, `[~]` in progress, `[x]` complete, `[!]` blocked.

### Phase 0 — Workspace and decisions

- [x] **T00.1** Confirm the plugin is developed only in this standalone directory/repository and does not modify or install into the existing WordPress/Next.js project.
- [~] **T00.2** Confirmed on `https://anbenigeria.com`: PHP 8.2.33, WordPress 7.1.1, and HTTPS. Local PHP, PHPUnit, WP-CLI, and coding tools remain unavailable in this shell.
- [x] **T00.3** Record the target namespace, text domain, version, REST namespace, credential transport, and supported SEO plugins in a small architecture note.
- [x] **T00.4** Initialize Git, `.gitignore`, `README.md`, `readme.txt`, and a changelog. Do not commit credentials, database dumps, logs, or WordPress core files.

**Exit evidence:** clean standalone repository, documented environment assumptions, no secrets tracked.

### Phase 1 — Plugin bootstrap

- [x] **T01.1** Create `ai-diagnostic-bridge.php` with plugin headers, constants, PHP/WordPress version guards, namespace bootstrap, and activation/deactivation hooks.
- [x] **T01.2** Create `includes/class-plugin.php` and load classes only after `plugins_loaded`.
- [x] **T01.3** Add activation checks and minimal default options; ensure activation does not run diagnostics or create unnecessary data.
- [x] **T01.4** Add uninstall behavior that removes only plugin-owned options/transients/log data after explicit uninstall, never site content.
- [~] **T01.5** Plugin activation and live operation confirmed on `anbenigeria.com`; `php -l` and activation/deactivation lifecycle tests remain pending because PHP is unavailable locally.

**Exit evidence:** activation produces no PHP errors and no frontend request performs diagnostics.

### Phase 2 — Response and error primitives

- [x] **T02.1** Implement `class-response.php` with the standard success/error envelope, plugin metadata, timestamp, check status, findings, and metadata.
- [x] **T02.2** Define finding builders for stable ID, severity, category, title, factual message, evidence, source, and optional inference fields.
- [x] **T02.3** Add safe error responses that do not reveal stack traces, absolute paths, secrets, SQL, or request credentials.
- [~] **T02.4** Add shared sanitization, pagination, bounded-limit, and timestamp helpers. Initial response primitives and bounded values are implemented; shared pagination helpers will be completed with the REST controller.
- [~] **T02.5** Added PHPUnit response-contract tests for response shape, status/severity validation, finding fields, and safe errors; tests require a WordPress/PHPUnit environment and have not run locally.

**Exit evidence:** fixtures can produce a valid response without loading a diagnostic module.

### Phase 3 — Credential authentication and logging

- [x] **T03.1** Implement `class-auth.php` to generate a cryptographically random token, show it once, hash it, and store only the hash and lifecycle metadata.
- [x] **T03.2** Authenticate HTTPS REST requests using a Bearer token; reject missing, malformed, invalid, and revoked credentials with generic 401 responses.
- [x] **T03.3** Implement generate, revoke, and regenerate operations with capability checks, admin nonces, and no public JavaScript exposure.
- [x] **T03.4** Add transient-based failed-auth rate limiting and document that Cloudflare/WAF rate limiting remains required.
- [~] **T03.5** Implemented the activity-log primitive with configurable retention, but route instrumentation still needs to call it.
- [ ] **T03.6** Test valid, invalid, revoked, regenerated, rate-limited, and non-admin cases; verify raw tokens never appear in options, logs, responses, or test artifacts.

**Exit evidence:** authentication tests pass and a generated token is displayed exactly once.

### Phase 4 — REST controller and diagnostic manager

- [x] **T04.1** Implement `class-diagnostic-manager.php` with a registry mapping allowlisted check IDs to diagnostic classes.
- [x] **T04.2** Implement `class-rest-api.php` and register `/ai-diagnostic/v1` routes with authentication permission callbacks.
- [x] **T04.3** Add `GET /diagnostic` and `POST /diagnostic`; validate `checks` against the registry and reject unknown values.
- [~] **T04.4** Add route handlers for `/site`, `/health`, `/errors`, `/plugins`, `/themes`, `/rest-api`, `/performance`, `/woocommerce`, and the SEO/image/link routes. Core and initial operational routes are implemented; SEO/image/link routes are pending.
- [x] **T04.5** Ensure request data cannot select functions, files, SQL, shell commands, WP-CLI commands, hooks, or arbitrary classes.
- [ ] **T04.6** Add REST permission, invalid-request, unknown-check, and combined-response tests.
- [~] **T04.7** Authenticated smoke tests completed on `https://anbenigeria.com` for site, plugins, errors, health, WooCommerce, performance, security, and REST API. Unauthenticated rejection testing remains pending.

**Exit evidence:** all routes register, unauthenticated calls fail, and only allowlisted modules execute.

### Phase 5 — Site and WordPress health modules

- [x] **T05.1** Implement `class-site-health.php` for safe WordPress/PHP/database versions, URLs, HTTPS, multisite, permalinks, timezone, locale, limits, active theme/plugins, debug state, cron, and REST availability.
- [x] **T05.2** Implement deterministic health findings and statuses without exposing configuration contents or private data.
- [x] **T05.3** Implement `class-php-errors.php` with bounded debug-log reading, error-type parsing, timestamps/frequency, safe messages, normalized paths, and cautious plugin/theme association.
- [x] **T05.4** Implement `class-rest-api-check.php` using bounded internal checks; report restrictions and failures without weakening settings.
- [x] **T05.5** Implement `class-performance.php` for WordPress-side indicators only.
- [x] **T05.6** Implement `class-security.php` for deterministic security observations only.
- [ ] **T05.7** Test debug logging disabled/enabled, missing logs, path normalization, REST restrictions, and sensitive-value redaction.

**Exit evidence:** `/site`, `/health`, `/errors`, `/rest-api`, `/performance`, and `/security` return factual structured findings.

### Phase 6 — Plugin, theme, and WooCommerce modules

- [x] **T06.1** Implement `class-plugins.php` using WordPress plugin APIs for installed, active/network-active, version, author, slug, updates, and deterministic observations.
- [x] **T06.2** Implement `class-themes.php` for active, parent/child, version, stylesheet metadata, directory, and update observations with path redaction.
- [x] **T06.3** Implement `class-woocommerce.php` with an early `not_applicable` result when WooCommerce is absent.
- [~] **T06.4** Collects safe WooCommerce version, currency, gateway count, and configured page IDs; shipping counts, scheduled-action health, and compatibility indicators remain to be added.
- [ ] **T06.5** Test WooCommerce absent/present fixtures and verify no customer, order, payment, or API-secret data is returned.

**Exit evidence:** module behavior is graceful with and without WooCommerce.

### Phase 7 — SEO post analyzers

- [ ] **T07.1** Implement `class-seo-manager.php` and a shared post-analysis result contract.
- [ ] **T07.2** Implement `class-post-analysis.php` for public post/page title, slug, excerpt, word count, content, and metadata observations.
- [ ] **T07.3** Implement configurable title checks: missing, empty, short, long, duplicate, and title/slug relationship observations.
- [ ] **T07.4** Implement supported metadata readers for Yoast, Rank Math, and AIOSEO only where documented; never overwrite metadata.
- [ ] **T07.5** Implement meta-description checks: missing, empty, short, long, and duplicate.
- [ ] **T07.6** Implement `class-indexability.php` for status, visibility/password, noindex/robots, canonical, and determinable sitemap observations.
- [ ] **T07.7** Implement `GET /seo/post/{id}` with explicit authentication, public-content privacy rules, and stable `seo_findings` output.
- [ ] **T07.8** Test title/meta thresholds, duplicates, private/password posts, canonical/noindex signals, and sensitive-content exclusion.

**Exit evidence:** one post can be analyzed deterministically without making edits.

### Phase 8 — SEO headings, images, and links

- [ ] **T08.1** Add heading parsing for H1 count, missing/multiple H1s, hierarchy jumps, empty headings, and long headings.
- [ ] **T08.2** Implement `class-image-analysis.php` for attachment ID, URL, filename, alt presence/length, and featured-image state.
- [ ] **T08.3** Implement paginated `GET /images/issues` and ensure no alt text is generated or applied.
- [ ] **T08.4** Implement `class-link-analysis.php` for internal/external links, missing hrefs, malformed URLs, duplicates, and bounded optional internal verification with timeouts.
- [ ] **T08.5** Implement paginated `GET /links/issues`; never crawl the site during ordinary requests.
- [ ] **T08.6** Test malformed HTML/links, empty headings, missing alt text, duplicate links, pagination, and request timeouts.

**Exit evidence:** image, heading, and link issues are factual, bounded, and paginated.

### Phase 9 — SEO collections and aggregation

- [ ] **T09.1** Implement paginated `GET /seo/posts?per_page=&page=` without loading all posts into memory.
- [ ] **T09.2** Implement `GET /seo/issues` with stable issue types and critical/high/medium/low summary counts.
- [ ] **T09.3** Implement `GET /seo/site` for site-level indexability and supported sitemap/SEO-plugin observations.
- [ ] **T09.4** Test pagination boundaries, empty collections, duplicate issue aggregation, and large-site limits.

**Exit evidence:** SEO dashboard endpoints provide predictable collection and summary contracts.

### Phase 10 — Admin settings

- [x] **T10.1** Implement `admin/class-admin.php` and `admin/views/settings.php` under an appropriate capability.
- [x] **T10.2** Add credential generate/revoke/regenerate actions protected by WordPress nonces and escaped notices.
- [~] **T10.3** Displays version, namespace, credential status, and last auth timestamps; logging controls/retention and available-module display remain to be completed.
- [ ] **T10.4** Test CSRF protection, insufficient capabilities, one-time token display, and escaped admin output.

**Exit evidence:** administrators can manage credentials safely without frontend exposure.

### Phase 11 — Quality gates and documentation

- [ ] **T11.1** Run `php -l` across every PHP file.
- [ ] **T11.2** Run PHPUnit/WordPress tests and record exact results.
- [ ] **T11.3** Run WordPress Coding Standards and static analysis if available; fix obvious violations.
- [~] **T11.4** Plugin activation and authenticated REST smoke tests completed on `https://anbenigeria.com`; activation/deactivation lifecycle and unauthenticated REST tests remain pending.
- [ ] **T11.5** Review every endpoint for capability/authentication, input bounds, privacy, redaction, and no arbitrary execution.
- [ ] **T11.6** Complete `README.md`, `readme.txt`, endpoint examples, security model, AI boundary, installation, troubleshooting, and known limitations.
- [ ] **T11.7** Tag `0.1.0` only after the acceptance checklist is complete and the repository contains no secrets or generated test data.

**Exit evidence:** reproducible test report, clean package, complete documentation, and versioned `0.1.0` release candidate.

## Handoff record

Update this block at the end of each session so another AI can continue safely.

- **Current task:** `T02.5`
- **Last completed task:** `T06.4` (REST foundation, core diagnostics, WooCommerce detection, and admin credential management)
- **Files changed in last session:** REST controller, diagnostic manager, site-health, plugins, themes, admin settings, plugin bootstrap, task tracker
- **Tests/checks run:** live authenticated REST checks completed on anbenigeria.com for site, plugins, errors, health, WooCommerce, performance, security, and REST API; local PHP syntax tests remain unavailable
- **Known blockers:** no local PHP runtime, PHPUnit, WP-CLI, or coding standards tools; unauthenticated REST and lifecycle tests remain
- **Next action:** run the new T02.5 response-contract tests in a WordPress/PHPUnit environment, then add authentication and REST tests (T03.6, T04.6).
- **Do not redo:** T00.1, T00.3, T00.4, T01.1–T01.4, T02.1–T02.3, T03.1–T03.4, T04.1–T04.3, T04.5, T05.1, T05.2, T06.1, T06.2, T10.1, and T10.2 are implemented. T00.2, T01.5, T02.4, T04.4, T04.7, T03.6, T04.6, T05.7, T06.5, T10.4, and T11.4 remain partial or blocked.
