import type { StatKey } from '@moss/shared'

type IconProps = { className?: string }

export function HeartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.5 2 4 13.5h6.5L9 22l10-12.5h-6.6L13.5 2z" />
    </svg>
  )
}

export function LeafIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.5 3.5C11 3.5 4 8.6 4 15.6c0 1.4.4 2.7 1 3.8-1 .9-1.7 1.7-2 2.1l1.3 1c.4-.5 1-1.2 1.9-2 1.2 1 2.8 1.5 4.6 1.5 7 0 9.7-7.9 9.7-18.5zM9 17.5c2-2.2 4.6-4.5 7.5-6.4-2.4 2.3-4.6 4.6-6.4 7.1L9 17.5z" />
    </svg>
  )
}

export function StepsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <ellipse cx="8" cy="7.5" rx="3" ry="4.5" />
      <ellipse cx="16" cy="12.5" rx="3" ry="4.5" />
      <rect x="5.6" y="13" width="4.8" height="3" rx="1.5" />
      <rect x="13.6" y="18" width="4.8" height="3" rx="1.5" />
    </svg>
  )
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20 14.6A8.5 8.5 0 0 1 9.4 4 8.5 8.5 0 1 0 20 14.6z" />
    </svg>
  )
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z" />
    </svg>
  )
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" strokeLinecap="round" />
    </svg>
  )
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  )
}

export const STAT_META: Partial<Record<StatKey, { label: string; Icon: (p: IconProps) => React.JSX.Element; color: string }>> = {
  happiness: { label: 'Happiness', Icon: HeartIcon, color: '#e9879a' },
  energy: { label: 'Energy', Icon: BoltIcon, color: '#f5c451' },
  nature: { label: 'Nature', Icon: LeafIcon, color: '#9bcb57' },
  movement: { label: 'Movement', Icon: StepsIcon, color: '#7fb6d9' },
  rest: { label: 'Rest', Icon: MoonIcon, color: '#b9a6e8' },
}

export const STAT_LABEL: Record<StatKey, string> = {
  happiness: 'Happiness',
  energy: 'Energy',
  nature: 'Nature',
  movement: 'Movement',
  rest: 'Rest',
  curiosity: 'Curiosity',
  hunger: 'Hunger',
  bathroom: 'Bathroom',
}
