import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { bridgePath, fetchBridge, sanitizeEnvelope } from '../src/bridge'
import { boundedJson, createSession, decryptToken, encode, encryptToken, passwordMatches, siteOrigin, validSession } from '../src/security'
import { parseFields, safeFinding } from '../src/explanations'

const key = encode(crypto.getRandomValues(new Uint8Array(32)))
const finding = { id: 'seo-title-short', severity: 'low', category: 'seo-title', title: 'Short title', message: 'Title is short.', evidence: { length: 8 }, source: 'seo' }
const envelope = { success: true, plugin: { name: 'AI Diagnostic Bridge', version: '0.1.0' }, check: { id: 'seo', status: 'warning', timestamp: '2026-09-23T12:00:00Z' }, findings: [finding], metadata: {} }
const limiter = () => ({ limit: vi.fn(async () => ({ success: true })) })
function environment(): Env {
  return {
    ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', CREDENTIAL_KEY: key,
    SESSION_KEY: 'test-session-secret', DASHBOARD_PASSWORD: 'test-dashboard-secret',
    AI: { run: vi.fn(async () => ({ response: JSON.stringify({ summary: 'summary', why_it_matters: 'why', recommended_next_step: 'next', verification_step: 'verify', caveats: 'caveat' }) })) } as unknown as Ai,
    LOGIN_LIMIT: limiter(), API_LIMIT: limiter(), CONNECTION_LIMIT: limiter(),
    DB: { prepare: vi.fn() } as Partial<D1Database> as D1Database,
    ASSETS: { fetch: vi.fn(async () => new Response('<html></html>')) } as Partial<Fetcher> as Fetcher,
  }
}
const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => new Request(`https://dashboard.example${path}`, { method, headers: { Origin: 'https://dashboard.example', 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('credential and session security', () => {
  it('encrypts credentials and authenticates the site association', async () => {
    const encrypted = await encryptToken('private-token', key, 'https://anbenigeria.com')
    expect(JSON.stringify(encrypted)).not.toContain('private-token')
    expect(await decryptToken({ ...encrypted, url: 'https://anbenigeria.com' }, key)).toBe('private-token')
    await expect(decryptToken({ ...encrypted, url: 'https://other.example' }, key)).rejects.toThrow()
  })
  it('rejects forged and expired sessions', async () => {
    const session = await createSession('key')
    expect(await validSession(session, 'key')).toBe(true)
    expect(await validSession(session, 'wrong-key')).toBe(false)
    expect(await validSession(`${session}x`, 'key')).toBe(false)
    expect(await validSession(await createSession('key', Date.now() - 1), 'key')).toBe(false)
    expect(await passwordMatches('wrong', 'right', 'key')).toBe(false)
  })
  it.each(['http://anbenigeria.com', 'https://evil.example', 'https://user:pass@anbenigeria.com', 'https://anbenigeria.com/path', 'https://127.0.0.1', 'https://anbenigeria.com?token=x'])('blocks unapproved destination %s', value => {
    expect(() => siteOrigin(value, 'https://anbenigeria.com')).toThrow()
  })
  it('requires authentication before accessing WordPress or storage', async () => {
    const env = environment()
    const outbound = vi.fn(); vi.stubGlobal('fetch', outbound)
    const result = await worker.fetch(request('/api/bridge/health'), env)
    expect(result.status).toBe(401)
    expect(env.DB.prepare).not.toHaveBeenCalled()
    expect(outbound).not.toHaveBeenCalled()
  })
  it('blocks cross-origin state changes and returns a secure cookie on login', async () => {
    const env = environment()
    expect((await worker.fetch(request('/api/login', 'POST', { password: env.DASHBOARD_PASSWORD }, { Origin: 'https://evil.example' }), env)).status).toBe(403)
    const response = await worker.fetch(request('/api/login', 'POST', { password: env.DASHBOARD_PASSWORD }), env)
    expect(response.status).toBe(200)
    const cookie = response.headers.get('Set-Cookie')!
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict')
    expect(await response.text()).not.toContain(env.DASHBOARD_PASSWORD)
  })
  it('enforces login rate limits before checking credentials', async () => {
    const env = environment(); env.LOGIN_LIMIT.limit = vi.fn(async () => ({ success: false }))
    const response = await worker.fetch(request('/api/login', 'POST', { password: env.DASHBOARD_PASSWORD }), env)
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('60')
  })
  it('fails closed when secrets are missing', async () => {
    const env = environment(); env.SESSION_KEY = ''
    expect((await worker.fetch(request('/api/session'), env)).status).toBe(503)
  })
})

describe('AI explanation evidence boundary', () => {
  it('keeps only bounded finding evidence and removes sensitive fields', () => {
    const result = safeFinding({ ...finding, evidence: { length: 8, post_content: 'private body', customer_email: 'x@example.com', nested: { token: 'secret', ok: true } } })
    expect(result.evidence).toEqual({ length: 8, nested: { ok: true } })
    expect(result).not.toHaveProperty('post_content')
  })
  it('requires all five explanation fields', () => {
    expect(parseFields({ summary: 's', why_it_matters: 'w', recommended_next_step: 'n', verification_step: 'v', caveats: 'c' })).toEqual({ summary: 's', why_it_matters: 'w', recommended_next_step: 'n', verification_step: 'v', caveats: 'c' })
    expect(() => parseFields({ summary: 's' })).toThrow('explanation did not contain all required fields')
  })
})

describe('bounded read-only proxy', () => {
  it('saves only encrypted credentials after verification and returns only connection status', async () => {
    const env = environment()
    const token = 'synthetic-wordpress-token-0123456789'
    let values: unknown[] = []
    const run = vi.fn().mockResolvedValue({ success: true })
    const statement = {
      all: vi.fn(), raw: vi.fn(),
      bind: (...args: unknown[]) => { values = args; return statement }, run,
      first: vi.fn().mockImplementation(async () => ({ id: 'default', name: values[0], url: values[1], ciphertext: values[2], iv: values[3], verified_at: values[4] })),
    }
    env.DB.prepare = vi.fn(() => statement as D1PreparedStatement)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(envelope)))
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/connection', 'PUT', { name: 'Anbe', url: 'https://anbenigeria.com', token }, { Cookie: `__Host-aidb_session=${session}` }), env)
    expect(response.status).toBe(200)
    expect(run).toHaveBeenCalledOnce()
    expect(JSON.stringify(values)).not.toContain(token)
    expect(await decryptToken({ url: String(values[1]), ciphertext: String(values[2]), iv: String(values[3]) }, env.CREDENTIAL_KEY)).toBe(token)
    const body = await response.text()
    expect(body).not.toContain(token); expect(body).not.toContain('ciphertext'); expect(body).not.toContain('iv')
  })
  it('retains the old credential if replacement verification fails', async () => {
    const env = environment()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private details', { status: 401 })))
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/connection', 'PUT', { name: 'Anbe', url: 'https://anbenigeria.com', token: 'invalid-wordpress-token-01234567890' }, { Cookie: `__Host-aidb_session=${session}` }), env)
    expect(response.status).toBe(502)
    expect(env.DB.prepare).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('private details')
  })
  it.each(['diagnostic', 'themes', '../health', 'https://evil.example', 'seo/post/0', 'seo/post/-1'])('rejects route %s', path => {
    expect(() => bridgePath(path, new URLSearchParams())).toThrow()
  })
  it('allows the bounded read-only plugins route', () => {
    expect(bridgePath('plugins', new URLSearchParams())).toBe('plugins')
  })
  it('allows the existing read-only WooCommerce route', () => {
    expect(bridgePath('woocommerce', new URLSearchParams())).toBe('woocommerce')
  })
  it.each(['page=0', 'page=1001', 'per_page=51', 'page=1&page=2', 'url=https://evil.example', 'page=1.5'])('rejects invalid pagination %s', query => {
    expect(() => bridgePath('seo/posts', new URLSearchParams(query))).toThrow()
  })
  it('retains approved bounded collection parameters', () => {
    expect(bridgePath('seo/posts', new URLSearchParams('page=2&per_page=5'))).toBe('seo/posts?page=2&per_page=5')
  })
  it('rejects response overflow even without a Content-Length header', async () => {
    await expect(boundedJson(new Response('x'.repeat(200)), 100)).rejects.toMatchObject({ status: 413 })
  })
  it('retains finding contracts while dropping private fields and token values', () => {
    const result = sanitizeEnvelope({
      ...envelope, token: 'TOP_SECRET', customer: { name: 'private' },
      metadata: {
        items: [{ post_id: 10, title: 'About TOP_SECRET', post_type: 'page', findings: [finding], metadata: { orders: [{ id: 123 }], observations: { title: { value: 'About' } } } }],
        plugins: [{ slug: 'woocommerce', version: '11.1.1', active: true, vulnerability: { status: 'no_matching_advisory', checked_at: '2026-09-25T00:00:00Z', cache_age_seconds: 0, served_from_cache: false } }],
        pagination: { page: 1, per_page: 20, total: 1, pages: 1 },
      },
    }, ['TOP_SECRET'])
    const raw = JSON.stringify(result)
    expect(raw).not.toContain('TOP_SECRET'); expect(raw).not.toContain('orders'); expect(raw).not.toContain('customer')
    expect(result.findings[0]).toEqual(finding)
    expect(result.metadata.items).toMatchObject([{ post_id: 10, findings: [finding] }])
    expect(result.metadata.plugins).toMatchObject([{ slug: 'woocommerce', vulnerability: { served_from_cache: false } }])
  })
  it('preserves safe CVE advisory identifiers and affected range evidence', () => {
    const result = sanitizeEnvelope({ ...envelope, findings: [{ ...finding, evidence: { advisory_url: 'https://www.cve.org/CVERecord?id=CVE-2026-3375', affected_ranges: [{ min: null, max: { version: '7.6.3', inclusive: false } }] } }] }, [])
    expect((result.findings[0] as { evidence: unknown }).evidence).toEqual({ advisory_url: 'https://www.cve.org/CVERecord?id=CVE-2026-3375', affected_ranges: [{ min: null, max: { version: '7.6.3', inclusive: false } }] })
  })
  it('does not follow redirects or return raw upstream errors', async () => {
    const outbound = vi.fn<typeof fetch>(async () => new Response('private response', { status: 302, headers: { Location: 'https://evil.example' } }))
    vi.stubGlobal('fetch', outbound)
    await expect(fetchBridge('https://anbenigeria.com', 'private-token', 'health', environment())).rejects.toMatchObject({ code: 'wordpress_route' })
    expect(outbound).toHaveBeenCalledOnce()
    expect(outbound.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })
  it('does not forward browser cookies or headers to WordPress', async () => {
    const outbound = vi.fn<typeof fetch>(async () => Response.json(envelope)); vi.stubGlobal('fetch', outbound)
    await fetchBridge('https://anbenigeria.com', 'private-token', 'health', environment())
    expect(outbound.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer private-token', Accept: 'application/json' } })
    expect(Object.keys(outbound.mock.calls[0]?.[1]?.headers ?? {})).toEqual(['Authorization', 'Accept'])
  })
  it('blocks mutation methods on diagnostic routes', async () => {
    const env = environment()
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/bridge/health', 'POST', {}, { Cookie: `__Host-aidb_session=${session}` }), env)
    expect(response.status).toBe(405); expect(env.DB.prepare).not.toHaveBeenCalled()
  })
})
