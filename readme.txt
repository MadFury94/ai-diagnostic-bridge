=== AI Diagnostic Bridge ===
Contributors: brianazukaeme
Requires at least: 6.5
Requires PHP: 8.1
Stable tag: 0.1.6
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

== Description ==

Read-only, deterministic WordPress support and SEO diagnostics. The plugin reports structured evidence and does not edit content, change settings, install or update plugins, or call an AI provider.

== Installation ==

1. Upload the `ai-diagnostic-bridge` directory to `wp-content/plugins/`.
2. Activate AI Diagnostic Bridge in WordPress admin.
3. Open Settings -> AI Diagnostic Bridge and generate a credential.
4. Store the one-time credential in a server-side secret store and send it as `Authorization: Bearer TOKEN`.

== REST API ==

The namespace is `/wp-json/ai-diagnostic/v1/`. Core routes include `/site`, `/health`, `/plugins`, `/themes`, `/errors`, `/rest-api`, `/performance`, `/security`, and `/woocommerce`. SEO routes include `/seo/post/{id}`, `/seo/posts`, `/seo/issues`, `/seo/site`, `/images/issues`, and `/links/issues`. Collection page sizes are bounded to 1-50. Combined diagnostic GET and POST requests accept an allowlisted check list.

== Security ==

Credentials are random tokens stored only as password hashes. Admin actions require `manage_options` and WordPress nonces. Failed authentication is rate-limited. Activity logs exclude headers, tokens, request bodies, query values, and response contents. Diagnostic input is allowlisted and bounded.

== AI boundary ==

This plugin supplies deterministic evidence only. It contains no AI provider integration and performs no AI-triggered writes. Any future explanation or repair workflow must remain human reviewed.

== Limitations ==

WooCommerce present behavior is fixture-tested, with separate manual Anbe break/repair evidence. The disposable SQLite environment has a stock-reservation limitation. Optional internal-link verification is not implemented; ordinary link analysis does not crawl or make unbounded requests. Vulnerability checks use the public keyless WPVulnerability feed and leave unavailable or incomplete results unknown. The plugin does not detect general update bugs or prove exploitation, compatibility, checkout success, or indexing.

See README.md, PLAN.md, PROGRESS.md, and SUPPORT-JOURNAL.md for endpoint examples, troubleshooting, tests, and implementation evidence.

