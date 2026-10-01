import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../deployment.json', import.meta.url), 'utf8'))
const expected = `https://${manifest.workerName}.onochieazukaeme.workers.dev`
const origin = process.argv[2] ?? expected
assert.equal(origin, expected, 'This smoke script only targets its dedicated client Worker.')
const secrets = JSON.parse(readFileSync(new URL('../.private/secrets.json', import.meta.url), 'utf8'))
const report = { checkedAt: new Date().toISOString(), worker: origin, wordpress: manifest.origin, checks: [], authenticatedWordPress: false }
const check = (name, status) => { report.checks.push({ name, status }); console.log(`${name}: HTTP ${status}`) }
async function call(path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${origin}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(20000) })
}
const anonymous = await call('/api/bridge/health')
assert.equal(anonymous.status, 401); check('Unauthenticated diagnostics rejected', anonymous.status)
const page = await call('/')
assert.equal(page.status, 200); assert(page.headers.get('Content-Security-Policy')?.includes("connect-src 'self'")); check('Dashboard and CSP', page.status)
const login = await call('/api/login', { method: 'POST', body: { password: secrets.DASHBOARD_PASSWORD } })
assert.equal(login.status, 200); check('Client dashboard login', login.status)
const cookieHeader = login.headers.get('set-cookie') ?? ''
assert(cookieHeader.startsWith(`${manifest.cookieName}=`)); assert(cookieHeader.includes('HttpOnly')); assert(cookieHeader.includes('Secure'))
const cookie = cookieHeader.split(';')[0]
try {
  const connection = await call('/api/connection', { cookie })
  assert.equal(connection.status, 200)
  const state = await connection.json()
  assert.equal(state.url, manifest.origin); assert.equal(state.name, manifest.siteName)
  check('Dedicated site identity', connection.status)
  if (!state.configured) {
    const health = await call('/api/bridge/health', { cookie })
    assert.equal(health.status, 409); check('Missing client credential fails closed', health.status)
    console.log('WordPress acceptance pending: install the plugin and set this Worker WORDPRESS_TOKEN secret.')
  } else {
    const verified = await call('/api/connection', { method: 'POST', body: {}, cookie })
    assert.equal(verified.status, 200, `WordPress verification failed: HTTP ${verified.status}`)
    check('WordPress credential verified', verified.status)
    for (const route of ['health', 'plugins', 'core-updates', 'woocommerce', 'seo/site', 'seo/posts?page=1&per_page=1', 'seo/issues?page=1&per_page=1', 'images/issues?page=1&per_page=1', 'links/issues?page=1&per_page=1']) {
      const response = await call(`/api/bridge/${route}`, { cookie })
      assert.equal(response.status, 200, `Diagnostic ${route} failed: HTTP ${response.status}`)
      const raw = await response.text()
      for (const secret of Object.values(secrets)) assert(!raw.includes(secret), 'Dashboard secret appeared in a response.')
      const data = JSON.parse(raw)
      assert.equal(data.success, true); assert.equal(data.plugin.name, 'AI Diagnostic Bridge'); assert(Array.isArray(data.findings))
      check(`WordPress ${route}`, response.status)
    }
    report.authenticatedWordPress = true
  }
} finally {
  await call('/api/logout', { method: 'POST', body: {}, cookie })
  writeFileSync(new URL('../.private/smoke-summary.json', import.meta.url), JSON.stringify(report, null, 2))
}
