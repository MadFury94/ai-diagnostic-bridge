export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export const encode = (data: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(data)))
export const decode = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0))
const bytes = (value: string) => new TextEncoder().encode(value)

async function hmac(secret: string) {
  return crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
export async function passwordMatches(input: string, expected: string, key: string) {
  const imported = await hmac(key)
  const signature = await crypto.subtle.sign('HMAC', imported, bytes(expected))
  return crypto.subtle.verify('HMAC', imported, signature, bytes(input))
}
export async function createSession(secret: string, expires = Date.now() + 8 * 60 * 60 * 1000) {
  const payload = `${expires}:${crypto.randomUUID()}`
  return `${encode(bytes(payload))}.${encode(await crypto.subtle.sign('HMAC', await hmac(secret), bytes(payload)))}`
}
export async function validSession(token: string, secret: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 2 || token.length > 256) return false
    const payload = new TextDecoder().decode(decode(parts[0]))
    const expires = Number(payload.split(':')[0])
    return expires > Date.now() && expires <= Date.now() + 8 * 60 * 60 * 1000 &&
      await crypto.subtle.verify('HMAC', await hmac(secret), decode(parts[1]), bytes(payload))
  } catch { return false }
}
export async function encryptToken(token: string, key: string, siteUrl: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(`default:${siteUrl}`) }, imported, bytes(token))
  return { iv: encode(iv), ciphertext: encode(ciphertext) }
}
export async function decryptToken(row: { iv: string; ciphertext: string; url: string }, key: string) {
  const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(row.iv), additionalData: bytes(`default:${row.url}`) }, imported, decode(row.ciphertext)))
}
export function siteOrigin(input: unknown, allowed: string) {
  try {
    const url = new URL(String(input))
    if (url.protocol !== 'https:' || url.origin !== allowed || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
    return url.origin
  } catch { throw new ApiError(400, 'invalid_site', 'Use the configured HTTPS WordPress site URL.') }
}
export async function boundedJson(input: Request | Response, max: number): Promise<unknown> {
  if (Number(input.headers.get('content-length')) > max) throw new ApiError(413, 'too_large', 'The response or request exceeds the allowed size.')
  const reader = input.body?.getReader()
  if (!reader) throw new ApiError(400, 'invalid_json', 'A JSON body is required.')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new ApiError(413, 'too_large', 'The response or request exceeds the allowed size.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(result)) } catch { throw new ApiError(502, 'invalid_json', 'The service did not return valid diagnostic JSON.') }
}
