# AI Diagnostic Bridge

Standalone WordPress plugin project for secure, deterministic WordPress support and SEO diagnostics. The plugin is the evidence layer in a future `React → Cloudflare Worker → Cloudflare AI → WordPress` architecture; it contains no AI provider integration and does not automatically change WordPress.

Implementation is tracked in [PLAN.md](PLAN.md). Version `0.1.5` includes the authenticated REST foundation, admin credential-management screen, and initial core diagnostics.

## Contract tests

The `tests/` directory contains PHPUnit tests for the stable response envelope, allowed status and severity values, finding fields, and safe error responses. Run them inside a WordPress PHPUnit environment with PHPUnit installed:

```bash
phpunit -c phpunit.xml.dist
```

The tests require WordPress so the plugin sanitization helpers and `WP_Error` implementation are available. They do not call external APIs or expose stored credentials.
