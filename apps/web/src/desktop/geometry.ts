import * as THREE from 'three'

/** A soft almond leaf shape, pointing up the +Y axis from the origin. */
export function leafGeometry(length = 1, width = 0.45): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(width, length * 0.25, width * 0.8, length * 0.75, 0, length)
  s.bezierCurveTo(-width * 0.8, length * 0.75, -width, length * 0.25, 0, 0)
  const geo = new THREE.ShapeGeometry(s, 12)
  // Curl the leaf slightly so it catches light.
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    pos.setZ(i, Math.abs(x) * 0.5 * -1 + Math.sin((y / length) * Math.PI) * 0.08)
  }
  geo.computeVertexNormals()
  return geo
}

/** Deterministic pseudo-random generator so procedural props look the same every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Cheap smooth 3D noise made from layered sines — plenty for organic lumps. */
export function lumpNoise(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 5.1 + y * 1.7) * 0.5 +
    Math.sin(y * 6.3 + z * 2.9) * 0.35 +
    Math.sin(z * 7.7 + x * 3.1) * 0.3 +
    Math.sin((x + y + z) * 11.0) * 0.15
  )
}

/** Wood grain texture generated on a canvas (no external image assets needed). */
export function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 512, 0)
  g.addColorStop(0, '#8c5c3a')
  g.addColorStop(0.5, '#9a6842')
  g.addColorStop(1, '#85563a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  const r = rng(7)
  for (let i = 0; i < 90; i++) {
    const y = r() * 512
    ctx.strokeStyle = `rgba(${60 + r() * 30}, ${35 + r() * 20}, ${20 + r() * 10}, ${0.08 + r() * 0.18})`
    ctx.lineWidth = 1 + r() * 3
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (r() - 0.5) * 3)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Tiny code-editor screen for Moss's laptop. */
export function codeScreenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#16211a'
  ctx.fillRect(0, 0, 256, 160)
  const colors = ['#9bcb57', '#f5c451', '#7fb6d9', '#e8823a', '#c9c2ae']
  const r = rng(3)
  for (let line = 0; line < 12; line++) {
    let x = 12 + Math.floor(r() * 3) * 12
    const y = 14 + line * 12
    const words = 1 + Math.floor(r() * 4)
    for (let w = 0; w < words; w++) {
      const len = 12 + r() * 40
      ctx.fillStyle = colors[Math.floor(r() * colors.length)]!
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, y, len, 5)
      x += len + 8
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
