import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { siteName } = JSON.parse(readFileSync(`${root}/deployment.json`, 'utf8'))
const privateDir = `${root}/.private`
mkdirSync(privateDir, { recursive: true })
if (existsSync(`${privateDir}/secrets.json`) || existsSync(`${privateDir}/dashboard-access.txt`)) {
  throw new Error('Client secrets already exist. Refusing to overwrite them; use deliberate rotation instead.')
}
const secrets = {
  DASHBOARD_PASSWORD: randomBytes(32).toString('base64url'),
  SESSION_KEY: randomBytes(32).toString('base64url'),
}
writeFileSync(`${privateDir}/secrets.json`, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' })
writeFileSync(`${privateDir}/dashboard-access.txt`, `${siteName} diagnostic dashboard access key\n\n${secrets.DASHBOARD_PASSWORD}\n\nKeep private and save in your password manager. This is not the WordPress credential.\n`, { mode: 0o600, flag: 'wx' })
console.log('Generated fresh client-only dashboard and session secrets in ignored .private/. No secret values printed.')
