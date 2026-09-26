export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') window.dispatchEvent(new Event('aidb-session-expired'))
    throw new ApiError(data.error?.message ?? 'The request failed. Please try again.', response.status, data.error?.code ?? 'request_failed')
  }
  return data as T
}
export type ConnectionInfo = { id: string; name: string; url: string; configured: boolean; verified_at: string | null }
export type Finding = { id: string; severity: string; category: string; title: string; message: string; evidence: Record<string, unknown>; source: string }
export type ExplanationFields = { summary: string; why_it_matters: string; recommended_next_step: string; verification_step: string; caveats: string }
export type Explanation = { id: string; site_id: string; finding_id: string; finding_snapshot: Record<string, unknown>; original_output: ExplanationFields; current_output: ExplanationFields; status: 'draft' | 'verified-as-is' | 'corrected'; reviewer_note: string | null; reviewer_identity: string | null; reviewed_at: string | null; created_at: string; updated_at: string }
export type PluginRecord = { name: string; slug: string; version: string; active: boolean; network_active: boolean; author: string; update: { status: string; available_version: string | null; version_jump: string | null; last_checked: string | null }; vulnerability: { status: string; checked_at?: string | null; served_from_cache?: boolean } }
export type PluginEnvelope = { success: boolean; check: { id: string; status: string; timestamp: string }; findings: Finding[]; metadata: { plugins?: PluginRecord[]; total?: number; current_version?: string; available_version?: string | null; [key: string]: unknown } }
export const scanPlugins = () => api<PluginEnvelope>('bridge/plugins')
export const scanCoreUpdates = () => api<PluginEnvelope>('bridge/core-updates')
export type PluginChangelog = { slug: string; name: string; current_version: string | null; changelog: string; source_url: string }
export const getPluginChangelog = (slug: string) => api<PluginChangelog>(`plugin-changelog?slug=${encodeURIComponent(slug)}`)
export type Post = { post_id: number; title: string; post_type: string; findings: Finding[]; check: { status: string }; metadata: Record<string, unknown> }
export type Envelope = {
  success: boolean;
  check: { id: string; status: string; timestamp: string };
  findings: Finding[];
  metadata: { items?: Post[]; pagination?: { page: number; per_page: number; total: number; pages: number }; [key: string]: unknown };
}
export const getExplanation = (findingId: string) => api<{ explanation: Explanation | null }>(`explanations?finding_id=${encodeURIComponent(findingId)}`)
export const askExplanation = (finding: Finding, post: Post, extraEvidence?: Record<string, unknown>) => api<{ explanation: Explanation }>('explanations/generate', 'POST', { finding: { ...finding, evidence: { ...finding.evidence, ...(extraEvidence ?? {}) }, post: { id: post.post_id, type: post.post_type, title: post.title } } })
export const verifyExplanation = (id: string, reviewer_note?: string) => api<{ explanation: Explanation }>(`explanations/${id}/verify`, 'POST', { reviewer_note })
export const correctExplanation = (id: string, fields: ExplanationFields, reviewer_note?: string) => api<{ explanation: Explanation }>(`explanations/${id}/correct`, 'POST', { fields, reviewer_note })
export const regenerateExplanation = (id: string) => api<{ explanation: Explanation }>(`explanations/${id}/regenerate`, 'POST', {})
export async function scanSite() {
  const site = await api<Envelope>('bridge/seo/site')
  const posts: Post[] = []
  let total = 0
  let pages = 1
  for (let page = 1; page <= Math.min(pages, 20); page++) {
    const response = await api<Envelope>(`bridge/seo/posts?page=${page}&per_page=50`)
    if (!response.metadata.pagination || !Array.isArray(response.metadata.items)) throw new Error('The scan response is incomplete. Check the installed bridge version.')
    pages = response.metadata.pagination.pages
    total = response.metadata.pagination.total
    posts.push(...response.metadata.items)
  }
  const unique = [...new Map(posts.map(post => [post.post_id, post])).values()]
  return { site, posts: unique, total, incomplete: pages > 20 || unique.length !== total, scannedAt: new Date().toISOString() }
}
