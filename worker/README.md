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
- Dashboard scans read at most 20 pages of 50 records sequentially. Incomplete scans are labelled. Scans are not transactional snapshots or durable scan history.

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

## Credential operations and remaining scope

Saving a verified replacement atomically overwrites the current D1 record; failed verification leaves the existing record intact. Removing a connection deletes its current D1 record. Neither action revokes a WordPress-issued token: revoke/regenerate it in WordPress Settings → AI Diagnostic Bridge when needed. Encrypted D1 historical backups may retain older ciphertext according to platform retention.

Sign-out clears the browser cookie. To invalidate all previously issued session cookies immediately, rotate `SESSION_KEY` using `wrangler secret put SESSION_KEY`; also rotate `DASHBOARD_PASSWORD` when replacing access credentials. Rotating `CREDENTIAL_KEY` requires re-encrypting or reconnecting the site; do not replace it blindly.

AI explanation generation, verification/correction capture, multi-user administration, additional sites, durable scan history, and complete release hardening remain separate work. This backend does not expose a general diagnostic executor or write to WordPress.

References: [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Worker best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [static assets](https://developers.cloudflare.com/workers/static-assets/).
