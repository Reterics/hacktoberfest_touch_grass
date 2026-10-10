import type { PairingInfo } from '@moss/shared'

const TOKEN_KEY = 'moss.companionToken'

/** The pairing token from the QR URL, remembered for this tab so reloads keep working. */
export function companionToken(): string | undefined {
  const fromUrl = new URLSearchParams(window.location.search).get('token') ?? undefined
  try {
    if (fromUrl) sessionStorage.setItem(TOKEN_KEY, fromUrl)
    return fromUrl ?? sessionStorage.getItem(TOKEN_KEY) ?? undefined
  } catch {
    return fromUrl
  }
}

function headers(json = true): HeadersInit {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  const token = companionToken()
  if (token) h['x-moss-token'] = token
  return h
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status)
  return body as T
}

export async function post<T = { ok: true }>(path: string, body: unknown = {}): Promise<T> {
  return handle<T>(await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) }))
}

export async function getPairing(): Promise<PairingInfo> {
  return handle<PairingInfo>(await fetch(`/api/pairing?port=${window.location.port || 80}`, { headers: headers() }))
}

export type PhotoOutcome =
  | { outcome: 'completed'; detected: string[]; reason: string }
  | { outcome: 'rejected'; reason: string; manualAllowed: boolean }
  | { outcome: 'error'; reason: string; manualAllowed: boolean }

export async function uploadPhoto(photo: Blob, questId: string): Promise<PhotoOutcome> {
  const form = new FormData()
  form.append('questId', questId)
  form.append('photo', photo, 'evidence.jpg')
  return handle<PhotoOutcome>(await fetch('/api/quest/photo', { method: 'POST', headers: headers(false), body: form }))
}

export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const token = companionToken()
  return `${proto}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
}
