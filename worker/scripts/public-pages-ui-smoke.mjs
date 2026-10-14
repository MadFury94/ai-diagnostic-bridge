// Local production-build UI exercise. API responses are synthetic and no
// production origins, credentials, database, or email service are contacted.
import { createServer } from 'node:http'
import { readFile, stat, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../../', import.meta.url))
const findings = [{ id: 'public-image-http-error-fixture', severity: 'medium', category: 'public-availability', source: 'public_http', title: 'Image returned an HTTP error', message: 'The public GET request returned HTTP 404.', evidence: { url: 'https://public.example.com/missing.png', page_url: 'https://public.example.com/', response_status: 404 } }]
const envelope = { success: true, check: { id: 'fixture', status: 'ok', timestamp: new Date().toISOString() }, findings: [], metadata: {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const output = path.join(root, 'worker/.private/public-pages-ui')
await mkdir(output, { recursive: true })
try {
  for (const [name, directory] of [['anbe', 'dashboard/dist'], ['katalyst', 'worker-katalyst/dashboard/dist'], ['missus', 'worker-missus/dashboard/dist']]) {
    const dist = path.join(root, directory)
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
        let file = path.resolve(dist, '.' + pathname)
        if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html')
        try { if (!(await stat(file)).isFile()) file = path.join(dist, 'index.html') } catch { file = path.join(dist, 'index.html') }
        response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
        response.end(await readFile(file))
      } catch { response.writeHead(500); response.end('Fixture server error') }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    const apiPaths = []
    let incomplete = false
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      apiPaths.push(url.pathname)
      const publicScan = { ...envelope, findings, metadata: { enabled: true, incomplete, configured_pages: 1, checked: 2, skipped: 0, reasons: incomplete ? ['request_timeout'] : [], observations: [{ url: 'https://public.example.com/missing.png', kind: 'image', outcome: 'http_error', status: 404 }] } }
      let data = envelope
      if (url.pathname === '/api/session') data = { authenticated: true }
      else if (url.pathname === '/api/connection') data = { configured: true, name: 'Local public checks fixture', url: 'https://public.example.com', alert_severity: 'high', alert_email: '' }
      else if (url.pathname === '/api/scan') data = { site: envelope, publicScan, posts: [], total: 0, incomplete, scannedAt: new Date().toISOString() }
      else if (url.pathname === '/api/public-scan') data = publicScan
      else if (url.pathname === '/api/explanations') data = { explanation: null }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    })
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/findings`)
      await page.getByText('Public page checks', { exact: true }).waitFor()
      await page.getByRole('button', { name: /Public pages, links and images/ }).click()
      await page.getByRole('dialog').getByText('https://public.example.com/missing.png', { exact: false }).waitFor()
      assert.equal(apiPaths.some(url => url.includes('/seo/post/-1')), false)
      assert.equal(await page.getByRole('dialog').getByText('WordPress ID -1', { exact: false }).count(), 0)
      assert(apiPaths.includes('/api/public-scan'))
      await page.screenshot({ path: path.join(output, `${name}-detail.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 390, height: 844 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile viewport overflow')
      incomplete = true
      await page.getByRole('button', { name: 'Run scan' }).click()
      await page.getByText('This scan is incomplete.', { exact: false }).waitFor()
      await page.screenshot({ path: path.join(output, `${name}-mobile-partial.png`), fullPage: true })
      assert.deepEqual(errors, [])
      console.log(`${name}: public summary, finding detail, correct refresh endpoint, mobile layout and incomplete coverage passed`)
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)) }
  }
} finally { await browser.close() }
