# AI Diagnostic Bridge — Project Context, Goals, Achievements, and Current Work

## Read this first

Latest practical work (2026-09-22): [WOOCOMMERCE-TEST-PLAN.md](WOOCOMMERCE-TEST-PLAN.md) tracks the requested one-stage-at-a-time store exercises. Step 1 passed against real active WooCommerce 11.1.1: authenticated bridge HTTP 200, installed true, configuration fields available. No enabled gateways/shipping methods and one failed site-wide scheduled action were observed. Next is store baseline setup and safe investigation of that failed action. Prior statements below that WooCommerce-present integration is wholly unverified are historical; detection/configuration reading is now verified, but checkout and break/repair exercises remain pending.

This is an active project, not a completed handoff. Continue working from the repository state described here. Read `PLAN.md`, `APPLICATION-CONTEXT.md`, `SUPPORT-JOURNAL.md`, `LOCAL-WORDPRESS-SETUP.md`, and `README.md` before changing code. `PLAN.md` is the authoritative implementation task list; `SUPPORT-JOURNAL.md` is the evidence record.

## Project purpose and goals

AI Diagnostic Bridge is a reusable WordPress plugin for safe, deterministic site diagnostics. A future AI support assistant should be able to call authenticated WordPress REST endpoints, inspect factual site evidence, identify likely configuration problems, and explain a useful next step to a site owner or support engineer.

The plugin must work for both WooCommerce and ordinary WordPress sites. It must not be tied to Missus, Anbe Nigeria, a particular theme, or a particular hosting provider. It must not call an AI provider itself, execute arbitrary code, modify content/settings, expose a general command interface, or disclose credentials, customer data, payment data, cookies, salts, database secrets, or `wp-config.php` contents.

The main goals are:

- Stable response contracts that an AI client can consume.
- Authenticated REST diagnostics with clear HTTP 401 failures.
- Useful findings for site health, PHP errors, plugins, themes, REST, performance, security, WooCommerce, and planned SEO checks.
- Correct severity aggregation: informational findings do not become warnings by themselves.
- Bounded, privacy-safe evidence and activity logging.
- Reproducible local tests plus read-only live smoke tests.
- A support tool whose value is demonstrated through real troubleshooting evidence, not only feature count.

## Why this exists: Jen and Automattic

Brian is preparing to reapply for Automattic's Happiness Engineer role from January 2027 onward. Jen's feedback said the bar now emphasizes hands-on AI work, real WordPress/WooCommerce experience, and strong troubleshooting. She asked for named projects, tools actually built, what happened when they were used, measurable before/after results, verification of AI suggestions, and deliberate WordPress/WooCommerce break-diagnose-repair practice.

AI Diagnostic Bridge is the support-focused project built in response. It should show that AI was used to ship and investigate a real tool, while Brian understands why each fix works and can explain it to a customer. Keep `APPLICATION-CONTEXT.md` as the detailed application context and `SUPPORT-JOURNAL.md` as the evidence record. Record symptoms, baseline, hypothesis, AI proposal, verification/correction, root cause, repair, validation, customer explanation, and measured time or `not measured`.

Missus is a separate headless Next.js WooCommerce storefront with an admin panel and Paystack payments. Missus must remain unchanged while this standalone plugin is developed. Connect the projects only through verified cases: observed symptom, WordPress/WooCommerce cause, bridge evidence, repair, and customer explanation. Do not claim that a fixture test or an AI suggestion is a real-store result without evidence.

Reference source for Jen's correspondence: `D:\My Web Sites\missus\JEN_FEEDBACK.md`.

## Repository and deployment locations

Standalone plugin repository:

`D:\My Web Sites\ai-diagnostic-bridge`

Original Missus copy, retained as backup:

`D:\My Web Sites\missus\ai-diagnostic-bridge`

Git remote:

`https://github.com/MadFury94/ai-diagnostic-bridge.git`

Latest pushed commit recorded in the plan: `ed3be7f`.

The plugin is deployed separately to WordPress installations by copying/ installing the plugin directory and activating it in WordPress Admin. It is not part of the Next.js deployment.

## What has been built and achieved

### Foundation and security

- Standalone namespaced PHP plugin structure exists.
- Plugin bootstrap, activation/deactivation hooks, admin settings, REST registration, authentication, response helpers, diagnostic manager, activity log, and diagnostic modules exist.
- Credential management uses generation, one-time display, hashing, revocation/regeneration metadata, bearer authentication, generic 401 errors, auth timestamps, and rate limiting.
- Admin credential actions use capability checks, nonces, sanitization, and escaped output.
- Sensitive values are excluded from responses and evidence.
- Invalid or altered check selections are rejected instead of being silently reinterpreted.
- Activity logging records bounded request outcomes without recording tokens or request contents.
- Informational findings no longer elevate an overall check to warning.

### Diagnostic coverage

Implemented or substantially implemented:

- Site health and environment metadata.
- PHP error log inspection with bounded reads and redaction.
- Plugin inventory and inactive-plugin findings.
- Theme inventory.
- REST API reachability and namespace checks.
- Performance indicators.
- Security indicators including HTTPS/debug display state.
- WooCommerce optional detection and configuration diagnostics.
- WooCommerce page publication, shipping-zone counts, scheduled-action summaries, database-update-needed state, HPOS state, and safe extension exception handling.
- Stable response envelope and finding fields.

The SEO manager and analyzers are the current next implementation area.

### Tests and validation already achieved

- Every plugin PHP file passed `php -l` syntax validation.
- The local test suite currently reports **40 PHPUnit tests and 629 assertions passed** using PHP 8.3.33, PHPUnit 10.5.64, and a temporary SQLite WordPress snapshot.
- Authentication/logging, response, REST validation, core diagnostic, and WooCommerce fixture coverage have been exercised.
- Local authenticated health smoke check returned HTTP 200 with `success: true`.
- Local missing/invalid authentication returns generic HTTP 401 JSON.
- Local activation and lifecycle work has been exercised; official WordPress fixture/lifecycle framework setup is still separate from the current SQLite snapshot tests.

## Live WordPress connection and evidence

The plugin has also been tested against the live Hostinger-hosted WordPress site:

`https://anbenigeria.com`

The REST base is:

`https://anbenigeria.com/wp-json/`

Diagnostic routes use the namespace:

`/wp-json/ai-diagnostic/v1/`

The connection method is a WordPress-generated site credential sent from a Windows terminal as an HTTPS header:

```text
Authorization: Bearer <credential stored outside the repository>
```

The credential was generated/managed in WordPress Admin through the AI Diagnostic Bridge settings. It is stored locally only in an ignored environment variable or `.env` file and must never be placed in this document, committed, printed, or pasted into evidence. If the prior credential was exposed, revoke and regenerate it before further live tests.

Live smoke checks already recorded included:

- Request without authorization returns HTTP 401 `unauthorized`.
- Authenticated `/health` works and later reported `debug: false` after debug was disabled.
- Authenticated `/plugins` works and reports inactive LiteSpeed Cache as an informational finding with overall status `ok`.
- Authenticated `/errors` inspected available entries and found no errors.
- Authenticated `/performance`, `/security`, `/rest-api`, and `/woocommerce` work.
- WooCommerce correctly reports `not_applicable` when WooCommerce is not installed.
- REST API reachability returned HTTP 200 and namespace metadata.

These are read-only smoke tests. They do not prove that every diagnostic works on every real WooCommerce extension or that a customer checkout is repaired. Keep live-site evidence separate from local fixture results.

Typical safe live test shape from Windows PowerShell is:

```powershell
curl.exe -H "Authorization: Bearer $env:AIDB_TOKEN" https://anbenigeria.com/wp-json/ai-diagnostic/v1/health
```

Do not substitute a real token into this document or into shell history. Hostinger is appropriate for authenticated smoke tests; local WordPress is preferred for PHPUnit, activation/deactivation, and deliberately broken test cases.

## Local environment

Installed under `.tools`:

- PHP 8.3.33: `.tools\php\php.exe`
- PHPUnit 10.5.64: `.tools\phpunit.phar`

Also available:

- WP-CLI 2.12.0: `C:\wp-cli\wp-cli.phar`

The disposable local WordPress/SQLite site is under `local-wp2`, intended for `http://127.0.0.1:8085`. Setup and commands are in `LOCAL-WORDPRESS-SETUP.md`. The local site has been verified in the current project records; if a fresh shell reports a database or server issue, retest the running environment before rebuilding or changing permissions.

## Current task position

The latest plan record says:

- Current task: **T07.1** — implement the SEO manager and shared post-analysis result contract.
- Last completed task: **T06.4/T06.5** — WooCommerce diagnostics and fixture tests.
- Latest recorded test result: **40 tests / 629 assertions passed**.
- Local authenticated WooCommerce endpoint: HTTP 200 and `not_applicable` because WooCommerce is absent.
- Known limitation: real WooCommerce-present integration and a deliberate real-store break/repair cycle remain unverified.
- Coding standards tool availability remains unverified.

Do not redo completed foundation, authentication, response, core, or WooCommerce work unless new evidence shows a regression. Update `PLAN.md` and `SUPPORT-JOURNAL.md` after meaningful work.

## Remaining implementation sequence

Use the exact checkboxes in `PLAN.md`. The immediate sequence is:

1. T07.1: SEO manager and shared post-analysis contract.
2. T07.2–T07.8: post analysis, metadata, indexability, post endpoint, and tests.
3. T08.1–T08.6: headings, image analysis, link analysis, pagination, and tests.
4. T09.1–T09.4: SEO collections, issue aggregation, site endpoint, and tests.
5. T10.3–T10.4: complete admin status/logging/module display and admin tests.
6. T11.1–T11.7: final syntax, PHPUnit, coding standards, security review, documentation, and release checklist.

Alongside implementation, complete the practical support evidence backlog: create a small synthetic WooCommerce store, deliberately break checkout/shipping/payment/logging/REST scenarios, diagnose and repair them, and record timings and customer-ready explanations. Do not break Missus or a live customer site.

## Working rules

- Read this file and the linked project documents before acting.
- Keep standalone plugin changes in this repository; do not modify Missus for plugin reuse work.
- Prefer small deterministic modules and narrow tests.
- Treat configuration evidence, checkout availability, and an actual customer outcome as different claims.
- Run syntax checks and the narrowest relevant tests after each change.
- Never expose credentials, customer/order/payment data, private logs, or generated test secrets.
- Do not claim unfinished work is shipped, and do not claim fixture results are live-store results.
- Update the plan and support journal with evidence, limitations, and what remains uncertain.

## Definition of success

The project is ready for its intended application and reuse when a new WordPress or WooCommerce site can install and authenticate the plugin, diagnostic routes return stable safe envelopes, findings have correct severity and useful evidence, local tests pass, live smoke tests are documented, support break/repair exercises have measurable evidence, and every remaining `PLAN.md` item is complete or explicitly deferred.

## 2026-09-22 — Repository access repaired for the AI Powered WordPress course

Brian is taking the AI Powered WordPress course. Portable PHP previously had no php.ini and lacked OpenSSL/cURL; WordPress returned `No working transports found`. Added `.tools/php/php.ini` enabling OpenSSL, cURL, ZIP, fileinfo, mbstring, and SQLite, with WordPress's CA bundle and certificate verification retained.

Verified outside the agent sandbox: plugin search and theme search each returned results, a temporary Hello Dolly ZIP downloaded and opened successfully, and WordPress reported filesystem method `direct`. No new plugin was installed. The sandbox blocked outbound requests, so the local server was restarted outside it. An HTTP probe on that server confirmed enabled OpenSSL/cURL/ZIP and WordPress.org HTTP 200; login returned HTTP 200. Temporary probe and download were removed.

Use the current commands in LOCAL-WORDPRESS-SETUP.md; do not duplicate extension-loading switches now that php.ini loads them. The course-specific AI plugin/provider remains unverified.

## 2026-09-22 — Synthetic WooCommerce baseline completed with SQLite limitation

Step 2 of WOOCOMMERCE-TEST-PLAN.md is complete. The configured product, shipping zone/rate, offline payment method, cart total, and synthetic order were verified. The first checkout exposed SQLite stock-reservation incompatibility; a temporary local-only bypass allowed a single baseline order and was removed immediately. This is documented as a limitation, not a plugin fix. Next task is checkout-page break/repair (step 3).
