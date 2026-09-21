# Changelog

## Unreleased

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
