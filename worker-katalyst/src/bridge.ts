import { ApiError, boundedJson, siteOrigin } from './security'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const collectionRoutes = new Set(['seo/posts', 'seo/issues', 'images/issues', 'links/issues'])
export function bridgePath(path: string, params: URLSearchParams) {
  if (!['health', 'plugins', 'core-updates', 'woocommerce', 'seo/site', ...collectionRoutes].includes(path) && !/^seo\/post\/[1-9]\d{0,9}$/.test(path)) throw new ApiError(404, 'route_not_found', 'This diagnostic route is not available.')
  const query = new URLSearchParams()
  for (const [key, value] of params) {
    if (!collectionRoutes.has(path) || !['page', 'per_page'].includes(key) || params.getAll(key).length !== 1 || !/^[1-9]\d*$/.test(value) || Number(value) > (key === 'page' ? 1000 : 50)) throw new ApiError(400, 'invalid_query', 'Use page 1–1000 and per_page 1-50 on collection routes only.')
    query.set(key, value)
  }
  if (collectionRoutes.has(path)) { if (!query.has('page')) query.set('page', '1'); if (!query.has('per_page')) query.set('per_page', '20') }
  return `${path}${query.size ? `?${query}` : ''}`
}

// Only known, bounded diagnostic observation fields survive the proxy.
const safeKeys = new Set(('contract contract_version available post id post_id post_type title value length min_length max_length check status timestamp observations slug excerpt present character_count word_count meta_description source indexability public password_protected noindex canonical sitemap determinable included headings images links count missing_alt_count featured_image attachment_id items url filename alt_present alt_length featured internal external missing_href malformed duplicate h1_count empty_count long_count hierarchy_jumps truncated pagination page per_page total pages issue_counts site home_url wp_version php_version database_version multisite https permalink_structure timezone locale memory_limit bytes recommended_minimum_bytes max_upload_size max_post_size active_theme active_theme_version active_plugin_count debug cron_disabled signal duplicates title_slug slug_matches_title image_count missing_alt heading_count level previous_level href index bytes_read plugins name version active network_active author update vulnerability available_version version_jump last_checked installed_version plugin advisory_id advisory_url official_docs_url cves affected_ranges cvss_score advisory_severity feed_updated unverifiable_advisories checked_at cache_age_seconds served_from_cache vulnerability_lookup_limit min max inclusive installed currency database_update_needed cart_page_id checkout_page_id shop_page_id pages published_page payment_gateway_count enabled_payment_gateway_count shipping enabled zone_count enabled_method_count scheduled_actions scope overdue_grace_seconds failed overdue count hpos_enabled observed_count template_count affected_components cause cause_note scope_note required_plugin pro_widget_types').split(' '))
for (const field of ['match_count', 'hierarchy_jump_count', 'long_alt_count', 'internal_count', 'external_count', 'missing_href_count', 'malformed_count', 'duplicate_count']) safeKeys.add(field)
function cleanText(value: string, secrets: string[]) {
  let result = value
  for (const secret of secrets) if (secret) result = result.split(secret).join('[redacted]')
  return result.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [redacted]').replace(/https?:\/\/[^\s<>"']+/g, raw => {
    try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString() } catch { return '[url]' }
  }).slice(0, 2000)
}
function cleanAdvisoryUrl(value: string, secrets: string[]) {
  const redacted = cleanText(value, secrets)
  try {
    const url = new URL(value)
    const cve = url.hostname === 'www.cve.org' && url.pathname === '/CVERecord' ? url.searchParams.get('id') : null
    return cve && /^CVE-\d{4}-\d{4,}$/.test(cve) ? `https://www.cve.org/CVERecord?id=${cve}` : redacted
  } catch { return redacted }
}
function safeValue(value: unknown, secrets: string[], depth = 0, key = ''): Json {
  if (depth > 12) return null
  if (typeof value === 'string') return 'advisory_url' === key ? cleanAdvisoryUrl(value, secrets) : cleanText(value, secrets)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    if (value.length > 200) throw new ApiError(502, 'invalid_contract', 'The diagnostic collection exceeds its bounds.')
    return value.map(item => safeValue(item, secrets, depth + 1, key))
  }
  const result: Record<string, Json> = {}
  for (const [key, item] of Object.entries(object(value))) {
    if (safeKeys.has(key) || /^seo-[a-z0-9-]{1,90}$/.test(key)) result[key] = safeValue(item, secrets, depth + 1, key)
  }
  return result
}
function findings(value: unknown, secrets: string[]): Json[] {
  if (!Array.isArray(value) || value.length > 200) throw new ApiError(502, 'invalid_contract', 'The finding response is invalid.')
  return value.map(item => {
    const entry = object(item)
    if (!['info', 'low', 'medium', 'high', 'critical'].includes(String(entry.severity))) throw new ApiError(502, 'invalid_contract', 'The finding severity is invalid.')
    const result: Record<string, Json> = {}
    for (const key of ['id', 'severity', 'category', 'title', 'message', 'source']) {
      if (typeof entry[key] !== 'string') throw new ApiError(502, 'invalid_contract', 'A finding field is missing.')
      result[key] = cleanText(entry[key], secrets)
    }
    result.evidence = safeValue(entry.evidence, secrets)
    return result
  })
}
export function sanitizeEnvelope(value: unknown, secrets: string[]) {
  const data = object(value)
  if (data.success !== true || object(data.plugin).name !== 'AI Diagnostic Bridge' || !['ok', 'warning', 'error', 'not_applicable', 'unknown'].includes(String(object(data.check).status))) throw new ApiError(502, 'invalid_contract', 'WordPress responded, but the response was blank or not a valid AI Diagnostic Bridge result. Check for a PHP/server error, plugin configuration issue, or hosting response problem.')
  const original = object(data.metadata)
  const metadata = object(safeValue(original, secrets))
  if (Array.isArray(original.items)) metadata.items = original.items.map(item => {
    const entry = object(item)
    const result = object(safeValue(entry, secrets))
    if ('findings' in entry) result.findings = findings(entry.findings, secrets)
    if ('metadata' in entry) result.metadata = safeValue(entry.metadata, secrets)
    return result
  })
  return {
    success: true,
    plugin: { name: 'AI Diagnostic Bridge', version: cleanText(String(object(data.plugin).version ?? ''), secrets) },
    check: safeValue(data.check, secrets),
    findings: findings(data.findings, secrets),
    metadata,
  }
}
export async function fetchBridge(url: string, token: string, route: string, env: Env) {
  const origin = siteOrigin(url, env.ALLOWED_SITE_ORIGIN)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const localRoute = origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')
    const [routePath, routeQuery] = route.split('?')
    const endpoint = localRoute
      ? `${origin}/index.php?rest_route=/ai-diagnostic/v1/${routePath}${routeQuery ? `&${routeQuery}` : ''}`
      : `${origin}/wp-json/ai-diagnostic/v1/${route}`
    const response = await fetch(endpoint, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual', signal: controller.signal,
    })
    if (!response.ok) {
      await response.body?.cancel()
      if ([401, 403].includes(response.status)) throw new ApiError(502, 'wordpress_auth', 'WordPress refused the credential. Ask the deployment administrator to replace the site credential.')
      if (response.status === 429) throw new ApiError(429, 'wordpress_rate_limit', 'WordPress is rate limiting requests. Wait a minute before retrying.')
      if (response.status >= 500) throw new ApiError(502, 'wordpress_server_error', `WordPress returned HTTP ${response.status}. The site or hosting server may be experiencing a server-side failure; no current findings are available.`)
      throw new ApiError(502, 'wordpress_route', `WordPress returned HTTP ${response.status} for the diagnostic route. Check the plugin, site URL, and hosting configuration.`)
    }
    return sanitizeEnvelope(await boundedJson(response, 1024 * 1024), [token, env.DASHBOARD_PASSWORD, env.SESSION_KEY])
  } catch (error) {
		if (error instanceof ApiError) throw error
		if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(504, 'wordpress_timeout', 'WordPress did not respond within 12 seconds. The site or hosting server may be slow or unavailable; no current findings are available.')
		throw new ApiError(502, 'wordpress_network', 'The WordPress site could not be reached, so no current findings are available. Check hosting status, DNS, SSL, firewall rules, and the saved site URL.')
  } finally { clearTimeout(timeout) }
}


