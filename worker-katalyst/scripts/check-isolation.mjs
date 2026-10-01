import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(`${root}/deployment.json`, 'utf8'))
const config = readFileSync(`${root}/wrangler.toml`, 'utf8')
const rootSection = config.split('\n[')[0]
const database = config.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/g) ?? []
const quoted = (section, key) => section.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
assert.equal(quoted(rootSection, 'name'), manifest.workerName)
assert.equal(database.length, 1, 'Exactly one client database must be bound.')
assert.equal(quoted(database[0], 'database_name'), manifest.databaseName)
assert.equal(quoted(database[0], 'database_id'), manifest.databaseId)
assert.match(manifest.databaseId, /^[0-9a-f-]{36}$/)
assert.notEqual(manifest.databaseId, '00000000-0000-0000-0000-000000000000', 'Provision a new D1 database first.')
assert.equal(quoted(config, 'ALLOWED_SITE_ORIGIN'), manifest.origin)
assert.equal(quoted(config, 'SITE_NAME'), manifest.siteName)
assert.equal(new URL(manifest.origin).origin, manifest.origin)
assert.equal(new URL(manifest.origin).protocol, 'https:')
const namespaces = [...config.matchAll(/^namespace_id\s*=\s*"(\d+)"/gm)].map(match => match[1])
assert.deepEqual(namespaces, manifest.rateNamespaceIds)
assert.equal(new Set(namespaces).size, 3)
assert.equal(quoted(config, 'directory'), './dashboard/dist')
assert(!existsSync(`${root}/wrangler.jsonc`) && !existsSync(`${root}/wrangler.json`), 'Use only this client TOML config.')
assert(readFileSync(`${root}/src/index.ts`, 'utf8').includes(`const cookieName = '${manifest.cookieName}'`))
console.log(`Isolation configuration verified for ${manifest.workerName}; one dedicated database and three dedicated rate-limit namespaces.`)
