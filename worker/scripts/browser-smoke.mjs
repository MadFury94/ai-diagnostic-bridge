import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const base = process.argv[2]
if (!base || new URL(base).protocol !== 'https:') throw new Error('Supply the deployed HTTPS Worker origin.')
const secrets = JSON.parse(readFileSync(new URL('../.private/secrets.json', import.meta.url), 'utf8'))
const rawEnv = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
const wpToken = rawEnv.match(/^AI_DIAGNOSTIC_TOKEN\s*=\s*(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '')
assert(wpToken)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const pageErrors = []
  const requests = []
  const responseChecks = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => {
    requests.push({ url: request.url(), hasWordPressToken: JSON.stringify(request.headers()).includes(wpToken) || Boolean(request.postData()?.includes(wpToken)) })
  })
  page.on('response', response => {
    if (response.url().includes('/api/')) responseChecks.push(response.text().then(body => {
      assert(!body.includes(wpToken), 'WordPress credential in browser response')
      assert(!body.includes(secrets.CREDENTIAL_KEY), 'Encryption key in browser response')
    }))
  })
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByLabel('Dashboard access key').fill(secrets.DASHBOARD_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('heading', { name: 'Anbe Nigeria', exact: true }).waitFor()
  const connectionResponse = await page.request.get(`${base}/api/connection`)
  const connection = await connectionResponse.json()
  if (connection.configured) {
  await page.getByText('Last successful scan:', { exact: false }).waitFor({ timeout: 60000 })
  await page.getByRole('heading', { name: 'Anbe Nigeria', exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('../.private/dashboard-desktop.png', import.meta.url)), fullPage: true })
  await page.getByRole('textbox', { name: 'Search findings' }).fill('About ANBE Nigeria')
  const about = page.getByRole('button').filter({ hasText: 'About ANBE Nigeria' })
  await about.click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('heading', { name: 'Evidence', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: 'Search findings' }).fill('')
  await page.getByRole('link', { name: 'Site connection', exact: true }).click()
  await page.getByText('Anbe Nigeria is configured.', { exact: false }).waitFor()
  assert.equal(await page.locator('#token').inputValue(), '')
  await page.getByRole('button', { name: 'Test saved connection' }).click()
  await page.getByText('Connection verified successfully.').waitFor({ timeout: 30000 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page.getByText('Last successful scan:', { exact: false }).waitFor({ timeout: 60000 })
  } else {
    await page.getByText('No site is connected.', { exact: false }).waitFor()
    await page.getByRole('link', { name: 'Site connection', exact: true }).click()
    assert.equal(await page.locator('#token').inputValue(), '')
    await page.locator('#site-url').fill('https://example.invalid')
    await page.locator('#token').fill('synthetic-test-token-01234567890123456789')
    await page.getByRole('button', { name: 'Save and test connection' }).click()
    await page.getByRole('alert').filter({ hasText: 'Use the configured HTTPS WordPress site URL.' }).waitFor()
    assert.equal(await page.locator('#token').inputValue(), '')
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    await page.getByText('No site is connected.', { exact: false }).waitFor()
    await page.screenshot({ path: fileURLToPath(new URL('../.private/dashboard-desktop.png', import.meta.url)), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile layout overflows horizontally')
  await page.screenshot({ path: fileURLToPath(new URL('../.private/dashboard-mobile.png', import.meta.url)), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByLabel('Dashboard access key').waitFor()
  await Promise.all(responseChecks)
  assert.deepEqual(pageErrors, [])
  assert(requests.every(request => !request.hasWordPressToken), 'WordPress credential in browser request')
  assert(requests.every(request => new URL(request.url).origin === base), 'Browser contacted a third-party origin')
  console.log(JSON.stringify({ result: 'passed', connected: connection.configured, checks: ['login', ...(connection.configured ? ['live overview', 'About finding detail', 'keyboard dismiss', 'saved connection test'] : ['honest unconfigured state', 'unapproved site rejected', 'token field clears after failed save']), '390px mobile layout', 'logout', 'same-origin browser traffic', 'no known WordPress token in browser requests or responses'], screenshots: ['.private/dashboard-desktop.png', '.private/dashboard-mobile.png'] }, null, 2))
} catch (error) {
  let message = error instanceof Error ? error.message : 'Browser verification failed.'
  for (const value of [...Object.values(secrets), wpToken]) message = message.split(value).join('[redacted]')
  console.error(message)
  process.exitCode = 1
} finally { await browser.close() }
