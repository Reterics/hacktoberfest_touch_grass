import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { VISUAL_PROFILES, type MossVisualState, type VisualProfile } from '../lib/visualState.ts'
import { leafGeometry, lumpNoise, rng } from './geometry.ts'

const BODY_RADIUS = 0.6
const BODY_Y = 0.55
const FACE_CAMERA_YAW = 0.5
const BASE_GREEN = new THREE.Color('#6fa83a')
const DULL_GREEN = new THREE.Color('#8a8f6a')
const WHITE = new THREE.Color('#ffffff')
const DULL_TINT = new THREE.Color('#c9c3ab')

interface Props {
  visual: MossVisualState
  level: number
  /** 0..1 average wellbeing, tints Moss. */
  health: number
  reducedMotion: boolean
  onPoke?: () => void
  /** Ref that receives Moss's world-space head position (for dialogue / particles). */
  headRef?: React.RefObject<THREE.Object3D | null>
}

function bodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(BODY_RADIUS, 6)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    // Gumdrop silhouette: flatter base, slightly wider middle.
    const base = n.y < -0.2 ? 1 - (Math.abs(n.y) - 0.2) * 0.35 : 1
    const lump = 1 + lumpNoise(n.x * 1.4, n.y * 1.4, n.z * 1.4) * 0.035
    v.copy(n).multiplyScalar(BODY_RADIUS * base * lump)
    v.y *= 0.9
    pos.setXYZ(i, v.x, v.y, v.z)
    // Luminance-only variation (lighter on top, speckled); the material color supplies the hue.
    const speck = (lumpNoise(n.x * 9, n.y * 9, n.z * 9) + 1) * 0.5
    const l = 0.72 + n.y * 0.12 + speck * 0.2
    colors.set([l, l, l], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

interface Tuft {
  position: THREE.Vector3
  scale: number
  color: THREE.Color
}

function tufts(count: number): Tuft[] {
  const r = rng(42)
  const out: Tuft[] = []
  while (out.length < count) {
    const theta = r() * Math.PI * 2
    const y = r() * 1.6 - 0.45
    if (y > 1) continue
    const rad = Math.sqrt(1 - y * y)
    const n = new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad)
    // Keep the face clear.
    if (n.z > 0.55 && n.y < 0.45 && n.y > -0.4 && Math.abs(n.x) < 0.65) continue
    const color = new THREE.Color().setHSL(0.24 + r() * 0.04, 0.45 + r() * 0.15, 0.3 + r() * 0.12)
    const position = n.clone().multiplyScalar(BODY_RADIUS * 0.94)
    position.y *= 0.9
    out.push({ position, scale: 0.03 + r() * 0.035, color })
  }
  return out
}

export function MossModel({ visual, level, health, reducedMotion, onPoke, headRef }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftEye = useRef<THREE.Group>(null)
  const rightEye = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const sprout = useRef<THREE.Group>(null)
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null)
  const tuftMesh = useRef<THREE.InstancedMesh>(null)
  const tuftMat = useRef<THREE.MeshStandardMaterial>(null)
  const zzz = useRef<THREE.Group>(null)
  const poke = useRef(0)
  const blink = useRef({ next: 2, until: 0 })

  // Eased copy of the visual profile, so state changes blend instead of snapping.
  const eased = useRef<VisualProfile>({ ...VISUAL_PROFILES[visual] })
  const targetProfile = VISUAL_PROFILES[visual]

  const geo = useMemo(bodyGeometry, [])
  const tuftList = useMemo(() => tufts(level >= 20 ? 520 : 380), [level >= 20])
  const leaf = useMemo(() => leafGeometry(0.22, 0.1), [])
  const tier = level >= 30 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0

  useEffect(() => {
    const mesh = tuftMesh.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    tuftList.forEach((t, i) => {
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.position.clone().normalize())
      m.compose(t.position, q, new THREE.Vector3(t.scale, t.scale * 0.8, t.scale))
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, t.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [tuftList])

  const tmpColor = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const p = eased.current
    const target = targetProfile
    const k = 1 - Math.exp(-delta * 4)
    for (const key of ['eyes', 'bob', 'speed', 'wiggle', 'hop', 'look', 'lean', 'vibrance'] as const) {
      p[key] += (target[key] - p[key]) * k
    }
    p.mouth = target.mouth
    p.zzz = target.zzz

    const motion = reducedMotion ? 0.25 : 1
    poke.current = Math.max(0, poke.current - delta * 2.5)
    const pokeHop = Math.sin(poke.current * Math.PI) * 0.25

    if (root.current && body.current) {
      const hop = Math.abs(Math.sin(t * p.speed * 3)) * p.hop * motion + pokeHop
      body.current.position.y = BODY_Y + Math.sin(t * p.speed * 2) * p.bob * motion + hop
      const breathe = 1 + Math.sin(t * p.speed * 2) * 0.025 * motion
      const squash = 1 - Math.max(0, 0.12 - hop) * (p.hop > 0.05 ? 0.6 : 0)
      body.current.scale.set(1 / Math.sqrt(squash * breathe), squash * breathe, 1 / Math.sqrt(squash * breathe))
      // Face the camera by default; glance toward the window when Moss wants to go outside.
      root.current.rotation.y = FACE_CAMERA_YAW + THREE.MathUtils.lerp(0, -1.1, p.look) + Math.sin(t * 0.4) * 0.05 * motion
      body.current.rotation.z = Math.sin(t * p.speed * 4) * p.wiggle * motion - p.lean * 0.1
      body.current.rotation.x = p.lean * 0.12 - p.look * 0.12
    }

    // Blink every few seconds.
    let open = p.eyes
    if (t > blink.current.next) {
      blink.current.until = t + 0.12
      blink.current.next = t + 2.5 + Math.random() * 3
    }
    if (t < blink.current.until) open = Math.min(open, 0.08)
    const eyeScale = Math.max(0.06, open)
    leftEye.current?.scale.set(1, eyeScale, 1)
    rightEye.current?.scale.set(1, eyeScale, 1)

    // Typing arms while working.
    const typing = p.lean > 0.5 ? Math.sin(t * 14) * 0.25 : 0
    if (leftArm.current) leftArm.current.rotation.x = -0.4 * p.lean + typing
    if (rightArm.current) rightArm.current.rotation.x = -0.4 * p.lean - typing

    if (sprout.current) sprout.current.rotation.z = Math.sin(t * 1.3) * 0.12 * motion + p.wiggle * Math.sin(t * 9)

    if (bodyMat.current) {
      const vib = Math.min(1.3, p.vibrance * (0.75 + health * 0.25))
      tmpColor.copy(DULL_GREEN).lerp(BASE_GREEN, Math.min(1, vib))
      if (vib > 1) tmpColor.offsetHSL(0, 0, (vib - 1) * 0.15)
      bodyMat.current.color.copy(tmpColor)
      tuftMat.current?.color.copy(WHITE).lerp(DULL_TINT, 1 - Math.min(1, vib))
      bodyMat.current.emissiveIntensity = tier >= 4 ? 0.25 + Math.sin(t * 2) * 0.08 : Math.max(0, vib - 1) * 0.8
    }

    if (zzz.current) {
      zzz.current.visible = p.zzz
      zzz.current.children.forEach((child, i) => {
        const phase = (t * 0.5 + i / 3) % 1
        child.position.set(0.3 + phase * 0.35, 1.1 + phase * 0.7, 0)
        child.scale.setScalar(0.5 + phase)
        ;((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI)
      })
    }
  })

  const mouth = VISUAL_PROFILES[visual].mouth
  const happyEyes = VISUAL_PROFILES[visual].eyes < 0.2 && VISUAL_PROFILES[visual].mouth === 'grin'

  return (
    <group ref={root}>
      <group
        ref={body}
        position={[0, BODY_Y, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          poke.current = 1
          onPoke?.()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial ref={bodyMat} vertexColors roughness={0.95} emissive="#4f7a1e" emissiveIntensity={0} />
        </mesh>
        <instancedMesh ref={tuftMesh} args={[undefined, undefined, tuftList.length]} castShadow>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial ref={tuftMat} roughness={1} flatShading />
        </instancedMesh>

        {/* face */}
        <group position={[0, 0.02, BODY_RADIUS * 0.93]}>
          {happyEyes ? (
            <>
              <mesh position={[-0.19, 0.06, 0.02]} rotation={[0, 0, 0]}>
                <torusGeometry args={[0.055, 0.016, 8, 16, Math.PI]} />
                <meshStandardMaterial color="#1a140f" roughness={0.4} />
              </mesh>
              <mesh position={[0.19, 0.06, 0.02]}>
                <torusGeometry args={[0.055, 0.016, 8, 16, Math.PI]} />
                <meshStandardMaterial color="#1a140f" roughness={0.4} />
              </mesh>
            </>
          ) : (
            <>
              <Eye groupRef={leftEye} x={-0.19} />
              <Eye groupRef={rightEye} x={0.19} />
            </>
          )}
          <Mouth kind={mouth} />
          <mesh position={[-0.32, -0.07, -0.03]} rotation={[0, -0.45, 0]}>
            <circleGeometry args={[0.06, 20]} />
            <meshBasicMaterial color="#ff8fa6" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0.32, -0.07, -0.03]} rotation={[0, 0.45, 0]}>
            <circleGeometry args={[0.06, 20]} />
            <meshBasicMaterial color="#ff8fa6" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>

        {/* arms */}
        <mesh ref={leftArm} position={[-0.56, -0.12, 0.12]} castShadow>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#5c8f2f" roughness={0.9} />
        </mesh>
        <mesh ref={rightArm} position={[0.56, -0.12, 0.12]} castShadow>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#5c8f2f" roughness={0.9} />
        </mesh>

        {/* sprout grows with level */}
        <group ref={sprout} position={[0.02, BODY_RADIUS * 0.86, 0]} scale={0.8 + tier * 0.15}>
          <mesh position={[0, 0.09, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.018, 0.2, 8]} />
            <meshStandardMaterial color="#4f7d28" />
          </mesh>
          <mesh geometry={leaf} position={[0, 0.17, 0]} rotation={[0.2, 0, -0.9]} castShadow>
            <meshStandardMaterial color="#8cc84b" side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
          <mesh geometry={leaf} position={[0, 0.17, 0]} rotation={[0.2, 0, 0.9]} castShadow>
            <meshStandardMaterial color="#7dbb3f" side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
          {tier >= 1 && (
            <mesh geometry={leaf} position={[0, 0.12, 0]} rotation={[-0.5, 1.4, 0.6]} scale={0.8} castShadow>
              <meshStandardMaterial color="#9bd35a" side={THREE.DoubleSide} roughness={0.6} />
            </mesh>
          )}
          {tier >= 2 && <Flower glow={tier >= 4} />}
          <object3D ref={headRef} position={[0, 0.35, 0]} />
        </group>

        {/* feet */}
        <mesh position={[-0.2, -BODY_RADIUS * 0.82, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.08, 6, 12]} />
          <meshStandardMaterial color="#3f6624" roughness={0.9} />
        </mesh>
        <mesh position={[0.2, -BODY_RADIUS * 0.82, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.08, 6, 12]} />
          <meshStandardMaterial color="#3f6624" roughness={0.9} />
        </mesh>
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

function Eye({ groupRef, x }: { groupRef: React.RefObject<THREE.Group | null>; x: number }) {
  return (
    <group ref={groupRef} position={[x, 0.06, 0]}>
      <mesh scale={[0.075, 0.1, 0.05]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshPhysicalMaterial color="#17120d" roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh position={[0.025, 0.035, 0.045]}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.02, -0.03, 0.045]}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

function Mouth({ kind }: { kind: VisualProfile['mouth'] }) {
  const mat = <meshStandardMaterial color="#2a1a12" roughness={0.5} />
  switch (kind) {
    case 'smile':
      return (
        <mesh position={[0, -0.06, 0.02]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.04, 0.011, 8, 16, Math.PI]} />
          {mat}
        </mesh>
      )
    case 'grin':
      return (
        <mesh position={[0, -0.05, 0.02]} rotation={[0, 0, Math.PI]} scale={[1, 1.1, 1]}>
          <circleGeometry args={[0.06, 20, 0, Math.PI]} />
          <meshBasicMaterial color="#3b1d16" side={THREE.DoubleSide} />
        </mesh>
      )
    case 'open':
      return (
        <mesh position={[0, -0.08, 0.01]} scale={[0.035, 0.045, 0.02]}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#3b1d16" />
        </mesh>
      )
    case 'frown':
      return (
        <mesh position={[0, -0.11, 0.02]}>
          <torusGeometry args={[0.035, 0.01, 8, 16, Math.PI]} />
          {mat}
        </mesh>
      )
    default:
      return (
        <mesh position={[0, -0.08, 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.009, 0.05, 4, 8]} />
          {mat}
        </mesh>
      )
  }
}

function Flower({ glow }: { glow: boolean }) {
  return (
    <group position={[0, 0.22, 0]}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.045, 0, Math.sin((i / 5) * Math.PI * 2) * 0.045]} scale={[0.04, 0.015, 0.04]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#f2a7b8" emissive={glow ? '#f7c8d4' : '#000000'} emissiveIntensity={glow ? 0.6 : 0} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshStandardMaterial color="#f5c451" emissive="#f5c451" emissiveIntensity={glow ? 0.8 : 0.15} />
      </mesh>
    </group>
  )
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
