import * as publicScanner from '../src/public-scan'
﻿import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCompletedScan, sendFindingAlerts, defaultAlerts, parseAlertSettings, type ScanFinding } from '../src/alerts'
import { scanSite } from '../src/scan'
import { sanitizeEnvelope } from '../src/bridge'
import worker from '../src/index'
import { createSession, encode, encryptToken } from '../src/security'

const critical = { id: 'critical-test', severity: 'critical', title: 'Critical issue', route: 'health' }
const site = () => ({ ...defaultAlerts, id: 'default', name: 'Test Site', url: 'https://anbenigeria.com' })
let db: DatabaseSync
let env: Env
let outbound: ReturnType<typeof vi.fn<typeof fetch>>
let clock: number
const response = (findings: ScanFinding[] = [], metadata = {}, status = 'warning') => ({ success: true, plugin: { name: 'AI Diagnostic Bridge' }, check: { status }, findings: findings.map(finding => ({ ...finding, category: 'security', source: 'health', message: 'PRIVATE_MESSAGE', evidence: { title: 'PRIVATE_EVIDENCE' } })), metadata })
beforeEach(() => {
  clock = Date.now()
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync('migrations/0001_sites.sql', 'utf8'))
  db.exec(readFileSync('migrations/0003_critical_email_alerts.sql', 'utf8'))
  db.exec("INSERT INTO sites (id,name,url,ciphertext,iv,verified_at) VALUES ('default','Test','https://anbenigeria.com','cipher','iv','now')")
  env = {
    RESEND_API_KEY: 'private-resend-key', ALERT_EMAIL_FROM: 'alerts@example.com', DASHBOARD_ORIGIN: 'https://dashboard.example',
    DB: {
      prepare: (sql: string) => {
        const stmt = db.prepare(sql)
        let args: (string | number)[] = []
        const result = { bind: (...values: (string | number)[]) => { args = values; return result }, first: async () => stmt.get(...args) ?? null, run: async () => stmt.run(...args), runSync: () => stmt.run(...args) }
        return result
      },
      batch: async (statements: { runSync: () => unknown }[]) => {
        db.exec('BEGIN')
        try { const results = statements.map(statement => statement.runSync()); db.exec('COMMIT'); return results }
        catch (error) { db.exec('ROLLBACK'); throw error }
      },
    },
  } as unknown as Env
  outbound = vi.fn<typeof fetch>(async () => Response.json({ id: 'email-id' }))
  vi.stubGlobal('fetch', outbound)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { db.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const scan = async (findings: ScanFinding[], connection = site()) => {
  await recordCompletedScan(env, connection, findings, ++clock, '2026-10-02T12:00:00.000Z')
  await sendFindingAlerts(env, connection)
}

 describe('completed scan notifications', () => {
  it('silently baselines, sends a new finding once, stays silent across days, and sends after clear/reappear', async () => {
    await scan([{ ...critical, id: 'existing' }])
    expect(outbound).not.toHaveBeenCalled()
    await scan([critical, { ...critical, id: 'existing' }])
    expect(outbound).toHaveBeenCalledOnce()
    clock += 7 * 86400000
    await scan([critical, { ...critical, id: 'existing' }])
    expect(outbound).toHaveBeenCalledOnce()
    await scan([])
    await scan([critical])
    expect(outbound).toHaveBeenCalledTimes(2)
  })
  it('sends only the requested summary and authenticated opaque link, never message or evidence', async () => {
    await scan([])
    const sanitized = sanitizeEnvelope(response([critical]), [])
    await scan(sanitized.findings.map(value => ({ ...value as unknown as ScanFinding, route: 'health' })))
    const [endpoint, options] = outbound.mock.calls[0]
    expect(endpoint).toBe('https://api.resend.com/emails')
    const email = JSON.parse(String(options?.body))
    expect(email).toMatchObject({ to: ['webdeveloperbrian@gmail.com'], subject: 'New diagnostic finding' })
    expect(email.text).toMatch(/^Site: Test Site \(anbenigeria\.com\)\nFinding: Critical issue\nSeverity: critical\nDetected: 2026-10-02T12:00:00.000Z\nView finding \(sign-in required\): https:\/\/dashboard.example\/findings\?alert=[0-9a-f-]{36}$/)
    expect(JSON.stringify(email)).not.toMatch(/PRIVATE_MESSAGE|PRIVATE_EVIDENCE|critical-test|private-resend-key|wp-json|Bearer/)
    expect(email).not.toHaveProperty('html')
  })
  it('redacts known secrets and removes control characters from allowed labels', async () => {
    await scan([])
    await recordCompletedScan(env, { ...site(), name: 'Site SECRET\nInjected' }, [{ ...critical, title: 'SECRET https://example.com/?token=x' }], ++clock, '2026-10-02T12:00:00Z', ['SECRET'])
    await sendFindingAlerts(env, site())
    expect(String(outbound.mock.calls[0][1]?.body)).not.toMatch(/SECRET|token=x/)
  })
  it('defaults to high and critical and permits per-connection recipient/threshold', async () => {
    await scan([])
    await scan([{ ...critical, id: 'medium', severity: 'medium' }, { ...critical, severity: 'high' }], { ...site(), alert_email: 'client@example.com' })
    expect(outbound).toHaveBeenCalledOnce()
    expect(JSON.parse(String(outbound.mock.calls[0][1]?.body)).to).toEqual(['client@example.com'])
    await scan([{ ...critical, id: 'medium', severity: 'medium' }], { ...site(), alert_severity: 'info' })
    expect(outbound).toHaveBeenCalledOnce() // Previously seen ID stays silent.
  })
  it('deduplicates concurrent baseline commits and email claims', async () => {
    await scan([])
    await Promise.all(Array.from({ length: 5 }, () => recordCompletedScan(env, site(), [critical], ++clock, '2026-10-02T12:00:00Z')))
    await Promise.all(Array.from({ length: 5 }, () => sendFindingAlerts(env, site())))
    expect(outbound).toHaveBeenCalledOnce()
  })
  it('does not let a late older scan replace the newer baseline', async () => {
    await scan([])
    await scan([critical])
    await recordCompletedScan(env, site(), [], clock - 1, '2026-10-02T12:00:00Z')
    await scan([critical])
    expect(outbound).toHaveBeenCalledOnce()
  })
  it.each([429, 500, 'network'])('retries %s with a stable short email and idempotency key', async failure => {
    await scan([])
    vi.useFakeTimers()
    outbound.mockImplementationOnce(async () => {
      if (failure === 'network') throw new Error('private error')
      return new Response('private response', { status: Number(failure) })
    })
    await scan([critical])
    await scan([critical])
    expect(outbound).toHaveBeenCalledOnce()
    vi.setSystemTime(Date.now() + 60000)
    await scan([{ ...critical, title: 'Changed wording' }])
    expect(outbound).toHaveBeenCalledTimes(2)
    expect(outbound.mock.calls[0][1]?.body).toEqual(outbound.mock.calls[1][1]?.body)
    expect(outbound.mock.calls[0][1]?.headers).toEqual(outbound.mock.calls[1][1]?.headers)
  })
  it('does not send old findings after provider settings are enabled', async () => {
    delete env.RESEND_API_KEY
    await scan([critical])
    env.RESEND_API_KEY = 'private-resend-key'
    await scan([critical])
    expect(outbound).not.toHaveBeenCalled()
  })
  it('validates preferences', () => {
    expect(parseAlertSettings(defaultAlerts)).toEqual(defaultAlerts)
    expect(() => parseAlertSettings({ ...defaultAlerts, alert_email: 'x@example.com\r\nBcc: x' })).toThrow()
    expect(() => parseAlertSettings({ ...defaultAlerts, alert_severity: 'unknown' })).toThrow()
  })
  it('uses the strongest occurrence when multiple pages share a finding ID', async () => {
    await scan([])
    await scan([critical, { ...critical, severity: 'low', route: 'seo/post/42' }])
    expect(outbound).toHaveBeenCalledOnce()
    expect(JSON.parse(String(outbound.mock.calls[0][1]?.body)).text).toContain('Severity: critical')
  })
  it('refuses dashboard origins containing credentials or a non-HTTPS scheme', async () => {
    await scan([])
    await recordCompletedScan(env, site(), [critical], ++clock, '2026-10-02T12:00:00Z')
    for (const origin of ['http://dashboard.example', 'https://user:secret@dashboard.example', 'https://dashboard.example/?token=x']) {
      env.DASHBOARD_ORIGIN = origin
      await sendFindingAlerts(env, site())
    }
    expect(outbound).not.toHaveBeenCalled()
  })
  it('requires authentication for an email detail link and returns current evidence only after login', async () => {
    await scan([]); await scan([critical])
    const id = String(db.prepare('SELECT id FROM finding_email_alerts').get()?.id)
    const key = encode(crypto.getRandomValues(new Uint8Array(32)))
    const encrypted = await encryptToken('wordpress-token', key, 'https://anbenigeria.com')
    db.prepare('UPDATE sites SET ciphertext = ?, iv = ?').run(encrypted.ciphertext, encrypted.iv)
    Object.assign(env, { CREDENTIAL_KEY: key, SESSION_KEY: 'session-key', DASHBOARD_PASSWORD: 'password', ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', API_LIMIT: { limit: async () => ({ success: true }) } })
    const url = `https://dashboard.example/api/finding-alerts/${id}`
    expect((await worker.fetch(new Request(url), env)).status).toBe(401)
    outbound.mockResolvedValueOnce(Response.json(response([critical])))
    const cookie = `__Host-aidb_session=${await createSession(env.SESSION_KEY)}`
    const result = await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ finding: { message: 'PRIVATE_MESSAGE', evidence: { title: 'PRIVATE_EVIDENCE' } } })
    outbound.mockResolvedValueOnce(Response.json(response([])))
    expect(await (await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).json()).toMatchObject({ finding: null })
  })
  it('does not call a scan complete when pages are missing or checks are unknown', async () => {
    Object.assign(env, { ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', DASHBOARD_PASSWORD: '', CREDENTIAL_KEY: '', SESSION_KEY: '' })
    outbound.mockImplementation(async input => Response.json(String(input).includes('seo/posts') ? response([], { items: [], pagination: { page: 1, pages: 1, total: 2 } }) : response([], {}, 'unknown')))
    expect((await scanSite(env, 'https://anbenigeria.com', 'token')).incomplete).toBe(true)
  })
  it('compares only complete server scans and ignores browser-supplied findings', async () => {
    vi.useFakeTimers()
    const key = encode(crypto.getRandomValues(new Uint8Array(32)))
    const encrypted = await encryptToken('wordpress-token', key, 'https://anbenigeria.com')
    db.prepare('UPDATE sites SET ciphertext = ?, iv = ?').run(encrypted.ciphertext, encrypted.iv)
    Object.assign(env, { CREDENTIAL_KEY: key, SESSION_KEY: 'session-key', DASHBOARD_PASSWORD: 'password', ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', API_LIMIT: { limit: async () => ({ success: true }) } })
    const cookie = `__Host-aidb_session=${await createSession(env.SESSION_KEY)}`
    let current: ScanFinding[] = []
    let partial = false
    const emails: string[] = []
    outbound.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === 'https://api.resend.com/emails') { emails.push(String(init?.body)); return Response.json({ id: 'accepted' }) }
      if (url.includes('seo/posts')) return Response.json(response([], { items: [], pagination: { page: 1, pages: 0, total: partial ? 1 : 0 } }))
      return Response.json(response(url.endsWith('/health') ? current : []))
    })
    const run = async () => {
      vi.setSystemTime(Date.now() + 1000)
      return worker.fetch(new Request('https://dashboard.example/api/scan', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://dashboard.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ findings: [critical] }) }), env)
    }
    expect((await run()).status).toBe(200)
    expect(emails).toHaveLength(0)
    current = [critical]; partial = true
    expect(await (await run()).json()).toMatchObject({ incomplete: true })
    expect(emails).toHaveLength(0)
    partial = false
    await run(); await run()
    expect(emails).toHaveLength(1)
    current = []; await run()
    current = [critical]; await run()
    expect(emails).toHaveLength(2)
  })
})

describe('public scan integration', () => {

  it('integrates public findings with scan completion, notifications, and authenticated current evidence', async () => {
    const key = encode(crypto.getRandomValues(new Uint8Array(32)))
    const encrypted = await encryptToken('wordpress-token', key, 'https://anbenigeria.com')
    db.prepare('UPDATE sites SET ciphertext = ?, iv = ?').run(encrypted.ciphertext, encrypted.iv)
    Object.assign(env, { CREDENTIAL_KEY: key, SESSION_KEY: 'session-key', DASHBOARD_PASSWORD: 'password', ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', API_LIMIT: { limit: async () => ({ success: true }) } })
    const cookie = `__Host-aidb_session=${await createSession(env.SESSION_KEY)}`
    const publicFinding = { id: 'public-link-http-error-0123456789abcdef01234567', title: 'Internal link returned an HTTP error', severity: 'high', category: 'public-availability', source: 'public_http', message: 'Observed HTTP 500.', evidence: { url: 'https://public.example.com/broken', response_status: 500 } }
    const current = { success: true, check: { id: 'public-pages', status: 'ok', timestamp: 'now' }, findings: [] as publicScanner.PublicFinding[], metadata: { enabled: true, incomplete: false, scope: 'fixture-scope', configured_pages: 1, checked: 1, requests: 1, skipped: 0, reasons: [] as string[], observations: [], limits: publicScanner.PUBLIC_SCAN_LIMITS } }
    const publicSpy = vi.spyOn(publicScanner, 'scanPublicPages').mockImplementation(async () => structuredClone(current))
    outbound.mockImplementation(async input => {
      if (String(input).includes('seo/posts')) return Response.json(response([], { items: [], pagination: { page: 1, pages: 0, total: 0 } }))
      return Response.json(response([]))
    })
    const scanRequest = () => worker.fetch(new Request('https://dashboard.example/api/scan', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://dashboard.example', 'Content-Type': 'application/json' }, body: '{}' }), env)
    vi.useFakeTimers()
    await scanRequest() // Silent baseline.
    vi.setSystemTime(Date.now() + 1000)
    current.findings = [publicFinding]
    current.metadata.incomplete = true
    expect(await (await scanRequest()).json()).toMatchObject({ incomplete: true, publicScan: { findings: [publicFinding] } })
    expect(db.prepare('SELECT count(*) AS n FROM finding_email_alerts').get()?.n).toBe(0)
    current.metadata.incomplete = false
    vi.setSystemTime(Date.now() + 1000)
    await scanRequest()
    const alert = db.prepare('SELECT id, route FROM finding_email_alerts').get()
    expect(alert?.route).toBe('public/pages/fixture-scope')
    const url = `https://dashboard.example/api/finding-alerts/${alert?.id}`
    expect((await worker.fetch(new Request(url), env)).status).toBe(401)
    expect(await (await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).json()).toMatchObject({ finding: publicFinding })
    current.findings = []
    current.metadata.incomplete = true
    expect((await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).status).toBe(503)
    current.metadata.incomplete = false
    expect(await (await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).json()).toMatchObject({ finding: null })
    expect((await worker.fetch(new Request('https://dashboard.example/api/public-scan'), env)).status).toBe(401)
    const direct = await worker.fetch(new Request('https://dashboard.example/api/public-scan', { headers: { Cookie: cookie } }), env)
    expect(direct.status).toBe(200)
    current.metadata.scope = 'different-scope'
    expect((await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).status).toBe(503)
    expect(publicSpy).toHaveBeenCalled()
  })

})
