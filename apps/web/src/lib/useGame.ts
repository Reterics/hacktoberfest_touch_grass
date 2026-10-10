import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEvent, ServerMessage, ServerSnapshot } from '@moss/shared'
import { companionToken, wsUrl } from './api.ts'

function authHeader(): Record<string, string> {
  const token = companionToken()
  return token ? { 'x-moss-token': token } : {}
}

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'unauthorized'

export interface GameConnection {
  snapshot: ServerSnapshot | null
  connection: ConnectionState
  /** Server time estimate, so countdowns match the laptop even if the phone clock is off. */
  now: () => number
  /** Subscribe to one-shot game events (for animations). */
  onEvent: (fn: (e: GameEvent) => void) => () => void
}

export function useGame(): GameConnection {
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const offset = useRef(0)
  const listeners = useRef(new Set<(e: GameEvent) => void>())

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let disposed = false
    let opened = false

    const connect = () => {
      setConnection('connecting')
      opened = false
      socket = new WebSocket(wsUrl())
      socket.onopen = () => {
        opened = true
        attempts = 0
        setConnection('open')
      }
      socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data as string) as ServerMessage
        if (data.type === 'snapshot') {
          offset.current = data.snapshot.serverNow - Date.now()
          setSnapshot(data.snapshot)
        } else {
          for (const fn of listeners.current) fn(data.event)
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setConnection('closed')
        // A socket rejected before it opened usually means a missing or expired pairing token.
        if (!opened && attempts >= 1) {
          void fetch('/api/state', { headers: authHeader() }).then((res) => {
            if (res.status === 401 && !disposed) setConnection('unauthorized')
          })
        }
        attempts += 1
        retry = setTimeout(connect, Math.min(8000, 500 * 2 ** attempts))
      }
    }
    connect()
    return () => {
      disposed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [])

  const now = useCallback(() => Date.now() + offset.current, [])
  const onEvent = useCallback((fn: (e: GameEvent) => void) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  return { snapshot, connection, now, onEvent }
}

/** Re-renders every `ms` milliseconds; used for countdowns. */
export function useTicker(ms = 250): void {
  const [, set] = useState(0)
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const fn = () => setReduced(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return reduced
}
