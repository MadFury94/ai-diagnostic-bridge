# AI Diagnostic Bridge Dashboard Design Plan

## Implementation status â€” 2026-09-24

Worker implementation (M2) is deployed at https://ai-diagnostic-bridge.onochieazukaeme.workers.dev. The dashboard is served with Worker Static Assets on the same origin as the API, replacing the separate Pages hosting proposal. Authentication, encrypted D1 credentials, real save/test/disconnect, bounded read-only proxying, rate limits, redaction, and safe logs are implemented. Dashboard mocks were replaced with API integration and unconfigured/loading/error/stale/incomplete states. Type-checks, production build, 32 Worker tests, deployed HTTP checks, and browser checks passed.

M3 live Anbe acceptance is complete: all seven proxy routes returned HTTP 200, the scan returned 12 records, and About page 10 was `ok` with only informational slug mismatch. Browser login, live scan/detail, saved-connection test, keyboard dismissal, mobile layout, and logout passed. The root `.env` targets local WordPress and was not imported as Anbe; the live connection was configured separately. M4 AI explanations are complete: live Anbe testing generated one verified-as-is explanation and one corrected explanation while preserving both original outputs; M5 release work remains separate. See `worker/README.md`, `PROGRESS.md`, and `SUPPORT-JOURNAL.md` for evidence and operation details.

## Purpose

The dashboard is a read-only support workspace for reviewing WordPress diagnostic evidence. It will help a support engineer move from a site-wide summary to a named post or page, understand the finding, and decide what to check next.

The dashboard is a separate application from the WordPress plugin. The plugin remains deterministic: it collects bounded evidence and reports findings. The dashboard presents that evidence. The AI layer explains verified findings and drafts support guidance; it does not change WordPress.

## Initial user flow

1. Add or select a configured WordPress site.
2. Run or refresh a diagnostic scan.
3. Review the overall status and issue counts.
4. Filter findings by severity, issue type, post type, or title.
5. Open a post/page detail view.
6. Review the evidence, likely impact, and suggested next step.
7. Ask AI for a support-ready explanation.
8. Verify the recommendation in WordPress and record the result in the support journal.

The first release is read-only. It will not edit posts, pages, media, settings, orders, customers, or payment data.

## Site connection and token handling

The first dashboard release supports one site per dashboard account, while using a data model that can expand to multiple sites later.

The connection screen contains:

- Site name (a label chosen by the user)
- WordPress site URL
- AI Diagnostic Bridge token
- Save and test connection actions

The token field is write-only. After saving, the UI shows only whether a token is configured and the last connection result; it never displays the stored token again.

For local development, the token may be supplied through an ignored `.env` file. In the deployed Cloudflare Worker, a user-entered token must be stored server-side using an encrypted secret or an encrypted site-credential store. It must not be written to React build assets, browser local storage, URL parameters, logs, analytics, or client-visible API responses. Production credentials are not ordinary frontend environment variables because those values are exposed to the browser at build time.

The Worker should associate the credential with a site record and use it only when calling that site's authenticated bridge routes. The initial one-site implementation can use one protected server-side credential; the storage interface should reserve a site identifier so multiple sites can be added without changing the dashboard response contract.

Connection setup must verify the URL and token with a read-only health request, return a generic success or failure message, and rate-limit repeated attempts. Revoking or replacing a token must invalidate the previous credential and never echo either value.

## Screen design

### Site overview

- Site name and URL (displayed without credentials)
- Last successful scan time
- Overall status: `ok`, `warning`, or `error`
- Summary cards for issue counts by severity and issue type
- Count of analyzed Posts and Pages
- Clear indication when results are stale or incomplete

### Findings list

Each row shows:

- Title
- Post type: Post or Page
- WordPress ID
- Finding title and stable finding ID
- Severity
- Category
- Short evidence summary
- Link to the detail view

Filters:

- Severity
- Category
- Finding type
- Post or Page
- Search by title or ID
- Actionable findings only (hide informational observations)

### Finding detail

- Post/page title, type, ID, and public URL when available
- Finding title, severity, category, and message
- Evidence fields supplied by the plugin
- Why the issue matters in plain language
- Recommended next check or repair
- Verification command or UI path where appropriate
- AI explanation with a visible `AI-generated interpretation` label
- Copyable support reply
- Link back to the scan and journal entry

### Scan state and errors

The interface should distinguish:

- A clean result
- A result with findings
- A not-applicable result
- An authentication failure
- A WordPress route or network failure
- A stale result that needs refreshing

Errors should show the next diagnostic action without exposing tokens, headers, cookies, or raw server responses.

## Visual direction

Use a calm support-tool layout rather than a marketing dashboard:

- Light neutral background with high-contrast content panels
- One primary accent color for actions and links
- Severity colors used consistently: informational, low, medium, high, critical
- Clear typography and generous spacing for scanning during support work
- Tables on desktop, stacked cards on narrow screens
- Do not rely on color alone; every severity indicator includes text
- Keep AI content visually separate from deterministic evidence

## Data and API boundaries

The browser talks only to the Cloudflare Worker. It never receives the WordPress diagnostic token.

The Worker will:

- Authenticate the dashboard user
- Store WordPress credentials as server-side secrets
- Call the authenticated bridge endpoints
- Enforce endpoint, pagination, and response-size limits
- Return the bounded fields needed by the dashboard
- Redact credentials, cookies, private data, and unnecessary raw content
- Apply rate limits and structured error handling

Initial data sources:

- `GET /health`
- `GET /seo/site`
- `GET /seo/issues`
- `GET /seo/posts`
- `GET /seo/post/{id}`
- `GET /images/issues`
- `GET /links/issues`

The dashboard must preserve the plugin response envelope and stable finding fields: `id`, `severity`, `category`, `title`, `message`, `evidence`, and `source`.

## AI boundary

AI receives the smallest evidence object needed to explain a finding. It should not receive credentials, customer/order/payment data, cookies, salts, or the full post body by default.

AI output should have a structured shape:

- `summary`
- `why_it_matters`
- `recommended_next_step`
- `verification_step`
- `caveats`

The UI must label this as an interpretation, keep the original deterministic finding visible, and provide a way to mark the explanation as verified or corrected. AI must not issue arbitrary WordPress commands or perform automatic content changes.

## Implementation milestones

### M1 â€” Dashboard shell

- React application with routing and responsive layout
- Mock data matching the plugin response contract
- Overview, findings list, and finding detail screens
- Loading, empty, stale, and error states

### M2 â€” Cloudflare Worker proxy

- Single-site connection form with write-only token entry
- Server-side WordPress site configuration and encrypted secret storage
- Read-only proxy routes for the initial bridge endpoints
- Authentication, rate limiting, bounds, redaction, and request logging
- Local development configuration without committed secrets

### M3 â€” Live Anbe connection

- Connect the dashboard to Anbe through the Worker
- Verify titles, post types, findings, pagination, and failure states
- Confirm the browser network never contains the WordPress token

### M4 â€” AI explanation workflow

- [x] Add a Worker-side AI request using the structured evidence object
- [x] Render explanation, next step, and verification guidance
- [x] Add human verification/correction capture
- [x] Record a concrete support case in `SUPPORT-JOURNAL.md`

### M5 â€” Hardening and release

- Accessibility and keyboard review
- Response-size and rate-limit testing
- Authentication and secret-handling review
- Deployment documentation and screenshots
- Separate dashboard release notes from the WordPress plugin release

## First acceptance case

Use the existing Anbe data without repairing every remaining page:

1. Open the overview and see the current site-wide warning status.
2. Find `About ANBE Nigeria | Our Mission` and confirm it is `ok` except for an informational slug observation.
3. Open a remaining issue such as Services or Projects.
4. Confirm the dashboard shows the title, post type, stable finding ID, severity, evidence, and next step.
5. Generate an AI explanation and verify it against the WordPress evidence before recording it in the support journal.

## Out of scope for the first dashboard release

- Editing WordPress content or settings
- Automatic SEO repairs
- Customer, order, payment, or account-data screens
- Arbitrary WP-CLI or code execution
- Full post-body storage in the dashboard
- Multi-user administration beyond the minimum dashboard authentication

