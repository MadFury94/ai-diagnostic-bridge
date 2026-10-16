import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { encode, encryptToken } from '../src/security'

it('runs independent operational checks on the native five-minute handler and survives a WordPress outage', async () => {
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' })
  const key = encode(crypto.getRandomValues(new Uint8Array(32)))
  const token = await encryptToken('fixture-token', key, 'https://anbenigeria.com')
  const emails: { subject: string; text: string }[] = []
  const time = Math.floor(Date.now() / 300000) * 300000
  let unavailable = false, failing = true, observed = time / 1000
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['DB'], bindings: { ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', CREDENTIAL_KEY: key, OPERATIONAL_MONITOR_ENABLED: 'true', RESEND_API_KEY: 'fixture-resend', ALERT_EMAIL_FROM: 'alerts@example.com', DASHBOARD_ORIGIN: 'https://dashboard.example' }, outboundService: async request => {
    const url = new URL(request.url)
    if (url.hostname === 'api.resend.com') { emails.push(await request.json() as { subject: string; text: string }); return Response.json({ id: 'email-id' }) }
    if (url.pathname === '/') return new Response('Unavailable', { status: 503 })
    if (url.pathname.endsWith('/operations')) {
      if (unavailable) return new Response('WordPress unavailable', { status: 503 })
      return Response.json({ success: true, plugin: { name: 'AI Diagnostic Bridge' }, check: { status: 'ok' }, findings: [], metadata: { contract_version: 1, observed_at: Math.floor(Date.now() / 1000), sources: { database_log: { status: failing ? 'fail' : 'pass', count: failing ? 1 : 0, latest_at: failing ? observed : 0, scheduler_count: 0, window_seconds: 900, truncated: false, log_id: 'c'.repeat(64), bytes_read: 1000 }, wp_cron: { status: 'unknown' }, action_scheduler: { status: 'unknown' } } } })
    }
    throw new Error('Unexpected scan request: operational checks must not request SEO endpoints')
  } }))
  try {
    const db = await runtime.getD1Database('DB')
    for (const migration of ['0001_sites.sql', '0003_critical_email_alerts.sql', '0004_availability.sql', '0005_operational_monitor.sql']) {
      for (const sql of readFileSync('migrations/' + migration, 'utf8').split(';').filter(value => value.trim())) await db.prepare(sql).run()
    }
    await db.prepare("INSERT INTO sites (id,name,url,ciphertext,iv,verified_at) VALUES ('default','Test','https://anbenigeria.com',?,?,'now')").bind(token.ciphertext, token.iv).run()
    const worker = await runtime.getWorker()
    const cron = '0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
    await worker.scheduled({ cron, scheduledTime: new Date(time) })
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toContain('Commands out of sync')
    expect(emails[0].text).not.toContain('fixture-token')
    // Same bucket must not create another notification.
    await worker.scheduled({ cron, scheduledTime: new Date(time + 1) })
    expect(emails).toHaveLength(1)
    unavailable = true
    await worker.scheduled({ cron, scheduledTime: new Date(time + 300000) })
    expect(emails).toHaveLength(2) // independent homepage outage
    expect(await db.prepare("SELECT active FROM operational_states WHERE source = 'database_log'").first('active')).toBe(1)
    expect(await db.prepare("SELECT status FROM operational_states WHERE source = 'database_log'").first('status')).toBe('unknown')
    unavailable = false; failing = false
    await worker.scheduled({ cron, scheduledTime: new Date(time + 600000) })
    expect(await db.prepare("SELECT active FROM operational_states WHERE source = 'database_log'").first('active')).toBe(0)
    failing = true; observed = time / 1000 + 900
    await worker.scheduled({ cron, scheduledTime: new Date(time + 900000) })
    expect(emails).toHaveLength(3)
  } finally { await runtime.dispose() }
}, 60000)
