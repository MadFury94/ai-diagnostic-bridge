# WooCommerce incident detection: evidence and acceptance plan

Date: 2026-10-15. This records the pre-implementation source audit and acceptance criteria. The first database-signature/scheduler-observation implementation now exists in plugin 0.1.8 and the Anbe Worker; see OPERATIONAL-MONITORING.md and SUPPORT-JOURNAL.md for its exact coverage and deployment status. Content correctness, comprehensive database integrity, and reproduction of the original root cause remain open.

## What is established

The controlled Anbe HTTP 503 test proved scheduled homepage failure detection and user-confirmed outage email delivery. Failure windows were 09:35 and 09:40 UTC; provider acceptance was 09:40:38 UTC. It did not test content correctness, WooCommerce database integrity, WordPress cron execution, or diagnosis of the original client incident. The user's three-day/client-call versus five-minute comparison is a reported experience, not a like-for-like reproduction of that incident or measured repair time.

The user identified the original site as Anbe and supplied three Hostinger AI screenshots in `worker/src/hostinger/`. The screenshots report HTTP 503 and repeated WordPress database "Commands out of sync" errors associated with WP-Cron and WooCommerce Action Scheduler. The user reports that restoring a backup through Hostinger restored access. This is distinct from both local exercises below and the deliberate HTTP 503 test.

The screenshots are Hostinger AI summaries, not raw logs or independently verified root-cause evidence. They describe proposed database repair and WooCommerce deactivation as not applied in those runs. A backup dated 2026-10-06 is mentioned as available; this does not establish which backup was restored. Screenshot filenames reflect receipt/export dates, not a confirmed incident date. Still unknown: the original timestamped log sequence, initiating query/plugin, installed versions at failure, exact backup contents/date restored, and whether the database errors caused or accompanied the outage.

MySQL documents "Commands out of sync" as incorrect sequencing of client operations, including mishandled pending results. It is not, by itself, proof of corrupt tables. See [MySQL error explanation](https://dev.mysql.com/doc/refman/8.0/en/commands-out-of-sync.html). A healthy table/schema inspection therefore cannot rule out this incident class; restoring a backup establishes recovery, not which component caused the failure.

| Recorded failure | Evidence | What it establishes |
| --- | --- | --- |
| Local WooCommerce 11.1.1 `fetch_patterns` failure, September 22 | SUPPORT-JOURNAL.md records the handler present in normal/admin/REST bootstrap and absent in cron bootstrap | A context-dependent missing callback for optional pattern caching; not proof that checkout broke or the whole scheduler stopped |
| Local SQLite checkout failure, September 22 | Stock reservation failed on `INTERVAL 60 MINUTE`; a temporary local stock-hold workaround allowed a synthetic checkout | A database-adapter compatibility failure; not evidence of a missing table or corrupt database |
| Anbe HTTP 503 exercise, October 15 | Scheduled monitor state, provider acceptance, and user-reported inbox receipt | Reachability notification works for this failure type |
| Original Anbe outage, date unconfirmed | Three Hostinger AI screenshots report 503 and database "Commands out of sync" associated with scheduled processing; user reports backup restoration | Symptom/signature and reported recovery are identified; exact causal chain remains unverified |

## Current implementation and gaps

| Area | Source and existing behavior | Missing evidence |
| --- | --- | --- |
| Five-minute availability | `worker/src/availability.ts`: accepts HTTP 2xx and cancels the response body | Expected content, rendered UI, WooCommerce behavior |
| Database | `includes/diagnostics/class-woocommerce.php`: database version, update-needed flag, HPOS mode | Required table/column/index presence or targeted consistency checks; these existing fields do not establish integrity |
| WordPress cron | `includes/diagnostics/class-site-health.php`: reports `DISABLE_WP_CRON` | Execution history, overdue events, external-runner evidence |
| Action Scheduler | WooCommerce adapter: site-wide failed and pending-overdue counts, five-minute grace, bounded to 100 with truncation | Task attribution, age/trend, execution progress, context-specific callback failures |
| Error-log evidence | `includes/diagnostics/class-php-errors.php`: bounded configured debug-log tail matching PHP fatal/parse/warning/notice/deprecated labels; `worker/src/scan.ts` does not request `errors` | A plain WordPress database "Commands out of sync" line does not match the existing classifier; this evidence is not part of scheduled scans |
| Alerts | `worker/src/scan.ts`, `index.ts`, and `alerts.ts`: hourly, complete-scan-only findings; silent first baseline; new IDs only; default high threshold | Existing medium action findings do not email at the default threshold. A failed/incomplete scan suppresses finding notification even when other evidence is useful |

## Proposed checks and evidence contracts

All checks must distinguish pass, confirmed failure, unknown/unavailable, and not applicable. A permission/query error is not evidence of corruption. Findings must include observation time, scope, coverage/caps, and a stable ID. Exclude SQL text/errors containing secrets, database prefixes, customer/order contents, action arguments, and raw page bodies from outward evidence.

### 1. Expected public content

Configure explicit per-site expectations for selected public pages: required non-personal text/markup markers and narrowly defined error markers. A 200 response missing a required marker is a content mismatch, not proof of its cause. Establish a healthy fixture before enabling a rule; do not infer correctness from page size, title presence, or an AI judgment alone.

Use bounded HTML reads, same-origin redirect rules, timeouts, and server-controlled paths. Unsupported content types, truncation before evaluation, transport failure, or missing configuration must be unknown/not configured rather than a pass. Static HTML checks cannot prove a JavaScript-rendered interface works; browser checks would be a separate explicit scope. Avoid authenticated pages, cart mutations, checkout submissions, and real transactions.

Acceptance: healthy HTTP 200 passes; HTTP 200 with an expected marker removed fails; an explicitly configured error marker fails; unrelated content changes still pass; a capped body is unknown; recovery requires a valid matching response. Include a cached-success limitation in reported coverage.

### 2. WooCommerce database structure and targeted consistency

First map the original error to a specific invariant. Resolve required schema against the installed WooCommerce version, database engine, and active order storage mode. Read only bounded schema metadata and, where necessary, narrowly scoped aggregate consistency observations. Do not equate plugin/database version equality with healthy schema. Describe these as targeted structure/consistency checks, not a comprehensive corruption audit.

Evidence should identify logical components, expected versus observed structure, engine/storage mode, and unknown reasons. Missing required structures can justify high severity; optional/inactive-mode structures must not raise a critical incident. A migration flag remains separate evidence. No repair, schema alteration, action retry, or database-wide integrity operation belongs in a diagnostic scan.

Acceptance on a disposable representative MySQL/MariaDB store: healthy schema passes; a deliberately missing required table/column/index is identified precisely; inactive HPOS does not require active-HPOS-only structures; denied metadata access is unknown; unsupported versions/engines are unknown; restoration clears the finding. If the original error is adapter compatibility rather than structure, a schema test alone must explicitly fail acceptance as a reproduction of that incident.

### 3. WordPress cron and WooCommerce scheduled-action health

Separate three questions: is cron configured, is work overdue, and has the relevant runner actually made progress? `DISABLE_WP_CRON` alone is not a failure because an external runner may be configured. A REST request loading a callback is not evidence that the callback loads under cron.

Observe bounded overdue event counts and oldest due age; Action Scheduler failed/overdue counts, safely attributed task categories, oldest age, and completion progress across observations. Distinguish historical failures from newly failing work, a single callback failure from a stalled queue, and WooCommerce tasks from unrelated plugin tasks. For a claimed missing callback, capture sanitized execution-context evidence rather than infer from queue counts.

Do not execute jobs to test health. Execution timestamps must come from trustworthy recorded events; if unavailable, report unknown. A persistent heartbeat would require an explicitly designed instrumentation change rather than a claim of read-only observation. Thresholds and observation intervals must be defined against the site's expected workload before enabling notifications.

Acceptance: a disabled built-in cron with a healthy external runner does not alert; an advancing queue passes; an overdue queue with no progress over the configured observation window alerts; old failed actions alone do not prove a current outage; unavailable scheduler APIs are unknown; a callback absent only in cron is correctly distinguished; no diagnostic request runs or retries a task; recovery requires observed progress, not just a cleared count.

## Notification and scheduling acceptance

Choose and document the cadence for each new check. The existing five-minute availability schedule does not automatically apply to database or cron diagnostics. Do not promise five-minute WooCommerce detection from the hourly full scan.

Define severity from observed impact and confidence. Do not raise all medium findings merely to force email. Decide how independently completed operational checks notify when unrelated SEO scans are incomplete: use separate completion/baseline scopes if implementing independent alerts, never mark a partial scan globally complete. Report lost diagnostic coverage separately from a confirmed WooCommerce fault.

Test configured thresholds, initial-baseline behavior, new/ongoing/resolved/reappearing incidents, overlapping observations, provider retry, and incomplete-source behavior. Notifications must state observed symptom and evidence, qualify possible causes, and link to authenticated detail. Verify an actual scheduled run and inbox delivery separately from mocked-provider tests.

## Implementation order and incident acceptance gate

### Priority refined by the Hostinger evidence

First implement bounded, sanitized recognition of the database error signature with observation timestamps, freshness, repeat counts, and safe scheduler context. A matching line without scheduler evidence must not be attributed to WooCommerce. Do not expose raw queries, stack traces, action arguments, or log paths. Old restored log entries must not trigger a new current incident; absent/unreadable/rotated logs must report coverage uncertainty rather than a healthy database.

Next add cron/Action Scheduler execution-progress evidence and a notification path that does not depend on every SEO request succeeding. Keep homepage reachability as independent symptom detection. When WordPress cannot boot or the database cannot serve the diagnostic endpoint, the Worker can detect unavailability but cannot retrieve fresh internal evidence; a separately authorized host-log source would be needed to diagnose during that outage. No such host integration is currently available in this implementation.

Acceptance for this incident class: a dated sanitized fixture containing the exact database signature is recognized without leaking query data; fresh recurrence is distinguished from historical entries; scheduler attribution is evidence-backed; a 503 is alerted even when internal diagnostics fail; a 200 response with fresh internal errors still produces the appropriate operational finding; recovery of HTTP and recovery of internal processing remain separate. A synthetic signature test verifies detection, not reproduction of the original initiating defect. Missing-table tests remain useful additional coverage but do not satisfy this incident's acceptance criteria alone.

1. Preserve the supplied Hostinger evidence and user-reported recovery recorded above; obtain sanitized original log excerpts if available to establish chronology and the initiating defect. Begin signature-detection fixtures from the known error without inventing a cause.
2. Define stable per-source evidence contracts, severity, thresholds, schedule, unknown handling, and notification scope; update Worker field allowlists and dashboard presentation accordingly.
3. Implement deterministic read-only checks with fixtures and isolated integration coverage. Reproduce the original failure only in a disposable matching environment.
4. Demonstrate a working baseline, failure detection with relevant evidence, and clearing after the recorded repair. Record timing from a known injected fault separately from notification and repair time.
5. Deploy and verify healthy scheduled operation, then use a controlled non-production failure for end-to-end notification acceptance.

Until step 4 passes for the actual incident: the answer to "would this have detected why WooCommerce broke?" remains unverified. A test that merely returns HTTP 503 does not satisfy this gate.
