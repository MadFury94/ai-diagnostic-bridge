# Katalyst deployment journal

## 2026-10-01 — Isolated Worker provisioned

Katalyst is a separate one-client Worker deployment. The Anbe Worker and its D1 database were not modified or referenced by the Katalyst binding.

Provisioned resources:

- Worker: `ai-diagnostic-bridge-katalyst`
- URL: `https://ai-diagnostic-bridge-katalyst.onochieazukaeme.workers.dev`
- Public site: `https://katalyst.tech`
- WordPress API origin: `https://wp.katalyst.tech`
- D1: `ai-diagnostic-bridge-katalyst`, UUID `4eaf7816-e79e-4495-a9cc-f6cd8174cc94`
- Rate-limit namespaces: `93026011`, `93026012`, `93026013`
- Migrations: `0001_sites.sql` and `0002_explanations.sql` applied remotely
- Initial Worker version: `48040960-f9ef-43cc-b62f-a4d4b6750903`
- Secrets generated and deployed: `DASHBOARD_PASSWORD`, `SESSION_KEY`
- WordPress secret: `WORDPRESS_TOKEN`, not yet set because the plugin is not installed at the client origin

Validation passed: isolation check, 42 Worker tests, TypeScript check, dashboard production build, Wrangler dry run, and deployed smoke checks. Final smoke returned HTTP 401 for unauthenticated diagnostics, HTTP 200 for dashboard/login and fixed Katalyst identity, and HTTP 200 for WordPress credential verification plus health, plugins, core updates, WooCommerce, SEO, image, and link diagnostics.

The public `https://katalyst.tech/` homepage returned HTTP 200. The plugin endpoint `https://katalyst.tech/wp-json/ai-diagnostic/v1/health` returned HTTP 404, so WordPress acceptance is pending. After installing/activating the plugin and generating its credential, set it privately with:

```powershell
"PASTE_THE_KATALYST_WORDPRESS_CREDENTIAL_HERE" | node node_modules/wrangler/bin/wrangler.js secret put WORDPRESS_TOKEN --config wrangler.toml
```

Then rerun `node scripts/smoke.mjs https://ai-diagnostic-bridge-katalyst.onochieazukaeme.workers.dev`. Do not record the credential in this journal.

## Backend origin correction

The public Katalyst frontend returned 404 for the diagnostic route. The active WordPress backend is https://wp.katalyst.tech; its unauthenticated diagnostic route returns the expected 401 JSON response. The Worker configuration and deployment metadata were updated to use this backend origin before redeployment.

## Final acceptance

The Worker was redeployed with the backend origin (version `b85dde6b-f1a9-49cf-ac6b-3b6f68877e20`). The complete smoke test passed against the live WordPress plugin and all diagnostic collections returned HTTP 200.

