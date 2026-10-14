import { scanPublicPages } from './public-scan'
import { fetchBridge, object } from './bridge'
import { ScanFinding } from './alerts'

// Read all alert sources on the server; browser-submitted findings cannot seed
// alerts or claim that a partial scan completed.
export async function scanSite(env: Env, url: string, token: string) {
  const publicScan = await scanPublicPages(env, url)
  const findings: ScanFinding[] = publicScan.findings.map(finding => ({ id: finding.id, title: finding.title, severity: finding.severity, route: `public/pages/${publicScan.metadata.scope}` }))
  let incomplete = publicScan.metadata.incomplete
  const read = async (route: string) => {
    const result = await fetchBridge(url, token, route, env)
    if (object(result.check).status === 'unknown' || result.metadata.truncated === true) incomplete = true
    for (const raw of result.findings) {
      const item = object(raw)
      findings.push({ id: String(item.id), title: String(item.title), severity: String(item.severity), route })
    }
    return result
  }
  const site = await read('seo/site')
  for (const route of ['health', 'plugins', 'core-updates', 'woocommerce']) await read(route)
  const posts: Record<string, unknown>[] = []
  let total = 0
  let pages = 1
  for (let page = 1; page <= Math.min(pages, 20); page++) {
    const result = await read(`seo/posts?page=${page}&per_page=50`)
    const pagination = object(result.metadata.pagination)
    if (!Array.isArray(result.metadata.items) || !Number.isInteger(pagination.total) || !Number.isInteger(pagination.pages) || Number(pagination.pages) < 0 || Number(pagination.total) < 0 || Number(pagination.page) !== page) { incomplete = true; break }
    if (page > 1 && (total !== pagination.total || pages !== Math.max(1, Number(pagination.pages)))) incomplete = true
    total = Number(pagination.total)
    pages = Math.max(1, Number(pagination.pages))
    for (const raw of result.metadata.items) {
      const post = object(raw)
      if (!Number.isInteger(post.post_id) || !Array.isArray(post.findings)) { incomplete = true; continue }
      if (object(post.check).status === 'unknown' || object(post.metadata).truncated === true) incomplete = true
      posts.push(post)
      for (const rawFinding of post.findings) {
        const finding = object(rawFinding)
        findings.push({ id: String(finding.id), title: String(finding.title), severity: String(finding.severity), route: `seo/post/${post.post_id}` })
      }
    }
  }
  const unique = [...new Map(posts.map(post => [post.post_id, post])).values()]
  incomplete ||= pages > 20 || unique.length !== total || unique.length !== posts.length
  return { publicScan, site, posts: unique, total, incomplete, scannedAt: new Date().toISOString(), findings }
}
