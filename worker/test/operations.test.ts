import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { checkOperations, readOperation, recordOperation } from '../src/operations'
import { defaultAlerts, recordCompletedScan, sendFindingAlerts } from '../src/alerts'
import { sanitizeEnvelope } from '../src/bridge'
import { createSession, encode, encryptToken } from '../src/security'
import worker from '../src/index'

let db: DatabaseSync, env: Env, time: number
let outbound: ReturnType<typeof vi.fn<typeof fetch>>
const site = { ...defaultAlerts, id: 'default', name: 'Test', url: 'https://anbenigeria.com' }
const queue = (due: number, fingerprint = 'a'.repeat(64)) => ({ status: 'observed', count: 1, oldest_due: due, fingerprint, truncated: false })
const clearQueue = { status: 'observed', count: 0, oldest_due: 0, fingerprint: '', truncated: false }
const logFailure = () => ({ status: 'fail', count: 2, latest_at: time / 1000, scheduler_count: 1, window_seconds: 900, truncated: false, log_id: 'c'.repeat(64), bytes_read: 1000 })
const clearLog = { status: 'pass', count: 0, latest_at: 0, scheduler_count: 0, window_seconds: 900, truncated: false, log_id: 'c'.repeat(64), bytes_read: 1000 }
beforeEach(() => {
  time = Math.floor(Date.now() / 300000) * 300000
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const migration of ['0001_sites.sql', '0003_critical_email_alerts.sql', '0004_availability.sql', '0005_operational_monitor.sql']) db.exec(readFileSync('migrations/' + migration, 'utf8'))
  db.exec("INSERT INTO sites (id,name,url,ciphertext,iv,verified_at) VALUES ('default','Test','https://anbenigeria.com','cipher','iv','now')")
  env = {
    OPERATIONAL_MONITOR_ENABLED: 'true', ALLOWED_SITE_ORIGIN: site.url,
    RESEND_API_KEY: 'test-resend', ALERT_EMAIL_FROM: 'alerts@example.com', DASHBOARD_ORIGIN: 'https://dashboard.example',
    DB: {
      prepare: (sql: string) => {
        const stmt = db.prepare(sql); let args: (string | number)[] = []
        const result = { bind: (...values: (string | number)[]) => { args = values; return result }, first: async () => stmt.get(...args) ?? null, run: async () => stmt.run(...args), runSync: () => stmt.run(...args) }
        return result
      },
      batch: async (statements: { runSync: () => unknown }[]) => {
        db.exec('BEGIN')
        try { const values = statements.map(statement => statement.runSync()); db.exec('COMMIT'); return values }
        catch (error) { db.exec('ROLLBACK'); throw error }
      },
    },
  } as unknown as Env
  outbound = vi.fn<typeof fetch>(async () => Response.json({ id: 'provider-id' }))
  vi.stubGlobal('fetch', outbound)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { db.close(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const pending = () => Number(db.prepare('SELECT count(*) AS n FROM finding_email_alerts WHERE sent_at IS NULL').get()?.n)

it('alerts on a fresh database failure immediately, deduplicates, and rearms only after a valid clear', async () => {
  await recordOperation(env, site, 'database_log', logFailure(), time)
  expect(pending()).toBe(1)
  await recordOperation(env, site, 'database_log', logFailure(), time)
  await recordOperation(env, site, 'database_log', logFailure(), time - 300000)
  expect(pending()).toBe(1)
  await sendFindingAlerts(env, site)
  const body = JSON.parse(String(outbound.mock.calls[0][1]?.body))
  expect(body.subject).toContain('Commands out of sync')
  expect(body.text).toContain('does not prove table corruption')
  time += 300000
  await recordOperation(env, site, 'database_log', { status: 'unknown' }, time)
  expect((await readOperation(env, site.id, 'database_log')).available).toBe(false)
  expect(db.prepare('SELECT active FROM operational_states').get()?.active).toBe(1)
  time += 900000
  await recordOperation(env, site, 'database_log', clearLog, time)
  expect((await readOperation(env, site.id, 'database_log')).finding).toBeNull()
  time += 300000
  await recordOperation(env, site, 'database_log', logFailure(), time)
  expect(pending()).toBe(1)
})

it('requires 15 minutes of continuous observations of the same overdue task', async () => {
  const observed = queue(time / 1000 - 600)
  for (let tick = 0; tick < 3; tick++) {
    await recordOperation(env, site, 'action_scheduler', observed, time)
    expect(pending()).toBe(0)
    time += 300000
  }
  await recordOperation(env, site, 'action_scheduler', observed, time)
  expect(pending()).toBe(1)
  time += 300000
  await recordOperation(env, site, 'action_scheduler', queue(time / 1000 - 600, 'b'.repeat(64)), time)
  expect(pending()).toBe(0)
  expect((await readOperation(env, site.id, 'action_scheduler')).finding).toBeNull()
})

it('does not infer failure from disabled cron, historic failures, or an unavailable/empty scheduler', async () => {
  await recordOperation(env, site, 'wp_cron', { ...clearQueue, cron_disabled: true, failed: 83 }, time)
  expect(pending()).toBe(0)
  expect((await readOperation(env, site.id, 'wp_cron')).available).toBe(true)
  await recordOperation(env, site, 'action_scheduler', { status: 'unknown' }, time)
  expect((await readOperation(env, site.id, 'action_scheduler')).available).toBe(false)
})

it('resets continuity after unavailable observations or long gaps', async () => {
  const observed = queue(time / 1000 - 600)
  await recordOperation(env, site, 'wp_cron', observed, time)
  time += 300000; await recordOperation(env, site, 'wp_cron', { status: 'unknown' }, time)
  time += 300000; await recordOperation(env, site, 'wp_cron', observed, time)
  time += 900000; await recordOperation(env, site, 'wp_cron', observed, time)
  expect(pending()).toBe(0)
})

it('does not clear an incident on malformed data, truncated negatives or old log timestamps', async () => {
  await recordOperation(env, site, 'database_log', logFailure(), time)
  for (const raw of [{ ...clearLog, truncated: true }, { ...logFailure(), latest_at: time / 1000 - 3600 }, { ...clearLog, count: -1 }]) {
    time += 300000; await recordOperation(env, site, 'database_log', raw, time)
    expect(db.prepare('SELECT active FROM operational_states').get()?.active).toBe(1)
    expect((await readOperation(env, site.id, 'database_log')).available).toBe(false)
  }
})

it('full diagnostic baselines cannot erase independent pending notifications', async () => {
  await recordOperation(env, site, 'database_log', logFailure(), time)
  await recordCompletedScan(env, site, [], time, new Date(time).toISOString())
  await recordCompletedScan(env, site, [], time + 1, new Date(time + 1).toISOString())
  expect(pending()).toBe(1)
})

it('does not declare a rotated or truncated-away log recovered immediately', async () => {
  await recordOperation(env, site, 'database_log', logFailure(), time)
  const rotated = { ...clearLog, log_id: 'd'.repeat(64), bytes_read: 0 }
  time += 300000; await recordOperation(env, site, 'database_log', rotated, time)
  expect((await readOperation(env, site.id, 'database_log')).available).toBe(false)
  expect(db.prepare('SELECT active FROM operational_states').get()?.active).toBe(1)
  for (let i = 0; i < 3; i++) { time += 300000; await recordOperation(env, site, 'database_log', rotated, time) }
  expect((await readOperation(env, site.id, 'database_log')).finding).toBeNull()
})

it('honors disabled recipients and severity, retries with stable identity, and deletes obsolete pending mail', async () => {
  await recordOperation(env, { ...site, alert_email: '' }, 'database_log', logFailure(), time)
  expect(pending()).toBe(0)
  time += 300000; await recordOperation(env, site, 'database_log', clearLog, time)
  time += 300000; await recordOperation(env, { ...site, alert_severity: 'critical' }, 'database_log', logFailure(), time)
  expect(pending()).toBe(0)
  time += 300000; await recordOperation(env, site, 'database_log', clearLog, time)
  time += 300000; await recordOperation(env, site, 'database_log', logFailure(), time)
  outbound.mockResolvedValueOnce(new Response('', { status: 503 }))
  await sendFindingAlerts(env, site)
  db.exec('UPDATE finding_email_alerts SET lease_until = 0')
  await sendFindingAlerts(env, site)
  expect(outbound.mock.calls[0][1]?.headers).toEqual(outbound.mock.calls[1][1]?.headers)
  time += 300000; await recordOperation(env, site, 'database_log', clearLog, time)
  time += 300000; await recordOperation(env, site, 'database_log', logFailure(), time)
  expect(pending()).toBe(1)
  time += 300000; await recordOperation(env, { ...site, alert_email: 'new@example.com' }, 'database_log', { status: 'unknown' }, time)
  expect(pending()).toBe(0)
})

it('sanitizes operational evidence and permits each source to succeed independently', async () => {
  env.CREDENTIAL_KEY = encode(crypto.getRandomValues(new Uint8Array(32)))
  const encrypted = await encryptToken('test-token', env.CREDENTIAL_KEY, site.url)
  const payload = { success: true, plugin: { name: 'AI Diagnostic Bridge' }, check: { status: 'ok' }, findings: [], metadata: { contract_version: 1, observed_at: Math.floor(Date.now() / 1000), sources: { database_log: { ...logFailure(), sql: 'PRIVATE_QUERY' }, wp_cron: { status: 'unknown' }, action_scheduler: clearQueue } } }
  expect(JSON.stringify(sanitizeEnvelope(payload, []))).not.toContain('PRIVATE_QUERY')
  outbound.mockResolvedValueOnce(Response.json(payload))
  await checkOperations(env, { ...site, ...encrypted }, time)
  expect(outbound.mock.calls.filter(call => String(call[0]).includes('api.resend.com'))).toHaveLength(1)
  expect((await readOperation(env, site.id, 'wp_cron')).available).toBe(false)
  expect((await readOperation(env, site.id, 'action_scheduler')).available).toBe(true)
})

it('protects observations and notification detail and refuses to call unknown evidence cleared', async () => {
  Object.assign(env, { SESSION_KEY: 'session-key', DASHBOARD_PASSWORD: 'password', CREDENTIAL_KEY: 'invalid', API_LIMIT: { limit: async () => ({ success: true }) } })
  expect((await worker.fetch(new Request('https://dashboard.example/api/operations'), env)).status).toBe(401)
  await recordOperation(env, site, 'database_log', logFailure(), time)
  const id = db.prepare('SELECT id FROM finding_email_alerts').get()?.id
  const headers = { Cookie: '__Host-aidb_session=' + await createSession(env.SESSION_KEY) }
  let result = await worker.fetch(new Request(`https://dashboard.example/api/finding-alerts/${id}`, { headers }), env)
  expect(result.status).toBe(200)
  expect((await result.json() as { finding: { id: string } }).finding.id).toBe('operational-database_log')
  time += 300000; await recordOperation(env, site, 'database_log', { status: 'unknown' }, time)
  result = await worker.fetch(new Request(`https://dashboard.example/api/finding-alerts/${id}`, { headers }), env)
  expect(result.status).toBe(503)
})
