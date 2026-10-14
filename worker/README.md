# AI Diagnostic Bridge Worker

Single-account, read-only dashboard backend. The React build and API share one Worker origin. This replaces the initially proposed separate Pages deployment, avoiding cross-origin session/cookie configuration. The WordPress plugin remains separate and unchanged.

## Architecture

Browser → Worker → allowlisted HTTPS WordPress diagnostic routes. D1 stores a single `default` site record with an AES-256-GCM encrypted token. A Cloudflare Worker secret holds the encryption key. Authentication uses a separate random dashboard access key and an eight-hour HMAC-authenticated, Secure, HttpOnly, SameSite=Strict cookie. No credentials are stored in browser storage or frontend build variables.

Only `https://anbenigeria.com` is allowed by this deployment. URL credentials, non-HTTPS URLs, paths, queries, fragments, arbitrary destinations, and upstream redirects are rejected. Changing the supported site requires changing `ALLOWED_SITE_ORIGIN` and redeploying; never turn this into an unrestricted proxy.

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/login` | POST | Exchange `{password}` for a dashboard session |
| `/api/session` | GET | Validate the session |
| `/api/logout` | POST | Clear the session cookie |
| `/api/connection` | GET | Return name, URL, configured status, verification timestamp |
| `/api/connection` | PUT | Verify `{name,url,token}` against WordPress health before encrypting and replacing the record |
| `/api/connection` | POST | Test the saved credential |
| `/api/connection` | DELETE | Remove the saved dashboard connection |
| `/api/bridge/health` | GET | Health envelope |
| `/api/bridge/seo/site` | GET | Site indexability envelope |
| `/api/bridge/seo/posts` | GET | Paginated public records and findings |
| `/api/bridge/seo/issues` | GET | Paginated issue collection |
| `/api/bridge/seo/post/{id}` | GET | One public post/page analysis |
| `/api/bridge/images/issues` | GET | Paginated image observations |
| `/api/bridge/links/issues` | GET | Paginated link observations |

All routes except login require a valid session. State-changing requests also require an exact same-origin Origin header and JSON Content-Type. Diagnostic routes reject mutations. Query parameters are limited to `page=1..1000` and `per_page=1..50` on collections. The proxy preserves the plugin envelope and finding fields while retaining only known diagnostic metadata/evidence fields. New plugin fields need an explicit proxy allowlist review.

## Limits and logging

- Upstream request and body-read deadline: 12 seconds.
- Upstream response: at most 1 MiB, counted while streaming.
- Login body: 4 KiB; connection body: 8 KiB.
- Collection/observation arrays: at most 200 entries per array.
- Login and connection changes: 5 attempts per 60 seconds each; authenticated API: 60 requests per 60 seconds.
- Rate-limit counters are per Cloudflare location, eventually consistent, and not a strict global quota. See [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- Structured application logs contain only operation area, HTTP status, and elapsed milliseconds. Invocation request logs are disabled. No request bodies, headers, URLs/queries, credential values, diagnostic data, or raw upstream errors are logged by this code.
- API responses use `Cache-Control: no-store`. The browser calls only its own origin; a CSP blocks other connections.
- Dashboard and scheduled scans read at most 20 pages of 50 records sequentially. Incomplete scans are labelled. Scans are not transactional snapshots or durable scan history.

## Development and validation

```powershell
cd dashboard
npm ci
npm run build
cd ../worker
npm ci
npm run types
npm run check
npm test
npx wrangler deploy --dry-run
```

For local runtime work, copy `.dev.vars.example` to the ignored `.dev.vars` and supply separate development secrets. Generate a 32-byte AES key encoded as base64. Apply the schema with `npx wrangler d1 migrations apply ai-diagnostic-bridge --local`, then `npm run dev` to serve the built dashboard and API. Local credentials are never automatically imported from the production secret file.

## Deployment

The account ID and project-specific D1 ID are in `wrangler.jsonc`. Do not deploy this configuration into another account without replacing them. Build the dashboard first; deployment uploads `dashboard/dist`.

For an initial deployment, `node scripts/prepare-secrets.mjs` creates ignored `.private/secrets.json` and `.private/dashboard-access.txt` without printing their contents. It refuses to overwrite existing credentials. The access text file contains only the dashboard sign-in key, not the WordPress token. Keep these files private and use a password manager for the dashboard key.

```powershell
npx wrangler d1 migrations apply ai-diagnostic-bridge --remote
npx wrangler secret bulk .private/secrets.json
npx wrangler deploy
```

`scripts/smoke.mjs <worker-origin>` authenticates using the ignored secret file. If no site is connected, it reads ignored `.private/anbe.env` if present, otherwise the repository `.env`, and imports the credential only if `WORDPRESS_URL` has exactly the allowlisted Anbe HTTPS origin. Local WordPress credentials are never imported as Anbe credentials. If the site remains unconfigured, the script reports that live checks were skipped and tests the unconfigured response. Once connected, it checks all seven allowed diagnostic routes, failure statuses, cookie flags, and response credential exclusion without printing secret values. It does not modify WordPress.

`scripts/browser-smoke.mjs <worker-origin>` runs headless installed Microsoft Edge via Playwright. It checks sign-in, live scan, About detail, keyboard dismissal, saved connection verification, mobile overflow, sign-out, and browser credential/origin boundaries. Screenshots are saved under ignored `.private/`.

## Finding email alerts (Resend)

For a side-by-side activation guide covering both deployments, see [Email alerts: Anbe and Katalyst](../EMAIL-ALERTS-SETUP.md).

The dashboard calls authenticated `POST /api/scan`, and the Worker also runs the same scan hourly through its Cloudflare Cron Trigger (`0 * * * *`). The Worker reads site SEO, health, plugins, core updates, WooCommerce, and up to 20 pages of 50 public posts/pages. It compares finding IDs only after every required request succeeds and pagination is complete. Unknown/truncated results, missing records, failed requests, and capped scans do not advance the baseline or trigger email. Direct diagnostic reads and browser-submitted findings cannot trigger alerts.

The first successful scan silently establishes a baseline. Subsequent scans email only IDs absent from the previous successful scan, at or above the connection's minimum severity. Default is **high**, including high and critical. A persistent finding never repeats merely because time passes; confirmed clearing followed by reappearance is new. Changing wording, recipient, or threshold does not make an existing ID new. Atomic D1 baseline updates and email claims suppress concurrent duplicates; older overlapping scans cannot overwrite newer baselines.

Each plain-text email contains only the site name with its affected hostname, finding title and severity, detection timestamp in UTC, and an authenticated dashboard detail link. The link carries a random notification ID, never a credential or finding payload. The dashboard retains the link during sign-in and loads current evidence through authenticated `GET /api/finding-alerts/{id}`. If the finding has cleared, it says so. No evidence, diagnostic message, raw finding ID, WordPress URL, or credentials are included in the email. Finding titles and site labels are bounded and redact known secrets/control characters.

Setup in this `worker/` deployment:

1. Create a Resend account and verify a sending domain with the exact DKIM and SPF/return-path DNS records Resend provides. Review or add DMARC without replacing an existing domain policy. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Apply migrations: `npx wrangler d1 migrations apply ai-diagnostic-bridge --remote` (`--local` for development). Migration 0003 has not been deployed as part of this work.
3. Store a sending API key with `npx wrangler secret put RESEND_API_KEY`, and a sender such as `Diagnostics <alerts@your-verified-domain>` with `npx wrangler secret put ALERT_EMAIL_FROM`. Never commit or share the API key.
4. Set `DASHBOARD_ORIGIN` to the canonical HTTPS dashboard origin, with no path/query or credentials, using Wrangler variables or `npx wrangler secret put DASHBOARD_ORIGIN`. Links use this configured origin, never a request-supplied host.
5. Build and deploy. In **Site connection → Finding email alerts**, set the recipient and minimum severity. Defaults: `webdeveloperbrian@gmail.com` and high. Blank recipient disables the connection's alerts. Preferences use authenticated, same-origin `PATCH /api/connection`; credential replacement preserves them.

The integration requires Resend but no SDK dependency: it uses the [Resend API](https://resend.com/docs/api-reference/emails/send-email) documented in [Cloudflare's tutorial](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/). Disabled/unconfigured alerts still establish scan baselines, so enabling email does not send old findings. Local example settings are in `.dev.vars.example`.

D1 stores baseline IDs and notification summaries/routing metadata, never finding evidence in the alert tables. Pending sends retry after a one-minute backoff on later completed scans, using a stable [Resend idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider deduplication lasts 24 hours, so an ambiguous success followed by a database write failure can duplicate after that window. Each request has a five-second timeout; sends stop starting after 20 seconds and remaining notifications await a later scan. Pending notifications for resolved IDs or previous recipients are removed. Delivery is best effort; provider acceptance is not proof of inbox delivery. Deleting a connection cascades to its baseline and notifications. Provider/storage failures do not fail the diagnostic result.

Tests require Node 22.13+ for SQLite and use mocked Resend calls. No live emails are sent. The separate Katalyst deployment now implements the same behavior; see [Katalyst setup](../worker-katalyst/README.md).

## Credential operations and remaining scope

Saving a verified replacement atomically overwrites the current D1 record; failed verification leaves the existing record intact. Removing a connection deletes its current D1 record. Neither action revokes a WordPress-issued token: revoke/regenerate it in WordPress Settings → AI Diagnostic Bridge when needed. Encrypted D1 historical backups may retain older ciphertext according to platform retention.

Sign-out clears the browser cookie. To invalidate all previously issued session cookies immediately, rotate `SESSION_KEY` using `wrangler secret put SESSION_KEY`; also rotate `DASHBOARD_PASSWORD` when replacing access credentials. Rotating `CREDENTIAL_KEY` requires re-encrypting or reconnecting the site; do not replace it blindly.

AI explanation generation, verification/correction capture, multi-user administration, additional sites, durable scan history, and complete release hardening remain separate work. This backend does not expose a general diagnostic executor or write to WordPress.

References: [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Worker best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [static assets](https://developers.cloudflare.com/workers/static-assets/).

### Where to enter the API key

In Cloudflare, open **Workers & Pages**, select **ai-diagnostic-bridge** (Anbe), then **Settings > Variables and Secrets > Add**. Choose **Secret**, name it `RESEND_API_KEY`, and paste the Resend sending API key as its value. Also configure `ALERT_EMAIL_FROM` (the address on your verified sending domain) and `DASHBOARD_ORIGIN` (this Worker's HTTPS dashboard origin). [Cloudflare secret setup](https://developers.cloudflare.com/workers/configuration/secrets/).

The sender domain and affected site domain are separate. One verified sender can notify you about Anbe, Katalyst, and future client sites. Each notification identifies its actual affected hostname, for example `Anbe Nigeria (anbenigeria.com)`; it does not infer the affected site from the From address. The recipient remains per connection.

Katalyst uses a separate Worker, `ai-diagnostic-bridge-katalyst`. Secrets are per Worker, so configure the same three bindings there as well, with the Katalyst dashboard origin. Its alert integration is now implemented; apply its migration and deploy its updated code before expecting emails. See [Katalyst setup](../worker-katalyst/README.md).

## Bounded public-page checks (Anbe deployed 2026-10-14)

See [Public page checks](../PUBLIC-PAGE-CHECKS.md) for the new PUBLIC_SCAN_PATHS setting, public origin selection, bounded page/link/image observations, dashboard integration and incomplete-scan alert behavior. Anbe Worker 9bd92087-4ebd-492f-8970-be09dc0ee290 is deployed; a complete live scan read 12 WordPress records and checked 15 public URLs. The existing high/critical alert threshold remains unchanged. User-run error/email verification is pending. No database migration or plugin update is needed for this addition.

## 2026-10-14 - Independent Anbe availability monitoring

Added a separate Cloudflare cron (*/5 * * * *) that checks the public homepage without WordPress credentials or a successful diagnostic scan. Hourly diagnostic scans remain unchanged. Two consecutive failed checks within 15 minutes open an outage; the next HTTP 2xx closes it and queues recovery. Normal detection is about 5-10 minutes after failure. Timeout is 10 seconds, with at most three same-origin redirects. HTTP errors (including blocked 403/429), unsafe redirects, transport errors and timeouts count as failed checks, not proof that every visitor is offline. A healthy initial check sends no email.

Notifications use the existing recipient and Resend settings, independent of finding severity. Blank recipient disables mail. D1 migration 0004 stores timestamp-guarded state and notification events; duplicate/stale ticks do not advance the failure streak. Delivery uses leases, stable provider idempotency keys and retries on subsequent checks; events expire after 23 hours. The check requests cache revalidation but a CDN may still return cached success. It cannot detect broken page content returning 200, plugin deactivation alone, or an outage of Cloudflare/the monitoring Worker itself. Other clients are unchanged.

Availability cron investigation (2026-10-14): replaced the five-minute step expression with an equivalent explicit minute list after production showed no recorded availability runs. Real scheduled execution and inbox delivery remain unverified; see SUPPORT-JOURNAL.md.
