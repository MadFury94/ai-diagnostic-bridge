import type { AlertSite } from './alerts'

// Fixed deployment origin, no WordPress credentials, no diagnostic dependency.
export async function probeAvailability(origin: string): Promise<string | null> {
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Invalid availability origin')
  let url = new URL('/', base)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'AI-Diagnostic-Bridge-Availability/1.0' } })
      await response.body?.cancel()
      if (response.status >= 200 && response.status < 300) return null
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location')
        if (!location) return 'Redirect without destination'
        const next = new URL(location, url)
        if (next.origin !== base.origin || next.username || next.password) return 'Redirect outside configured origin'
        url = next
        continue
      }
      return `HTTP ${response.status}`
    }
    return 'Too many redirects'
  } catch { return controller.signal.aborted ? 'Timed out after 10 seconds' : 'Connection failed' }
  finally { clearTimeout(timer) }
}

export async function recordAvailability(env: Env, site: AlertSite, detail: string | null, time: number) {
  const failed = detail === null ? 0 : 1
  const enabled = Boolean(site.alert_email && env.RESEND_API_KEY && env.ALERT_EMAIL_FROM)
  // Batch is atomic; timestamp guard ignores overlapping, repeated and stale ticks.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO availability_state (site_id) VALUES (?)').bind(site.id),
    env.DB.prepare(`INSERT INTO availability_emails (id, site_id, recipient, state, detail, detected_at)
      SELECT ?, site_id, ?, CASE WHEN ? = 1 THEN 'down' ELSE 'recovered' END, ?, ?
      FROM availability_state WHERE site_id = ? AND checked_at < ? AND ? = 1
      AND ((? = 1 AND failures >= 1 AND down = 0 AND checked_at >= ?)
        OR (? = 0 AND down = 1))`)
      .bind(crypto.randomUUID(), site.alert_email, failed, detail ?? 'Homepage returned HTTP 2xx', time,
        site.id, time, enabled ? 1 : 0, failed, time - 15 * 60000, failed),
    env.DB.prepare(`UPDATE availability_state SET failures = CASE WHEN ? = 0 THEN 0
      WHEN checked_at < ? THEN 1 ELSE failures + 1 END,
      down = CASE WHEN ? = 0 THEN 0 WHEN failures >= 1 AND checked_at >= ? THEN 1 ELSE down END,
      detail = ?, checked_at = ? WHERE site_id = ? AND checked_at < ?`)
      .bind(failed, time - 15 * 60000, failed, time - 15 * 60000, detail ?? 'HTTP 2xx', time, site.id, time),
    env.DB.prepare('DELETE FROM availability_emails WHERE site_id = ? AND (recipient <> ? OR detected_at < ?)')
      .bind(site.id, site.alert_email, time - 23 * 60 * 60000),
  ])
}

export async function sendAvailabilityEmails(env: Env, site: AlertSite) {
  if (!site.alert_email || !env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) return
  for (let i = 0; i < 4; i++) {
    const now = Date.now()
    const event = await env.DB.prepare(`UPDATE availability_emails SET lease_until = ? WHERE id = (
      SELECT id FROM availability_emails WHERE site_id = ? AND recipient = ? AND sent_at IS NULL
      AND lease_until <= ? AND id = (SELECT id FROM availability_emails WHERE site_id = ? AND recipient = ? AND sent_at IS NULL ORDER BY detected_at LIMIT 1) ORDER BY detected_at LIMIT 1
    ) RETURNING id, state, detail, detected_at`)
      .bind(now + 60000, site.id, site.alert_email, now, site.id, site.alert_email)
      .first<{ id: string; state: string; detail: string; detected_at: number }>()
    if (!event) return
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `availability/${event.id}` },
        body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: [site.alert_email],
          subject: event.state === 'down' ? 'Website availability check failed' : 'Website is responding again',
          text: `Site: ${new URL(env.ALLOWED_SITE_ORIGIN).origin}\nStatus: ${event.state}\nCheck: ${event.detail}\nObserved: ${new Date(event.detected_at).toISOString()}\nThis checks the public homepage from Cloudflare, independently of WordPress diagnostics.` }),
      })
      await response.body?.cancel()
      if (!response.ok) throw new Error('Delivery failed')
      await env.DB.prepare('UPDATE availability_emails SET sent_at = ?, lease_until = 0 WHERE id = ?').bind(Date.now(), event.id).run()
    } catch { console.log(JSON.stringify({ event: 'availability_email', status: 'failed' })); return }
  }
}

export async function checkAvailability(env: Env, site: AlertSite, time: number) {
  const detail = await probeAvailability(env.ALLOWED_SITE_ORIGIN)
  await recordAvailability(env, site, detail, time)
  await sendAvailabilityEmails(env, site)
  console.log(JSON.stringify({ event: 'availability_check', status: detail === null ? 'up' : 'failed' }))
}
