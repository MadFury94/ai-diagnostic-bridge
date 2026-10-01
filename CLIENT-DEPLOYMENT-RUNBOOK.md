# One-Worker-per-client deployment runbook

This runbook provisions one isolated AI Diagnostic Bridge Worker for one WordPress client. Each client gets a separate Worker name, D1 database, rate-limit namespaces, dashboard/session secrets, and WordPress credential secret. Do not combine clients in one database or add a client selector to the Worker. The Anbe Worker remains a separate deployment.

The checked-in template is `worker-katalyst/`. For the next client, copy that directory from the committed template or use its scaffold helper after committing the template. Replace every client-specific value before provisioning.

## Prepare the client site

Install and activate AI Diagnostic Bridge on the client WordPress site. In **Settings → AI Diagnostic Bridge**, generate a credential and copy it once. Do not put that credential in Git, a browser, a dashboard URL, or a plain-text config file. The exact site origin must be HTTPS with no path, query, or trailing slash, for example `https://katalyst.tech`.

Verify the plugin route before deployment:

```powershell
curl.exe -i https://CLIENT.example/wp-json/ai-diagnostic/v1/health
```

Unauthenticated access should return JSON HTTP 401. A 404 means the plugin is not installed at that URL yet; finish WordPress installation before final acceptance.

## Create the isolated Worker

From the repository root, copy the committed client template to a new directory and give it a unique Worker name such as `ai-diagnostic-bridge-clientslug`. Create three fresh rate-limit namespace IDs; never reuse the Anbe IDs (`92326001`, `92326002`, `92326003`) or another client's IDs.

Update `deployment.json` and `wrangler.toml` with the unique Worker name, D1 name, exact HTTPS `ALLOWED_SITE_ORIGIN`, `SITE_NAME`, three rate-limit namespace IDs, and client-specific cookie name. Run:

```powershell
node scripts/check-isolation.mjs
```

The check must confirm one D1 binding, the exact origin, unique rate-limit IDs, the client cookie name, and no second Wrangler config.

## Provision a new D1 database

From the new Worker directory:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 create ai-diagnostic-bridge-clientslug --config wrangler.toml
```

Copy the returned UUID into `wrangler.toml` (`database_id`) and `deployment.json` (`databaseId`). Confirm it belongs to the new database name; never copy the Anbe UUID `231f8e19-7547-4b93-89b9-75cca8f0ab57`.

Apply the migrations:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply ai-diagnostic-bridge-clientslug --remote --config wrangler.toml
```

## Create fresh secrets

Generate unique dashboard and session secrets locally:

```powershell
node scripts/prepare-secrets.mjs
```

The script refuses to overwrite existing values and does not print them. Deploy them with:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.toml --secrets-file .private/secrets.json
```

After the WordPress plugin is installed and its credential generated, enter that credential separately:

```powershell
"PASTE_THE_CLIENT_WORDPRESS_CREDENTIAL_HERE" | node node_modules/wrangler/bin/wrangler.js secret put WORDPRESS_TOKEN --config wrangler.toml
```

Do not place the WordPress credential in `.private/secrets.json`. `WORDPRESS_TOKEN` is a Worker secret and is never returned to the dashboard. Rotate it after a WordPress credential regeneration.

## Build, deploy, and accept

```powershell
npm --prefix dashboard ci --no-audit --no-fund
npm --prefix dashboard run build
npm run types
npm run check
npm test
node scripts/check-isolation.mjs
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.toml --secrets-file .private/secrets.json
node scripts/smoke.mjs https://ai-diagnostic-bridge-clientslug.<account-subdomain>.workers.dev
```

Before `WORDPRESS_TOKEN` is set, expected smoke behavior is dashboard HTTP 200, unauthenticated diagnostics HTTP 401, and authenticated diagnostics HTTP 409 (`not_connected`). After the plugin is installed and the secret is set, smoke must verify the fixed client origin, authenticated health, plugins, core-updates, WooCommerce, SEO, and bounded collection routes. Confirm no credential appears in any response.

Record the Worker URL, database UUID, migration result, secret names (never values), smoke output, and setup delays in that client's `DEPLOYMENT-JOURNAL.md`.

## Katalyst instance

- Worker: `ai-diagnostic-bridge-katalyst`
- URL: `https://ai-diagnostic-bridge-katalyst.onochieazukaeme.workers.dev`
- Site: `https://katalyst.tech`
- D1: `ai-diagnostic-bridge-katalyst`, UUID `4eaf7816-e79e-4495-a9cc-f6cd8174cc94`
- Rate-limit namespaces: `93026011`, `93026012`, `93026013`
- State: deployed and smoke-tested; the WordPress plugin route currently returns 404, so `WORDPRESS_TOKEN` has not been set and full acceptance is pending plugin installation.

The Worker reads the WordPress credential only from `WORDPRESS_TOKEN`. D1 stores fixed-site verification metadata and dashboard explanation records. This is deliberate per-client isolation, not a migration toward multi-tenancy.
