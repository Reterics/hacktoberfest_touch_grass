import { lazy, Suspense } from 'react'

// The phone never downloads the Three.js desktop scene.
const Desktop = lazy(() => import('./desktop/Desktop.tsx'))
const Companion = lazy(() => import('./companion/Companion.tsx'))
// Dev-only sprite baker; tree-shaken out of production builds.
const Bake = import.meta.env.DEV ? lazy(() => import('./dev/Bake.tsx')) : null

export function App() {
  const isCompanion = window.location.pathname.startsWith('/companion')
  if (Bake && new URLSearchParams(window.location.search).has('bake')) {
    return (
      <Suspense fallback={null}>
        <Bake />
      </Suspense>
    )
  }
  return <Suspense fallback={<div className="h-full bg-forest-950" />}>{isCompanion ? <Companion /> : <Desktop />}</Suspense>
}
