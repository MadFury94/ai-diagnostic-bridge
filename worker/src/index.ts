import { bridgePath, fetchBridge, object } from './bridge'
import { ApiError, boundedJson, createSession, decryptToken, encryptToken, passwordMatches, siteOrigin, validSession } from './security'
import { ExplanationFields, ExplanationRecord, generateExplanation, parseFields, rowToRecord, safeFinding } from './explanations'

type Site = { id: string; name: string; url: string; ciphertext: string; iv: string; verified_at: string }
const cookieName = '__Host-aidb_session'
const json = (data: unknown, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } })
const cookie = (value: string, age: number) => `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`
const getSite = (env: Env) => env.DB.prepare("SELECT * FROM sites WHERE id = 'default'").first<Site>()
const summary = (row: Site | null) => ({ id: 'default', configured: Boolean(row), name: row?.name ?? 'Anbe Nigeria', url: row?.url ?? '', verified_at: row?.verified_at ?? null })
const explanationResponse = (record: ExplanationRecord) => ({ explanation: record })
const parseNote = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500) || null : null
const explanationInsert = async (env: Env, finding: Record<string, unknown>, original: ExplanationFields, id = crypto.randomUUID()) => {
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO explanations (id, site_id, finding_id, finding_snapshot, original_output, current_output, status, reviewer_note, reviewer_identity, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)')
    .bind(id, 'default', String(finding.id), JSON.stringify(finding), JSON.stringify(original), JSON.stringify(original), 'draft', now, now).run()
  const row = await env.DB.prepare('SELECT * FROM explanations WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!row) throw new ApiError(500, 'storage_error', 'The explanation could not be saved.')
  return rowToRecord(row)
}

async function api(request: Request, env: Env) {
  const url = new URL(request.url)
  if (!env.SESSION_KEY || !env.DASHBOARD_PASSWORD || !env.CREDENTIAL_KEY) throw new ApiError(503, 'setup_required', 'Dashboard secrets are not configured.')
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'cross_origin', 'Open the dashboard directly to continue.')
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.headers.get('Origin') !== url.origin) throw new ApiError(403, 'cross_origin', 'This request must come from the dashboard.')
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError(415, 'content_type', 'Send a JSON request.')
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const { success } = await env.LOGIN_LIMIT.limit({ key: 'single-account-login' })
    if (!success) throw new ApiError(429, 'rate_limit', 'Too many sign-in attempts. Wait a minute and try again.')
    const body = object(await boundedJson(request, 4096))
    if (typeof body.password !== 'string' || !await passwordMatches(body.password, env.DASHBOARD_PASSWORD, env.SESSION_KEY)) throw new ApiError(401, 'unauthorized', 'The dashboard access key is incorrect.')
    return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(await createSession(env.SESSION_KEY), 28800) })
  }
  const session = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? ''
  if (!await validSession(session, env.SESSION_KEY)) throw new ApiError(401, 'unauthorized', 'Sign in to the dashboard to continue.')
  if (url.pathname === '/api/session' && request.method === 'GET') return json({ authenticated: true })
  if (url.pathname === '/api/logout' && request.method === 'POST') return json({ authenticated: false }, 200, { 'Set-Cookie': cookie('', 0) })
  if (!(await env.API_LIMIT.limit({ key: 'default' })).success) throw new ApiError(429, 'rate_limit', 'Too many requests. Wait a minute and try again.')
  if (url.pathname === '/api/connection') {
    if (request.method === 'GET') return json(summary(await getSite(env)))
    if (!['PUT', 'DELETE', 'POST'].includes(request.method)) throw new ApiError(405, 'method_not_allowed', 'Use GET, PUT, POST, or DELETE for the connection.')
    if (!(await env.CONNECTION_LIMIT.limit({ key: 'default' })).success) throw new ApiError(429, 'rate_limit', 'Too many connection attempts. Wait a minute and try again.')
    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM sites WHERE id = 'default'").run()
      return json(summary(null))
    }
    if (request.method === 'POST') {
      const row = await getSite(env)
      if (!row) throw new ApiError(409, 'not_connected', 'Save a site connection first.')
      await fetchBridge(row.url, await decryptToken(row, env.CREDENTIAL_KEY), 'health', env)
      const verified = new Date().toISOString()
      await env.DB.prepare("UPDATE sites SET verified_at = ? WHERE id = 'default' AND ciphertext = ?").bind(verified, row.ciphertext).run()
      return json(summary(await getSite(env)))
    }
    const body = object(await boundedJson(request, 8192))
    const origin = siteOrigin(body.url, env.ALLOWED_SITE_ORIGIN)
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100 || typeof body.token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(body.token)) throw new ApiError(400, 'invalid_connection', 'Enter a site name and a valid diagnostic token.')
    await fetchBridge(origin, body.token, 'health', env)
    const encrypted = await encryptToken(body.token, env.CREDENTIAL_KEY, origin)
    await env.DB.prepare("INSERT INTO sites (id, name, url, ciphertext, iv, verified_at) VALUES ('default', ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, ciphertext=excluded.ciphertext, iv=excluded.iv, verified_at=excluded.verified_at")
      .bind(body.name.trim(), origin, encrypted.ciphertext, encrypted.iv, new Date().toISOString()).run()
    return json(summary(await getSite(env)))
  }
  if (url.pathname === '/api/explanations') {
    if (request.method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Use GET to read explanations.')
    const findingId = url.searchParams.get('finding_id') ?? ''
    if (!/^[a-z0-9][a-z0-9_-]{0,120}$/i.test(findingId)) throw new ApiError(400, 'invalid_finding', 'A finding ID is required.')
    const row = await env.DB.prepare('SELECT * FROM explanations WHERE site_id = ? AND finding_id = ? ORDER BY updated_at DESC LIMIT 1').bind('default', findingId).first<Record<string, unknown>>()
    return json(row ? explanationResponse(rowToRecord(row)) : { explanation: null })
  }
  if (url.pathname === '/api/explanations/generate' && request.method === 'POST') {
    if (!env.AI) throw new ApiError(503, 'ai_unavailable', 'AI explanations are not configured.')
    const body = object(await boundedJson(request, 16000))
    const finding = safeFinding(body.finding)
    const output = await generateExplanation(env.AI, finding)
    return json(explanationResponse(await explanationInsert(env, finding, output)))
  }
  const explanationMatch = url.pathname.match(/^\/api\/explanations\/([0-9a-f-]{20,60})\/(verify|correct|regenerate)$/)
  if (explanationMatch && request.method === 'POST') {
    const id = explanationMatch[1]
    const action = explanationMatch[2]
    const row = await env.DB.prepare('SELECT * FROM explanations WHERE id = ? AND site_id = ?').bind(id, 'default').first<Record<string, unknown>>()
    if (!row) throw new ApiError(404, 'explanation_not_found', 'The explanation was not found.')
    const current = rowToRecord(row)
    if (action === 'regenerate') {
      if (!env.AI) throw new ApiError(503, 'ai_unavailable', 'AI explanations are not configured.')
      const output = await generateExplanation(env.AI, current.finding_snapshot)
      await env.DB.prepare('DELETE FROM explanations WHERE id = ? AND site_id = ?').bind(id, 'default').run()
      return json(explanationResponse(await explanationInsert(env, current.finding_snapshot, output)))
    }
    const body = object(await boundedJson(request, 10000))
    const note = parseNote(body.reviewer_note)
    const status = action === 'verify' ? 'verified-as-is' : 'corrected'
    const output = action === 'verify' ? current.current_output : parseFields(body.fields)
    const reviewedAt = new Date().toISOString()
    await env.DB.prepare('UPDATE explanations SET current_output = ?, status = ?, reviewer_note = ?, reviewer_identity = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND site_id = ?')
      .bind(JSON.stringify(output), status, note, 'dashboard-user', reviewedAt, reviewedAt, id, 'default').run()
    const updated = await env.DB.prepare('SELECT * FROM explanations WHERE id = ? AND site_id = ?').bind(id, 'default').first<Record<string, unknown>>()
    if (!updated) throw new ApiError(500, 'storage_error', 'The explanation could not be updated.')
    return json(explanationResponse(rowToRecord(updated)))
  }
  if (url.pathname.startsWith('/api/bridge/')) {
    if (request.method !== 'GET') throw new ApiError(405, 'read_only', 'Diagnostics are read-only. Use GET.')
    const route = bridgePath(url.pathname.slice('/api/bridge/'.length), url.searchParams)
    const row = await getSite(env)
    if (!row) throw new ApiError(409, 'not_connected', 'Open Site connection to configure WordPress.')
    const envelope = await fetchBridge(row.url, await decryptToken(row, env.CREDENTIAL_KEY), route, env)
    return json(envelope)
  }
  throw new ApiError(404, 'route_not_found', 'This API route is not available.')
}

export default {
  async fetch(request: Request, env: Env) {
    const started = Date.now()
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      let response: Response
      try { response = await api(request, env) } catch (error) {
        const known = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'The dashboard service is unavailable. Please try again.')
        response = json({ success: false, error: { code: known.code, message: known.message } }, known.status, known.status === 429 ? { 'Retry-After': '60' } : {})
      }
      // Deliberately omit URL/query, identity, headers, bodies, and exception details.
      console.log(JSON.stringify({ event: 'api_request', area: url.pathname.startsWith('/api/bridge/') ? 'bridge' : 'account', status: response.status, duration_ms: Date.now() - started }))
      return response
    }
    const asset = await env.ASSETS.fetch(request)
    const response = new Response(asset.body, asset)
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    return response
  },
} satisfies ExportedHandler<Env>
