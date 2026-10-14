import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { publicUrl, scanPublicPages, PUBLIC_SCAN_LIMITS, type PublicScan } from '../src/public-scan'

const origin = 'https://public.example.com'
let runtime: Miniflare
let replies: Map<string, { status?: number; body?: string; headers?: Record<string, string> }>
let requests: Array<{ url: string; headers: Record<string, string>; method: string }>

beforeAll(async () => {
  const bundle = await build({ stdin: { contents: `import { scanPublicPages } from './src/public-scan'; export default { async fetch(request) { const input = await request.json(); return Response.json(await scanPublicPages(input, '${origin}')); } }`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' })
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23',
    outboundService: async request => {
      requests.push({ url: request.url, headers: Object.fromEntries(request.headers), method: request.method })
      const reply = replies.get(request.url)
      return new Response(reply?.body ?? '', { status: reply?.status ?? 200, headers: reply?.headers ?? { 'Content-Type': 'text/html' } })
    },
  }))
  await runtime.ready
}, 30000)
afterAll(async () => { await runtime?.dispose() })
beforeEach(() => { replies = new Map(); requests = [] })
const run = async (config: Record<string, string | undefined> = { PUBLIC_SCAN_PATHS: '["/"]' }): Promise<PublicScan> => (await runtime.dispatchFetch('https://scanner.example.com', { method: 'POST', body: JSON.stringify(config) })).json() as Promise<PublicScan>
const html = (body: string) => replies.set(origin + '/', { body })

describe('bounded public-page checks in the Workers runtime', () => {
  it('reproduces broken link and image findings, clears after repair, and retains IDs on reappearance', async () => {
    html('<a href="/missing">Help</a><img src="/missing.png"><a href="/missing#again">Again</a>')
    replies.set(origin + '/missing', { status: 404 })
    replies.set(origin + '/missing.png', { status: 404 })
    const broken = await run()
    expect(broken.metadata.incomplete).toBe(false)
    expect(broken.findings).toHaveLength(2)
    expect(broken.findings.map(f => f.evidence.resource_type).sort()).toEqual(['image', 'link'])
    expect(broken.findings.every(f => f.evidence.page_url === origin + '/')).toBe(true)
    replies.set(origin + '/missing', { body: 'Repaired help page' })
    replies.set(origin + '/missing.png', { headers: { 'Content-Type': 'image/png' } })
    const repaired = await run()
    expect(repaired.check.status).toBe('ok')
    expect(repaired.findings).toEqual([])
    replies.set(origin + '/missing', { status: 404 })
    replies.set(origin + '/missing.png', { status: 404 })
    expect((await run()).findings.map(f => f.id)).toEqual(broken.findings.map(f => f.id))
    expect(requests.every(r => r.method === 'GET' && !r.headers.authorization && !r.headers.cookie && !r.headers['x-ai-diagnostic-token'])).toBe(true)
  })
  it('follows canonical redirects before parsing and detects a real cycle', async () => {
    replies.set(origin + '/', { status: 308, headers: { Location: '/home/' } })
    replies.set(origin + '/home/', { body: '<a href="loop">Loop</a>' })
    replies.set(origin + '/home/loop', { status: 302, headers: { Location: '/other' } })
    replies.set(origin + '/other', { status: 301, headers: { Location: '/home/loop' } })
    const result = await run()
    expect(result.metadata.incomplete).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].evidence.observation).toBe('redirect-loop')
    expect(requests).toHaveLength(4)
  })
  it('does not treat a long redirect chain as proof of a loop', async () => {
    for (let n = 0; n < 5; n++) replies.set(origin + (n ? '/' + n : '/'), { status: 302, headers: { Location: '/' + (n + 1) } })
    const result = await run()
    expect(result.findings).toEqual([])
    expect(result.metadata.reasons).toContain('redirect_limit')
    expect(requests).toHaveLength(4)
  })
  it('rejects external, credential-bearing, private, action, and query URLs before fetching', async () => {
    html('<a href="https://evil.example.org/private">external</a><img src="http://127.0.0.1/a"><a href="/?add-to-cart=1">Buy</a><a href="/wp-admin/">admin</a><a href="/checkout">checkout</a><a href="https://user:secret@public.example.com/private">secret</a><img src="/image.png?signature=SECRET"><a href="/safe">safe</a>')
    const result = await run()
    expect(requests.map(r => r.url)).toEqual([origin + '/', origin + '/safe'])
    expect(result.metadata.skipped).toBe(7)
    expect(JSON.stringify(result)).not.toMatch(/SECRET|user:secret|signature/)
  })
  it('never follows an off-origin redirect or falsely reports it healthy', async () => {
    replies.set(origin + '/', { status: 302, headers: { Location: 'https://127.0.0.1/private?token=SECRET' } })
    const result = await run()
    expect(requests).toHaveLength(1)
    expect(result.metadata.reasons).toContain('redirect_outside_scope')
    expect(result.findings).toEqual([])
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })
  it('uses a native HTML parser, ignores comments/scripts, and honours base URLs', async () => {
    html(`<base href="/catalog/"><!-- <img src='/fake.png'> --><script>"<a href='/fake'>"</script><a href=help>Help</a><img src="photo&#46;png">`)
    await run()
    expect(requests.map(r => r.url)).toEqual([origin + '/', origin + '/catalog/help', origin + '/catalog/photo.png'])
  })
  it('does not reinterpret links under an external base as same-origin', async () => {
    html('<base href="https://other.example.com/"><a href="help">Help</a>')
    expect((await run()).metadata.reasons).toContain('base_outside_scope')
    expect(requests).toHaveLength(1)
  })
  it.each([401, 403, 429])('treats HTTP %s as unverifiable, not a broken public page', async status => {
    replies.set(origin + '/', { status })
    const result = await run()
    expect(result.metadata.incomplete).toBe(true)
    expect(result.findings).toEqual([])
  })
  it.each([404, 410, 500, 503])('reports selected-page HTTP %s but cannot clear previously discovered resources', async status => {
    replies.set(origin + '/', { status })
    const result = await run()
    expect(result.findings[0]).toMatchObject({ severity: 'high', evidence: { response_status: status, resource_type: 'page' } })
    expect(result.metadata.reasons).toContain('source_page_unavailable')
  })
  it('bounds targets and makes overflow explicitly incomplete', async () => {
    html(Array.from({ length: 100 }, (_, i) => `<a href="/page-${i}">Page</a>`).join(''))
    const result = await run()
    expect(result.metadata.reasons).toContain('target_limit')
    expect(requests).toHaveLength(1 + PUBLIC_SCAN_LIMITS.targets)
  })
  it('bounds response bytes instead of parsing truncated HTML as complete', async () => {
    html('x'.repeat(PUBLIC_SCAN_LIMITS.bytes + 1) + '<a href="/never">Never</a>')
    const result = await run()
    expect(result.metadata.reasons).toContain('html_byte_limit')
    expect(requests).toHaveLength(1)
  })
  it('does not crawl linked pages recursively', async () => {
    html('<a href="/next">Next</a>')
    replies.set(origin + '/next', { body: '<a href="/never">Never</a>' })
    await run()
    expect(requests.map(r => r.url)).toEqual([origin + '/', origin + '/next'])
  })
  it('bounds the total requests even when many linked targets redirect', async () => {
    html(Array.from({ length: 30 }, (_, i) => `<a href="/start-${i}">Page</a>`).join(''))
    for (let i = 0; i < 30; i++) replies.set(origin + '/start-' + i, { status: 302, headers: { Location: '/end-' + i } })
    const result = await run()
    expect(requests).toHaveLength(PUBLIC_SCAN_LIMITS.requests)
    expect(result.metadata.reasons).toContain('request_limit')
    expect(result.metadata.checked).toBe(24) // Source plus 23 completed two-hop destinations; remaining targets are not checked.
  })
  it('excludes encoded query actions and unsupported entities rather than changing their meaning', async () => {
    html('<a href="/&#63;add-to-cart=1">Buy</a><img src="/photo&unknown;.png"><img src="/photo&#x2e;png">')
    await run()
    expect(requests.map(r => r.url)).toEqual([origin + '/', origin + '/photo.png'])
  })
  it('identifies changes in configured source scope independently of page order', async () => {
    const one = await run({ PUBLIC_SCAN_PATHS: '["/a","/b"]' })
    const reordered = await run({ PUBLIC_SCAN_PATHS: '["/b","/a"]' })
    const changed = await run({ PUBLIC_SCAN_PATHS: '["/a"]' })
    expect(one.metadata.scope).toBe(reordered.metadata.scope)
    expect(one.metadata.scope).not.toBe(changed.metadata.scope)
  })
  it('fails closed on invalid server configuration and disables cleanly when unset', async () => {
    for (const config of [{ PUBLIC_SCAN_PATHS: 'bad' }, { PUBLIC_SCAN_PATHS: '["/?token=SECRET"]' }, { PUBLIC_SCAN_PATHS: '["/"]', PUBLIC_SITE_ORIGIN: 'https://127.0.0.1' }, { PUBLIC_SCAN_PATHS: '["/a","/b","/c","/d"]' }]) {
      expect((await run(config)).check.status).toBe('unknown')
    }
    expect((await run({})).check.status).toBe('not_applicable')
    expect(requests).toEqual([])
  })
})

describe('timeouts and URL boundaries', () => {
  it('aborts a stalled request and retains unknown rather than healthy', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('PRIVATE'))))))
    try {
      const resultPromise = scanPublicPages({ PUBLIC_SCAN_PATHS: '["/"]' }, origin)
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(PUBLIC_SCAN_LIMITS.requestMs + 1)
      const result = await resultPromise
      expect(result.metadata.reasons).toContain('request_timeout')
      expect(result.findings).toEqual([])
      expect(JSON.stringify(result)).not.toContain('PRIVATE')
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  it.each(['/wp-%61dmin/', '/%252fwp-admin', '/%2fadmin', '/a\\b', '//evil.example.com/', '/account/orders', 'javascript:alert(1)', '/%00', '/a?secret=x'])('rejects %s', raw => {
    expect(publicUrl(raw, origin, origin)).toBeNull()
  })
})
