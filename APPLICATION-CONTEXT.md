# Jen and Automattic application context

Recorded: 2026-09-21. Target: Brian's preparation to reapply for Automattic's Happiness Engineer role from January 2027 onward, when ready.

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

**AI Diagnostic Bridge:** authenticated WordPress diagnostic APIs, safe evidence, AI-assisted development and investigation, reproducible tests, and customer-facing explanations. Today the plugin is deterministic and does not call an AI provider. The current evidence includes an assistant consuming authenticated local endpoints; the planned Worker/AI/dashboard integration is not shipped.

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

The local WordPress site and isolated SQLite test snapshots are working. A real small WooCommerce test store and deliberate break/diagnose/repair exercises remain outstanding. The journal contains a practice backlog and reusable case template. Keep the software implementation sequence in PLAN.md, and track support practice alongside it rather than treating code completion as proof of support outcomes.
