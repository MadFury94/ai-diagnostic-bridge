# Changelog

## 0.1.9 - Plugin log setup

- Add administrator log setup under Settings > AI Diagnostic Bridge, with automatic detection of configured WordPress/PHP file logging and readable/missing/unreadable status.
- Allow a nonce-protected, administrator-only override pointing to an existing readable local file; clearing it restores automatic detection. Preserve credentials and respect server-configured overrides.
- Keep paths and raw log content out of diagnostic responses. No debug mode, log creation, permissions, or server configuration changes are made automatically. Existing Worker contract is unchanged.

## 0.1.8 - Operational evidence and Anbe monitoring

- Add an authenticated read-only operations endpoint for fresh database Commands out of sync signatures, overdue WordPress events, and pending/in-progress Action Scheduler observations.
- Add independent five-minute Worker state and high-severity notifications, duplicate suppression, source-specific unknown handling, and authenticated evidence details. A full diagnostic failure does not suppress these observations.
- Add dashboard coverage/status visibility and D1 migration 0005. Plugin installation and readable log configuration are required for full coverage; no database repair or logging configuration changes are performed. See OPERATIONAL-MONITORING.md and SUPPORT-JOURNAL.md for installation and deployment status.

## Worker public-page diagnostics - Anbe deployed 2026-10-14

- Add bounded server-configured public page, internal-link and image HTTP checks, validated redirects, safe stable findings and explicit incomplete coverage.
- Integrate all three dashboards and authenticated notification detail; preserve the existing complete-scan baseline and human-reviewed AI explanations.
- Document local failure/repair evidence, configuration, exclusions and deployment acceptance in PUBLIC-PAGE-CHECKS.md. WordPress plugin remains 0.1.7; Anbe deployment and live scan are verified. Other clients remain pending.

## Unreleased

- Plugin 0.1.7 accepts the dedicated `X-AI-Diagnostic-Token` header for headless/JWT compatibility, preserving Bearer authentication for existing clients. Both paths enforce hashed credentials, revocation and rate limiting. Missus Worker uses the dedicated header.

- Kept the plugins diagnostic status as `ok` when findings are informational only; warnings now require a medium, high, or critical finding.

## 0.1.5

- Added PHP error, REST API, performance, security, and WooCommerce diagnostics.
- Added direct REST routes for the new diagnostic modules.

## 0.1.4

- Registered admin-post credential actions before `admin-post.php` dispatches them.

## 0.1.3

- Opted credential-management forms out of WordPress client-side view transitions.

## 0.1.2

- Fixed the admin settings template's namespaced plugin version reference.

## 0.1.1

- Added the Settings → AI Diagnostic Bridge credential-management screen.
- Added authenticated REST routes for the initial diagnostic modules.

## 0.1.0 (unreleased)

- Added standalone plugin bootstrap and lifecycle checks.
- Added structured response and finding primitives.
- Added hashed credential generation, Bearer authentication, revocation, and rate-limit foundation.
- Added bounded diagnostic activity logging.

## Anbe availability alerts - 2026-10-15

- Expanded outage and recovery subjects with hostname/result, and bodies with explanations, UTC check window, confirmation criteria, troubleshooting, cadence, recovery expectations, and coverage limits.
- Added authenticated GET/POST /api/availability and shared five-minute buckets to prevent repeated checks from counting as separate failures.
- Confirmed live scheduled HTTP 503 outage delivery to the user's inbox; recovery was observed and its email accepted by the provider.
- Recorded the user's reported three-day/client-call experience alongside the approximately five-minute deliberate HTTP 503 test. This does not establish faster detection of the original WooCommerce database/cron incident, a like-for-like comparison, repair time, or a detection guarantee.

## WooCommerce coverage audit - 2026-10-15

- Added INCIDENT-DETECTION-PLAN.md with existing coverage, missing evidence, acceptance tests, and implementation order for content correctness, database structure/consistency, and scheduler execution health. These checks are not implemented by this documentation change.
