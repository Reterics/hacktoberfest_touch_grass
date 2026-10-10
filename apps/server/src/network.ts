import { networkInterfaces } from 'node:os'

// Windows in particular exposes many virtual adapters (WSL, Hyper-V, Docker, VPNs).
// The phone needs the address of the real Wi-Fi / Ethernet adapter.
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|tailscale|zerotier|vpn|utun|bridge|br-|veth/i

function privateRank(ip: string): number {
  if (ip.startsWith('192.168.')) return 0
  if (ip.startsWith('10.')) return 1
  const m = ip.match(/^172\.(\d+)\./)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2
  return 9
}

function nameRank(name: string): number {
  if (/wi-?fi|wlan|wireless/i.test(name)) return 0
  if (/ethernet|^en|^eth/i.test(name)) return 1
  return 2
}

export function detectLanAddress(override?: string): string {
  if (override) return override
  const candidates: { ip: string; name: string }[] = []
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) candidates.push({ ip: a.address, name })
    }
  }
  candidates.sort((a, b) => privateRank(a.ip) - privateRank(b.ip) || nameRank(a.name) - nameRank(b.name))
  return candidates[0]?.ip ?? 'localhost'
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLoopback(ip: string | undefined): boolean {
  return !!ip && LOOPBACK.has(ip)
}

/** True for requests coming from this machine, whether via loopback or one of its own LAN addresses. */
export function isThisMachine(ip: string | undefined): boolean {
  if (!ip) return false
  if (isLoopback(ip)) return true
  const bare = ip.replace(/^::ffff:/, '')
  return Object.values(networkInterfaces()).some((addrs) => addrs?.some((a) => a.address === bare))
}

/**
 * The real client address. Forwarded headers are only trusted when the direct peer is loopback,
 * which is the Vite dev proxy running on this same machine.
 */
export function clientAddress(remote: string | undefined, forwardedFor: string | string[] | undefined): string | undefined {
  if (isLoopback(remote) && forwardedFor) {
    const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim()
    if (first) return first
  }
  return remote
}
