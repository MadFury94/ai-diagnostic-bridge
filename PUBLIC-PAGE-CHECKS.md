# Bounded public-page diagnostics

Status: implemented on 2026-10-13. Anbe deployed and live scan accepted on 2026-10-14 (Worker 9bd92087-4ebd-492f-8970-be09dc0ee290). Katalyst and Missus remain local implementations awaiting deployment/live acceptance. This is an additive Worker/dashboard feature. The WordPress plugin remains at 0.1.7 and needs no update for these checks.

## What this release checks

Manual and hourly scans can request selected public pages, parse their initial HTML, and request same-origin anchor destinations and `img src` URLs. Findings report HTTP 404/410, HTTP 5xx, and proven redirect cycles. A successful request is an HTTP observation, not proof of correct rendering, image decoding, accessibility, checkout, or business behavior.

Each finding includes a stable ID derived from resource kind, URL and issue type, severity, affected URL, referring page, observed status where available, and `source: public_http`. URLs containing queries are excluded rather than having their queries stripped. Raw HTML, response headers, cookies, credentials and exception text are not returned in evidence. Multiple references to the same resource kind/URL are checked once; the first referring page is retained.

The three deployments have identical `src/public-scan.ts` implementations to preserve the current isolated-client layout. `scan.ts` merges the resulting finding summaries into the existing trusted server-side alert flow and returns a separate `publicScan` envelope. All dashboards show a Public page checks summary, checked URLs/outcomes, findings, detail evidence and click-only reviewed AI explanations. Public evidence is not fetched through a synthetic WordPress post ID.

## Configuration

Server-owned Worker variables select the scope; browser requests cannot submit URLs:

```toml
PUBLIC_SCAN_PATHS = '["/"]'
# Optional: use the actual public site rather than the WordPress origin.
PUBLIC_SITE_ORIGIN = "https://www.example.com"
```

`PUBLIC_SCAN_PATHS` is a JSON array of one to three absolute paths on that origin, for example `["/", "/about/", "/shop/"]`. Choose existing public read-only pages; the example paths are not automatically configured. Unset or empty means disabled. Malformed or unsafe configuration produces an incomplete result with no requests. `PUBLIC_SITE_ORIGIN` defaults to the deployment's `ALLOWED_SITE_ORIGIN`.

Local deployment configs start with `/`:

| Deployment | Public origin |
| --- | --- |
| Anbe | `https://anbenigeria.com` |
| Katalyst | `https://wp.katalyst.tech` (configured WordPress origin; no separate frontend origin has been assumed) |
| Missus | `https://www.missusoutfits.com` (existing canonical Next.js origin) |

If a homepage redirects to a different canonical hostname, explicitly configure that verified public origin. Cross-origin redirects are never followed automatically. For a large homepage, select smaller representative pages if the limits prevent completion. Do not increase bounds merely to make an incomplete result look clean.

## Bounds and exclusions

- At most three source pages, 40 distinct discovered resource kind/URL pairs, and 48 total HTTP requests including redirects per public scan.
- At most three redirects per target, four seconds per request including HTML body reads, and a 20-second scan deadline. These limits apply to this module; existing WordPress diagnostics have their own bounds.
- At most 256 KiB per source HTML response, enforced while streaming before parsing. Only source pages are parsed; linked destinations are not crawled recursively.
- HTTPS on the exact configured origin, with no embedded credentials, query strings, local/IP origins, or encoded path separators. Known admin, API, account, cart, checkout, login/logout and order-action paths are excluded.
- No authentication, diagnostic token, cookie, or form submission is used. Normal GET requests can still appear in site access logs.
- Only `a[href]` and `img[src]` in initial HTML are inspected. External/CDN resources, query-based image optimizers, `srcset`, lazy-loaded `data-src`, CSS backgrounds, scripts/styles, and client-rendered content are outside this first release. Unsupported/ambiguous URL entities are skipped rather than guessed.
- The native HTML parser ignores apparent tags in comments/scripts. Common named and numeric URL entities are decoded explicitly, and the document's first base URL is respected.

HTTP 401/403/429, other unverifiable statuses, failed requests, timeouts, blocked redirects, non-HTML source pages and exceeded limits are unknown/incomplete, not evidence of a healthy site. A redirect chain exceeding the limit is not called a loop unless a URL repeats. A failed source page can yield a finding but is incomplete because its previously linked resources cannot be rechecked.

## Alert behavior

Public findings join the existing baseline only after the complete combined scan succeeds. A first completed scan is silent; new qualifying IDs on subsequent complete scans can email, persistent IDs do not repeat, and confirmed clearing/reappearance can email again. Page failures and HTTP 5xx are high severity; broken link/image 404/410 and link/image redirect cycles are medium. The default high threshold therefore excludes most missing-link/image alerts unless the user selects medium.

An incomplete public scan prevents the entire combined scan from advancing the existing alert baseline or sending new scan notifications. Partial findings remain visible in the dashboard. This conservative behavior can delay other notifications on pages that consistently exceed the limits; review coverage and scope before enabling in production. This release does not implement independent per-source alert baselines.

Authenticated email details use a `public/pages/<scope-hash>` route marker to recheck public evidence, rather than sending that marker to WordPress. An absent finding in an incomplete or disabled public scan is not shown as resolved. Notification links also refuse to infer clearing when the configured source-page scope has changed. `GET /api/public-scan` is authenticated and rate-limited, returns current observations, and does not advance the baseline or send email.

## Reproduce the controlled failure/repair exercise

From each Worker directory:

```powershell
npm test -- test/public-scan.test.ts
npm test -- test/alerts.test.ts
npm run check
```

After building all three dashboards, `node worker/scripts/public-pages-ui-smoke.mjs` runs the local production-build UI exercise using synthetic API responses. It checks public finding detail, refresh routing, mobile overflow and incomplete coverage; screenshots stay under ignored `worker/.private/public-pages-ui/`.

The public-scan suite bundles the production module into a local Cloudflare Workers runtime. Its simulated public site has an HTML page referencing `/missing` and `/missing.png`. Both return 404, are changed to 200 for repair, then return 404 again. Assertions verify both findings, clearing, stable IDs on recurrence, and absence of credentials in requests. Other cases exercise redirects, HTML parsing, exclusions, byte/target bounds and timeouts. The alert tests exercise scan completion and authenticated notification detail through the actual Worker handler and a disposable SQLite database.

This is controlled local fixture evidence, not a live WordPress/WooCommerce repair or Brian's independent reproduction. No production page is deliberately broken. See `SUPPORT-JOURNAL.md` for the case and verification record.

## Release and subsequent work

Before deployment, run each Worker suite/type check, build its dashboard, run the client isolation checks, and perform Wrangler dry runs. Deployment is a separate step; these changes require no new D1 migration or new secret. Use the existing client runbooks and preserve each deployment's secrets and bindings. Verify selected public origins, partial-scan behavior and a real read-only scan after deployment before recording live acceptance.

Next phases remain browser rendering/mobile checks, rendered accessibility and test-mode shopping journeys. They require separate bounded execution and test-store evidence; no browser automation or repair capability is added by this release.

Implementation references: [Cloudflare HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) and [Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/). Runtime types and the installed Miniflare compatibility adapter were checked locally.


## Verified local results (2026-10-13)

| Check | Result |
| --- | --- |
| Anbe Worker suite | 85 passed |
| Katalyst Worker suite | 91 passed |
| Missus Worker suite | 94 passed |
| Worker TypeScript and final dashboard builds | All three passed |
| Local desktop/mobile dashboard exercise | All three passed |
| Client isolation checks | Katalyst and Missus passed |
| Final Wrangler deployment dry runs | All three passed; no production deployment |

The 31 focused public-scanner tests passed again per deployment after the last coverage-counter adjustment. The production PHP plugin was unchanged, so no new PHP suite or static-analysis result is claimed.

## Anbe live acceptance - 2026-10-14

The combined scan completed with all 12 WordPress records and 15 public URLs checked (16 requests, three references excluded). No new public HTTP findings were returned. Plugin 0.1.7 is installed and health is ok. Existing high/critical email threshold is unchanged; medium missing-link/image findings need the medium preference to email. User-run error/email verification is pending. See PROGRESS.md for the deployment and baseline evidence.
