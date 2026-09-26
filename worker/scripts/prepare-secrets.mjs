import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const privateDir = fileURLToPath(new URL('../.private/', import.meta.url))
mkdirSync(privateDir, { recursive: true })
const secretFile = `${privateDir}/secrets.json`
if (existsSync(secretFile)) throw new Error('Secrets already exist; refusing to overwrite deployment credentials.')
const secrets = {
  DASHBOARD_PASSWORD: randomBytes(32).toString('base64url'),
  CREDENTIAL_KEY: randomBytes(32).toString('base64'),
  SESSION_KEY: randomBytes(32).toString('base64url'),
}
writeFileSync(secretFile, JSON.stringify(secrets), { mode: 0o600 })
writeFileSync(`${privateDir}/dashboard-access.txt`, `AI Diagnostic Bridge dashboard access key\n\n${secrets.DASHBOARD_PASSWORD}\n\nKeep this key private. This is not the WordPress token.\n`, { mode: 0o600 })
console.log('Created ignored deployment secrets and dashboard-access.txt. Secret values were not printed.')
