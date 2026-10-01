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
    ALLOWED_SITE_ORIGIN: 'https://katalyst.tech', SITE_NAME: 'Katalyst', WORDPRESS_TOKEN: 'synthetic-katalyst-token-0123456789',
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
    const encrypted = await encryptToken('private-token', key, 'https://katalyst.tech')
    expect(JSON.stringify(encrypted)).not.toContain('private-token')
    expect(await decryptToken({ ...encrypted, url: 'https://katalyst.tech' }, key)).toBe('private-token')
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
  it.each(['http://katalyst.tech', 'https://evil.example', 'https://user:pass@katalyst.tech', 'https://katalyst.tech/path', 'https://127.0.0.1', 'https://katalyst.tech?token=x'])('blocks unapproved destination %s', value => {
    expect(() => siteOrigin(value, 'https://katalyst.tech')).toThrow()
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
  it('uses the Worker secret and persists only verification metadata', async () => {
    const env = environment()
    const run = vi.fn().mockResolvedValue({ success: true })
    const statement = { bind: vi.fn().mockReturnThis(), run }
    env.DB.prepare = vi.fn(() => statement as unknown as D1PreparedStatement)
    const outbound = vi.fn(async () => Response.json(envelope)); vi.stubGlobal('fetch', outbound)
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/connection', 'POST', {}, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)
    expect(response.status).toBe(200)
    expect(outbound).toHaveBeenCalledWith('https://katalyst.tech/wp-json/ai-diagnostic/v1/health', expect.objectContaining({ headers: { Authorization: `Bearer ${env.WORDPRESS_TOKEN}`, Accept: 'application/json' }, redirect: 'manual' }))
    expect(run).toHaveBeenCalledOnce()
    expect(statement.bind.mock.calls[0].slice(0, 2)).toEqual(['Katalyst', 'https://katalyst.tech'])
    expect(JSON.stringify(statement.bind.mock.calls)).not.toContain(env.WORDPRESS_TOKEN)
    expect(await response.text()).not.toContain(env.WORDPRESS_TOKEN)
  })
  it.each(['PUT', 'DELETE'])('blocks browser credential changes through %s', async method => {
    const env = environment(); const outbound = vi.fn(); vi.stubGlobal('fetch', outbound)
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/connection', method, { url: 'https://other-client.example', token: 'replacement' }, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)
    expect(response.status).toBe(405)
    expect(env.DB.prepare).not.toHaveBeenCalled(); expect(outbound).not.toHaveBeenCalled()
  })
  it('does not persist verification when WordPress refuses the secret', async () => {
    const env = environment()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private details', { status: 401 })))
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/connection', 'POST', {}, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)
    expect(response.status).toBe(502); expect(env.DB.prepare).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('private details')
  })
  it('fails closed before the client credential is provisioned', async () => {
    const env = environment(); delete env.WORDPRESS_TOKEN
    const outbound = vi.fn(); vi.stubGlobal('fetch', outbound)
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/bridge/health', 'GET', undefined, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)
    expect(response.status).toBe(409); expect(outbound).not.toHaveBeenCalled()
  })
  it('rejects another deployment session before touching its own storage or upstream', async () => {
    const env = environment(); const outbound = vi.fn(); vi.stubGlobal('fetch', outbound)
    const otherSession = await createSession('a-different-client-session-key')
    const response = await worker.fetch(request('/api/connection', 'GET', undefined, { Cookie: `__Host-aidb_katalyst_session=${otherSession}` }), env)
    expect(response.status).toBe(401); expect(env.DB.prepare).not.toHaveBeenCalled(); expect(outbound).not.toHaveBeenCalled()
  })
  it('ignores supplied destinations and secrets when testing its fixed connection', async () => {
    const env = environment(); const outbound = vi.fn<typeof fetch>(async () => Response.json(envelope)); vi.stubGlobal('fetch', outbound)
    const statement = { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({ success: true }) }
    env.DB.prepare = vi.fn(() => statement as unknown as D1PreparedStatement)
    const session = await createSession(env.SESSION_KEY)
    expect((await worker.fetch(request('/api/connection', 'POST', { url: 'https://other-client.example', token: 'other-client-secret' }, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)).status).toBe(200)
    expect(outbound.mock.calls[0][0]).toBe('https://katalyst.tech/wp-json/ai-diagnostic/v1/health')
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
    await expect(fetchBridge('https://katalyst.tech', 'private-token', 'health', environment())).rejects.toMatchObject({ code: 'wordpress_route' })
    expect(outbound).toHaveBeenCalledOnce()
    expect(outbound.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })
  it('does not forward browser cookies or headers to WordPress', async () => {
    const outbound = vi.fn<typeof fetch>(async () => Response.json(envelope)); vi.stubGlobal('fetch', outbound)
    await fetchBridge('https://katalyst.tech', 'private-token', 'health', environment())
    expect(outbound.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer private-token', Accept: 'application/json' } })
    expect(Object.keys(outbound.mock.calls[0]?.[1]?.headers ?? {})).toEqual(['Authorization', 'Accept'])
  })
  it('blocks mutation methods on diagnostic routes', async () => {
    const env = environment()
    const session = await createSession(env.SESSION_KEY)
    const response = await worker.fetch(request('/api/bridge/health', 'POST', {}, { Cookie: `__Host-aidb_katalyst_session=${session}` }), env)
    expect(response.status).toBe(405); expect(env.DB.prepare).not.toHaveBeenCalled()
  })
})
