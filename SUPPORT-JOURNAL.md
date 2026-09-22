# AI Diagnostic Bridge support evidence journal

Started: 2026-09-21. Purpose and application context: [APPLICATION-CONTEXT.md](APPLICATION-CONTEXT.md).

## Evidence status

Entries below summarize observed work in this workspace/conversation unless explicitly labelled otherwise. They are development/troubleshooting evidence, not customer support tickets or claims of customer impact. Brian's independent reproduction and explanation are still to be recorded. Investigation time and hours saved were not measured in these sessions.

The latest suite passed **40 tests / 629 assertions** on PHP 8.3.33 and PHPUnit 10.5.64. The reported PHPUnit test runtime was **12.500 seconds**; this excludes setup and is not an investigation-time or productivity metric. Tests use a temporary SQLite snapshot and the repository source, not the installed plugin copy. The local WooCommerce-present cases use an API-adapter fixture; real WooCommerce integration remains unverified.

## 2026-09-21 — Local setup: verify the blocker before fixing it

**Symptom/baseline:** the handoff said WordPress installation was unfinished and the database directory was unwritable. The local website did not respond.

**Investigation and AI correction:** instead of applying the documented administrator permission command, the assistant inspected permissions, checked PHP writability, and created/wrote/read/deleted a temporary SQLite database. All succeeded. WP-CLI `core is-installed` returned exit code 0. The existing database already pointed to `http://127.0.0.1:8085`.

**What failed during development:** loading SQLite extensions by short names initially looked in `C:\php\ext` and failed. Explicit DLL paths worked. Starting the server also encountered duplicate `Path`/`PATH` environment entries; normalizing those entries in the child shell allowed the hidden process to start.

**Resolution and outcome:** no ACL change or reinstall was needed. Copied and activated AI Diagnostic Bridge 0.1.5 and started the local PHP server. Website and login returned HTTP 200; `/wp-admin/` redirected to login as expected. Updated the stale handoff.

**Customer explanation:** “WordPress was already installed. The site was unavailable because its local web server was not running. We verified database access and started the server, preserving the installation.”

**Learning:** a recorded blocker is a hypothesis until retested; diagnose the running environment before changing permissions or rebuilding a site. **Time saved:** not measured. Evidence: [local setup](LOCAL-WORDPRESS-SETUP.md), [handoff](PROGRESS.md).

## 2026-09-21 — Missing authorization crashed the diagnostic endpoint

**Before:** a request without an Authorization header produced a PHP TypeError from `trim(null)`, with a stack trace displayed in the local debug environment. The HTTP response misleadingly showed 200.

**Root cause and repair:** WordPress can return null for a missing header. Changed the authentication reader to use an empty string for that case, allowing normal rejection to run.

**Verification:** local requests with missing authorization and an invalid bearer token returned generic JSON with HTTP 401. Later tests covered malformed, revoked, regenerated, and rate-limited credentials as well as non-admin credential management. The existing token was read from ignored `.env` and worked without being printed.

**Customer explanation:** “A request with no credentials should be refused cleanly. It now receives an authentication-required response instead of an internal error.”

**Learning:** inspect both HTTP status and response contents; a 200 alone did not demonstrate success. Evidence: [authentication source](includes/class-auth.php), [authentication/logging tests](tests/AuthLoggingTest.php). **Investigation/repair duration:** not measured.

## 2026-09-21 — Verify responses and record request outcomes safely

**Before:** response contract tests existed but had not run locally; diagnostic routes were not consistently connected to activity logging.

**Changes:** added a local WordPress test bootstrap, then isolated credential tests in temporary SQLite snapshots. Added one activity entry per handled diagnostic request, containing endpoint, success, authentication result, timestamp, and duration. The registered endpoint name is logged, not request contents.

**Verification:** the initial contract suite passed 5 tests / 19 assertions. Authentication/logging expansion passed 14 / 114. Tests checked retention, disabled logging, duplicate permission probes, credential lifecycle, and token exclusion. Actual local HTTP success/failure requests produced the expected two log entries. The user's existing token still worked after tests.

**Customer explanation:** “The tool can show whether a diagnostic request succeeded or was refused without recording the credential or your request data.”

**Learning:** WordPress can probe permissions more than once; permission checks alone are not a reliable place to count requests. Existing-site credential tests need isolation. **Support-effort reduction:** not measured. Evidence: [REST controller](includes/class-rest-api.php), [snapshot bootstrap](tests/local-bootstrap.php).

## 2026-09-21 — Invalid check selections must not become a different request

**Before:** input handling could default invalid types to a site check, sanitize altered IDs into valid ones, or truncate oversized lists. A manager return-type mismatch could crash the intended unknown-check error path.

**Changes and reasoning:** accept exact registered IDs, reject malformed/nested/unknown input, enforce list and string bounds, and allow the declared WP_Error return. Preserve documented defaults only for omitted/empty lists; deduplicate valid IDs in order.

**Verification:** suite reached 22 tests / 491 assertions. Local HTTP returned 200 for a valid combination and 400 for nested checks, altered IDs, and malformed JSON. Tests covered parameter precedence and authentication across every registered diagnostic route.

**Customer explanation:** “The tool now tells you when a diagnostic selection is invalid instead of quietly running something else.”

**Learning:** validation should preserve intent; sanitization is not permission to reinterpret an invalid command. Evidence: [REST validation tests](tests/RestValidationTest.php). **Time saved:** not measured.

## 2026-09-21 — Log evidence must be bounded and safe to share

**Before, from source review:** the errors module ignored debug configuration, read the whole file before limiting lines, and could return raw messages/absolute paths. The REST module returned namespace indexes instead of names and treated redirects as successful checks.

**Changes:** respect debug configuration and custom local log paths; bound reads to 65,536 bytes / 100 recent nonempty lines; expose structured error type, recognized timestamp, and normalized location instead of raw messages. Mask other paths. Return namespace names, surface redirects, and omit upstream transport error details.

**Verification:** suite reached 31 tests / 583 assertions. Synthetic logs covered Windows/Unix paths, secrets, missing/disabled logs, severity, and truncation. Mocked REST checks covered 200, redirects, 401/403, server and transport errors. Local authenticated `/errors` returned 200 / `not_applicable` because debug logging was disabled; no real log failure was deliberately created on the site.

**Customer explanation:** “The diagnostic shares the error category and relevant code location without exposing the full log, which may contain private information.”

**Learning:** safe evidence may require deliberately withholding free-form text; passing only the final 100 lines does not bound memory if the whole file was loaded first. Evidence: [core tests](tests/CoreDiagnosticsTest.php). **Performance improvement:** bounded-read behavior verified; no latency or memory benchmark measured.

## 2026-09-21 — WooCommerce configuration checks without customer context

**Before:** only basic version/currency/page IDs and a checkout-available gateway count existed. Shipping, scheduled actions, and compatibility context were missing.

**AI proposal corrected through documentation:** checkout gateway availability can require a customer session and is unsuitable for a REST diagnostic. Replaced it with configured/enabled counts. An initial comparison of database version against plugin version was also replaced with WooCommerce's official update-needed flag, avoiding an assumption that every patch release requires a database update.

**Changes:** page publication checks; shipping counts including zone 0; bounded, explicitly site-wide failed/overdue scheduled-action summaries; database-update-needed flag; HPOS state; generic handling of extension exceptions. Missing APIs stay unknown rather than becoming zero. Empty payment/shipping settings are informational to accommodate free-order or virtual-product stores.

**Verification:** 40 tests / 629 assertions passed, including present/absent fixtures, limits, exception safety, and exclusion of synthetic private data. Actual local `/woocommerce` returned 200 / `not_applicable` because WooCommerce is absent. **Not yet demonstrated:** a real WooCommerce store's break/repair cycle or compatibility across real extensions.

**Customer explanation:** “These checks show configured pages and payment/shipping settings. They do not prove that a particular customer can complete checkout, so we would reproduce that customer's flow next.”

**Learning:** configuration, checkout availability, and observed customer outcomes are different kinds of evidence. Evidence: [WooCommerce tests](tests/WooCommerceTest.php), [API sources and limitations](README.md#woocommerce-diagnostics). **Support time saved:** not measured.

## Prior live evidence — reported in the original handoff

The original PROGRESS.md reported authenticated and unauthenticated smoke tests on Anbe Nigeria, including missing authorization returning 401, debug disabled, and an inactive plugin reported informationally. These were not rerun in the sessions summarized above. Locate the referenced commit `ed3be7f` and its supporting artifacts before using detailed live-site claims in an application. Do not imply that fixture tests or today's local results came from that live site.

## Planned practical exercises — not completed

Create a small disposable WooCommerce test store with synthetic products and test-mode payments. Establish a working baseline before each exercise and restore it afterward. Do not break Missus or a live customer site.

| Exercise | Baseline and deliberate failure | Evidence to collect |
|---|---|---|
| Checkout page | Working checkout; unpublish its configured page | Customer symptom, bridge finding, restore publication, repeat checkout |
| Shipping | Physical product with a matching zone; disable the needed method | Customer address scenario, configuration counts, zone diagnosis, restored rate |
| Payment configuration | Test checkout with an enabled gateway; disable it | Configured versus checkout behavior, test transaction outcome, restored setting |
| PHP log | Controlled synthetic warning with debug logging enabled, then disabled | Detection, bounded/redacted evidence, repair of the test cause, clean repeat |
| REST restriction | Working endpoint; introduce a reversible restriction | HTTP status before/after, safe failure evidence, restored access |
| Vague support report | “Checkout is broken” with a known synthetic cause | Questions asked, manual baseline time, bridge-assisted time, verified root cause, customer reply |

For timing comparisons, define the same task and start/end points, note prior familiarity, and repeat where practical. Report observations and sample size; do not extrapolate a single exercise into hours saved for customers.

## Template for the next case

- Date, case ID, project/version, environment, evidence level:
- Customer-style report and intended outcome:
- Working baseline and exact reproduction steps:
- Hypothesis and AI suggestion (including tool used):
- Evidence gathered; what supported or contradicted the suggestion:
- Root cause and why the repair addresses it:
- Change and rollback/restoration steps:
- Before/after behavior and validation artifacts:
- Time to diagnose / repair / verify; comparison method or “not measured”:
- Customer explanation and next step:
- Brian's explanation in his own words; what changed in his understanding:
- Remaining uncertainty, follow-up, and safe artifact links:

## 2026-09-22 — Restore repository access for the AI Powered WordPress course

**User report:** Brian started the AI Powered WordPress course and could not access the online repository from local WordPress.

**Baseline/root cause:** portable PHP had no loaded php.ini, and OpenSSL/cURL were disabled. WordPress's HTTPS request failed with `http_request_failed: No working transports found`. Local WordPress is not inherently offline; this runtime lacked HTTPS support.

**Repair:** added persistent `.tools/php/php.ini` enabling OpenSSL/cURL, ZIP, fileinfo, mbstring, and SQLite. Configured WordPress's bundled CA certificates with TLS verification retained. Restarted the local PHP server using this configuration.

**Failed attempts and verification:** the first test still failed inside the agent sandbox. An approved outside-sandbox request returned HTTP 200, identifying a separate network restriction. PowerShell Stop-Process then failed with a null-reference error; after verifying the process executable/PID, Windows taskkill stopped the old server and a new hidden server started outside the sandbox.

**Results:** WordPress plugin search returned one result; theme search returned one result. WordPress downloaded a valid Hello Dolly ZIP with three entries, which was deleted without installation. Filesystem method was `direct`. A temporary HTTP probe on the restarted server confirmed OpenSSL/cURL/ZIP loaded and WordPress.org HTTP 200. The probe was removed; login returned HTTP 200.

**Customer explanation:** Your local WordPress can use the online plugin directory. Its PHP runtime lacked the modules needed for secure connections. Those are now enabled, and repository searches and a plugin download passed verification.

**Learning:** verify the dashboard's running PHP process, not just the command line; distinguish sandbox restrictions from site configuration without disabling certificate checks. No new plugin was installed or activated. The course's particular AI plugin/provider and SQLite compatibility remain unverified. No provider call was tested. Investigation duration and time saved were not measured; Brian's own reproduction/explanation remains to be recorded. Evidence: [current setup guide](LOCAL-WORDPRESS-SETUP.md).

## 2026-09-22 — Real WooCommerce detection, practical exercise step 1

**Context:** Brian installed WooCommerce and asked to put the proposed exercises into a task-list file and work through them one at a time. Created WOOCOMMERCE-TEST-PLAN.md and completed the first read-only stage.

**Evidence:** WP-CLI reports WooCommerce 11.1.1 active. An authenticated local `/woocommerce` request returned HTTP 200, success true, and warning status. Database version is 11.1.1, database update not needed, currency NGN, HPOS enabled. Shop/cart/checkout pages (11/12/13) are published. Three configured gateways, zero enabled; shipping enabled, zero custom zones and enabled methods. Site-wide scheduled-action counts: one failed, zero overdue. No diagnostic section returned unknown/unavailable.

**Privacy and scope:** inspected response fields were configuration facts/counts; the current token was checked for absence without display. No customer/order/payment records were requested or returned. No settings were changed. This verifies actual WooCommerce detection/configuration reads, not successful checkout or all extension combinations. Comprehensive privacy/regression checks remain in step 5.

**Customer explanation:** WooCommerce is installed and the diagnostic tool can read its configuration. Your store pages are published, but payment and shipping methods still need setup for our physical-product test. A background task has failed; we need to inspect its cause before drawing conclusions.

**Next:** step 2, establish a synthetic-store baseline; investigate the failed scheduled action without exposing its arguments or private log contents. Break/repair exercises have not started. Elapsed troubleshooting time and savings were not measured. Brian's independent reproduction/explanation remains to be recorded.

## 2026-09-22 — Missing fetch_patterns callback reproduced in cron context

Investigated failed action 17 (`fetch_patterns`) without retrying it or reading task arguments. Temporary HTTP probes bootstrapped the installed WooCommerce 11.1.1 under normal, admin, REST, and cron-style request constants. The hook was registered in normal/admin/REST contexts but absent in cron context; init had run in all four cases. Automatic cron spawning was disabled for the probes; no action was invoked, and the probe file was removed.

Installed source confirms BlockRegistrationContext skips block initialization for cron; Bootstrap loads PTKPatternsStore explicitly for admin/REST but not cron, while that store's constructor registers fetch_patterns. This matches the confirmed upstream issue: https://github.com/woocommerce/woocommerce/issues/68409 (reported for 11.1.0). The same missing-handler condition is reproduced in our 11.1.1 installation. This points to a WooCommerce request-initialization bug rather than missing PHP extensions or SQLite configuration. It concerns the optional block-pattern cache; this investigation is not an end-to-end checkout validation.

No workaround, plugin edit, or action retry was performed. Next decision is whether to wait for an upstream fix or implement and verify a narrowly scoped local workaround. Customer explanation: the task handler loads in the dashboard but is skipped during background cron requests, so the scheduler cannot call it. Timings/savings not measured.

## 2026-09-22 — Synthetic WooCommerce baseline and SQLite checkout boundary

Configured product 17 (synthetic physical notebook, NGN 2,500, stock 10), Nigeria shipping zone 1 with flat rate NGN 500, and local COD. Cart and shipping calculation returned NGN 3,000. The first checkout created draft order 19 but failed in WooCommerce stock reservation because the SQLite adapter could not parse MySQL `INTERVAL 60 MINUTE`; stock remained 10.

For this disposable baseline only, installed a temporary local MU-plugin that set `woocommerce_order_hold_stock_minutes` to zero and suppressed mail. Checkout then succeeded: order 20, `processing`, COD payment status `success`, total NGN 3,000, stock reduced from 10 to 9. Removed the temporary MU-plugin immediately afterward. This verifies cart, shipping, offline payment, order creation, and stock reduction; it does not validate concurrent stock reservation locking on SQLite. Draft order 19 and order 20 are synthetic local evidence; no real payment, email, customer, or fulfilment occurred.

The bridge now reports one enabled gateway, one enabled shipping method, and one failed site-wide scheduled action. Saved baseline state is in `.tools/woocommerce-baseline.json`. Time to diagnose/repair and time saved: not measured. Brian's independent reproduction and explanation: still to be recorded. Next is checkout-page break/repair; do not create another baseline order.
