import type { SearchMemoryQuery } from './api'

export interface SearchShareLink {
  url: string
  params: URLSearchParams
}

export interface SearchShareLinkOptions {
  origin?: string
  pathname?: string
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const ALLOWED_CABIN_CLASSES = new Set(['economy', 'premium_economy', 'business', 'first'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function paramsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    out[key] = value
  }
  return out
}

/**
 * Build a fully-qualified URL that reproduces a search via query string. Only
 * fields necessary to re-run the search are emitted; unsupported or invalid
 * values are silently dropped to avoid producing unparseable links.
 */
export function buildSearchShareLink(
  query: SearchMemoryQuery,
  options: SearchShareLinkOptions = {},
): SearchShareLink {
  const params = new URLSearchParams()
  const from = query.from?.trim().toUpperCase()
  const to = query.to?.trim().toUpperCase()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (DATE_REGEX.test(query.date)) params.set('date', query.date)
  if (Number.isFinite(query.passengers) && query.passengers > 0) {
    params.set('passengers', String(query.passengers))
  }
  if (ALLOWED_CABIN_CLASSES.has(query.class)) {
    params.set('class', query.class)
  }

  const origin = options.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const pathname = options.pathname ?? '/search'
  const url = origin ? `${origin}${pathname}?${params.toString()}` : `${pathname}?${params.toString()}`

  return { url, params }
}

/**
 * Decode a URL (typically `window.location.search`) into a SearchMemoryQuery,
 * returning null when required fields are missing or invalid.
 */
export function decodeSearchQueryFromUrl(search: string | URLSearchParams): SearchMemoryQuery | null {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search)

  const from = (params.get('from') ?? '').trim().toUpperCase()
  const to = (params.get('to') ?? '').trim().toUpperCase()
  const date = params.get('date') ?? ''

  if (from.length !== 3 || to.length !== 3 || !DATE_REGEX.test(date)) {
    return null
  }

  const passengersRaw = params.get('passengers') ?? '1'
  const passengers = Number.parseInt(passengersRaw, 10)
  if (!Number.isFinite(passengers) || passengers < 1 || passengers > 9) {
    return null
  }

  const cabin = params.get('class') ?? 'economy'
  if (!ALLOWED_CABIN_CLASSES.has(cabin)) {
    return null
  }

  return {
    from,
    to,
    date,
    passengers,
    class: cabin as SearchMemoryQuery['class'],
  }
}

/**
 * Decode a search payload embedded in JSON form (e.g. for QR codes or copy-to-clipboard
 * variants). Returns null when the payload is missing, malformed, or carries an
 * unsupported schema.
 */
export function decodeSearchQueryFromJson(input: unknown): SearchMemoryQuery | null {
  if (!isPlainObject(input)) return null
  const candidate: Record<string, unknown> = input
  const from = typeof candidate.from === 'string' ? candidate.from.trim().toUpperCase() : ''
  const to = typeof candidate.to === 'string' ? candidate.to.trim().toUpperCase() : ''
  const date = typeof candidate.date === 'string' ? candidate.date : ''
  const passengersRaw = candidate.passengers
  const passengers = typeof passengersRaw === 'number' ? passengersRaw : Number(passengersRaw)
  const cabin = typeof candidate.class === 'string' ? candidate.class : 'economy'

  if (from.length !== 3 || to.length !== 3 || !DATE_REGEX.test(date)) return null
  if (!Number.isFinite(passengers) || passengers < 1 || passengers > 9) return null
  if (!ALLOWED_CABIN_CLASSES.has(cabin)) return null

  return {
    from,
    to,
    date,
    passengers,
    class: cabin as SearchMemoryQuery['class'],
  }
}

/**
 * Encode a search as compact JSON. Useful for sharing via channels that can't
 * carry URL parameters (e.g. SMS, QR codes, push notifications).
 */
export function encodeSearchQueryToJson(query: SearchMemoryQuery): string {
  return JSON.stringify(paramsToObject(buildSearchShareLink(query).params))
}