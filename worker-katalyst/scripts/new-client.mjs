import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const [slug, origin, siteName, ...namespaces] = process.argv.slice(2)
assert(/^[a-z][a-z0-9-]{1,30}$/.test(slug ?? ''), 'Usage: node scripts/new-client.mjs <slug> <https://site> "Site name" <login-id> <api-id> <connection-id>')
assert(siteName?.trim() && !/[\r\n]/.test(siteName) && siteName.length <= 100, 'A short, single-line site name is required.')
const url = new URL(origin)
assert(url.protocol === 'https:' && url.origin === origin, 'Use an exact HTTPS origin without a trailing slash, credentials, path, or query.')
assert(namespaces.length === 3 && namespaces.every(value => /^[1-9]\d{0,14}$/.test(value)) && new Set(namespaces).size === 3, 'Supply three distinct positive rate-limit namespace IDs.')
const source = fileURLToPath(new URL('../', import.meta.url))
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: source, encoding: 'utf8' }).trim()
const prefix = relative(root, source).replaceAll('\\', '/').replace(/\/$/, '')
const old = JSON.parse(readFileSync(join(source, 'deployment.json'), 'utf8'))
assert(origin !== old.origin, 'A new client needs its own origin.')
assert(namespaces.every(value => !old.rateNamespaceIds.includes(value)), 'Do not reuse the template client rate-limit namespaces.')
const target = join(dirname(source.replace(/[\\/]$/, '')), `worker-${slug}`)
assert(!existsSync(target), 'The target already exists. Refusing to overwrite a deployment.')
const paths = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: root }).toString('utf8').split('\0').filter(Boolean)
assert(paths.length > 0, 'Commit the template before cloning it.')
const next = { ...old, workerName: `ai-diagnostic-bridge-${slug}`, databaseName: `ai-diagnostic-bridge-${slug}`, databaseId: '00000000-0000-0000-0000-000000000000', origin, siteName, rateNamespaceIds: namespaces, cookieName: `__Host-aidb_${slug}_session` }
const replacements = [[old.workerName, next.workerName], [old.databaseId, next.databaseId], [old.origin, origin], [new URL(old.origin).hostname, url.hostname], [old.siteName, siteName], [old.cookieName, next.cookieName], ...old.rateNamespaceIds.map((value, index) => [value, namespaces[index]])]
for (const name of paths) {
  const local = name.slice(prefix.length + 1)
  if (local === 'DEPLOYMENT-JOURNAL.md') continue
  assert(!/(^|\/)(\.private|\.wrangler|node_modules|dist)(\/|$)/.test(local), 'Template unexpectedly contains private/generated state.')
  const destination = join(target, local)
  mkdirSync(dirname(destination), { recursive: true })
  let bytes = execFileSync('git', ['show', `HEAD:${name}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
  if (!/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|zip)$/i.test(local)) {
    let text = bytes.toString('utf8')
    for (const [from, to] of replacements) text = text.split(from).join(to)
    bytes = Buffer.from(text)
  }
  writeFileSync(destination, bytes, { flag: 'wx' })
}
writeFileSync(join(target, 'deployment.json'), JSON.stringify(next, null, 2) + '\n')
writeFileSync(join(target, 'DEPLOYMENT-JOURNAL.md'), `# ${siteName} deployment journal\n\nScaffolded from committed source. No database, credentials, deployment, or site verification exists yet. Follow CLIENT-DEPLOYMENT-RUNBOOK.md.\n`, { flag: 'wx' })
console.log(`Created ${relative(root, target)} from tracked source only. Provision NEW D1 and NEW secrets; confirm all three rate-limit IDs are unused across the Cloudflare account before deployment.`)
