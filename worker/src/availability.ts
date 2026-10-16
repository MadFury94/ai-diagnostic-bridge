import type { AlertSite } from './alerts'

function availabilityMessage(origin: string, event: { state: string; detail: string; detected_at: number }) {
  const site = new URL(origin)
  const recovered = event.state === 'recovered'
  const explanation = recovered
    ? 'The public homepage returned a successful HTTP response after the previously detected outage.'
    : event.detail === 'HTTP 503'
      ? 'The server returned HTTP 503 (Service Unavailable). The homepage was unavailable to this monitor. Maintenance, server overload, or an application issue are possible causes; this check cannot determine which.'
      : /^HTTP 5\d\d$/.test(event.detail)
        ? 'The server returned an error while handling the homepage request. Hosting or application logs are needed to identify the cause.'
        : /^HTTP (403|429)$/.test(event.detail)
          ? 'The homepage request was blocked or rate-limited. A firewall or traffic rule may be blocking the monitor even if visitors can access the site.'
          : event.detail.startsWith('HTTP ')
            ? 'The homepage returned an unsuccessful HTTP response. Check the reported status and the website configuration.'
            : event.detail.startsWith('Redirect') || event.detail === 'Too many redirects'
              ? 'The monitor could not safely follow the homepage redirects. Check for missing destinations, redirect loops, or redirects to another domain.'
              : event.detail === 'Timed out after 10 seconds'
                ? 'The homepage did not complete its response within 10 seconds. Server slowness or a network issue may be responsible.'
                : 'The monitor could not connect successfully to the homepage. Check hosting availability, DNS, and TLS configuration.'
  return {
    subject: `${recovered ? 'Recovery' : 'Availability alert'}: ${site.hostname} — ${recovered ? 'homepage responding again' : event.detail}`,
    text: [
      recovered ? 'WEBSITE RECOVERY' : 'WEBSITE AVAILABILITY ALERT',
      `Homepage checked: ${site.origin}/`,
      `Result: ${event.detail}`,
      `Event check window (UTC): ${new Date(event.detected_at).toISOString()}`,
      '', explanation, '',
      recovered
        ? 'Confirmation: one successful homepage check following a confirmed outage.'
        : 'Confirmation: two consecutive failed checks in separate five-minute windows, no more than 15 minutes apart. This timestamp identifies the confirming check window, not the exact outage start.',
      '', 'What to do next:',
      ...(recovered ? [
        '- Open the website and verify the pages and important actions your visitors use.',
        '- If this was a planned test, confirm the temporary outage code has been removed.',
      ] : [
        '- Open the homepage to check whether visitors are affected.',
        '- If this was a planned test or maintenance, remove the test code or finish maintenance when ready.',
        '- For an unexpected failure, review recent changes and hosting/application error logs around the time above.',
        '- For blocked requests or redirect errors, check firewall and redirect settings.',
      ]),
      '', 'Monitoring continues every five minutes, independently of the hourly diagnostic scan.',
      recovered
        ? 'A successful homepage response does not confirm that checkout, every page, or all WordPress features are working.'
        : 'A recovery email is queued when a later check receives a successful HTTP response. Persistent failures do not generate a new alert every five minutes.',
      'This check observes the public homepage from Cloudflare. It does not establish the root cause or whether every visitor is affected.',
    ].join('\n'),
  }
}

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
          ...availabilityMessage(env.ALLOWED_SITE_ORIGIN, event) }),
      })
      await response.body?.cancel()
      if (!response.ok) { console.log(JSON.stringify({ event: 'availability_email', status: 'provider_rejected', http_status: response.status })); return }
      await env.DB.prepare('UPDATE availability_emails SET sent_at = ?, lease_until = 0 WHERE id = ?').bind(Date.now(), event.id).run()
      console.log(JSON.stringify({ event: 'availability_email', status: 'accepted' }))
    } catch { console.log(JSON.stringify({ event: 'availability_email', status: 'failed' })); return }
  }
}

export async function checkAvailability(env: Env, site: AlertSite, time: number) {
  const detail = await probeAvailability(env.ALLOWED_SITE_ORIGIN)
  // Manual checks and scheduler deliveries share a five-minute bucket.
  // Repeated clicks or overlapping deliveries cannot count as two failed ticks.
  await recordAvailability(env, site, detail, Math.floor(time / 300000) * 300000)
  await sendAvailabilityEmails(env, site)
  console.log(JSON.stringify({ event: 'availability_check', status: detail === null ? 'up' : 'failed' }))
}
