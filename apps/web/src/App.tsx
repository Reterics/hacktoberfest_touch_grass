import { lazy, Suspense } from 'react'

// The phone never downloads the Three.js desktop scene.
const Desktop = lazy(() => import('./desktop/Desktop.tsx'))
const Companion = lazy(() => import('./companion/Companion.tsx'))

export function App() {
  const isCompanion = window.location.pathname.startsWith('/companion')
  return <Suspense fallback={<div className="h-full bg-forest-950" />}>{isCompanion ? <Companion /> : <Desktop />}</Suspense>
}
