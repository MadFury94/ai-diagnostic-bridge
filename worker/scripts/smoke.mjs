import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const base = process.argv[2]
if (!base || new URL(base).protocol !== 'https:') throw new Error('Supply the deployed HTTPS Worker origin.')
const secrets = JSON.parse(readFileSync(new URL('../.private/secrets.json', import.meta.url), 'utf8'))
const anbeFile = new URL('../.private/anbe.env', import.meta.url)
const config = Object.fromEntries(readFileSync(existsSync(anbeFile) ? anbeFile : new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]] : []
}))
let cookie = ''
async function call(path, method = 'GET', body, authenticated = true) {
  const response = await fetch(`${base}/api/${path}`, {
    method, headers: { Origin: base, ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}), redirect: 'manual', signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  for (const value of [...Object.values(secrets), config.AI_DIAGNOSTIC_TOKEN]) assert(!text.includes(value), 'A credential appeared in a response.')
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`Non-JSON response for ${path}: HTTP ${response.status}`) }
  return { response, data }
}
try {
  assert.equal((await call('bridge/health', 'GET', undefined, false)).response.status, 401)
  const login = await call('login', 'POST', { password: secrets.DASHBOARD_PASSWORD }, false)
  assert.equal(login.response.status, 200)
  cookie = login.response.headers.get('set-cookie').split(';')[0]
  assert(login.response.headers.get('set-cookie').includes('HttpOnly'))
  assert.equal((await call('session')).response.status, 200)
  let connection = await call('connection')
  if (!connection.data.configured && new URL(config.WORDPRESS_URL).origin === 'https://anbenigeria.com') {
    connection = await call('connection', 'PUT', { name: 'Anbe Nigeria', url: new URL(config.WORDPRESS_URL).origin, token: config.AI_DIAGNOSTIC_TOKEN })
    assert.equal(connection.response.status, 200, `Connection failed: ${connection.data.error?.code}`)
  }
  if (!connection.data.configured) assert.equal((await call('bridge/health')).response.status, 409)
  const checks = []
  for (const path of connection.data.configured ? ['health', 'seo/site', 'seo/issues?page=1&per_page=3', 'seo/posts?page=1&per_page=50', 'seo/post/10', 'images/issues?page=1&per_page=3', 'links/issues?page=1&per_page=3'] : []) {
    const result = await call(`bridge/${path}`)
    assert.equal(result.response.status, 200, `${path}: ${result.data.error?.code}`)
    assert.equal(result.data.success, true)
    assert.equal(result.response.headers.get('cache-control'), 'no-store')
    checks.push({ route: path, status: 200, check: result.data.check.status, findings: result.data.findings.length, pagination: result.data.metadata.pagination })
    if (path.startsWith('seo/posts')) {
      const posts = result.data.metadata.items
      assert(posts.every(post => typeof post.title === 'string' && ['post', 'page'].includes(post.post_type)))
      const about = posts.find(post => post.post_id === 10)
      assert(about, 'About page was missing from the scan.')
      console.log(JSON.stringify({ about: { title: about.title, status: about.check.status, findings: about.findings.map(f => ({ id: f.id, severity: f.severity })) }, records: posts.length }))
    }
  }
  assert.equal((await call('bridge/seo/posts?per_page=51')).response.status, 400)
  assert.equal((await call('bridge/diagnostic')).response.status, 404)
  assert.equal((await call('bridge/health', 'POST', {})).response.status, 405)
  const crossOrigin = await fetch(`${base}/api/connection`, { method: 'DELETE', headers: { Cookie: cookie, Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(crossOrigin.status, 403)
  const staticResponse = await fetch(base)
  assert.equal(staticResponse.status, 200)
  assert(staticResponse.headers.get('content-security-policy')?.includes("connect-src 'self'"))
  const logout = await call('logout', 'POST')
  assert.equal(logout.response.status, 200)
  cookie = ''
  assert.equal((await call('session')).response.status, 401)
  console.log(JSON.stringify({ result: 'passed', connected: connection.data.configured, checks, liveAnbe: connection.data.configured ? 'verified' : 'Awaiting the live Anbe credential; local WordPress credentials were not sent to Anbe.', privacy: 'No configured credential appeared in API responses.', authentication: '401 without session; secure cookie login; cross-origin mutation blocked; logout clears cookie.' }, null, 2))
} catch (error) {
  let message = error instanceof Error ? error.message : 'Smoke check failed.'
  for (const value of [...Object.values(secrets), config.AI_DIAGNOSTIC_TOKEN]) if (value) message = message.split(value).join('[redacted]')
  console.error(message)
  process.exitCode = 1
}
