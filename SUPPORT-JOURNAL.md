# AI Diagnostic Bridge support evidence journal

Started: 2026-09-21. Purpose and application context: [APPLICATION-CONTEXT.md](APPLICATION-CONTEXT.md).

## Evidence status

Latest status (2026-09-24): Worker/dashboard deployment and live Anbe acceptance are complete, including all seven proxy routes and browser scan/detail checks. Later dated entries supersede the earlier credential-blocker and old suite/integration summaries below. Current requested work is plugin update and known-vulnerability detection.

Entries below summarize observed work in this workspace/conversation unless explicitly labelled otherwise. They are development/troubleshooting evidence, not customer support tickets or claims of customer impact. Brian's independent reproduction and explanation are still to be recorded. Investigation time and hours saved were not measured in these sessions.

The latest suite passed **40 tests / 629 assertions** on PHP 8.3.33 and PHPUnit 10.5.64. The reported PHPUnit test runtime was **12.500 seconds**; this excludes setup and is not an investigation-time or productivity metric. Tests use a temporary SQLite snapshot and the repository source, not the installed plugin copy. The local WooCommerce-present cases use an API-adapter fixture; real WooCommerce integration remains unverified.

## 2026-09-21 ? Local setup: verify the blocker before fixing it

**Symptom/baseline:** the handoff said WordPress installation was unfinished and the database directory was unwritable. The local website did not respond.

**Investigation and AI correction:** instead of applying the documented administrator permission command, the assistant inspected permissions, checked PHP writability, and created/wrote/read/deleted a temporary SQLite database. All succeeded. WP-CLI `core is-installed` returned exit code 0. The existing database already pointed to `http://127.0.0.1:8085`.

**What failed during development:** loading SQLite extensions by short names initially looked in `C:\php\ext` and failed. Explicit DLL paths worked. Starting the server also encountered duplicate `Path`/`PATH` environment entries; normalizing those entries in the child shell allowed the hidden process to start.

**Resolution and outcome:** no ACL change or reinstall was needed. Copied and activated AI Diagnostic Bridge 0.1.6 and started the local PHP server. Website and login returned HTTP 200; `/wp-admin/` redirected to login as expected. Updated the stale handoff.

**Customer explanation:** ?WordPress was already installed. The site was unavailable because its local web server was not running. We verified database access and started the server, preserving the installation.?

**Learning:** a recorded blocker is a hypothesis until retested; diagnose the running environment before changing permissions or rebuilding a site. **Time saved:** not measured. Evidence: [local setup](LOCAL-WORDPRESS-SETUP.md), [handoff](PROGRESS.md).

## 2026-09-21 ? Missing authorization crashed the diagnostic endpoint

**Before:** a request without an Authorization header produced a PHP TypeError from `trim(null)`, with a stack trace displayed in the local debug environment. The HTTP response misleadingly showed 200.

**Root cause and repair:** WordPress can return null for a missing header. Changed the authentication reader to use an empty string for that case, allowing normal rejection to run.

**Verification:** local requests with missing authorization and an invalid bearer token returned generic JSON with HTTP 401. Later tests covered malformed, revoked, regenerated, and rate-limited credentials as well as non-admin credential management. The existing token was read from ignored `.env` and worked without being printed.

**Customer explanation:** ?A request with no credentials should be refused cleanly. It now receives an authentication-required response instead of an internal error.?

**Learning:** inspect both HTTP status and response contents; a 200 alone did not demonstrate success. Evidence: [authentication source](includes/class-auth.php), [authentication/logging tests](tests/AuthLoggingTest.php). **Investigation/repair duration:** not measured.

## 2026-09-21 ? Verify responses and record request outcomes safely

**Before:** response contract tests existed but had not run locally; diagnostic routes were not consistently connected to activity logging.

**Changes:** added a local WordPress test bootstrap, then isolated credential tests in temporary SQLite snapshots. Added one activity entry per handled diagnostic request, containing endpoint, success, authentication result, timestamp, and duration. The registered endpoint name is logged, not request contents.

**Verification:** the initial contract suite passed 5 tests / 19 assertions. Authentication/logging expansion passed 14 / 114. Tests checked retention, disabled logging, duplicate permission probes, credential lifecycle, and token exclusion. Actual local HTTP success/failure requests produced the expected two log entries. The user's existing token still worked after tests.

**Customer explanation:** ?The tool can show whether a diagnostic request succeeded or was refused without recording the credential or your request data.?

**Learning:** WordPress can probe permissions more than once; permission checks alone are not a reliable place to count requests. Existing-site credential tests need isolation. **Support-effort reduction:** not measured. Evidence: [REST controller](includes/class-rest-api.php), [snapshot bootstrap](tests/local-bootstrap.php).

## 2026-09-21 ? Invalid check selections must not become a different request

**Before:** input handling could default invalid types to a site check, sanitize altered IDs into valid ones, or truncate oversized lists. A manager return-type mismatch could crash the intended unknown-check error path.

**Changes and reasoning:** accept exact registered IDs, reject malformed/nested/unknown input, enforce list and string bounds, and allow the declared WP_Error return. Preserve documented defaults only for omitted/empty lists; deduplicate valid IDs in order.

**Verification:** suite reached 22 tests / 491 assertions. Local HTTP returned 200 for a valid combination and 400 for nested checks, altered IDs, and malformed JSON. Tests covered parameter precedence and authentication across every registered diagnostic route.

**Customer explanation:** ?The tool now tells you when a diagnostic selection is invalid instead of quietly running something else.?

**Learning:** validation should preserve intent; sanitization is not permission to reinterpret an invalid command. Evidence: [REST validation tests](tests/RestValidationTest.php). **Time saved:** not measured.

## 2026-09-21 ? Log evidence must be bounded and safe to share

**Before, from source review:** the errors module ignored debug configuration, read the whole file before limiting lines, and could return raw messages/absolute paths. The REST module returned namespace indexes instead of names and treated redirects as successful checks.

**Changes:** respect debug configuration and custom local log paths; bound reads to 65,536 bytes / 100 recent nonempty lines; expose structured error type, recognized timestamp, and normalized location instead of raw messages. Mask other paths. Return namespace names, surface redirects, and omit upstream transport error details.

**Verification:** suite reached 31 tests / 583 assertions. Synthetic logs covered Windows/Unix paths, secrets, missing/disabled logs, severity, and truncation. Mocked REST checks covered 200, redirects, 401/403, server and transport errors. Local authenticated `/errors` returned 200 / `not_applicable` because debug logging was disabled; no real log failure was deliberately created on the site.

**Customer explanation:** ?The diagnostic shares the error category and relevant code location without exposing the full log, which may contain private information.?

**Learning:** safe evidence may require deliberately withholding free-form text; passing only the final 100 lines does not bound memory if the whole file was loaded first. Evidence: [core tests](tests/CoreDiagnosticsTest.php). **Performance improvement:** bounded-read behavior verified; no latency or memory benchmark measured.

## 2026-09-21 ? WooCommerce configuration checks without customer context

**Before:** only basic version/currency/page IDs and a checkout-available gateway count existed. Shipping, scheduled actions, and compatibility context were missing.

**AI proposal corrected through documentation:** checkout gateway availability can require a customer session and is unsuitable for a REST diagnostic. Replaced it with configured/enabled counts. An initial comparison of database version against plugin version was also replaced with WooCommerce's official update-needed flag, avoiding an assumption that every patch release requires a database update.

**Changes:** page publication checks; shipping counts including zone 0; bounded, explicitly site-wide failed/overdue scheduled-action summaries; database-update-needed flag; HPOS state; generic handling of extension exceptions. Missing APIs stay unknown rather than becoming zero. Empty payment/shipping settings are informational to accommodate free-order or virtual-product stores.

**Verification:** 40 tests / 629 assertions passed, including present/absent fixtures, limits, exception safety, and exclusion of synthetic private data. Actual local `/woocommerce` returned 200 / `not_applicable` because WooCommerce is absent. **Not yet demonstrated:** a real WooCommerce store's break/repair cycle or compatibility across real extensions.

**Customer explanation:** ?These checks show configured pages and payment/shipping settings. They do not prove that a particular customer can complete checkout, so we would reproduce that customer's flow next.?

**Learning:** configuration, checkout availability, and observed customer outcomes are different kinds of evidence. Evidence: [WooCommerce tests](tests/WooCommerceTest.php), [API sources and limitations](README.md#woocommerce-diagnostics). **Support time saved:** not measured.

## Prior live evidence ? reported in the original handoff

The original PROGRESS.md reported authenticated and unauthenticated smoke tests on Anbe Nigeria, including missing authorization returning 401, debug disabled, and an inactive plugin reported informationally. These were not rerun in the sessions summarized above. Locate the referenced commit `ed3be7f` and its supporting artifacts before using detailed live-site claims in an application. Do not imply that fixture tests or today's local results came from that live site.

## Planned practical exercises ? not completed

Create a small disposable WooCommerce test store with synthetic products and test-mode payments. Establish a working baseline before each exercise and restore it afterward. Do not break Missus or a live customer site.

| Exercise | Baseline and deliberate failure | Evidence to collect |
|---|---|---|
| Checkout page | Working checkout; unpublish its configured page | Customer symptom, bridge finding, restore publication, repeat checkout |
| Shipping | Physical product with a matching zone; disable the needed method | Customer address scenario, configuration counts, zone diagnosis, restored rate |
| Payment configuration | Test checkout with an enabled gateway; disable it | Configured versus checkout behavior, test transaction outcome, restored setting |
| PHP log | Controlled synthetic warning with debug logging enabled, then disabled | Detection, bounded/redacted evidence, repair of the test cause, clean repeat |
| REST restriction | Working endpoint; introduce a reversible restriction | HTTP status before/after, safe failure evidence, restored access |
| Vague support report | ?Checkout is broken? with a known synthetic cause | Questions asked, manual baseline time, bridge-assisted time, verified root cause, customer reply |

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
- Time to diagnose / repair / verify; comparison method or ?not measured?:
- Customer explanation and next step:
- Brian's explanation in his own words; what changed in his understanding:
- Remaining uncertainty, follow-up, and safe artifact links:

## 2026-09-22 ? Restore repository access for the AI Powered WordPress course

**User report:** Brian started the AI Powered WordPress course and could not access the online repository from local WordPress.

**Baseline/root cause:** portable PHP had no loaded php.ini, and OpenSSL/cURL were disabled. WordPress's HTTPS request failed with `http_request_failed: No working transports found`. Local WordPress is not inherently offline; this runtime lacked HTTPS support.

**Repair:** added persistent `.tools/php/php.ini` enabling OpenSSL/cURL, ZIP, fileinfo, mbstring, and SQLite. Configured WordPress's bundled CA certificates with TLS verification retained. Restarted the local PHP server using this configuration.

**Failed attempts and verification:** the first test still failed inside the agent sandbox. An approved outside-sandbox request returned HTTP 200, identifying a separate network restriction. PowerShell Stop-Process then failed with a null-reference error; after verifying the process executable/PID, Windows taskkill stopped the old server and a new hidden server started outside the sandbox.

**Results:** WordPress plugin search returned one result; theme search returned one result. WordPress downloaded a valid Hello Dolly ZIP with three entries, which was deleted without installation. Filesystem method was `direct`. A temporary HTTP probe on the restarted server confirmed OpenSSL/cURL/ZIP loaded and WordPress.org HTTP 200. The probe was removed; login returned HTTP 200.

**Customer explanation:** Your local WordPress can use the online plugin directory. Its PHP runtime lacked the modules needed for secure connections. Those are now enabled, and repository searches and a plugin download passed verification.

**Learning:** verify the dashboard's running PHP process, not just the command line; distinguish sandbox restrictions from site configuration without disabling certificate checks. No new plugin was installed or activated. The course's particular AI plugin/provider and SQLite compatibility remain unverified. No provider call was tested. Investigation duration and time saved were not measured; Brian's own reproduction/explanation remains to be recorded. Evidence: [current setup guide](LOCAL-WORDPRESS-SETUP.md).

## 2026-09-22 ? Real WooCommerce detection, practical exercise step 1

**Context:** Brian installed WooCommerce and asked to put the proposed exercises into a task-list file and work through them one at a time. Created WOOCOMMERCE-TEST-PLAN.md and completed the first read-only stage.

**Evidence:** WP-CLI reports WooCommerce 11.1.1 active. An authenticated local `/woocommerce` request returned HTTP 200, success true, and warning status. Database version is 11.1.1, database update not needed, currency NGN, HPOS enabled. Shop/cart/checkout pages (11/12/13) are published. Three configured gateways, zero enabled; shipping enabled, zero custom zones and enabled methods. Site-wide scheduled-action counts: one failed, zero overdue. No diagnostic section returned unknown/unavailable.

**Privacy and scope:** inspected response fields were configuration facts/counts; the current token was checked for absence without display. No customer/order/payment records were requested or returned. No settings were changed. This verifies actual WooCommerce detection/configuration reads, not successful checkout or all extension combinations. Comprehensive privacy/regression checks remain in step 5.

**Customer explanation:** WooCommerce is installed and the diagnostic tool can read its configuration. Your store pages are published, but payment and shipping methods still need setup for our physical-product test. A background task has failed; we need to inspect its cause before drawing conclusions.

**Next:** step 2, establish a synthetic-store baseline; investigate the failed scheduled action without exposing its arguments or private log contents. Break/repair exercises have not started. Elapsed troubleshooting time and savings were not measured. Brian's independent reproduction/explanation remains to be recorded.

## 2026-09-22 ? Missing fetch_patterns callback reproduced in cron context

Investigated failed action 17 (`fetch_patterns`) without retrying it or reading task arguments. Temporary HTTP probes bootstrapped the installed WooCommerce 11.1.1 under normal, admin, REST, and cron-style request constants. The hook was registered in normal/admin/REST contexts but absent in cron context; init had run in all four cases. Automatic cron spawning was disabled for the probes; no action was invoked, and the probe file was removed.

Installed source confirms BlockRegistrationContext skips block initialization for cron; Bootstrap loads PTKPatternsStore explicitly for admin/REST but not cron, while that store's constructor registers fetch_patterns. This matches the confirmed upstream issue: https://github.com/woocommerce/woocommerce/issues/68409 (reported for 11.1.0). The same missing-handler condition is reproduced in our 11.1.1 installation. This points to a WooCommerce request-initialization bug rather than missing PHP extensions or SQLite configuration. It concerns the optional block-pattern cache; this investigation is not an end-to-end checkout validation.

No workaround, plugin edit, or action retry was performed. Next decision is whether to wait for an upstream fix or implement and verify a narrowly scoped local workaround. Customer explanation: the task handler loads in the dashboard but is skipped during background cron requests, so the scheduler cannot call it. Timings/savings not measured.

## 2026-09-22 ? Synthetic WooCommerce baseline and SQLite checkout boundary

Configured product 17 (synthetic physical notebook, NGN 2,500, stock 10), Nigeria shipping zone 1 with flat rate NGN 500, and local COD. Cart and shipping calculation returned NGN 3,000. The first checkout created draft order 19 but failed in WooCommerce stock reservation because the SQLite adapter could not parse MySQL `INTERVAL 60 MINUTE`; stock remained 10.

For this disposable baseline only, installed a temporary local MU-plugin that set `woocommerce_order_hold_stock_minutes` to zero and suppressed mail. Checkout then succeeded: order 20, `processing`, COD payment status `success`, total NGN 3,000, stock reduced from 10 to 9. Removed the temporary MU-plugin immediately afterward. This verifies cart, shipping, offline payment, order creation, and stock reduction; it does not validate concurrent stock reservation locking on SQLite. Draft order 19 and order 20 are synthetic local evidence; no real payment, email, customer, or fulfilment occurred.

The bridge now reports one enabled gateway, one enabled shipping method, and one failed site-wide scheduled action. Saved baseline state is in `.tools/woocommerce-baseline.json`. Time to diagnose/repair and time saved: not measured. Brian's independent reproduction and explanation: still to be recorded. Next is checkout-page break/repair; do not create another baseline order.

## 2026-09-22 ? Anbe Nigeria route and validation checks

Additional read-only checks returned HTTP 200 for `/site`, `/themes`, and the combined `/diagnostic` route. A POST diagnostic request for `health`, `plugins`, and `woocommerce` returned HTTP 200. Unknown check names and nested/non-string checks were rejected with HTTP 400, confirming request validation. No live content, settings, orders, customers, or credentials were changed.

## 2026-09-22 ? Anbe Nigeria live installation smoke test

Brian installed AI Diagnostic Bridge on Anbe Nigeria and stored the credential in the ignored `.env` file. Read-only smoke testing was run against the live HTTPS REST namespace; the credential was not printed or added to evidence.

Unauthenticated `/health` returned HTTP 401 as expected. Authenticated requests returned HTTP 200 with `success: true` for `/health`, `/plugins`, `/errors`, `/performance`, `/security`, `/rest-api`, and `/woocommerce`.

Safe summaries: health status `ok` with no findings; plugins status `ok` with one informational finding that LiteSpeed Cache is installed but inactive; errors status `not_applicable` with no findings; performance/security/REST status `ok` with no findings. WooCommerce 11.1.1 is installed with USD currency, three configured gateways and zero enabled, shipping enabled with zero zones/methods, and HPOS/configuration fields available. WooCommerce returned warning status because it reported no enabled gateways, no shipping methods (informational findings), and a site-wide scheduled-action review finding. Failed scheduled actions reached the diagnostic cap of 100 and were marked truncated; overdue count was zero. No order/customer/payment data was requested or returned.

No live settings, plugins, scheduled actions, orders, or credentials were changed. These results are current smoke evidence, not a claim that live checkout is broken; use staging before any deliberate break/repair exercise. The token remains only in ignored local storage and must never be committed or printed.

## 2026-09-22 ? Anbe Nigeria Pay on Delivery and product visibility check

After Brian added a product and enabled Pay on Delivery, the read-only WooCommerce diagnostic returned HTTP 200 with one enabled payment gateway (3 configured total). WooCommerce 11.1.1, USD currency, published shop/cart/checkout pages, HPOS enabled, and zero overdue scheduled actions were reported. The public WooCommerce Store API returned HTTP 200 with one visible product. No order was placed and no live state was changed by the bridge.

## 2026-09-22 ? Anbe Nigeria live checkout confirmation

Brian confirmed two live orders were created after adding a product and enabling Pay on Delivery. The orders are visible in WooCommerce, with pending orders and the current order processing; no checkout, payment, or scheduled-action errors were observed. This confirms live catalog visibility, checkout submission, Pay on Delivery selection, order creation, and status progression. Order identifiers and customer details are intentionally excluded from this journal.

## 2026-09-22 ? Local WooCommerce checkout page break and repair

On the disposable local site, checkout page 13 was temporarily changed from published to draft. A guest visiting /checkout/ received the ordinary site template instead of checkout. The bridge returned woocommerce-checkout-page-invalid with medium severity and reported the checkout page as unpublished. The page was republished; after adding the synthetic product to the cart, checkout rendered successfully. A final bridge request returned HTTP 200, checkout_published: true, and no checkout-page-invalid finding. No live site was changed. Elapsed timing was not captured.

## 2026-09-22 ? Local WooCommerce shipping method break and recovery

The local flat-rate shipping method (zone 1, instance 1) was temporarily disabled through the WooCommerce instance setting. The setting was restored to enabled, the local server was restarted, and the final bridge request returned HTTP 200 with one enabled shipping method, one shipping zone, and no woocommerce-no-shipping-methods finding. The remaining scheduled-actions finding was unrelated. No live site was changed.

## 2026-09-22 ? Local WooCommerce Pay on Delivery break and recovery

The local Pay on Delivery gateway was temporarily disabled by changing its local-only WooCommerce setting. The bridge returned HTTP 200 with zero enabled gateways and the woocommerce-no-enabled-gateways informational finding. The setting was restored to enabled; final verification returned one enabled gateway and no no-enabled-gateways finding. No live site, real payment, customer, or order data was involved.

## 2026-09-22 ? Local WooCommerce regression and safety checks

Final local checks confirmed missing and invalid credentials return HTTP 401. The restored WooCommerce baseline remains one enabled payment gateway and one enabled shipping method. Diagnostic responses were checked for the configured token and private order/customer/payment fields; no credential or order data was exposed. The automated suite completed 40 tests, 625 assertions, with one documented skip. PHPUnit reported a shutdown fatal from WooCommerce Action Scheduler querying the SQLite adapter after the suite; test results were still OK and this matches the known local SQLite compatibility boundary, not a plugin assertion failure.

## 2026-09-22 ? T07.1 SEO manager and shared contract

Implemented the narrowly scoped SEO manager contract. It supplies the standard response envelope, a versioned seo_post_analysis contract, stable post identity and observation slots for title, slug, excerpt, word count, metadata, indexability, headings, images, and links. No post content is read or exposed yet, and no SEO route or analyzer was added. Empty analysis returns 
ot_applicable with no findings; informational findings leave the check ok, preserving the WooCommerce severity rule. Focused verification passed with 2 tests and 11 assertions; the full suite passed with 42 tests and 636 assertions and one skip. The temporary SQLite test runtime still reports the known WooCommerce Action Scheduler shutdown fatal after assertions complete. T07.2 remains unverified and is next.

## 2026-09-22 ? T07.2 bounded public post analysis

Implemented class-post-analysis.php using the shared SEO contract. A public post/page produces bounded observations for title, slug, excerpt, content size, word count, metadata availability, and public status. Raw post content is never returned. Missing, private, password-protected, unpublished, and unsupported records return a clean 
ot_applicable result without exposing their title or content. Focused verification passed with 4 tests and 23 assertions; the complete suite passed with 44 tests and 648 assertions and one skip. The temporary SQLite runtime still reports the known WooCommerce Action Scheduler shutdown fatal after tests. Title threshold checks and SEO routes remain unimplemented.

## 2026-09-22 ? T07.3 configurable title observations

Extended the public post analyzer with bounded configurable title checks for missing/empty, short, long, duplicate, and title/slug relationship observations. Thresholds are validated and clamped; evidence avoids returning raw title content. The title/slug relationship is explicitly an informational observation and does not raise overall status. Focused verification passed with 6 tests and 28 assertions. The known SQLite/WooCommerce Action Scheduler shutdown fatal remains after assertions. Metadata readers, meta-description checks, and SEO routes remain unimplemented.

## 2026-09-22 ? T07.4/T07.5 supported metadata and descriptions

Added read-only metadata readers for documented Yoast, Rank Math, and AIOSEO post-meta keys. The analyzer does not overwrite metadata and returns only source, presence, and length observations. Added configurable meta-description checks for missing, short, long, and duplicate descriptions. Focused verification passed with 8 tests and 35 assertions. The temporary SQLite runtime still reports the known WooCommerce Action Scheduler shutdown fatal after assertions. Indexability analysis and an authenticated SEO REST endpoint remain unimplemented.

## 2026-09-22 ? T07.6 indexability observations

Added indexability analysis for public posts/pages. It reports status, public/password visibility, supported robots noindex signals, canonical metadata when available, and explicitly marks sitemap inclusion as undeterminable unless a later documented source supports it. A noindex signal produces a medium factual finding; the analyzer does not claim search-engine indexing. Focused verification passed with 9 tests and 39 assertions. The SQLite/WooCommerce shutdown fatal remains after assertions. The authenticated SEO post route is still pending.

## 2026-09-22 ? T07.7 authenticated SEO post endpoint

Added GET /ai-diagnostic/v1/seo/post/{id} with the existing bearer authentication and activity logging path. The route returns the stable SEO post-analysis contract for an explicitly requested public post/page and does not expose private content. Unauthenticated access returned 401 in tests; authenticated access returned the contract without the token. Focused verification passed with 18 tests and 422 assertions. The temporary SQLite/WooCommerce shutdown fatal remains after assertions. Live Anbe verification is not yet applicable because the route has not been deployed there.

## 2026-09-22 ? Initial heading, image-alt, and link observations

Extended the authenticated SEO post analysis with bounded HTML parsing. Heading observations cover H1 count, missing/multiple H1s, empty headings, hierarchy jumps, and long headings. Content images report counts and missing/long alt text without generating or changing alt values. Links are classified as internal/external and checked for missing hrefs, malformed schemes, and duplicates; no site-wide crawl or link verification runs. Focused verification passed with 19 tests and 428 assertions. Attachment IDs, featured-image state, optional link verification, and paginated image/link collections remain incomplete.

## 2026-09-22 ? Local SEO route smoke verification

The running local site initially returned est_no_route because it was serving the separate installed plugin copy before the new route files were synchronized. After syncing the repository plugin files and restarting the local PHP server, authenticated GET /index.php?rest_route=/ai-diagnostic/v1/seo/post/12 returned HTTP 200 with the shared seo_post_analysis contract and bounded heading, image, and link observations. No live site was changed.

## 2026-09-23 ? T08.2 image attachment and featured-image observations

Completed bounded image observations for the SEO post route. Content images report attachment IDs when resolvable, sanitized filenames, public URLs, alt presence/length, and featured state; configured featured images are included as observations. Missing or long alt text creates findings, and no alt value is generated or changed. Focused verification passed with 9 tests and 38 assertions. Paginated image collections and optional link verification remain unimplemented.

## 2026-09-23 ? T08.3 paginated image issues

Implemented the authenticated paginated /images/issues endpoint. It scans only published posts/pages in bounded pages, returns image issue items and {page, per_page, total, pages}, and never generates or applies alt text. Local smoke verification returned HTTP 200 for page 1/per_page 5 with six public records across two pages. Focused verification passed with 11 tests and 388 assertions. Link issue pagination remains next.

## 2026-09-23 ? T08.5 paginated link issues

Implemented the authenticated paginated /links/issues endpoint. It scans bounded published post/page batches and reports link counts and factual missing-href, malformed-scheme, and duplicate findings. It never launches a site-wide crawl or verifies arbitrary external URLs. Local smoke verification returned HTTP 200 with six public records across two pages. Focused verification passed with 13 tests and 393 assertions. Optional bounded internal link verification remains a documented limit.

## 2026-09-23 ? T09.1-T09.3 SEO collections and site aggregation

Implemented authenticated paginated /seo/posts, /seo/issues, and /seo/site. Post and issue collections are bounded to published posts/pages and expose stable items, pagination, and issue counts; site output reports public visibility without claiming sitemap or Google indexing where not determinable. Focused verification passed with 15 tests and 398 assertions. Empty-page/duplicate-aggregation edge coverage and Anbe deployment smoke testing remain next.

## 2026-09-23 ? T09.4 SEO collection edge coverage

Completed collection edge tests covering invalid bounds, empty pages, stable pagination, issue aggregation, and sensitive-data exclusion. Focused verification passed with 17 tests and 406 assertions. The temporary SQLite/WooCommerce Action Scheduler shutdown fatal remains after assertions. The SEO routes are ready for deployment smoke testing; admin/security quality work and optional link verification remain.

## 2026-09-23 ? Anbe Nigeria SEO deployment smoke test

After Brian updated the live plugin from commit eee2a2d, authenticated read-only smoke tests passed. The site exposed no public posts, so /seo/post/{id} was tested against public page 976 and returned HTTP 200, the seo_post_analysis contract, and bounded observations for title, slug, excerpt, content, word count, metadata, indexability, headings, images, and links. /images/issues?page=1&per_page=5, /links/issues?page=1&per_page=5, /seo/posts?page=1&per_page=5, /seo/issues?page=1&per_page=5, and /seo/site all returned HTTP 200 with success true. Collection pagination reported 11 published post/page records across 3 pages. No credentials, customer/order/payment data, or live settings were changed.

## 2026-09-23 ? Featured-image gap found and fixed

The new Anbe post was analyzed successfully (post 969), but the first live result showed zero images without an explicit missing-featured-image finding. Added a bounded seo-image-missing-featured low finding and a eatured_image observation with presence/attachment ID. Focused local post-analysis tests passed with 9 tests and 39 assertions. The live fix still requires deployment before rechecking Anbe.

## 2026-09-23 ? Anbe featured-image finding verified

After Brian updated Anbe to commit 3fed6a0, a read-only SEO analysis of post 969 returned HTTP 200 and reported seo-image-missing-featured with eatured_present: false. The same response also reported the existing title-long, meta-description-missing, and heading-missing-H1 findings. The post contained zero content images and zero missing-alt images. No post content or private data was retrieved for evidence.

## 2026-09-23 ? Anbe featured-image repair verified

Brian assigned a featured image to post 969. Read-only recheck returned HTTP 200 with eatured_present: true, attachment ID 816, one image, and zero missing-alt images. The seo-image-missing-featured finding cleared; title-long, meta-description-missing, and heading-missing-H1 findings remained. No bridge-side live changes were made.

## 2026-09-23 ? Anbe featured-image alt detection verified

After updating Anbe to commit 72631bc, post 969 returned HTTP 200 with seo-image-missing-alt. The post has one featured image (attachment 816), eatured_present: true, eatured_alt_present: false, and missing_alt: 1. The previous missing-featured finding remains cleared. No live content was changed by the bridge.

## 2026-09-23 ? Anbe post repair and aggregate findings verified

After Brian updated post 969, the authenticated single-post route returned HTTP 200 with only seo-title-slug-mismatch (info) and seo-meta-description-missing (medium). Featured image remained present and missing-alt count was zero. The aggregated /seo/issues?page=1&per_page=50 route returned HTTP 200 with 12 published records on one page and stable issue counts: heading hierarchy jumps 4, missing H1 6, multiple H1 1, missing alt 4, missing featured image 7, duplicate links 2, missing href 1, missing meta descriptions 12, short titles 8, and title/slug mismatches 2. No post content or private data was included in evidence.

## 2026-09-23 ? Aggregate alt count clarified

A follow-up check confirmed post 969's featured image attachment 816 has lt_present: true and lt_length: 10; its missing-alt count is zero. The aggregate count of four missing-alt findings belongs to other published records, not post 969.

## 2026-09-23 ? Anbe meta-description repair verified

Brian added a Yoast meta description to post 969. The missing-description finding cleared; the analyzer detected the description with source yoast and length 204, producing the expected low-severity seo-meta-description-long finding. The informational title/slug mismatch remains. No bridge-side live changes were made.

## 2026-09-23 ? Anbe shortened meta description verified

Brian shortened the Yoast meta description on post 969. The authenticated read-only recheck returned HTTP 200 and status ok; the meta-description finding cleared and only the informational title/slug mismatch remains. This confirms the analyzer distinguishes a repaired description from the remaining non-blocking title/slug observation. No bridge-side live changes were made.

## 2026-09-23 - Anbe site-wide issue scan refreshed

Authenticated read-only /seo/issues returned HTTP 200 with 12 published records. Current counts: missing meta descriptions 11, short titles 8, missing featured images 7, missing H1 headings 6, missing image alt text 4, heading hierarchy jumps 4, duplicate links 2, title/slug mismatches 2, multiple H1 headings 1, and missing link hrefs 1. Post 976 is the next repair target because it has only a missing meta description and missing featured image.

## 2026-09-23 - SEO collection labels improved

Updated /seo/posts and /seo/issues collection items to include the sanitized record title and post_type beside post_id. This makes issue lists actionable from the dashboard while keeping content bodies and private data excluded. Focused collection tests passed: 4 tests and 16 assertions; the known SQLite/WooCommerce shutdown fatal remains after assertions.

## 2026-09-23 - Anbe collection labels verified

After deployment, authenticated /seo/issues?page=1&per_page=3 returned HTTP 200 with success true and title/type labels: My account (Page 976), Cart (Page 974), and Checkout (Page 975). Finding counts remain available beside each label. No live content or settings were changed.

## 2026-09-23 - Anbe Home meta description verified

Brian added a homepage meta description to Home (page 18). The authenticated read-only check returned HTTP 200 with the Yoast description available at length 110; seo-meta-description-missing cleared. Remaining findings are short title, multiple H1 headings, heading hierarchy jump, duplicate link, and missing image alt text. No bridge-side live changes were made.

## 2026-09-23 - Anbe Home logo alt text verified

Brian added alt text to Home's featured logo image (attachment 722). The authenticated read-only check returned HTTP 200 with alt present and length 17; missing-alt count is now zero and seo-image-missing-alt cleared. Remaining Home findings are short title, multiple H1 headings, heading hierarchy jump, and duplicate link. No bridge-side live changes were made.

## 2026-09-23 - Complete Anbe SEO scan refreshed

The authenticated read-only scan covered all 12 published records: 1 post and 11 pages. Current aggregate counts are missing meta descriptions 10, short titles 8, missing featured images 6, missing H1 headings 6, missing image alt text 4, heading hierarchy jumps 4, duplicate links 2, title/slug mismatches 2, multiple H1 headings 1, and missing link hrefs 1. The complete title/type queue was captured for prioritization; WooCommerce utility pages remain lower priority than Home, About Us, Services, Projects, Contact Us, and the blog post.

## 2026-09-23 - About Us meta description proof verified

Brian added the proposed meta description to About Us (page 10). The authenticated read-only check returned HTTP 200 with the Yoast description available at length 109; seo-meta-description-missing cleared. Only seo-title-short and seo-heading-missing-h1 remain on this proof page. No bridge-side live changes were made.

## 2026-09-23 - About Us heading recheck clarified

The follow-up read-only check found one H1 on About Us, so seo-heading-missing-h1 has cleared. The only remaining finding is seo-title-short; the current title length is 8 characters (About Us). The page remains warning solely because of that title observation.

## 2026-09-23 - About Us proof completed

Brian changed the About Us title to About ANBE Nigeria | Our Mission. The authenticated check returned HTTP 200 with status ok; title length is 32, one H1 is present, and the meta description remains length 109. Only the informational seo-title-slug-mismatch remains, so no actionable warning is present.

## 2026-09-23 - Anbe Services meta description verified

Brian added the proposed meta description to Services (page 13). The authenticated check returned HTTP 200 with the Yoast description available at length 118; seo-meta-description-missing cleared. Remaining findings are short title, informational title/slug mismatch, missing H1, heading hierarchy jump, and one missing image alt text.

## 2026-09-23 - Diagnostic coverage accepted; remaining issues preserved

The representative live checks have confirmed that the bridge detects and reports repaired and unrepaired SEO conditions across a blog post, content pages, and WooCommerce utility pages. We will not manually repair every Anbe page. Remaining findings are intentionally preserved as realistic input for the AI explanation and support-recommendation layer.

## 2026-09-23 - Dashboard and AI phase selected

The next agenda is a separate read-only React dashboard on Cloudflare Pages, connected through a Cloudflare Worker that keeps the WordPress token server-side. The dashboard will show titled findings first; the AI explanation layer will be added after the deterministic response display works. The WordPress plugin remains the evidence layer and will not modify content or call an AI provider.

## 2026-09-23 - React dashboard adapted from shadcn-admin

Created the standalone dashboard/ React application using the referenced shadcn-admin starter as its UI foundation. Removed the starter's users, tasks, apps, chats, Clerk, and demo navigation areas. The retained dashboard has the diagnostic overview, findings/detail presentation, responsive sidebar, and single-site connection form with a write-only token field. It currently uses representative mock data and remains read-only; the Cloudflare Worker integration is next. The local dependency environment generated the dashboard build output, but the full TypeScript/Vite command needs a clean dependency install before release validation.

## 2026-09-24 ? Worker deployment and secure connection workflow

**Baseline:** mock dashboard findings/counts, simulated connection success, no deployed Worker, and missing frontend dependencies.

**Implementation:** deployed a same-origin React/Worker app with separate dashboard sign-in, encrypted single-site D1 credentials, real health verification before saving, authenticated read-only proxying, endpoint/site allowlists, bounded pagination/JSON reads, timeout, rate limits, and safe errors/logging. Failed credential replacement leaves the saved connection intact. Token inputs clear after save attempts; saved credentials are never returned. WordPress plugin code/content/settings were unchanged.

**Verification:** Worker type-check and 32 automated security/proxy/storage tests passed. Full dashboard TypeScript/Vite build and Wrangler dry run passed. Deployment: https://ai-diagnostic-bridge.onochieazukaeme.workers.dev. Deployed HTTP checks passed for login/logout, unauthenticated 401, unconfigured 409, invalid query 400, unknown route 404, diagnostic mutation 405, cross-origin 403, security headers, and credential exclusion. Headless Edge passed login/logout, empty connection state, unapproved-site rejection, cleared token input, 390px layout without horizontal overflow, same-origin traffic, and known-credential exclusion. These are deployment/security results, not live Anbe diagnostic results.

**AI assumption corrected:** prior records described an Anbe credential in root `.env`, but the actual file currently points to `http://127.0.0.1`. The proxy rejected its URL with `invalid_site`; no local token was sent to Anbe or saved. The user was asked to enter the live Anbe credential in Site connection. All seven live routes and About's acceptance case remain pending through the Worker.

**Customer explanation:** ?Your dashboard is deployed and protected by a separate sign-in. It verifies and encrypts your site's credential before loading diagnostic evidence. The existing local configuration belongs to the development site, so we still need to connect the live site.?

**Limitations:** AI explanations, human verification capture, and remaining release hardening are outstanding. Sessions last eight hours; rotating the session secret invalidates them. Rate limits are per Cloudflare location. Removing a dashboard connection does not revoke the token in WordPress. Brian's independent reproduction/explanation, investigation/repair duration, and troubleshooting time savings were not measured or recorded in this session. Legacy mixed-encoding bytes in this journal were normalized to UTF-8 without removing entries.

## 2026-09-24 ? Live Worker acceptance and plugin version evidence

**Worker outcome:** Anbe is connected in encrypted D1. All seven read-only proxy routes passed. The scan returned 12 records; About page 10 was `ok` with only informational slug mismatch. Browser checks passed sign-in, scan/detail, keyboard dismissal, saved connection health, mobile layout, and logout. This supersedes the earlier connection blocker. AI explanations remain outstanding.

**New request:** identify available plugin updates from core data and actual installed-version matches to published security advisories, without guessing general update bugs.

**Observed local update result:** WooCommerce 11.1.1 -> 11.1.2 is present in the real local `update_plugins` transient and produces `plugin-update-available`, low severity, patch jump, installed/available versions and core check time. No plugin was upgraded for this check. Major numeric jumps use medium severity as a compatibility-review signal, not proof of breakage.

**Vulnerability status:** implemented with the independent keyless WPVulnerability feed. The matcher validates explicit affected-version ranges, advisory links, and provider ratings, including CVE-2020-35489 boundaries. Actual installed affected/clean verification passed for Contact Form 7 5.3.1 and WooCommerce 11.1.1. Missing/malformed advisory evidence cannot produce a vulnerability claim or a clean result. No general bug heuristic was added.

**Validation and correction:** full PHP suite passed, 72 tests / 757 assertions / one WooCommerce-absent case skipped, exit 0. PHPUnit runtime 20.990 seconds. The old shutdown failure was caused by test cleanup closing SQLite before WordPress/WooCommerce shutdown callbacks. Queuing cleanup after those callbacks resolved it in this full run. The separate SQLite stock-reservation limitation remains.

**Customer explanation:** ?The diagnostic now reports updates WordPress already knows about and shows the exact versions. Security-advisory matching is still being connected to a data provider; it is not yet running on the endpoint.? Investigation duration, time saved, and Brian's independent reproduction were not measured or recorded.

## 2026-09-24 ? WPVulnerability checks connected and verified

The user selected the independent, keyless WPVulnerability API to preserve the project's no-credential constraint. The plugins check now queries its public HTTPS feed for each installed plugin, validates structured operators and advisory links, reports provider severity, and caps lookups at ten slugs per request. Successful results are cached per slug for four hours in WordPress transients; checked-at and cache-age metadata are exposed. Feed failures are marked unavailable/unknown and are never cached, so they cannot produce either a vulnerability claim or a clean result. No API token or general update-bug heuristic was added.

The local installed-plugin verification temporarily added Contact Form 7 5.3.1 and found CVE-2020-35489 as critical, with the CVE advisory link and affected range `< 5.3.2`. It also queried installed WooCommerce 11.1.1 and returned `no_matching_advisory`. The historical vulnerable plugin and download artifacts were removed after the check. This is an actual local WordPress feed and installed-version result, not a fixture-only claim.

The full PHP suite passed 74 tests and 774 assertions, with one WooCommerce-absent case skipped because WooCommerce is loaded. Investigation duration and time saved were not measured.

## 2026-09-25 ? Short-lived vulnerability cache measured

The first no-cache design could wait up to 8 seconds per live lookup, or 80 seconds at the ten-slug request budget. Added a four-hour WordPress transient per slug. Only complete successful feed results, including clean no-advisory results and advisory results, are stored. Timeouts, HTTP failures, malformed feeds, and incomplete advisory data are not stored. Warm results include `checked_at`, `cache_age_seconds`, and `served_from_cache` in plugin metadata and vulnerability evidence.

Measured against three real WPVulnerability slugs (`woocommerce`, `contact-form-7`, `akismet`) in the disposable local WordPress environment: cold uncached lookup took 4,973.8 ms; after resetting only the in-process cache, the warm transient-backed lookup took 0.6 ms and made no live calls. The automated cache test also confirmed an expired slug calls the feed again while a failed slug is retried rather than treated as clean. Full regression: 74 tests / 774 assertions / one skipped case.

**Local installed HTTP follow-up:** after syncing the changed plugin files and restarting the stopped development server, authenticated `/?rest_route=/ai-diagnostic/v1/plugins` returned the expected WooCommerce 11.1.1 -> 11.1.2 low/patch finding. The built-in server's pretty REST path returned HTML; explicit WordPress REST query routing worked. This confirms actual installed endpoint behavior, separate from fixture tests. No live WordPress plugin changes were deployed.

## 2026-09-25 - Live Anbe plugin diagnostics verification

The plugin changes were pushed in commit `b479d6f` and Hostinger refreshed the Anbe repository. The live response proves the installed copy is updated: it reports the new core update metadata, WPVulnerability evidence, four-hour cache fields, and the expected installed plugin inventory. A temporary read-only Worker proxy route was used for verification; it exposes no plugin-management or write operation.

**Live Anbe verification - cold:** the first post-deployment plugins request took **1,761.7 ms**. It returned 14 plugins, 9 `plugin-update-available` findings, and 6 `plugin-known-vulnerability` findings. The vulnerability evidence was fresh (`served_from_cache: false`, `cache_age_seconds: 0`, with `checked_at` at the request time). The first capture was made before the proxy's display sanitization fix, but the advisory IDs, versions, and matches were already present; the corrected repeat preserves the full CVE links and affected ranges.

**Live Anbe verification - warm:** a subsequent cache-backed request took **865.3 ms**. All six vulnerability findings reported `served_from_cache: true`, `checked_at: 2026-09-25T04:54:05+00:00`, and cache age about 335-336 seconds. That is 896.4 ms faster than the first cold request (about 51% lower latency). A later paired run measured 1,435.4 ms followed by 865.3 ms; both requests were already warm, so it is not labeled as a second cold measurement.

The real advisory matches are LiteSpeed Cache 7.6.2 (CVE-2026-3375 high, CVE-2026-3129 medium, CVE-2026-18978 high, CVE-2026-84761 high, and CVE-2026-76579 medium; affected ranges end below 7.8, 7.9, or 7.9.1) and Site Mailer 1.2.3 (CVE-2025-1319, medium, affected range below 1.2.4). Evidence includes the exact CVE advisory links and provider scores. These findings are flagged for deliberate human review; no plugin was updated or otherwise acted on.

The nine live update findings were Hostinger Easy Onboarding 2.1.17 -> 3.0.1 (major/medium), Hostinger 3.0.65 -> 3.0.78 (patch/low), LiteSpeed Cache 7.6.2 -> 7.9.1 (minor/low), The Preloader 1.0.9 -> 2.0.2 (major/medium), Site Mailer 1.2.3 -> 1.4.7 (minor/low), WooCommerce 11.1.1 -> 11.1.2 (patch/low), WP Mail SMTP 4.3.0 -> 4.9.0 (minor/low), WP Staging 4.15.0 -> 4.15.1 (patch/low), and Yoast SEO 24.2 -> 28.5 (major/medium).

**Regression check:** inventory remains 14 plugins and the overall warning is explained by the newly evidenced update/security findings. The WooCommerce response remains consistent: version/database 11.1.1, USD, 3 configured gateways with 1 enabled, shipping enabled with zero zones and methods, HPOS enabled, 83 failed scheduled actions, and zero overdue actions. No WooCommerce source, inventory fields, or prior severity aggregation behavior changed.

## 2026-09-25 - T07.8, T08.6, and T10.4 testing gaps closed

Added tests for the remaining SEO post, content-structure, collection-boundary, and admin-settings cases. T07.8 now covers missing/empty/short/long/duplicate titles, title/slug relationships, missing/empty/short/long/duplicate meta descriptions, private and password-protected posts, canonical/noindex observations, and the assertion that post body content and protected titles never appear in findings. T08.6 now covers malformed/unclosed HTML, empty headings, multiple/missing H1s, hierarchy jumps, missing image alt text, duplicate links, empty and maximum-size image/link collections, and the current no-crawl safety boundary. T10.4 now covers invalid nonces for generate/revoke, non-admin access, one-time token display, and escaped status/timestamp output.

The complete local WordPress suite now passes **81 tests and 804 assertions**, with one expected WooCommerce-absent skip. No real implementation bug was found. The one initial test error came from the test not loading WordPress's admin template helper; the test was corrected without changing production code. T08.4's optional bounded internal-link verifier remains intentionally unimplemented, so there is no verifier timeout path to test; the new safety test confirms ordinary link analysis performs zero internal HTTP calls.

PLAN.md T06.5 was updated to distinguish fixture coverage of automated WooCommerce present behavior from the separately recorded manual Anbe break/repair exercises.

## 2026-09-25 - Phase 11 quality gates through documentation

**T11.1:** `php -l` passed for 40 plugin/project PHP files, excluding disposable WordPress and tool trees; no syntax errors.

**T11.2:** Full local WordPress suite passed: 81 tests, 804 assertions, one expected WooCommerce-absent skip, exit 0. Runtime was PHP 8.3.33 with PHPUnit 10.5.64.

**T11.3:** PHPCS/WordPress Coding Standards and PHPStan were not available or configured in the workspace. No style-only or behavior-changing violations were silently fixed; this is an environment limitation, not a claimed static-analysis pass.

**T11.4:** Read-only live Anbe verification completed for unauthenticated REST access. `/health`, `/diagnostic`, `/seo/site`, `/plugins`, `/images/issues`, and `/links/issues` each returned HTTP 401 JSON. Local activation/deactivation/re-activation passed on the disposable WordPress environment with no PHP notices or warnings and no orphaned or mutated plugin settings. No live plugin state was changed.

**T11.5:** Reviewed `includes/class-rest-api.php`, authentication, diagnostic dispatch, and every registered core/SEO route. All routes use the shared Bearer permission callback; IDs, pagination, and diagnostic lists are bounded and allowlisted; post privacy, raw body, log, action-argument, credential, and upstream-error redaction were checked; no input selects arbitrary PHP execution, filesystem, SQL, shell, hooks, or classes.

**T11.6:** Rewrote README.md and readme.txt with installation, endpoint examples, authentication/hashing/rate limiting, deterministic-only AI boundary, troubleshooting, tests, and known limitations. The release target was deliberately resolved to plugin version 0.1.6.

## 2026-09-26 - Phase 11 release 0.1.6 completed

The version decision is resolved: the plugin release target is **0.1.6**, updated consistently in the plugin header, README.md, readme.txt, and PLAN.md.

Local lifecycle validation used the disposable WordPress environment. Activation created the expected minimal `aidb_settings` option with no PHP notices or warnings. Deactivation did not create orphaned options or mutate the plugin settings contract. Re-activation completed cleanly and preserved the existing settings. The focused lifecycle test passed with 1 test and 7 assertions.

The full suite after the lifecycle test passed with **82 tests, 811 assertions, and one expected WooCommerce-absent skip**. A repository review found no tracked credentials or generated test data; local WordPress/tool paths are ignored. This closes the remaining Phase 11 work and permits release tag `0.1.6`.
## 2026-09-26 — AI explanation and human verification case (T12.4/T12.5)

**Symptom:** A deterministic SEO finding needed a human-reviewed explanation before it could be copied into support communication.

**AI output:** On explicit request, the Worker sent only the bounded finding snapshot and returned five structured fields. The first Anbe finding (missing meta description) was accepted as-is. The second (missing featured image) was corrected by the reviewer to keep the summary explicitly tied to displayed evidence.

**Correction:** The database retains the complete original AI output, current corrected fields, final status, reviewer note, reviewer identity (`dashboard-user`), and review timestamp. Retrieval after both actions confirmed the original and corrected versions remained available.

**Validation:** Draft explanations are visibly amber/dashed and labeled unverified. The copyable support reply is unavailable until verification or correction. No credentials, customer/order/payment data, or full post body was sent to AI, and no WordPress write path exists.

**Timestamp:** 2026-09-26 (live Anbe acceptance). Local Worker suite: 37 tests passed; dashboard production build passed.

## 2026-09-26 — Core/plugin update review documented

**Need:** SEO findings are now working, but support also needs to know when WordPress or an installed plugin needs review and what an update may change.

**Implementation:** The dashboard's Updates and release review panel now reads the WordPress plugin update transient through the existing diagnostic route, shows installed/available versions and the version-jump class, links to the official plugin changelog, and highlights real installed-version vulnerability findings. A new `core-updates` diagnostic reads WordPress core update data and reports installed/available versions, release type, jump severity, and official release notes.

**Site-specific interpretation:** Each plugin update has an explicit `Explain this update for my site` action. It sends only the bounded update evidence to the existing AI explanation workflow and remains an unverified draft until a reviewer accepts or corrects it. Version numbers alone do not claim that an update has bugs or will break the site.

**Safety:** No automatic updates were added. Security advisories and official compatibility/deprecation statements remain evidence-gated; general bug prediction is intentionally excluded.

**Validation:** Worker type-check and dashboard production build passed. Source commit: `8d32f70`.

## 2026-09-26 — Clarified installed/update status and changelog meaning

The first update panel made available updates visible but did not clearly show the full installed inventory. The dashboard now lists every installed plugin with its active/inactive state and explicit `Up to date`, `Update available`, or `Known vulnerability` badges.

The site-specific AI explanation action now reads the official WordPress.org changelog before generating its draft. The AI receives the bounded changelog text plus the installed and available versions and explains what the documented changes may mean for this site's evidence. It does not infer bugs from a version number, perform updates, or present an unverified interpretation as fact.

## 2026-09-26 — Overview layout and site-specific update meaning

The dashboard no longer makes the user infer plugin state from a short update list. The first signed-in view now presents counts and a complete installed-plugin table with clear status badges, followed by the core/plugin review area.

For each available plugin update, the official changelog is combined with bounded Anbe context (site facts, active plugin versions, and deterministic findings). The AI explanation is now expected to state what the changelog documents, why it may matter to Anbe, what is only a possibility, and how to verify the result after updating. No credentials or post/customer/order/payment content is included, and no update is automatic.

## 2026-09-26 — Fixed missing plugin AI action and local dashboard startup

The plugin AI action was previously rendered only for update rows. That made it disappear when WordPress reported no available update. The dashboard now includes an explicit `Explain` action for installed plugins that are up to date or otherwise have no pending update, while update rows retain the full changelog explanation action.

The local Worker error was configuration-related: Wrangler had no `.dev.vars`. An ignored local file now supplies the existing development secrets without adding credentials to Git. Local mode still needs the site connection configured in its own D1 environment; the deployed dashboard remains the live Anbe path.
