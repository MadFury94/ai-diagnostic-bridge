# Email alerts: Anbe, Katalyst, and Missus Outfits

## Status as of 2026-10-04

Anbe, Katalyst, and Missus Outfits alert integrations, migrations, and hourly scheduled scan handlers are deployed. Each Worker runs `0 * * * *` in UTC in addition to manual scans. Resend secrets must be configured separately on each Worker and real inbox delivery still requires a controlled new-finding test. Missus still needs its WordPress plugin credential and its Resend sender settings should be checked after deployment.

| Site | Cloudflare Worker | Project directory | D1 database | Affected domain shown in email |
| --- | --- | --- | --- | --- |
| Anbe | `ai-diagnostic-bridge` | `worker/` | `ai-diagnostic-bridge` | `anbenigeria.com` |
| Katalyst | `ai-diagnostic-bridge-katalyst` | `worker-katalyst/` | `ai-diagnostic-bridge-katalyst` | `wp.katalyst.tech` |
| Missus Outfits | `ai-diagnostic-bridge-missus` | `worker-missus/` | `ai-diagnostic-bridge-missus` | `cms.missusoutfits.com` |

Missus was added as a third isolated deployment after the Anbe/Katalyst implementation. Its current activation status and commands are recorded in the [Missus setup guide](worker-missus/README.md) and [deployment journal](worker-missus/DEPLOYMENT-JOURNAL.md). Its `DASHBOARD_ORIGIN` is configured in Wrangler; add `RESEND_API_KEY` and `ALERT_EMAIL_FROM` to that Worker separately. The same provider sender can serve all three sites. Each retains its own database, WordPress token, dashboard/session secrets, and scan baseline.

## 1. Prepare Resend and the sending domain

Create a Resend account, add a domain you control, and publish the exact DKIM and SPF/return-path DNS records Resend supplies. Review the domain's existing DMARC record and add a policy if needed; preserve existing email configuration. Wait for verification before using a sender on that domain. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).

Create a sending API key. The same verified sender and Resend sending key can serve both Workers. The sender domain identifies your notification service; it does not need to match the client site with the issue. Each email separately identifies the affected site and hostname.

## 2. Configure each Worker separately

Open **Cloudflare > Workers & Pages > select the Worker > Settings > Variables and Secrets > Add**. Repeat for each Worker: secrets do not transfer between them. See [Cloudflare secret configuration](https://developers.cloudflare.com/workers/configuration/secrets/).

| Name | Type | What to enter | Shared between Workers? |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | **Secret** | The Resend sending API key | The value may be shared, but add it to each Worker separately. |
| `ALERT_EMAIL_FROM` | Text or Secret | Your sender, e.g. `Diagnostics <alerts@your-verified-domain>` | Yes, if both use that verified sender. |
| `DASHBOARD_ORIGIN` | Text or Secret | The canonical HTTPS origin of this site's dashboard | **No: each must point to its own dashboard.** |

For Katalyst, the recorded dashboard origin is `https://ai-diagnostic-bridge-katalyst.onochieazukaeme.workers.dev`. Use its canonical custom domain instead if one is configured. For Anbe, copy the Anbe Worker's dashboard origin from Cloudflare. Neither value is the WordPress site URL. Use an origin with no path, query, or credentials.

Enter the API key only in the Secret field or the interactive Wrangler prompt. Never put it in source code, chat, frontend variables, or the WordPress plugin. Keep the existing dashboard/session/WordPress credentials separate between clients.

All three local Wrangler configurations now record their own `DASHBOARD_ORIGIN`. API keys remain outside these files. If Cloudflare offers a config snippet containing a Resend key under `vars`, remove that plain-text variable and recreate it as a Secret. If the key was exposed, revoke it in Resend and replace it on every Worker that used it. The Gmail address is the recipient; `ALERT_EMAIL_FROM` must be an address on a verified sending domain. A shared verified sender can be used across all three Workers.

You can use these commands instead of the Cloudflare form. Run each block from its stated directory; each command prompts for its value.

From `worker/` (Anbe):

```powershell
npx wrangler secret put RESEND_API_KEY --config wrangler.jsonc
npx wrangler secret put ALERT_EMAIL_FROM --config wrangler.jsonc
npx wrangler secret put DASHBOARD_ORIGIN --config wrangler.jsonc
```

From `worker-katalyst/`:

```powershell
npx wrangler secret put RESEND_API_KEY --config wrangler.toml
npx wrangler secret put ALERT_EMAIL_FROM --config wrangler.toml
npx wrangler secret put DASHBOARD_ORIGIN --config wrangler.toml
```

If Wrangler reports that the latest Worker version is not currently deployed, use the version-aware command and promote the resulting version from Cloudflare Deployments:

```powershell
npx wrangler versions secret put RESEND_API_KEY --name WORKER_NAME --config wrangler.toml
```

The same command applies to Anbe with `--config wrangler.jsonc`. Use a newly rotated key if the previous key appeared in chat, logs, or a dashboard configuration snippet.

## 3. Apply migrations and deploy

Adding the API key alone does not activate undeployed code. Each database needs migration `0003_critical_email_alerts.sql`, and each Worker needs its new backend and dashboard build.

From `worker/` (Anbe):

```powershell
npx wrangler d1 migrations apply ai-diagnostic-bridge --remote --config wrangler.jsonc
npm --prefix ../dashboard run build
npm run deploy
```

From `worker-katalyst/`:

```powershell
node scripts/check-isolation.mjs
npx wrangler d1 migrations apply ai-diagnostic-bridge-katalyst --remote --config wrangler.toml
npm run build:dashboard
npm run deploy
```

## 4. Set preferences and establish the baseline

Sign in to each site's dashboard and open **Site connection > Finding email alerts**. The default recipient is **webdeveloperbrian@gmail.com**, and the default minimum severity is **high**, which includes high and critical. Preferences are saved separately for each connection. A blank recipient disables alerts.

Run a complete scan. The first successful complete scan establishes a baseline and sends no email for existing findings. Later complete scans send only for qualifying finding IDs absent from the previous complete scan. Persistent findings stay silent, even after days. A finding that clears and later reappears is new. Failed or incomplete scans do not replace the baseline. Changing a title, threshold, or recipient does not make an existing ID new.

The hourly scheduled scan and manual dashboard scan use the same completed-scan comparison. Leave the recipient configured and the Worker/WordPress credentials valid to receive future alerts. Failed or incomplete scheduled scans do not advance the baseline.

## What the email contains

The plain-text email contains only the site name and affected hostname, finding title, severity, UTC detection timestamp, and an opaque link to that site's dashboard. Examples of the Site line are `Anbe Nigeria (anbenigeria.com)` and `Katalyst (wp.katalyst.tech)`.

The link requires the corresponding dashboard login and loads current finding details after authentication. It is not a credential or public evidence link. Diagnostic messages, evidence payloads, and credentials are excluded from the email. If the finding has cleared, the detail page reports that it is no longer present.

## Verification and delivery limits

Local validation passed: **53 Anbe Worker tests**, **59 Katalyst Worker tests**, and **61 Missus Worker tests**, plus their TypeScript checks, dashboard builds, and deployment dry runs. Katalyst and Missus isolation checks passed. Missus was also deployed and smoke-tested before its WordPress credential was configured. Resend calls in tests are mocked; these results do not establish real inbox delivery.

After activation, verify delivery using a controlled new qualifying finding that appears after a baseline. Repeat the scan to confirm no duplicate, then confirm clearing and reappearance allow a new notification. Do not create a real production security problem merely to test email.

Sending is best effort. Provider acceptance does not prove inbox delivery. Failed sends retry on later complete scans with a one-minute backoff and stable Resend idempotency keys. See [detailed delivery limits](worker/README.md#finding-email-alerts-resend).

## Future clients

The current architecture has one managed site per Worker, not one shared multi-site dashboard. A future client needs its own Worker configuration, database/migrations, dashboard/session and WordPress credentials, alert settings, and dashboard origin. The verified Resend sender may be reused. The affected hostname is derived from that client's configured WordPress origin, so no email-template domain hardcoding is needed. Follow Katalyst's isolation pattern when creating another deployment.
