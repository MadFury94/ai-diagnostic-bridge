// Public HTTP observations only. No diagnostic credentials or visitor cookies
// enter this module. Kept identical in the three isolated Worker deployments.
declare global { interface Env { PUBLIC_SCAN_PATHS?: string; PUBLIC_SITE_ORIGIN?: string } }

export const PUBLIC_SCAN_LIMITS = { pages: 3, targets: 40, requests: 48, redirects: 3, bytes: 256 * 1024, requestMs: 4000, scanMs: 20000 } as const
type Kind = 'page' | 'link' | 'image'
type Target = { url: string; kind: Kind; page: string }
type Observation = { url: string; kind: Kind; outcome: string; status?: number }
export type PublicFinding = { id: string; severity: string; category: string; title: string; message: string; source: string; evidence: Record<string, unknown> }
export type PublicScan = {
  success: boolean
  check: { id: string; status: string; timestamp: string }
  findings: PublicFinding[]
  metadata: { enabled: boolean; incomplete: boolean; scope: string | null; configured_pages: number; checked: number; requests: number; skipped: number; reasons: string[]; observations: Observation[]; limits: typeof PUBLIC_SCAN_LIMITS }
}

// HTMLRewriter exposes raw attribute values. Decode the common URL entities
// once; skip unsupported/ambiguous entities rather than requesting a wrong URL.
function attributeUrl(raw: string | null): string | null {
  if (raw === null) return null
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/', colon: ':', quest: '?', num: '#', period: '.' }
  let valid = true
  const decoded = raw.replace(/&#(x[0-9a-f]+|[0-9]+);?|&([a-z]+);/gi, (_match, numeric: string | undefined, name: string | undefined) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10)
      if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) { valid = false; return '' }
      return String.fromCodePoint(code)
    }
    if (!name || !(name in named)) { valid = false; return '' }
    return named[name]
  })
  return valid && !/&(?:#|[a-z])/i.test(decoded) ? decoded : null
}

// Queries can contain actions, signed media URLs, or customer data. Do not
// strip a query and then probe a different URL; exclude the original instead.
export function publicUrl(raw: string, base: string, origin: string): string | null {
  try {
    if (!raw.trim() || raw.trim().startsWith('#') || raw.length > 1500 || /[\u0000-\u0020\u007f\\]/.test(raw)) return null
    const url = new URL(raw, base)
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.search || /%25|%2f|%5c|%00/i.test(url.pathname)) return null
    const path = decodeURIComponent(url.pathname)
    if (/[\u0000-\u0020\u007f\\]/.test(path) || /(?:^|\/)(?:wp-admin|wp-json|wp-login\.php|wp-cron\.php|xmlrpc\.php|api|cart|checkout|my-account|account|login|logout|signout|sign-out|add-to-cart|remove-item|wc-api|order-pay|order-received)(?:\/|$)/i.test(path)) return null
    url.hash = ''
    return url.href
  } catch { return null }
}

function configuredOrigin(raw: string): string | null {
  try {
    const url = new URL(raw)
    // Server configuration is the allowlist. IPs and local hostnames are not
    // valid public sites; every redirect must remain on this exact origin.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || /[\[\]:]/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null
    return url.origin
  } catch { return null }
}

async function findingId(target: Target, issue: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${target.kind}\n${target.url}\n${issue}`))
  return `public-${target.kind}-${issue}-${Array.from(new Uint8Array(digest)).slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function scanPublicPages(env: Pick<Env, 'PUBLIC_SCAN_PATHS' | 'PUBLIC_SITE_ORIGIN'>, fallbackOrigin: string): Promise<PublicScan> {
  const metadata: PublicScan['metadata'] = { enabled: Boolean(env.PUBLIC_SCAN_PATHS), incomplete: false, scope: null, configured_pages: 0, checked: 0, requests: 0, skipped: 0, reasons: [], observations: [], limits: PUBLIC_SCAN_LIMITS }
  const result: PublicScan = { success: true, check: { id: 'public-pages', status: 'not_applicable', timestamp: new Date().toISOString() }, findings: [], metadata }
  if (!metadata.enabled) return result
  const uncertain = (reason: string) => { metadata.incomplete = true; if (!metadata.reasons.includes(reason)) metadata.reasons.push(reason) }
  const origin = configuredOrigin(env.PUBLIC_SITE_ORIGIN ?? fallbackOrigin)
  let paths: unknown
  try { paths = JSON.parse(env.PUBLIC_SCAN_PATHS!) } catch { paths = null }
  if (!origin || !Array.isArray(paths) || paths.length < 1 || paths.length > PUBLIC_SCAN_LIMITS.pages || paths.some(path => typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || !publicUrl(path, origin, origin))) {
    uncertain('invalid_configuration'); result.success = false; result.check.status = 'unknown'; return result
  }
  const pages: Target[] = [...new Set((paths as string[]).map(path => publicUrl(path, origin, origin)!))].map(url => ({ url, page: url, kind: 'page' }))
  const scopeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pages.map(page => page.url).sort().join('\n')))
  metadata.scope = Array.from(new Uint8Array(scopeDigest)).slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('')
  metadata.configured_pages = pages.length
  const deadline = Date.now() + PUBLIC_SCAN_LIMITS.scanMs
  const targets = new Map<string, Target>()
  const observed = new Set<string>()
  const report = async (target: Target, issue: string, status?: number) => {
    const label = target.kind === 'image' ? 'Image' : target.kind === 'link' ? 'Internal link' : 'Public page'
    const loop = issue === 'redirect-loop'
    result.findings.push({
      id: await findingId(target, issue), severity: target.kind === 'page' || (status !== undefined && status >= 500) ? 'high' : 'medium',
      category: 'public-availability', source: 'public_http',
      title: `${label} ${loop ? 'redirect loop observed' : 'returned an HTTP error'}`,
      message: loop ? 'A repeated URL was observed while following same-origin redirects.' : `The public GET request returned HTTP ${status}. This is an observation from this scan, not a confirmed root cause.`,
      evidence: { url: target.url, page_url: target.page, resource_type: target.kind, ...(status === undefined ? {} : { response_status: status }), observation: issue },
    })
  }
  const addTarget = (raw: string | null, kind: Kind, base: string, page: string) => {
    if (!raw) return
    const url = publicUrl(raw, base, origin)
    if (!url) { metadata.skipped++; return }
    const key = `${kind}:${url}`
    if (targets.has(key) || (kind === 'link' && pages.some(target => target.url === url))) return
    if (targets.size >= PUBLIC_SCAN_LIMITS.targets) { uncertain('target_limit'); return }
    targets.set(key, { url, kind, page })
  }
  const probe = async (target: Target, readHtml: boolean) => {
    const key = `${target.kind}:${target.url}`
    if (observed.has(key)) return
    observed.add(key)
    let current = target.url
    const visited = new Set<string>()
    const record = (outcome: string, status?: number) => { if (outcome !== 'not_checked') metadata.checked++; metadata.observations.push({ url: target.url, kind: target.kind, outcome, ...(status === undefined ? {} : { status }) }) }
    for (let hop = 0; hop <= PUBLIC_SCAN_LIMITS.redirects; hop++) {
      if (visited.has(current)) { await report(target, 'redirect-loop'); if (readHtml) uncertain('source_page_unavailable'); record('redirect_loop'); return }
      visited.add(current)
      if (Date.now() >= deadline || metadata.requests >= PUBLIC_SCAN_LIMITS.requests) { uncertain(Date.now() >= deadline ? 'scan_timeout' : 'request_limit'); record('not_checked'); return }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(PUBLIC_SCAN_LIMITS.requestMs, deadline - Date.now()))
      let response: Response | undefined
      try {
        metadata.requests++
        response = await fetch(current, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: readHtml ? 'text/html' : '*/*' } })
        const status = response.status
        if ([301, 302, 303, 307, 308].includes(status)) {
          const next = publicUrl(response.headers.get('location') ?? '', current, origin)
          if (!next) { uncertain('redirect_outside_scope'); record('redirect_not_followed', status); return }
          if (visited.has(next)) { await report(target, 'redirect-loop'); if (readHtml) uncertain('source_page_unavailable'); record('redirect_loop', status); return }
          if (hop === PUBLIC_SCAN_LIMITS.redirects) { uncertain('redirect_limit'); record('redirect_limit', status); return }
          current = next
          continue
        }
        if (status === 404 || status === 410 || status >= 500) {
          await report(target, 'http-error', status); record('http_error', status)
          // A failed source page cannot establish that its previous links or
          // images cleared. Preserve the alert baseline until it can be read.
          if (readHtml) uncertain('source_page_unavailable')
          return
        }
        if (status < 200 || status >= 300) { uncertain('response_not_verified'); record('not_verified', status); return }
        if (!readHtml) { record('http_ok', status); return }
        if (!response.headers.get('content-type')?.toLowerCase().includes('text/html') || !response.body) { uncertain('source_not_html'); record('not_html', status); return }
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            size += chunk.value.byteLength
            if (size > PUBLIC_SCAN_LIMITS.bytes) { uncertain('html_byte_limit'); record('html_too_large', status); return }
            chunks.push(chunk.value)
          }
        } finally { await reader.cancel(); reader.releaseLock() }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        const html = new TextDecoder().decode(bytes)
        // A native parser avoids probing apparent tags inside scripts/comments.
        // Decode URL attributes explicitly and honour the document's <base>.
        let base = current
        let baseSeen = false
        await new HTMLRewriter().on('base[href]', { element(element) { if (!baseSeen) { baseSeen = true; const value = attributeUrl(element.getAttribute('href')); try { base = value === null ? '' : new URL(value, current).href } catch { base = '' } } } }).transform(new Response(html)).arrayBuffer()
        if (!base || new URL(base).origin !== origin) { uncertain('base_outside_scope'); record('links_not_checked', status); return }
        await new HTMLRewriter()
          .on('a[href]', { element(element) { const raw = attributeUrl(element.getAttribute('href')); if (raw === null) metadata.skipped++; else addTarget(raw, 'link', base, target.url) } })
          .on('img[src]', { element(element) { const raw = attributeUrl(element.getAttribute('src')); if (raw === null) metadata.skipped++; else addTarget(raw, 'image', base, target.url) } })
          .transform(new Response(html)).arrayBuffer()
        record('html_checked', status)
        return
      } catch {
        uncertain(controller.signal.aborted ? 'request_timeout' : 'request_failed'); record('unknown'); return
      } finally {
        clearTimeout(timer)
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {})
      }
    }
  }
  for (const target of pages) await probe(target, true)
  for (const target of targets.values()) await probe(target, false)
  result.check.status = metadata.incomplete ? 'unknown' : result.findings.length ? 'warning' : 'ok'
  return result
}
