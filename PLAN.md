# AI Diagnostic Bridge ï¿½ Implementation Plan

## Support evidence and application preparation

Read [APPLICATION-CONTEXT.md](APPLICATION-CONTEXT.md) alongside this plan. After meaningful work, update [SUPPORT-JOURNAL.md](SUPPORT-JOURNAL.md) with the symptom, hypothesis, AI verification/correction, repair, validation, customer explanation, and actual timing (or ï¿½not measuredï¿½). Maintain this evidence through January 2027 without claiming unfinished work is shipped or fixture results are real-store outcomes. Keep Missus unchanged.

- [ ] Set up a small real WooCommerce test store with synthetic products and test-mode payments.
- [ ] Complete and document deliberate WordPress/WooCommerce break/diagnose/repair exercises from the journal.
- [ ] Record Brian's independent reproduction and customer-ready explanations.
- [ ] Measure a defined manual versus bridge-assisted troubleshooting task; record limitations and sample size.
- [ ] Verify concrete Missus bug/repair artifacts before linking those cases to the application narrative.

These support exercises complement the implementation sequence below; they are not completed by passing the automated suite.

## Implementation objective

Build a standalone WordPress plugin named **AI Diagnostic Bridge** (`0.1.6`) that exposes authenticated, deterministic WordPress and SEO diagnostics to a future Cloudflare Worker and AI diagnostic agent.

The plugin will provide observed facts and deterministic findings only. It will not call an AI provider, execute arbitrary code, modify WordPress content or settings, or expose a general-purpose command interface.

## Project boundaries

- PHP 8.1+ and WordPress 6.5+.
- WordPress REST API only; no external PHP framework.
- Namespaced, object-oriented PHP with WordPress coding conventions.
- Standalone plugin directory/repository: `ai-diagnostic-bridge/`.
- No React admin dashboard in version 0.1.6.
- Diagnostics run only through explicitly requested authenticated endpoints or an optional admin test screen.
- No automatic AI suggestions or content/settings changes.
- No customer, payment, credential, cookie, salt, database-secret, or `wp-config.php` disclosure.

## Delivery phases

### Phase 1 ï¿½ Repository and plugin foundation

Create the standalone repository with:

```text
ai-diagnostic-bridge/
+-- ai-diagnostic-bridge.php
+-- README.md
+-- readme.txt
+-- uninstall.php
+-- .gitignore
+-- includes/
ï¿½   +-- class-plugin.php
ï¿½   +-- class-auth.php
ï¿½   +-- class-rest-api.php
ï¿½   +-- class-response.php
ï¿½   +-- class-activity-log.php
ï¿½   +-- diagnostics/
ï¿½   ï¿½   +-- class-diagnostic-manager.php
ï¿½   ï¿½   +-- class-site-health.php
ï¿½   ï¿½   +-- class-php-errors.php
ï¿½   ï¿½   +-- class-plugins.php
ï¿½   ï¿½   +-- class-themes.php
ï¿½   ï¿½   +-- class-rest-api-check.php
ï¿½   ï¿½   +-- class-woocommerce.php
ï¿½   ï¿½   +-- class-performance.php
ï¿½   ï¿½   +-- class-security.php
ï¿½   +-- seo/
ï¿½       +-- class-seo-manager.php
ï¿½       +-- class-post-analysis.php
ï¿½       +-- class-link-analysis.php
ï¿½       +-- class-image-analysis.php
ï¿½       +-- class-indexability.php
+-- admin/
ï¿½   +-- class-admin.php
ï¿½   +-- views/settings.php
+-- tests/
    +-- bootstrap.php
    +-- unit/
    +-- fixtures/
```

Use the namespace `BrianAzukaeme\AIDiagnosticBridge`. The bootstrap file should define plugin constants, load classes, register activation/deactivation hooks, and start the plugin on `plugins_loaded`. Activation should create only the minimum options needed for credentials and logging.

### Phase 2 ï¿½ Authentication and activity logging

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

### Phase 3 ï¿½ Response contract and REST controller

Implement `class-response.php` so every response includes:

```json
{
  "success": true,
  "plugin": {"name": "AI Diagnostic Bridge", "version": "0.1.6"},
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

### Phase 4 ï¿½ Core deterministic diagnostics

Implement each module behind a common manager interface returning normalized findings and metadata.

**Site health**: WordPress/PHP/database versions where safely available, site/home URLs, multisite and HTTPS status, permalink structure, timezone, locale, memory/upload/post limits, active theme, active plugin count, debug flags, cron status, and REST availability. Redact paths and never expose configuration contents.

**PHP errors**: Read only available `WP_DEBUG_LOG` data when enabled, with bounded bytes/lines and normalized `wp-content/...` paths. Parse fatal errors, warnings, notices, deprecations, and recognizable WordPress errors. Return timestamp, type, safe message, file/line when available, frequency, source, and a cautious plugin/theme association.

**Plugins**: Use WordPress plugin APIs to return name, slug, version, active/network-active state, author, update availability where available, and deterministic observations such as outdated or inactive plugins. Never deactivate or modify anything.

**Themes**: Return active theme, version, parent/child relationship, directory/stylesheet metadata, and update availability. Redact absolute paths.

**REST API check**: Perform bounded internal checks using WordPress APIs and report availability, status, namespaces, authentication requirements, and obvious errors without weakening restrictions.

**WooCommerce**: Detect availability first. Return `not_applicable` if absent. If present, report version, active/database health where available, currency, gateway/shipping method counts, configured cart/checkout/shop pages, scheduled-action health, and safe compatibility/error indicators. Never return customer/order/payment data or secrets.

**Performance**: Report WordPress-side indicators only: memory limits/usage, object/persistent cache, page-cache indicators, autoloaded-option size, cron indicators, safe database health indicators, active plugin count, and media statistics where practical. Do not claim Core Web Vitals or full frontend performance measurement.

**Security**: Report deterministic hardening observations (HTTPS, debug exposure, update status, user-facing REST restrictions where detectable) without changing security settings or exposing secrets.

### Phase 5 ï¿½ SEO analysis

Create reusable analyzers that operate only during explicit requests.

For public posts/pages, inspect title, slug, excerpt, content-derived headings and links, supported SEO-plugin metadata (Yoast, Rank Math, AIOSEO where documented), canonical/noindex signals, featured image, image alt text, word count, and detectable schema markers.

Use configurable thresholds for title/meta-description length. Report missing/empty, unusually short/long, and duplicate titles/descriptions without presenting a threshold as a ranking guarantee. Heading analysis must count H1s, detect missing/multiple H1s, hierarchy jumps, empty headings, and unusually long headings.

Image analysis must identify attachment ID, URL, filename, alt presence/length, and featured-image status. Link analysis must classify internal/external links, detect missing hrefs and malformed URLs, identify duplicates, and optionally verify a bounded set of internal links with short timeouts. Never launch a site-wide crawl during a normal request.

Indexability analysis must report post status, password/private visibility, noindex/robots metadata, canonical URL, and sitemap inclusion only where determinable. Never claim Google indexing.

Implement pagination for `/seo/posts`, `/images/issues`, and `/links/issues` with bounded `page` and `per_page`, returning `items` and `{page, per_page, total, pages}`. `/seo/post/{id}` returns post data only for an explicitly authenticated request and only for the requested public post/page; private content remains excluded unless a future, separately approved scope is introduced.

`/seo/issues` aggregates stable issue types and severity counts, preserving evidence and post IDs. It must not generate AI recommendations or alter metadata.

### Phase 6 ï¿½ Admin settings screen

Add a small Settings ? AI Diagnostic Bridge screen using capability checks, admin URLs, nonces, sanitization, and escaped output. Show plugin/version, namespace, credential status (never the stored credential), generation/revocation/regeneration actions, last successful/failed authentication, logging status/retention, and available modules. Show a one-time credential notice after generation and require explicit confirmation for revocation/regeneration.

### Phase 7 ï¿½ Tests and quality gates

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

### Phase 8 ï¿½ Documentation and release

Document installation, activation, credential handling, HTTPS/proxy requirements, all endpoints, request/response examples, pagination, rate limiting, module behavior, privacy boundaries, logging retention, and troubleshooting. Include an **AI Architecture** section describing:

```text
React dashboard ? Cloudflare Worker ? Cloudflare AI ? WordPress Diagnostic Bridge
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
- No AI API, arbitrary execution, automatic content changes, or settings changes exist in 0.1.6.
- PHP syntax, unit, WordPress coding, and REST smoke checks pass.

## Known version 0.1.6 limitations

- No browser-based performance/Core Web Vitals measurement.
- No background queue for very large SEO/media scans; requests use strict limits and pagination.
- Error-log availability depends on `WP_DEBUG_LOG` and hosting permissions.
- Update availability and some WooCommerce health details depend on WordPress/WooCommerce APIs and installed extensions.
- Internal link verification is bounded and cannot guarantee that every external or dynamic URL is healthy.
- Future change proposal/approval endpoints are reserved architecturally and are not implemented.

## Installation instructions for the completed plugin

1. Copy the standalone `ai-diagnostic-bridge` directory into `wp-content/plugins/` on a disposable test site.
2. Activate **AI Diagnostic Bridge** in WordPress Admin ? Plugins.
3. Open Settings ? AI Diagnostic Bridge.
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

### Phase 0 ï¿½ Workspace and decisions

- [x] **T00.1** Confirm the plugin is developed only in this standalone directory/repository and does not modify or install into the existing WordPress/Next.js project.
- [~] **T00.2** Confirmed on `https://anbenigeria.com`: PHP 8.2.33, WordPress 7.1.1, and HTTPS. Local PHP, PHPUnit, WP-CLI, and coding tools remain unavailable in this shell.
- [x] **T00.3** Record the target namespace, text domain, version, REST namespace, credential transport, and supported SEO plugins in a small architecture note.
- [x] **T00.4** Initialize Git, `.gitignore`, `README.md`, `readme.txt`, and a changelog. Do not commit credentials, database dumps, logs, or WordPress core files.

**Exit evidence:** clean standalone repository, documented environment assumptions, no secrets tracked.

### Phase 1 ï¿½ Plugin bootstrap

- [x] **T01.1** Create `ai-diagnostic-bridge.php` with plugin headers, constants, PHP/WordPress version guards, namespace bootstrap, and activation/deactivation hooks.
- [x] **T01.2** Create `includes/class-plugin.php` and load classes only after `plugins_loaded`.
- [x] **T01.3** Add activation checks and minimal default options; ensure activation does not run diagnostics or create unnecessary data.
- [x] **T01.4** Add uninstall behavior that removes only plugin-owned options/transients/log data after explicit uninstall, never site content.
- [x] **T01.5** Plugin activation and live operation confirmed on `anbenigeria.com`; local activation/deactivation/re-activation lifecycle tests pass on the disposable WordPress environment.

**Exit evidence:** activation produces no PHP errors and no frontend request performs diagnostics.

### Phase 2 ï¿½ Response and error primitives

- [x] **T02.1** Implement `class-response.php` with the standard success/error envelope, plugin metadata, timestamp, check status, findings, and metadata.
- [x] **T02.2** Define finding builders for stable ID, severity, category, title, factual message, evidence, source, and optional inference fields.
- [x] **T02.3** Add safe error responses that do not reveal stack traces, absolute paths, secrets, SQL, or request credentials.
- [~] **T02.4** Add shared sanitization, pagination, bounded-limit, and timestamp helpers. Initial response primitives and bounded values are implemented; shared pagination helpers will be completed with the REST controller.
- [x] **T02.5** Response-contract tests passed on 2026-09-21 using PHP 8.3.33, PHPUnit 10.5.64, and the installed local WordPress/SQLite runtime via `tests/local-bootstrap.php`: 5 tests, 19 assertions. Bootstrap verifies that the source checkout is tested rather than the installed plugin copy.

**Exit evidence:** fixtures can produce a valid response without loading a diagnostic module.

### Phase 3 ï¿½ Credential authentication and logging

- [x] **T03.1** Implement `class-auth.php` to generate a cryptographically random token, show it once, hash it, and store only the hash and lifecycle metadata.
- [x] **T03.2** Authenticate HTTPS REST requests using a Bearer token; reject missing, malformed, invalid, and revoked credentials with generic 401 responses.
- [x] **T03.3** Implement generate, revoke, and regenerate operations with capability checks, admin nonces, and no public JavaScript exposure.
- [x] **T03.4** Add transient-based failed-auth rate limiting and document that Cloudflare/WAF rate limiting remains required.
- [x] **T03.5** Diagnostic routes now record one bounded activity entry per handled request, including authentication failure, request result, endpoint, and duration; request secrets/content are excluded. Disabled logging and retention verified on 2026-09-21.
- [x] **T03.6** Authentication/logging tests passed on 2026-09-21 for valid, missing, malformed, invalid, revoked, regenerated, rate-limited/expired, and non-admin cases. Verified token exclusion from credential settings, diagnostic responses, and activity logs. Full local suite: 14 tests, 114 assertions, using a temporary SQLite snapshot removed on shutdown. Existing local token still works after tests.

**Exit evidence:** authentication tests pass and a generated token is displayed exactly once.

### Phase 4 ï¿½ REST controller and diagnostic manager

- [x] **T04.1** Implement `class-diagnostic-manager.php` with a registry mapping allowlisted check IDs to diagnostic classes.
- [x] **T04.2** Implement `class-rest-api.php` and register `/ai-diagnostic/v1` routes with authentication permission callbacks.
- [x] **T04.3** Add `GET /diagnostic` and `POST /diagnostic`; validate `checks` against the registry and reject unknown values.
- [~] **T04.4** Add route handlers for `/site`, `/health`, `/errors`, `/plugins`, `/themes`, `/rest-api`, `/performance`, `/woocommerce`, and the SEO/image/link routes. Core and initial operational routes are implemented; SEO/image/link routes are pending.
- [x] **T04.5** Ensure request data cannot select functions, files, SQL, shell commands, WP-CLI commands, hooks, or arbitrary classes.
- [x] **T04.6** REST permission, combined GET/POST, unknown-check, malformed JSON, invalid type/nesting, exact ID matching, limits, deduplication, defaults, precedence, and unsupported method/route tests passed on 2026-09-21. Full suite: 22 tests, 491 assertions. Local HTTP confirmed valid combined requests return 200 and nested input, altered IDs, and malformed JSON return 400. Changed PHP syntax checks passed.
- [x] **T04.7** Authenticated smoke tests completed on `https://anbenigeria.com` for site, plugins, errors, health, WooCommerce, performance, security, and REST API; unauthenticated access was also verified to return HTTP 401.

**Exit evidence:** all routes register, unauthenticated calls fail, and only allowlisted modules execute.

### Phase 5 ï¿½ Site and WordPress health modules

- [x] **T05.1** Implement `class-site-health.php` for safe WordPress/PHP/database versions, URLs, HTTPS, multisite, permalinks, timezone, locale, limits, active theme/plugins, debug state, cron, and REST availability.
- [x] **T05.2** Implement deterministic health findings and statuses without exposing configuration contents or private data.
- [x] **T05.3** Implement `class-php-errors.php` with bounded debug-log reading, error-type parsing, timestamps/frequency, safe messages, normalized paths, and cautious plugin/theme association.
- [x] **T05.4** Implement `class-rest-api-check.php` using bounded internal checks; report restrictions and failures without weakening settings.
- [x] **T05.5** Implement `class-performance.php` for WordPress-side indicators only.
- [x] **T05.6** Implement `class-security.php` for deterministic security observations only.
- [x] **T05.7** Debug logging disabled/enabled, default/custom/missing logs, Windows/Unix path normalization, byte/line bounds, REST restrictions/transport failures, and sensitive-data exclusion verified on 2026-09-21. Full suite: 31 tests, 583 assertions. Fixed unbounded/raw log reads and ignored debug configuration; REST namespaces now contain names, redirects are surfaced, and transport error details are excluded. Changed PHP syntax checks passed; local authenticated errors endpoint returned HTTP 200 / not_applicable with logging disabled.

**Exit evidence:** `/site`, `/health`, `/errors`, `/rest-api`, `/performance`, and `/security` return factual structured findings.

### Phase 6 ï¿½ Plugin, theme, and WooCommerce modules

- [x] **T06.1** Implement `class-plugins.php` using WordPress plugin APIs for installed, active/network-active, version, author, slug, updates, and deterministic observations.
- [x] **T06.2** Implement `class-themes.php` for active, parent/child, version, stylesheet metadata, directory, and update observations with path redaction.
- [x] **T06.3** Implement `class-woocommerce.php` with an early `not_applicable` result when WooCommerce is absent.
- [x] **T06.4** Added configured/enabled gateway counts, published-page checks, shipping zone/enabled-method counts including zone 0, bounded site-wide failed/overdue scheduled-action summaries, official database-update-needed status, and HPOS configuration. Missing APIs remain unknown; extension exceptions produce generic findings without details.
- [x] **T06.5** WooCommerce absent/present fixtures passed, including configuration failures, optional APIs, shipping/action bounds, informational severity, and private-data exclusion. Full suite on 2026-09-21: 40 tests, 629 assertions; PHP syntax checks passed. Actual local HTTP returned 200/not_applicable with WooCommerce absent. Automated present behavior remains fixture-tested rather than a real-installation assertion; separate manual break/repair exercises were completed against Anbe's real WooCommerce installation and are recorded in SUPPORT-JOURNAL.md.

**Exit evidence:** module behavior is graceful with and without WooCommerce.

### Phase 7 ï¿½ SEO post analyzers

- [x] **T07.1** Implement `class-seo-manager.php` and a shared post-analysis result contract.
- [x] **T07.2** Implement `class-post-analysis.php` for public post/page title, slug, excerpt, word count, content, and metadata observations.
- [x] **T07.3** Implement configurable title checks: missing, empty, short, long, duplicate, and title/slug relationship observations.
- [x] **T07.4** Implement supported metadata readers for Yoast, Rank Math, and AIOSEO only where documented; never overwrite metadata.
- [x] **T07.5** Implement meta-description checks: missing, empty, short, long, and duplicate.
- [x] **T07.6** Implement `class-indexability.php` for status, visibility/password, noindex/robots, canonical, and determinable sitemap observations.
- [x] **T07.7** Implement `GET /seo/post/{id}` with explicit authentication, public-content privacy rules, and stable `seo_findings` output.
- [x] **T07.8** Added title/meta missing-empty-short-long-duplicate and title/slug edge coverage, private/password exclusion, canonical/noindex observations, and raw body/title privacy assertions. Focused tests pass; see PROGRESS.md and SUPPORT-JOURNAL.md.

**Exit evidence:** one post can be analyzed deterministically without making edits.

### Phase 8 ï¿½ SEO headings, images, and links

- [x] **T08.1** Add heading parsing for H1 count, missing/multiple H1s, hierarchy jumps, empty headings, and long headings.
- [x] **T08.2** Implement `class-image-analysis.php` for attachment ID, URL, filename, alt presence/length, and featured-image state. Implemented within the post-analysis module.
- [x] **T08.3** Implement paginated `GET /images/issues` and ensure no alt text is generated or applied.
- [~] **T08.4** Implement `class-link-analysis.php` for internal/external links, missing hrefs, malformed URLs, duplicates, and bounded optional internal verification with timeouts. Bounded content-link classification is implemented; optional verification remains.
- [x] **T08.5** Implement paginated `GET /links/issues`; never crawl the site during ordinary requests.
- [x] **T08.6** Added malformed HTML/link, empty-heading, H1-count, hierarchy-jump, missing-alt, duplicate-link, empty/pagination/maximum-page-size, and no-crawl safety tests. The optional bounded internal-link verifier remains deliberately unimplemented (T08.4), so there is no timeout path to exercise; ordinary requests make zero internal HTTP calls.

**Exit evidence:** image, heading, and link issues are factual, bounded, and paginated.

### Phase 9 ï¿½ SEO collections and aggregation

- [x] **T09.1** Implement paginated `GET /seo/posts?per_page=&page=` without loading all posts into memory.
- [x] **T09.2** Implement `GET /seo/issues` with stable issue types and critical/high/medium/low summary counts.
- [x] **T09.3** Implement `GET /seo/site` for site-level indexability and supported sitemap/SEO-plugin observations.
- [x] **T09.4** Test pagination boundaries, empty collections, duplicate issue aggregation, and large-site limits.

**Exit evidence:** SEO dashboard endpoints provide predictable collection and summary contracts.

### Phase 10 ï¿½ Admin settings

- [x] **T10.1** Implement `admin/class-admin.php` and `admin/views/settings.php` under an appropriate capability.
- [x] **T10.2** Add credential generate/revoke/regenerate actions protected by WordPress nonces and escaped notices.
- [~] **T10.3** Displays version, namespace, credential status, and last auth timestamps; logging controls/retention and available-module display remain to be completed.
- [x] **T10.4** Added invalid-nonce rejection, non-admin capability coverage, one-time token rendering, and escaped attacker-influenced admin-status output tests. Focused tests pass; see PROGRESS.md and SUPPORT-JOURNAL.md.

**Exit evidence:** administrators can manage credentials safely without frontend exposure.

### Phase 11 ï¿½ Quality gates and documentation

- [x] **T11.1** Ran `php -l` across 40 plugin/project PHP files (excluding disposable WordPress/tool vendor trees) on 2026-09-25; zero syntax errors.
- [x] **T11.2** Full local WordPress PHPUnit run passed on 2026-09-25: 81 tests, 804 assertions, one expected WooCommerce-absent skip, exit 0 (PHP 8.3.33, PHPUnit 10.5.64).
- [x] **T11.3** Checked for PHPCS/WordPress Coding Standards and PHPStan/static-analysis executables/configuration on 2026-09-25; none are installed or configured in this workspace. No safe behavior changes or style-only auto-fixes were made; this limitation is recorded in PROGRESS.md and SUPPORT-JOURNAL.md.
- [x] **T11.4** Authenticated REST smoke tests were already complete; unauthenticated live requests to `/health`, `/diagnostic`, `/seo/site`, `/plugins`, `/images/issues`, and `/links/issues` returned HTTP 401 JSON. Local activation, deactivation, and re-activation passed cleanly on the disposable WordPress environment with no PHP notices/warnings and no orphaned or mutated plugin settings.
- [x] **T11.5** Completed a line-by-line review of all registered diagnostic and SEO routes on 2026-09-25. Every route uses the shared Bearer authentication permission callback; SEO IDs and collection page/per-page values are validated and bounded; diagnostic check IDs are exact allowlist entries with list/byte limits; findings use bounded observations and redact credentials, raw bodies, logs, action arguments, and upstream error details; no input reaches dynamic execution, filesystem, SQL, shell, hook, or arbitrary-class selection.
- [x] **T11.6** Completed `README.md` and `readme.txt` with installation, authenticated endpoint examples, security model, hashing/rate limiting, deterministic-only AI boundary, troubleshooting, and current limitations including SQLite stock reservation and unimplemented optional internal-link verification.
- [x] **T11.7** Confirmed the release tree contains no tracked secrets or generated test data and tagged release `0.1.6` after the Phase 11 gates passed.

**Exit evidence:** reproducible test report, clean package, complete documentation, and versioned `0.1.6` release candidate.

## Phase 12 ï¿½ Read-only React dashboard and AI support layer (post-0.1.6)

The WordPress plugin remains a deterministic evidence source. The dashboard and AI layer are separate from the plugin release and must not receive or store the WordPress diagnostic token in the browser.

- [x] **T12.1** React dashboard deployed with overview, issue counts, titled findings, sign-in, and site connection. Deployment uses Worker Static Assets on the same origin as the API instead of separate Cloudflare Pages. Live Anbe scan and browser workflow verified on 2026-09-24.
- [x] **T12.2** Worker proxy implemented and deployed with encrypted D1 credential storage, server-side secrets, session authentication, rate limits, strict site/route allowlists, request/response bounds, redaction, safe logging, and real connection verification. Type-check and 32 tests passed; deployed API and browser checks passed, including live Anbe acceptance recorded in T12.3/M3.
- [x] **T12.3** Finding detail views implemented with refreshed evidence, severity, title/type/ID, and a WordPress next check. All seven proxy routes passed live Anbe checks. The scan returned 12 records; About page 10 was `ok` with only informational slug mismatch. Browser sign-in, scan, About detail, keyboard dismissal, saved-connection test, mobile layout, and sign-out passed.
- [x] **T12.4** Added click-only Worker-side AI explanations using a bounded single-finding evidence object and JSON-schema five-field output. No credentials, customer/order/payment data, full post body, or WordPress writes are sent to AI.
- [x] **T12.5** Added draft styling, verify-as-is/correct/regenerate controls, original-output preservation, reviewer note/identity/timestamp capture, and copy-to-reply gating. Live Anbe acceptance on 2026-09-26 verified one explanation as-is and deliberately corrected another; both original and current versions were retrieved afterward.

**Exit evidence:** a read-only dashboard can inspect Anbe and the local site through the Worker, and AI explanations are clearly separated from deterministic WordPress evidence.

## Handoff record

### Local setup verification ï¿½ 2026-09-21

- Local PHP/SQLite write probe passed; WP-CLI confirms WordPress is installed. The previous tooling/write-access blocker is resolved.
- AI Diagnostic Bridge 0.1.6 copied and activated locally; PHP server started at `http://127.0.0.1:8085`.
- Website/login HTTP 200; admin redirects to login. Fixed null Authorization header handling in `includes/class-auth.php`; syntax check passed, and missing/invalid authorization both return HTTP 401 JSON.
- T02.5 completed: `tests/local-bootstrap.php` loads the disposable WordPress runtime and repository plugin source. PHPUnit passed all 5 tests / 19 assertions; bootstrap syntax check passed. Authenticated local health smoke check returned HTTP 200 and `success: true`; token was read from ignored `.env` without display. Authentication and lifecycle test coverage is still incomplete.

Update this block at the end of each session so another AI can continue safely.

- **Current task:** Phase 12 AI explanation and human verification workflow completed on 2026-09-26; post-release dashboard work remains separate.
- **Last completed task:** `T11.7` (2026-09-26): local lifecycle verification passed and release `0.1.6` was tagged.
- **Deployment:** https://ai-diagnostic-bridge.onochieazukaeme.workers.dev ï¿½ version `b32a1199-7267-44d1-8cea-b2f7884c35c3` (includes the verified system-font fallback fix).
- **Files changed in this session:** `worker/`, dashboard API/auth/connection/findings integration and build fixes, `.gitignore`, and task/evidence records; subsequently added plugin update detection, advisory matcher/tests, and fixed test database shutdown ordering.
- **Tests/checks run:** Worker type-check, 32 automated tests, dashboard TypeScript/Vite production build, Wrangler dry run, deployed API checks, and headless Edge checks passed. Browser checks cover login/logout, unconfigured state, rejected unapproved URL, cleared token field, mobile overflow, same-origin requests, and known-credential exclusion.
- **Connection status:** Anbe is now configured in the deployed encrypted store. API/browser smoke scripts passed. Root `.env` still targets local WordPress and was not imported as Anbe. Dashboard sign-in key is in ignored `worker/.private/dashboard-access.txt`; never print it.
- **Next action:** continue dashboard polish only. A future WPScan secondary source would require a separate decision and token-management design.
- **Preserved backlog:** optional internal-link verification remains unimplemented; T10.3 logging controls/available-module display remain partial. Test SQLite/WooCommerce shutdown ordering is fixed; the full suite now exits successfully with 81 tests, 804 assertions, and one WooCommerce-absent case skipped. The separate SQLite stock-reservation limitation remains. Plugin SEO routes were already deployed and verified on Anbe in prior sessions; do not repeat implementation from stale earlier checklist notes.


