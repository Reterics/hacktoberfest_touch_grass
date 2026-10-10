import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { VISUAL_PROFILES, type MossVisualState, type VisualProfile } from '../lib/visualState.ts'
import { MOSS_BODY_GLB } from '../lib/assets.ts'

/** Moss's height including fern fronds, in scene units. */
const TARGET_HEIGHT = 1.8
const FACE_CAMERA_YAW = 0.5
/** Eye and mouth heights as a fraction of total height, measured on the canonical master reference. */
const EYE_HEIGHT = 0.4
const MOUTH_HEIGHT = 0.335
const EYE_SPACING = 0.115
const LID_COLOR = '#5f7f26'
const WHITE = new THREE.Color('#f0f5e4')
const DULL_TINT = new THREE.Color('#b7b29a')

interface Props {
  visual: MossVisualState
  level: number
  /** 0..1 average wellbeing, tints Moss. */
  health: number
  reducedMotion: boolean
  onPoke?: () => void
  /** Ref that receives Moss's head position (for dialogue / particles). */
  headRef?: React.RefObject<THREE.Object3D | null>
}

/** Animated values shared between the body, fronds and face. */
interface Live {
  profile: VisualProfile
  blink: number
  time: number
}

/** Measurements taken from the GLB at load so the live face sits exactly on the mesh. */
interface BodyMetrics {
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  uniforms: { uDroop: { value: number }; uTime: { value: number }; uWiggle: { value: number } }
  height: number
  bodyTop: number
  eyeY: number
  mouthY: number
  eyeZ: [number, number]
  mouthZ: number
  eyeX: number
  cheeks: [THREE.Vector3, THREE.Vector3]
}

export function MossModel({ visual, level, health, reducedMotion, onPoke, headRef }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const zzz = useRef<THREE.Group>(null)
  const poke = useRef(0)
  const nextBlink = useRef(2)
  // Accumulated animation phase. Integrating speed (instead of sin(time * speed)) keeps motion
  // continuous while speed eases between states; otherwise a large elapsed time turns every
  // speed change into a huge phase jump and Moss visibly shakes.
  const phase = useRef(0)
  const live = useRef<Live>({ profile: { ...VISUAL_PROFILES[visual] }, blink: 0, time: 0 })
  const target = VISUAL_PROFILES[visual]
  const tier = level >= 30 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const p = live.current.profile
    const k = 1 - Math.exp(-delta * 4)
    for (const key of ['eyes', 'asym', 'droop', 'bob', 'speed', 'wiggle', 'hop', 'look', 'lean', 'vibrance'] as const) {
      p[key] += (target[key] - p[key]) * k
    }
    p.mouth = target.mouth
    p.zzz = target.zzz
    p.sprite = target.sprite
    live.current.time = t

    // Blink every few seconds.
    if (t > nextBlink.current) {
      live.current.blink = 1
      nextBlink.current = t + 2.5 + Math.random() * 3
    }
    live.current.blink = Math.max(0, live.current.blink - delta * 9)

    const motion = reducedMotion ? 0.25 : 1
    phase.current += delta * p.speed
    const ph = phase.current
    poke.current = Math.max(0, poke.current - delta * 2.5)
    const pokeHop = Math.sin(poke.current * Math.PI) * 0.25

    if (root.current && body.current) {
      const hop = Math.abs(Math.sin(ph * 3)) * p.hop * motion + pokeHop
      body.current.position.y = Math.max(0, Math.sin(ph * 2) * p.bob * motion) + hop
      // Squash from the feet: breathing, plus a landing squash for hoppy states.
      const breathe = 1 + Math.sin(ph * 2) * 0.02 * motion
      const squash = 1 - Math.max(0, 0.1 - hop) * (p.hop > 0.05 ? 0.6 : 0)
      const sy = squash * breathe
      body.current.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
      // Face the camera by default; glance toward the window when Moss wants to go outside.
      root.current.rotation.y = FACE_CAMERA_YAW + THREE.MathUtils.lerp(0, -1.1, p.look) + Math.sin(t * 0.4) * 0.05 * motion
      body.current.rotation.z = Math.sin(ph * 4) * p.wiggle * motion - p.lean * 0.08
      body.current.rotation.x = p.lean * 0.1 - p.look * 0.08
    }

    if (zzz.current) {
      zzz.current.visible = p.zzz
      zzz.current.children.forEach((child, i) => {
        const phase = (t * 0.5 + i / 3) % 1
        child.position.set(0.35 + phase * 0.35, TARGET_HEIGHT * 0.7 + phase * 0.6, 0)
        child.scale.setScalar(0.5 + phase)
        ;((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI)
      })
    }
  })

  return (
    <group ref={root}>
      <group
        ref={body}
        onPointerDown={(e) => {
          e.stopPropagation()
          poke.current = 1
          onPoke?.()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <BodyErrorBoundary fallback={<FallbackBody />}>
          <Suspense fallback={<FallbackBody />}>
            <GlbMoss live={live} health={health} tier={tier} reducedMotion={reducedMotion} />
          </Suspense>
        </BodyErrorBoundary>
        <object3D ref={headRef} position={[0, TARGET_HEIGHT, 0]} />
      </group>

      <group ref={zzz} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <planeGeometry args={[0.12, 0.12]} />
            <meshBasicMaterial map={zTexture()} transparent depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---- GLB body ---------------------------------------------------------------

function GlbMoss({ live, health, tier, reducedMotion }: { live: React.RefObject<Live>; health: number; tier: number; reducedMotion: boolean }) {
  // Meshopt decoding is bundled locally (no CDN), keeping Moss offline-capable.
  const gltf = useGLTF(MOSS_BODY_GLB, false, true)
  const metrics = useMemo(() => measureBody(gltf.scene), [gltf.scene])
  const tint = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const p = live.current.profile
    const motion = reducedMotion ? 0.3 : 1
    metrics.uniforms.uDroop.value = p.droop
    metrics.uniforms.uTime.value = live.current.time
    metrics.uniforms.uWiggle.value = (0.4 + p.wiggle * 4 + (p.speed > 2 ? 0.4 : 0)) * motion
    const vib = Math.min(1.3, p.vibrance * (0.75 + health * 0.25))
    tint.copy(DULL_TINT).lerp(WHITE, Math.min(1, vib))
    metrics.material.color.copy(tint)
    metrics.material.emissiveIntensity = tier >= 4 ? 0.18 + Math.sin(live.current.time * 2) * 0.06 : Math.max(0, vib - 1) * 0.6
  })

  return (
    <group>
      <mesh geometry={metrics.geometry} material={metrics.material} castShadow receiveShadow />
      <Face metrics={metrics} live={live} />
      {tier >= 2 && <Flower y={metrics.bodyTop + 0.02} glow={tier >= 4} />}
    </group>
  )
}

/**
 * Bakes the GLB into a single float geometry scaled to TARGET_HEIGHT with its feet at y=0,
 * finds where the fronds start, and raycasts the front surface for face placement.
 */
function measureBody(scene: THREE.Object3D): BodyMetrics {
  scene.updateMatrixWorld(true)
  let source: THREE.Mesh | null = null
  scene.traverse((o) => {
    if (!source && (o as THREE.Mesh).isMesh) source = o as THREE.Mesh
  })
  if (!source) throw new Error('Moss GLB has no mesh')
  const mesh: THREE.Mesh = source

  // Dequantise into float attributes and bake the node transform.
  const src = mesh.geometry
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = src.getAttribute(name)
    if (!attr) continue
    const out = new Float32Array(attr.count * attr.itemSize)
    for (let i = 0; i < attr.count; i++) {
      out[i * attr.itemSize] = attr.getX(i)
      out[i * attr.itemSize + 1] = attr.getY(i)
      if (attr.itemSize > 2) out[i * attr.itemSize + 2] = attr.getZ(i)
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize))
  }
  if (src.index) geometry.setIndex(Array.from(src.index.array as ArrayLike<number>))
  geometry.applyMatrix4(mesh.matrixWorld)

  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const scale = TARGET_HEIGHT / (box.max.y - box.min.y)
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
  geometry.scale(scale, scale, scale)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // Slice profile. Body slices have surface at the centre line (x≈0); frond slices have a gap
  // between the two fronds. The body top is the highest slice that still touches the centre.
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const slices = 60
  const width = new Array<number>(slices).fill(0)
  const centreGap = new Array<number>(slices).fill(Infinity)
  for (let i = 0; i < pos.count; i++) {
    const s = Math.min(slices - 1, Math.floor((pos.getY(i) / TARGET_HEIGHT) * slices))
    const ax = Math.abs(pos.getX(i))
    width[s] = Math.max(width[s]!, ax)
    centreGap[s] = Math.min(centreGap[s]!, ax)
  }
  let topSlice = 0
  for (let s = 0; s < slices * 0.8; s++) if (centreGap[s]! < TARGET_HEIGHT * 0.03) topSlice = s
  const bodyTop = ((topSlice + 1) / slices) * TARGET_HEIGHT

  // Meshy bakes fur noise into the geometry, which shades like crumpled paper. Blend body normals
  // toward a soft radial normal so the texture carries the moss detail and the lighting stays fluffy.
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (normals) {
    const center = new THREE.Vector3(0, bodyTop * 0.55, 0)
    const n = new THREE.Vector3()
    const radial = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > bodyTop) continue
      radial.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center).normalize()
      n.fromBufferAttribute(normals, i).lerp(radial, 0.8).normalize()
      normals.setXYZ(i, n.x, n.y, n.z)
    }
    normals.needsUpdate = true
  }

  // Find the front surface for the eyes and mouth.
  const probe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const ray = new THREE.Raycaster()
  const surfaceZ = (x: number, y: number) => {
    ray.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1))
    return ray.intersectObject(probe, false)[0]?.point.z ?? geometry.boundingBox!.max.z
  }
  const eyeY = TARGET_HEIGHT * EYE_HEIGHT
  const mouthY = TARGET_HEIGHT * MOUTH_HEIGHT
  const eyeX = TARGET_HEIGHT * EYE_SPACING

  const src0 = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
  const material = src0.clone()
  material.roughness = 0.95
  material.metalness = 0
  material.emissive = new THREE.Color('#4f7a1e')
  material.emissiveMap = material.map
  material.side = THREE.FrontSide
  const uniforms = { uDroop: { value: 0 }, uTime: { value: 0 }, uWiggle: { value: 0.4 } }
  const frondX = width.slice(topSlice + 2).filter((w) => w > 0).reduce((a, b, _, arr) => a + b / arr.length, 0) * 0.6
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uBase: { value: bodyTop - 0.02 },
      uTop: { value: TARGET_HEIGHT },
      uFrondX: { value: frondX },
    })
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uDroop; uniform float uTime; uniform float uWiggle;
        uniform float uBase; uniform float uTop; uniform float uFrondX;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Bend each fern frond around its base: droop outward when tired, perk up when excited.
        if (position.y > uBase) {
          float t = clamp((position.y - uBase) / (uTop - uBase), 0.0, 1.0);
          float side = position.x >= 0.0 ? 1.0 : -1.0;
          float sway = sin(uTime * 1.6 + side * 1.3) * 0.07 * uWiggle;
          // Droop bends outward strongly; perking up only straightens a little so the fronds never cross.
          float bend = uDroop > 0.0 ? uDroop * 1.15 : uDroop * 0.35;
          float ang = -side * (bend + sway) * t;
          vec2 p = vec2(position.x - side * uFrondX, position.y - uBase);
          float c = cos(ang); float s = sin(ang);
          transformed.xy = vec2(c * p.x - s * p.y + side * uFrondX, s * p.x + c * p.y + uBase);
        }`,
      )
  }
  material.customProgramCacheKey = () => 'moss-fronds'

  return {
    geometry,
    material,
    uniforms,
    height: TARGET_HEIGHT,
    bodyTop,
    eyeY,
    mouthY,
    eyeZ: [surfaceZ(-eyeX, eyeY), surfaceZ(eyeX, eyeY)],
    mouthZ: surfaceZ(0, mouthY),
    eyeX,
    cheeks: [-1, 1].map((side) => {
      const x = side * eyeX * 1.65
      const y = mouthY + TARGET_HEIGHT * 0.012
      return new THREE.Vector3(x, y, surfaceZ(x, y) + 0.004)
    }) as [THREE.Vector3, THREE.Vector3],
  }
}

useGLTF.preload(MOSS_BODY_GLB, false, true)

// ---- live face --------------------------------------------------------------

function Face({ metrics, live }: { metrics: BodyMetrics; live: React.RefObject<Live> }) {
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const openEyes = useRef<THREE.Group>(null)
  const happyEyes = useRef<THREE.Group>(null)
  const mouths = useRef<THREE.Group>(null)
  const size = metrics.height * 0.058

  useFrame(() => {
    const p = live.current.profile
    const happy = p.eyes < 0.2 && p.mouth === 'grin'
    if (openEyes.current) openEyes.current.visible = !happy
    if (happyEyes.current) happyEyes.current.visible = happy
    const open = Math.max(0, p.eyes * (1 - live.current.blink))
    setLid(left.current, open)
    setLid(right.current, Math.max(0, open - p.asym))
    mouths.current?.children.forEach((m) => (m.visible = m.name === p.mouth))
  })

  return (
    <group>
      <group ref={openEyes}>
        <Eye groupRef={left} position={[-metrics.eyeX, metrics.eyeY, metrics.eyeZ[0]]} yaw={-0.28} size={size} />
        <Eye groupRef={right} position={[metrics.eyeX, metrics.eyeY, metrics.eyeZ[1]]} yaw={0.28} size={size} />
      </group>
      <group ref={happyEyes} visible={false}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * metrics.eyeX, metrics.eyeY, metrics.eyeZ[side < 0 ? 0 : 1] + 0.005]} rotation={[0, side * 0.28, 0]}>
            <torusGeometry args={[size * 0.85, size * 0.18, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#2a1a12" roughness={0.5} />
          </mesh>
        ))}
      </group>
      {/* cheeks */}
      {metrics.cheeks.map((c, i) => (
        <mesh key={i} position={c} rotation={[0, (i === 0 ? -1 : 1) * 0.5, 0]}>
          <circleGeometry args={[size * 0.8, 20]} />
          <meshBasicMaterial color="#ff6f8c" transparent opacity={0.42} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <group ref={mouths} position={[0, metrics.mouthY, metrics.mouthZ + 0.005]}>
        <Mouth size={size} />
      </group>
    </group>
  )
}

/** Rotates the upper lid: open=1 tucks it away, 0 covers the eye. Moss's resting face sits around 0.55. */
function setLid(eye: THREE.Group | null, open: number) {
  const lid = eye?.getObjectByName('lid')
  if (lid) lid.rotation.x = THREE.MathUtils.lerp(Math.PI / 2 + 0.4, -Math.PI / 2 - 0.2, Math.min(1, open))
}

function Eye({ groupRef, position, yaw, size }: { groupRef: React.RefObject<THREE.Group | null>; position: [number, number, number]; yaw: number; size: number }) {
  return (
    <group ref={groupRef} position={position} rotation={[0, yaw, 0]}>
      {/* sclera */}
      <mesh scale={[size * 1.2, size, size * 0.6]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#eee6d6" roughness={0.35} />
      </mesh>
      {/* iris */}
      <mesh position={[0, -size * 0.08, size * 0.32]} scale={[size * 0.72, size * 0.75, size * 0.35]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color="#2b1810" roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh position={[size * 0.25, size * 0.12, size * 0.66]}>
        <sphereGeometry args={[size * 0.16, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* heavy upper lid in moss colour */}
      <mesh name="lid" scale={[size * 1.32, size * 1.16, size * 0.95]}>
        <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={LID_COLOR} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Mouth({ size }: { size: number }) {
  const dark = <meshStandardMaterial color="#2a1a12" roughness={0.5} />
  return (
    <>
      <mesh name="flat" rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[size * 0.1, size * 0.9, 4, 8]} />
        {dark}
      </mesh>
      <mesh name="smile" rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[size * 0.5, size * 0.1, 8, 16, Math.PI]} />
        {dark}
      </mesh>
      <mesh name="frown" position={[0, -size * 0.35, 0]}>
        <torusGeometry args={[size * 0.45, size * 0.1, 8, 16, Math.PI]} />
        {dark}
      </mesh>
      <mesh name="grin" rotation={[0, 0, Math.PI]} position={[0, size * 0.15, 0]}>
        <circleGeometry args={[size * 0.75, 20, 0, Math.PI]} />
        <meshBasicMaterial color="#3b1d16" side={THREE.DoubleSide} />
      </mesh>
      <mesh name="open" scale={[size * 0.42, size * 0.55, size * 0.2]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#3b1d16" />
      </mesh>
    </>
  )
}

function Flower({ y, glow }: { y: number; glow: boolean }) {
  return (
    <group position={[0, y, 0.05]}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.05, 0, Math.sin((i / 5) * Math.PI * 2) * 0.05]} scale={[0.045, 0.016, 0.045]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#f2a7b8" emissive={glow ? '#f7c8d4' : '#000000'} emissiveIntensity={glow ? 0.6 : 0} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshStandardMaterial color="#f5c451" emissive="#f5c451" emissiveIntensity={glow ? 0.8 : 0.15} />
      </mesh>
    </group>
  )
}

// ---- fallback ---------------------------------------------------------------

/** Shown while the GLB loads, or if it fails: a plain moss ball so the scene never looks broken. */
function FallbackBody() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow>
      <sphereGeometry args={[0.5, 32, 24]} />
      <meshStandardMaterial color="#7fa83a" roughness={1} />
    </mesh>
  )
}

class BodyErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[moss] Could not load the Moss model, using the fallback body.', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

let zTex: THREE.CanvasTexture | null = null
function zTexture(): THREE.CanvasTexture {
  if (zTex) return zTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f6eedb'
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('z', 32, 34)
  zTex = new THREE.CanvasTexture(c)
  return zTex
}
