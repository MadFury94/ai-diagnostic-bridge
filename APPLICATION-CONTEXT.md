# Jen and Automattic application context

Recorded: 2026-09-21. Implementation context reconciled: 2026-10-13. Target: Brian's preparation to reapply for Automattic's Happiness Engineer role from January 2027 onward, when ready.

## Why this project exists

Jen's feedback said the bar has moved toward hands-on AI work, real WordPress and WooCommerce experience, and strong troubleshooting ability. The application should name projects and tools, explain what happened when they were used, and show how Brian's understanding improved.

AI Diagnostic Bridge is a direct response to that guidance: a reusable support tool that an AI assistant can use to inspect WordPress safely and turn technical evidence into a clear customer explanation and next step. Its support value must be demonstrated through use, not inferred from feature count.

Jen specifically encouraged four things:

1. Build a support solution that speeds troubleshooting, identifies common problems, or turns a vague customer report into a clear next step.
2. Record specific results: what was broken or slow, what changed, how long it took, what failed during development, and how it was fixed.
3. Verify AI output and understand why fixes work well enough to explain them to a customer.
4. Set up a small WordPress/WooCommerce test store, deliberately break it, diagnose the failures, and repair them.

Source: Brian's saved correspondence at `D:\My Web Sites\missus\JEN_FEEDBACK.md`, read on 2026-09-21. January 2027 comes from that correspondence. The related public guidance is Jen's [Preparing for the Happiness Engineer role](https://happinessengineer.blog/2026/04/21/preparing-for-the-happiness-engineer-role/), published April 21, 2026. The public article encourages practical site building, troubleshooting, support communication, AI-assisted building, and verification. Private correspondence and unrelated personal details should not be copied into public application material.

## How the two projects connect

**AI Diagnostic Bridge:** authenticated WordPress diagnostic APIs, safe evidence, AI-assisted development and investigation, reproducible tests, and customer-facing explanations. Today the plugin is deterministic and does not call an AI provider. The recorded shipped baseline is plugin 0.1.7 plus separate Anbe, Katalyst and Missus Worker dashboards, manual/hourly scans, finding alerts, and click-only AI explanations with human verification/correction. October 6 records include observed Anbe and Missus accessibility findings. These deployment records were not independently reverified in the October 13 implementation session. The bounded public-page/link/image checks were deployed to Anbe and its live scan passed on October 14; Katalyst/Missus deployment and new-error email acceptance remain pending. See PUBLIC-PAGE-CHECKS.md.

**Missus:** Brian's separate headless Next.js WooCommerce storefront, with an admin panel and Paystack payments. This context is supplied by Brian and the saved feedback; this documentation session did not re-audit the storefront implementation. Missus must remain unchanged during standalone plugin development.

Connect the projects through verified cases, not shared branding alone: an observed storefront symptom, its WordPress/WooCommerce cause, the diagnostic evidence, the repair, and a customer explanation. The saved feedback mentions an order-authentication gap and a payment/webhook failure as possible Missus examples. Treat those as leads until the relevant code, commits, and validation records have been reviewed; do not invent their details or claim the bridge diagnosed them.

## Evidence standards through January 2027

- Keep [SUPPORT-JOURNAL.md](SUPPORT-JOURNAL.md) updated after each meaningful troubleshooting session, alongside task status in [PLAN.md](PLAN.md) and continuation notes in [PROGRESS.md](PROGRESS.md).
- Record symptom, baseline, hypothesis, evidence, AI suggestion, verification/correction, root cause, repair, before/after result, and a customer-ready explanation.
- Record actual elapsed investigation/repair time and support effort when measured. Mark missing measurements as **not measured**. Test runtime is not time saved.
- Separate local HTTP observations, fixture tests, source review, prior handoff reports, and real-store validation. A fixture pass does not prove a real WooCommerce store is repaired.
- Separate AI-generated explanations from Brian's own demonstrated understanding. Add Brian's explanation in his own words after he has reproduced or reviewed the case; do not attribute agent work to him as an independently completed exercise.
- Keep credentials, request headers, customer/order/payment data, and private logs out of journals and exported evidence. Use synthetic data and safe summaries. Never copy `.env` into evidence.
- Continue building evidence; the January application target is not a claim that the plugin is finished. No application submission, email to Jen, or public publication is implied by maintaining these documents.

## Remaining practical evidence

The local WordPress/SQLite WooCommerce store and isolated test snapshots are working. SUPPORT-JOURNAL.md records September 22 synthetic checkout, checkout-page, shipping and payment-gateway exercises, plus read-only Anbe observations. The SQLite stock-reservation workaround limits that checkout evidence; it is not a general payment or concurrency validation. A dedicated test-mode payment environment, further exercises, and Brian's independent reproduction/explanations remain follow-up work. Track support practice alongside PLAN.md rather than treating code completion as proof of support outcomes.

## Diagnostic expansion and support evidence - 2026-10-13

The next implementation phase expands observable failures through bounded public HTTP checks, followed later by browser/mobile/accessibility checks and synthetic shopping journeys. It preserves the deterministic WordPress plugin, protected credentials, separate backend/frontend attribution, and human-reviewed AI interpretations.

Use the local broken-link/image failure-and-repair exercise as fixture evidence only. Brian's independent reproduction, explanation, extension of the existing synthetic WooCommerce setup for test-mode payments, and live acceptance of the new checks remain separate tasks. Existing recorded real-site cases remain valid historical evidence and are not replaced by this exercise. More findings alone do not establish support value; document verified cause, repair, outcome and actual timing (or not measured).

## 2026-10-14 - Independent Anbe availability monitoring

Added a separate Cloudflare cron (*/5 * * * *) that checks the public homepage without WordPress credentials or a successful diagnostic scan. Hourly diagnostic scans remain unchanged. Two consecutive failed checks within 15 minutes open an outage; the next HTTP 2xx closes it and queues recovery. Normal detection is about 5-10 minutes after failure. Timeout is 10 seconds, with at most three same-origin redirects. HTTP errors (including blocked 403/429), unsafe redirects, transport errors and timeouts count as failed checks, not proof that every visitor is offline. A healthy initial check sends no email.

Notifications use the existing recipient and Resend settings, independent of finding severity. Blank recipient disables mail. D1 migration 0004 stores timestamp-guarded state and notification events; duplicate/stale ticks do not advance the failure streak. Delivery uses leases, stable provider idempotency keys and retries on subsequent checks; events expire after 23 hours. The check requests cache revalidation but a CDN may still return cached success. It cannot detect broken page content returning 200, plugin deactivation alone, or an outage of Cloudflare/the monitoring Worker itself. Other clients are unchanged.
