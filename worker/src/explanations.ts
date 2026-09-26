import { ApiError } from './security'
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export type ExplanationFields = {
  summary: string
  why_it_matters: string
  recommended_next_step: string
  verification_step: string
  caveats: string
}
type AIService = { run(model: string, input: unknown): Promise<unknown> }

export type ExplanationRecord = {
  id: string
  site_id: string
  finding_id: string
  finding_snapshot: Record<string, unknown>
  original_output: ExplanationFields
  current_output: ExplanationFields
  status: 'draft' | 'verified-as-is' | 'corrected'
  reviewer_note: string | null
  reviewer_identity: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

const fields = ['summary', 'why_it_matters', 'recommended_next_step', 'verification_step', 'caveats'] as const
const forbidden = /(?:credential|token|password|cookie|secret|customer|order|payment|post[_-]?body|content)/i
const cleanString = (value: unknown, max = 2000) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max).trim() : ''

function safeEvidence(value: unknown, depth = 0): unknown {
  if (depth > 4) return null
  if (typeof value === 'string') return cleanString(value, 1000)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 20).map(item => safeEvidence(item, depth + 1))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (!forbidden.test(key)) result[key] = safeEvidence(item, depth + 1)
    }
    return result
  }
  return null
}

export function safeFinding(value: unknown): Record<string, unknown> {
  const input = object(value)
  const result: Record<string, unknown> = {}
  for (const key of ['id', 'severity', 'category', 'title', 'message', 'source']) {
    const text = cleanString(input[key], 300)
    if (text) result[key] = text
  }
  if (typeof input.evidence === 'object' && input.evidence !== null) result.evidence = safeEvidence(input.evidence)
  const post = object(input.post)
  if (typeof post.id === 'number' && Number.isInteger(post.id) && post.id > 0) result.post = { id: post.id, type: cleanString(post.type, 30), title: cleanString(post.title, 300) }
  if (!result.id || !result.title || !result.message) throw new ApiError(400, 'invalid_finding', 'A bounded finding object is required.')
  return result
}

export function parseFields(value: unknown): ExplanationFields {
  const input = object(value)
  const result = {} as ExplanationFields
  for (const field of fields) {
    const text = cleanString(input[field])
    if (!text) throw new ApiError(502, 'invalid_ai_output', 'The explanation did not contain all required fields.')
    result[field] = text
  }
  return result
}

function parseModelResponse(value: unknown): ExplanationFields {
  const direct = object(value).response
  if (object(direct).summary) return parseFields(direct)
  if (object(value).summary) return parseFields(value)
  const raw = typeof direct === 'string' ? direct : typeof value === 'string' ? value : JSON.stringify(value)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new ApiError(502, 'invalid_ai_output', 'The explanation response was not structured JSON.')
  try { return parseFields(JSON.parse(match[0])) } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'invalid_ai_output', 'The explanation response was not valid JSON.')
  }
}

export async function generateExplanation(ai: AIService, finding: Record<string, unknown>): Promise<ExplanationFields> {
  const prompt = [
    'You are a support assistant interpreting one deterministic WordPress finding.',
    'Use only the supplied finding. Do not claim facts that are absent. Never propose destructive or automatic changes.',
    'Return JSON only with exactly these string fields: summary, why_it_matters, recommended_next_step, verification_step, caveats.',
    JSON.stringify({ finding }),
  ].join('\n')
  let result: unknown
  try {
    result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      prompt: `Return exactly one JSON object and no markdown, prose, or code fences. Every value must be a concise string.\n${prompt}`,
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: Object.fromEntries(fields.map(field => [field, { type: 'string' }])),
          required: [...fields],
        },
      },
      max_tokens: 700,
      temperature: 0.2,
    })
  } catch { throw new ApiError(502, 'ai_unavailable', 'AI explanation is temporarily unavailable.') }
  return parseModelResponse(result)
}

export function rowToRecord(row: Record<string, unknown>): ExplanationRecord {
  return {
    id: String(row.id), site_id: String(row.site_id), finding_id: String(row.finding_id),
    finding_snapshot: JSON.parse(String(row.finding_snapshot)), original_output: parseFields(JSON.parse(String(row.original_output))), current_output: parseFields(JSON.parse(String(row.current_output))),
    status: String(row.status) as ExplanationRecord['status'], reviewer_note: row.reviewer_note ? String(row.reviewer_note) : null,
    reviewer_identity: row.reviewer_identity ? String(row.reviewer_identity) : null, reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  }
}

export { fields }
