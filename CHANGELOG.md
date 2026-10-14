# Changelog

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
