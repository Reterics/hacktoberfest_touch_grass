import { randomBytes, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import type { PairingInfo } from '@moss/shared'

/** Short-lived, unguessable tokens that let a phone on the LAN act as the companion. */
export class Pairing {
  private tokens = new Map<string, number>()

  constructor(private readonly ttlMs: number) {}

  /** Reuses the newest token while it still has at least an hour left. */
  currentToken(now = Date.now()): { token: string; expiresAt: number } {
    this.prune(now)
    let newest: [string, number] | undefined
    for (const entry of this.tokens) if (!newest || entry[1] > newest[1]) newest = entry
    if (newest && newest[1] - now > 60 * 60 * 1000) return { token: newest[0], expiresAt: newest[1] }
    const token = randomBytes(18).toString('base64url')
    const expiresAt = now + this.ttlMs
    this.tokens.set(token, expiresAt)
    return { token, expiresAt }
  }

  isValid(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false
    this.prune(now)
    const candidate = Buffer.from(token)
    for (const known of this.tokens.keys()) {
      const k = Buffer.from(known)
      if (k.length === candidate.length && timingSafeEqual(k, candidate)) return true
    }
    return false
  }

  async info(baseUrl: string): Promise<PairingInfo> {
    const { token, expiresAt } = this.currentToken()
    const url = `${baseUrl}/companion?token=${token}`
    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1d2b1a', light: '#00000000' },
    })
    return { url, qrSvg, expiresAt }
  }

  private prune(now: number): void {
    for (const [token, expiresAt] of this.tokens) if (expiresAt <= now) this.tokens.delete(token)
  }
}
