# Database errors and scheduler monitoring

Implemented 2026-10-15 for the Anbe Worker and plugin 0.1.8. This addresses the error signature reported in the Hostinger screenshots; it does not establish the original root cause or implement a comprehensive database-integrity/content-correctness audit.

## Checks and thresholds

The authenticated plugin `GET /wp-json/ai-diagnostic/v1/operations` endpoint exposes independent, read-only observations under contract version 1. It does not run, retry, cancel, or repair jobs; alter schemas; enable logging; or change WooCommerce settings.

| Source | Observation | Alert rule |
| --- | --- | --- |
| Database log | At most the last 64 KiB of a configured local regular log file; standard `[DD-Mon-YYYY HH:MM:SS UTC] WordPress database error Commands out of sync` lines | One or more timestamped matches in the preceding 15 minutes, high severity |
| WordPress cron | Up to 100 overdue events in the current cron option format; oldest event identity and due time | The same event, already at least five minutes overdue, remains unchanged across 15 minutes of observations, high severity |
| Action Scheduler | Up to 101 pending and 101 in-progress actions at least five minutes overdue; site-wide oldest task identity and due time | The same overdue task remains unchanged across 15 minutes of observations, high severity |

Only timestamps, counts, opaque identities, fixed classifications, and coverage information leave the plugin. SQL, log lines, paths, hook names, task arguments, and customer/order data are not returned. Scheduler context for a database error is counted only when recognized in the log's `made by` call-chain suffix; an error alone is not attributed to WooCommerce.

The scheduler finding means one observed overdue item has not progressed, not that all processing stopped. Changed oldest identity or no overdue items clears that particular finding; it does not prove successful completion, since work could also have been removed. Historical failed-action counts and `DISABLE_WP_CRON` alone do not trigger these alerts. No new heartbeat is registered and no completed-task execution history is fabricated.

## Unknown evidence and recovery

Missing/unreadable logs, unsupported contracts/formats, query failures, inaccessible WordPress, stale snapshots, and invalid observations are unknown, not healthy. Unknown evidence cannot clear a previous active finding. An observation gap greater than ten minutes or an unknown scheduler observation restarts the 15-minute continuity window. Repeated deliveries in one five-minute bucket do not advance it.

Old error timestamps do not trigger a current incident. Undated, invalid, or future-dated matching lines make an otherwise negative log observation unknown. A truncated tail can prove a matching recent error but cannot establish its absence. After an active incident, a changed file identity or shrinking observed log resets a 15-minute coverage wait before a negative observation can clear it. File identity detection depends on filesystem inode support; this is not a forensic rotation audit. A cleared log finding means no matching recent error was observed under those coverage rules, not proof of database repair. Recovery appears in the dashboard; this release does not send separate operational recovery emails.

## Independent scheduling and email

Anbe's existing five-minute scheduled handler runs homepage availability and then operational checks with separate error handling. Full diagnostics remain hourly. Operational observations do not require SEO pagination or a successful full scan. Each source has its own D1 state and timestamp compare-and-set guard. Current evidence is available at authenticated `GET /api/operations` and in the dashboard monitoring panel.

Operational findings use the existing recipient, Resend configuration, and minimum severity. Blank recipient disables mail; a critical-only threshold excludes these high-severity findings. A confirmed operational failure can notify on its first observation, unlike the full-scan silent first baseline. An ongoing incident is not resent on every tick; a valid clear followed by recurrence rearms it. Enabling mail or changing recipients does not replay an already active incident. Pending messages retry with the existing provider idempotency/lease mechanism; obsolete recipients, resolved findings, and operational messages older than 23 hours are removed on subsequent source observations. Provider acceptance is not inbox receipt.

Email identifies the symptom, site, time, uncertainty, and next steps, with an authenticated detail link. Unknown, disabled, or stale monitoring refuses to label an earlier finding cleared. No raw internal log evidence is emailed. The full-scan baseline cleanup excludes operational notifications.

## Installation and activation

Plugin **0.1.9** adds a setup panel under **Settings > AI Diagnostic Bridge > Database error log setup**. It shows the detected source, selected path (administrator only), and readable/missing/unreadable status. Detection order is: server constant `AIDB_OPERATIONAL_LOG_PATH`, saved plugin override, enabled WordPress debug-log configuration, then enabled PHP logging with an absolute file path. Relative destinations and syslog are not supported. A configured but missing file is reported rather than silently replaced by a different log.

For existing supported logging, no manual path is needed. Otherwise an administrator can enter an existing readable local file and choose **Save and check log**. Blank restores automatic detection. A server constant locks the control. If no suitable log exists, the panel explains that logging must be configured on the server; it does not create one or enable debug mode. Readability does not prove current recording or a compatible error format. No Worker update or migration is needed for 0.1.9.

1. Install the prepared `ai-diagnostic-bridge-0.1.8.zip` as an update to the existing WordPress plugin. Preserve the existing connection credentials. The package contains runtime plugin files only.
2. Give the plugin access to an existing suitable local log. It uses `AIDB_OPERATIONAL_LOG_PATH` when explicitly defined in server-side WordPress configuration; otherwise it uses the existing enabled `WP_DEBUG` / `WP_DEBUG_LOG` configuration. Do not guess a Hostinger path or enable public debug output. Ask the host for the actual readable log path if needed. This release does not change either setting. Scheduler observations do not require the log.
3. Apply Anbe D1 migration `0005_operational_monitor.sql`, build the dashboard, and deploy the Anbe Worker with existing variables preserved. `OPERATIONAL_MONITOR_ENABLED=true` enables observations; false/absent disables the new checks without disabling homepage monitoring. Katalyst and Missus are separate deployments and are not changed by this release.
4. Verify plugin version and contract, then a real scheduled observation. The dashboard must show per-source coverage; unavailable logs must remain visibly unavailable. Test failures in an isolated environment, never by corrupting the live database or stopping the live scheduler.

Until plugin 0.1.8 is installed, an older/missing endpoint yields unavailable evidence, not a healthy result. If WordPress cannot boot, the Worker can still detect the public outage but cannot retrieve fresh internal evidence. A separate hosting log integration would be needed for that case; none is included here.

## Verification scope

PHP fixtures cover fresh/stale/invalid error timestamps, privacy, bounded log reads, source isolation, and queue identities. Worker tests cover per-source state, threshold/recipient behavior, retries, stale/duplicate observations, unknown preservation, log rotation, recurrence, authenticated detail, and independence from full-scan baselines. A native Miniflare/D1 scheduled test exercises database alert delivery with a simulated provider, WordPress unavailability, clearing, recurrence, and the independent homepage alert. These do not reproduce the original initiating database defect or prove delivery of the new notification to a real inbox.

Reference contracts: [Action Scheduler query API](https://actionscheduler.org/api/), [WordPress cron representation](https://developer.wordpress.org/reference/functions/_get_cron_array/), [MySQL Commands out of sync](https://dev.mysql.com/doc/refman/8.0/en/commands-out-of-sync.html). Implementation uses the installed Action Scheduler public query API and directly reads the versioned cron option to avoid legacy upgrade side effects.
