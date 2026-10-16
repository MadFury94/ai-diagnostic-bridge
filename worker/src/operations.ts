import { fetchBridge, object } from './bridge'
import { type AlertSite, sendFindingAlerts, severities } from './alerts'
import { decryptToken } from './security'

declare global { interface Env { OPERATIONAL_MONITOR_ENABLED?: string } }
export const operationalSources = ['database_log', 'wp_cron', 'action_scheduler'] as const
type Source = typeof operationalSources[number]
type State = { checked_at: number; since_at: number; fingerprint: string; active: number; status: string; evidence: string }
const titles: Record<Source, string> = {
  database_log: 'Recent database Commands out of sync errors observed',
  wp_cron: 'An overdue WordPress cron event has not progressed',
  action_scheduler: 'An overdue Action Scheduler task has not progressed',
}
const messages: Record<Source, string> = {
  database_log: 'The configured log contains this database error within the last 15 minutes. This does not prove table corruption or identify the initiating plugin. Review hosting logs and recent changes; do not repair tables solely on this evidence.',
  wp_cron: 'The same event remained overdue across at least 15 minutes of observations. Other events may still run. Check the WordPress or external cron runner and hosting logs. A disabled built-in cron alone is not treated as failure.',
  action_scheduler: 'The same pending or running task remained overdue across at least 15 minutes of observations. Other tasks may still complete. Review WooCommerce Scheduled Actions and hosting logs without blindly retrying jobs. This observation is site-wide, not attributed to WooCommerce alone.',
}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
export function evaluateOperation(source: Source, raw: unknown, previous: State, time: number) {
  const data = object(raw)
  let status = 'unknown', since = 0, fingerprint = ''
  const evidence: Record<string, unknown> = { observed_at: time, scope: source === 'database_log' ? 'configured-log-tail' : 'site-wide' }
  if (source === 'database_log') {
    const priorEvidence = object(JSON.parse(previous.evidence))
    for (const key of ['log_id', 'bytes_read', 'rotation_since']) if (priorEvidence[key] !== undefined) evidence[key] = priorEvidence[key]
    if (['pass', 'fail', 'unknown'].includes(String(data.status)) && integer(data.count) && data.count <= 65536 && integer(data.latest_at) && integer(data.scheduler_count) && data.scheduler_count <= data.count && data.window_seconds === 900 && typeof data.truncated === 'boolean' && typeof data.log_id === 'string' && /^[a-f0-9]{64}$/.test(data.log_id) && integer(data.bytes_read) && data.bytes_read <= 65536) {
      const changed = priorEvidence.log_id !== data.log_id || (typeof priorEvidence.bytes_read === 'number' && data.bytes_read < priorEvidence.bytes_read)
      const rotationSince = changed && previous.active ? time : Number(priorEvidence.rotation_since ?? 0)
      Object.assign(evidence, { count: data.count, latest_at: data.latest_at, scheduler_count: data.scheduler_count, window_seconds: 900, truncated: data.truncated, log_id: data.log_id, bytes_read: data.bytes_read, rotation_since: rotationSince })
      if (data.status === 'fail' && data.count > 0 && data.latest_at * 1000 >= time - 900000 && data.latest_at * 1000 <= time + 300000) status = 'fail'
      if (data.status === 'pass' && data.count === 0 && data.latest_at === 0 && !data.truncated && (!previous.active || rotationSince === 0 || time - rotationSince >= 900000)) status = 'pass'
    }
  } else if (data.status === 'observed' && integer(data.count) && data.count <= 100 && integer(data.oldest_due) && typeof data.truncated === 'boolean' && typeof data.fingerprint === 'string') {
    if (data.count === 0 && data.oldest_due === 0 && data.fingerprint === '' && !data.truncated) status = 'pass'
    else if (data.count > 0 && data.oldest_due > 0 && data.oldest_due * 1000 <= time && /^[a-f0-9]{64}$/.test(data.fingerprint)) {
      fingerprint = data.fingerprint
      const continuous = previous.status !== 'unknown' && previous.fingerprint === fingerprint && previous.since_at > 0 && time - previous.checked_at <= 600000
      since = continuous ? previous.since_at : time
      status = time - since >= 900000 ? 'fail' : 'observing'
    }
    Object.assign(evidence, { count: data.count, oldest_due: data.oldest_due, truncated: data.truncated, unchanged_since: since, observation_window_seconds: 900 })
  }
  if (status === 'unknown') evidence.reason = 'Observation unavailable, incomplete, stale, or unsupported; earlier findings are not confirmed cleared.'
  const active = status === 'unknown' ? previous.active : status === 'fail' ? 1 : 0
  return { status, since, fingerprint, active, evidence }
}

export async function recordOperation(env: Env, site: AlertSite, source: Source, raw: unknown, time: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO operational_states (site_id, source) VALUES (?, ?)').bind(site.id, source).run()
  const previous = await env.DB.prepare('SELECT checked_at, since_at, fingerprint, active, status, evidence FROM operational_states WHERE site_id = ? AND source = ?').bind(site.id, source).first<State>()
  if (!previous || previous.checked_at >= time) return
  const result = evaluateOperation(source, raw, previous, time)
  const route = `operations/${source}`
  const enabled = Boolean(site.alert_email && env.RESEND_API_KEY && env.ALERT_EMAIL_FROM && env.DASHBOARD_ORIGIN && severities.indexOf(site.alert_severity as typeof severities[number]) <= severities.indexOf('high'))
  // Compare-and-set guards the evidence and notification against concurrent/stale observations.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO finding_email_alerts (id, site_id, finding_id, title, severity, route, site_name, recipient, detected_at, lease_until, sent_at)
      SELECT ?, site_id, ?, ?, 'high', ?, ?, ?, ?, 0, NULL FROM operational_states
      WHERE site_id = ? AND source = ? AND checked_at = ? AND active = 0 AND ? = 1 AND ? = 1`)
      .bind(crypto.randomUUID(), `operational-${source}`, titles[source], route, new URL(site.url).hostname, site.alert_email, new Date(time).toISOString(), site.id, source, previous.checked_at, result.status === 'fail' ? 1 : 0, enabled ? 1 : 0),
    env.DB.prepare(`DELETE FROM finding_email_alerts WHERE site_id = ? AND route = ? AND sent_at IS NULL
      AND (recipient <> ? OR detected_at < ? OR (? = 0 AND ? <> 'unknown'))
      AND EXISTS (SELECT 1 FROM operational_states WHERE site_id = ? AND source = ? AND checked_at = ?)`)
      .bind(site.id, route, site.alert_email, new Date(time - 23 * 3600000).toISOString(), result.active, result.status, site.id, source, previous.checked_at),
    env.DB.prepare('UPDATE operational_states SET checked_at = ?, since_at = ?, fingerprint = ?, active = ?, status = ?, evidence = ? WHERE site_id = ? AND source = ? AND checked_at = ?')
      .bind(time, result.since, result.fingerprint, result.active, result.status, JSON.stringify(result.evidence), site.id, source, previous.checked_at),
  ])
}

export async function checkOperations(env: Env, site: AlertSite & { ciphertext: string; iv: string }, scheduledTime: number) {
  if (env.OPERATIONAL_MONITOR_ENABLED !== 'true') return
  const time = Math.floor(scheduledTime / 300000) * 300000
  let sources: Record<string, unknown> = {}
  try {
    const token = await decryptToken(site, env.CREDENTIAL_KEY)
    const response = await fetchBridge(site.url, token, 'operations', env)
    const observed = response.metadata.observed_at
    if (response.metadata.contract_version === 1 && integer(observed) && Math.abs(Date.now() - observed * 1000) <= 120000) sources = object(response.metadata.sources)
  } catch { console.log(JSON.stringify({ event: 'operational_check', status: 'unavailable' })) }
  for (const source of operationalSources) await recordOperation(env, site, source, sources[source], time)
  await sendFindingAlerts(env, site)
}

export async function readOperation(env: Env, siteId: string, source: Source) {
  const state = await env.DB.prepare('SELECT checked_at, since_at, fingerprint, active, status, evidence FROM operational_states WHERE site_id = ? AND source = ?').bind(siteId, source).first<State>()
  const available = Boolean(state && state.status !== 'unknown' && Date.now() - state.checked_at <= 900000)
  return { source, available, state: state ? { status: state.status, checked_at: state.checked_at, evidence: JSON.parse(state.evidence) } : null,
    finding: state?.active ? { id: `operational-${source}`, severity: 'high', category: 'operations', source: 'operational-monitor', title: titles[source], message: messages[source], evidence: JSON.parse(state.evidence) } : null }
}

export function operationalEmailExplanation(route: string) {
  const source = route.slice('operations/'.length) as Source
  return operationalSources.includes(source) ? messages[source] : ''
}
