# Real WooCommerce testing task list

Started: 2026-09-22. Run on the disposable local site only. Complete one stage at a time and record evidence in SUPPORT-JOURNAL.md. Never use real payments or customer data. Do not change Missus or Anbe Nigeria.

## 1. Verify installation and bridge detection

- [x] Confirm WooCommerce is active and record its version.
- [x] Call the authenticated bridge `/woocommerce` endpoint without displaying credentials.
- [x] Check version, currency, configured pages, gateway counts, shipping, scheduled actions, and database/HPOS fields.
- [x] Check response structure and privacy; record findings and any unavailable sections. Configuration warnings may be expected before store setup.

## 2. Establish a working baseline

- [x] Configure a synthetic store and confirm cart, checkout, and shop pages.
- [x] Add one simple physical test product with price and stock.
- [x] Configure one shipping zone and rate.
- [x] Configure an offline test method or provider sandbox; never use live payment credentials.
- [x] Complete a test order and verify the order result.
- [x] Save a safe baseline diagnostic summary and record the configuration for restoration.

## 3. Checkout page break and repair

- [x] Record the page's initial state and begin timing.
- [x] Temporarily unpublish the configured checkout page.
- [x] Reproduce the symptom and inspect the bridge's page finding.
- [x] Restore the original page status.
- [x] Verify the finding clears and checkout works again.
- [x] Record measured time, evidence, customer explanation, and Brian's own understanding.

## 4. Shipping and payment exercises

- [x] Record and temporarily disable the test shipping method.
- [x] Compare checkout behavior with bridge configuration findings; restore and verify.
- [x] Record and temporarily disable the test payment gateway.
- [x] Compare checkout behavior with bridge findings; restore and verify.
- [ ] Document limits: configuration counts do not prove availability for every customer address/cart.

## 5. Safety and regression checks

- [x] Confirm missing/invalid credentials return HTTP 401.
- [x] Check responses/logs exclude customer, order, payment, and credential data.
- [x] Run automated tests with WooCommerce present and document skips/failures precisely.
- [x] Verify exercises left the store in its baseline working state.
- [x] Update PLAN.md, PROGRESS.md, and SUPPORT-JOURNAL.md with results and remaining limits.

## Stage results

Step 1 completed on 2026-09-22: WP-CLI confirms WooCommerce 11.1.1 active. Real authenticated HTTP request returned 200, success true, and check status warning. Plugin/database versions match, no database update is needed, currency is NGN, and HPOS is enabled. Shop 11, cart 12, and checkout 13 are published pages. Three gateways are configured but none enabled; shipping is enabled with zero custom zones and zero enabled methods. One site-wide scheduled action has failed; none are overdue. The failed action's cause has not been investigated, and it must not be assumed to be a checkout failure. Response inspection found configuration facts/counts only; credential value was checked for absence without display. No site settings were changed.

Next: step 2, establish a working synthetic-store baseline. Also investigate the failed scheduled action using safe summaries before considering the baseline healthy. Later break/repair and regression steps have not started.

Failed-action investigation (2026-09-22): `fetch_patterns` handler is present during normal/admin/REST bootstrap but absent with DOING_CRON. This reproduces the condition described in confirmed WooCommerce issue https://github.com/woocommerce/woocommerce/issues/68409 in our 11.1.1 installation. It points to WooCommerce initialization logic, not a demonstrated PHP/SQLite setup fault. No retry or workaround applied; journal contains evidence.

Step 2 completed on 2026-09-22 with a compatibility limitation: product 17 (NGN 2,500, stock 10), Nigeria zone 1, flat rate instance 1 (NGN 500), and local COD were configured. Store API cart/shipping totals were NGN 3,000. The first checkout exposed a SQLite adapter failure in WooCommerce stock reservation (`INTERVAL 60 MINUTE`) and left draft order 19; it did not reduce stock. For this synthetic baseline only, a temporary local MU-plugin filter set the stock hold to zero and suppressed mail. Checkout then created order 20 with status `processing` and payment status `success`; stock reduced from 10 to 9. The temporary MU-plugin was removed. The bridge afterward reported one enabled gateway, one enabled shipping method, and one failed site-wide scheduled action. Stock-reservation locking is not validated on SQLite.

Next: step 3, checkout-page break and repair. Preserve order 20 and draft order 19 as synthetic evidence; do not create another baseline order.

Step 3 completed on 2026-09-22. Local checkout page 13 was changed from published to draft. Guest `/checkout/` showed the ordinary site template, and the bridge reported `woocommerce-checkout-page-invalid` with medium severity. The page was republished; after adding the synthetic product to the cart, checkout rendered and the bridge reported `checkout_published: true` with no checkout-page-invalid finding. This confirms the failure and repair path. Exact elapsed timing was not captured.
