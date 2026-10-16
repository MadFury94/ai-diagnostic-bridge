import { object } from './bridge'
import { ApiError } from './security'
import { operationalEmailExplanation } from './operations'

declare global { interface Env { RESEND_API_KEY?: string; ALERT_EMAIL_FROM?: string; DASHBOARD_ORIGIN?: string } }
export const severities = ['info', 'low', 'medium', 'high', 'critical'] as const
export type AlertSettings = { alert_email: string; alert_severity: string }
export const defaultAlerts: AlertSettings = { alert_email: 'webdeveloperbrian@gmail.com', alert_severity: 'high' }
export function parseAlertSettings(value: unknown): AlertSettings {
  const data = object(value)
  if (typeof data.alert_email !== 'string' || data.alert_email.length > 254 ||
      (data.alert_email !== '' && !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(data.alert_email)) ||
      !severities.includes(data.alert_severity as typeof severities[number])) throw new ApiError(400, 'invalid_alert_settings', 'Enter one recipient email (or leave blank to disable) and a valid severity.')
  return { alert_email: data.alert_email, alert_severity: String(data.alert_severity) }
}
export type ScanFinding = { id: string; title: string; severity: string; route: string }
export type AlertSite = AlertSettings & { id: string; name: string; url: string }
const log = (status: string) => console.log(JSON.stringify({ event: 'finding_email', status }))
const label = (value: string, secrets: string[]) => {
  let result = value
  for (const secret of secrets) if (secret) result = result.split(secret).join('[redacted]')
  return result.replace(/Bearer\s+\S+/gi, '[redacted]').replace(/https?:\/\/\S+/gi, '[link omitted]').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 180)
}

// Called only after the Worker finishes every required diagnostic page. The
// transaction compares and replaces the baseline atomically; first scan is silent.
export async function recordCompletedScan(env: Env, site: AlertSite, findings: ScanFinding[], startedAt: number, completedAt: string, secrets: string[] = []) {
  const byId = new Map<string, ScanFinding>()
  for (const finding of findings) {
    const previous = byId.get(finding.id)
    if (!previous || severities.indexOf(finding.severity as typeof severities[number]) > severities.indexOf(previous.severity as typeof severities[number])) byId.set(finding.id, finding)
  }
  const unique = [...byId.values()]
  const pending = unique.filter(finding => severities.indexOf(finding.severity as typeof severities[number]) >= severities.indexOf(site.alert_severity as typeof severities[number]))
    .map(finding => ({ id: finding.id, route: finding.route, severity: finding.severity, alert_id: crypto.randomUUID(), title: label(finding.title, secrets) }))
  const enabled = Boolean(site.alert_email && env.RESEND_API_KEY && env.ALERT_EMAIL_FROM && env.DASHBOARD_ORIGIN)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO finding_email_alerts (id, site_id, finding_id, title, severity, route, site_name, recipient, detected_at, lease_until, sent_at)
      SELECT json_extract(value, '$.alert_id'), ?, json_extract(value, '$.id'), json_extract(value, '$.title'), json_extract(value, '$.severity'), json_extract(value, '$.route'), ?, ?, ?, 0, NULL
      FROM json_each(?) WHERE ? AND EXISTS (SELECT 1 FROM finding_scan_baselines WHERE site_id = ? AND started_at < ?)
      AND json_extract(value, '$.id') NOT IN (SELECT j.value FROM finding_scan_baselines b, json_each(b.finding_ids) j WHERE b.site_id = ?)`)
      .bind(site.id, `${label(site.name, secrets)} (${new URL(site.url).hostname})`, site.alert_email, completedAt, JSON.stringify(pending), enabled ? 1 : 0, site.id, startedAt, site.id),
    env.DB.prepare(`INSERT INTO finding_scan_baselines (site_id, finding_ids, started_at) VALUES (?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET finding_ids = excluded.finding_ids, started_at = excluded.started_at WHERE started_at < excluded.started_at`)
      .bind(site.id, JSON.stringify(unique.map(finding => finding.id)), startedAt),
    // Resolved findings and obsolete recipients must not receive delayed emails.
    env.DB.prepare(`DELETE FROM finding_email_alerts WHERE site_id = ? AND route NOT LIKE 'operations/%' AND sent_at IS NULL AND (recipient <> ? OR finding_id NOT IN
      (SELECT j.value FROM finding_scan_baselines b, json_each(b.finding_ids) j WHERE b.site_id = ?))`).bind(site.id, site.alert_email, site.id),
  ])
}

type PendingAlert = { id: string; title: string; severity: string; site_name: string; recipient: string; detected_at: string; route: string }
export async function sendFindingAlerts(env: Env, site: AlertSite) {
  if (!site.alert_email || !env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM || !env.DASHBOARD_ORIGIN) return
  try {
    const origin = new URL(env.DASHBOARD_ORIGIN)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) { log('configuration_invalid'); return }
    const started = Date.now()
    while (Date.now() - started < 20000) {
      const now = Date.now()
      const alert = await env.DB.prepare(`UPDATE finding_email_alerts SET lease_until = ? WHERE id = (
        SELECT id FROM finding_email_alerts WHERE site_id = ? AND recipient = ? AND sent_at IS NULL AND lease_until <= ? ORDER BY detected_at, id LIMIT 1
      ) RETURNING id, title, severity, site_name, recipient, detected_at, route`).bind(now + 60000, site.id, site.alert_email, now).first<PendingAlert>()
      if (!alert) break
      const link = new URL('/findings', origin)
      link.searchParams.set('alert', alert.id)
      const operational = alert.route.startsWith('operations/')
      const body = { from: env.ALERT_EMAIL_FROM, to: [alert.recipient], subject: operational ? `${alert.site_name}: ${alert.title}` : 'New diagnostic finding',
        text: `Site: ${alert.site_name}\nFinding: ${alert.title}\nSeverity: ${alert.severity}\nDetected: ${alert.detected_at}\nView finding (sign-in required): ${link.href}${operational ? `\n\n${operationalEmailExplanation(alert.route)}\n\nChecked every five minutes independently of the full diagnostic scan. This is evidence observed at the time above, not a guarantee that the condition is still present. The authenticated detail shows the latest observation and coverage. Persistent findings do not email on every check.` : ''}` }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        let response: Response
        try {
          response = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `finding/${alert.id}` }, body: JSON.stringify(body) })
        } catch (error) {
          const kind = error instanceof Error && /^[A-Za-z]+$/.test(error.name) ? error.name : 'Error'
          log(controller.signal.aborted ? 'failed_timeout' : `failed_transport_${kind}`)
          break
        }
        await response.body?.cancel()
        if (!response.ok) { log(`failed_${response.status}`); break }
        try { await env.DB.prepare('UPDATE finding_email_alerts SET sent_at = ?, lease_until = 0 WHERE id = ?').bind(Date.now(), alert.id).run() }
        catch { log('failed_mark'); break }
        log('accepted')
      } catch { log('failed'); break }
      finally { clearTimeout(timeout) }
    }
  } catch { log('failed') }
}
