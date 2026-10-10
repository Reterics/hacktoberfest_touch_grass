import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { Dialogue, TimerPhase, UnlockId } from '@moss/shared'
import type { MossVisualState } from '../lib/visualState.ts'
import { MossModel } from './MossModel.tsx'
import { codeScreenTexture, leafGeometry, rng, woodTexture } from './geometry.ts'

export interface SceneProps {
  visual: MossVisualState
  phase: TimerPhase
  level: number
  health: number
  unlocks: UnlockId[]
  dialogue: Dialogue | null
  /** Increments each time a quest completes, to fire the reward stream. */
  rewardKey: number
  /** Moss is outside with the phone. */
  away: boolean
  reducedMotion: boolean
  onPoke: () => void
}

const WINDOW_POS = new THREE.Vector3(-1.5, 2.0, -2.4)

export function Scene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 32, position: [3.4, 2.7, 5.4], near: 0.1, far: 60 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <SceneContents {...props} />
    </Canvas>
  )
}

function SceneContents({ visual, phase, level, health, unlocks, dialogue, rewardKey, reducedMotion, onPoke, away }: SceneProps) {
  const head = useRef<THREE.Object3D>(null)
  const has = (id: UnlockId) => unlocks.includes(id)
  return (
    <>
      <color attach="background" args={['#2a3322']} />
      <fog attach="fog" args={['#2a3322', 10, 22]} />
      <Lights phase={phase} visual={visual} />
      <CameraRig phase={phase} visual={visual} reducedMotion={reducedMotion} />

      <Room phase={phase} reducedMotion={reducedMotion} />
      <Desk />
      <Laptop on={phase === 'focus'} />
      <Mug />
      <Notebook />
      <DeskPlant big={has('desk_plant')} lush={has('ecosystem')} />

      <group position={[0, 0, 0.2]}>
        <MossModel visual={visual} level={level} health={health} reducedMotion={reducedMotion} onPoke={onPoke} headRef={head} away={away} />
        {dialogue && !away && <DialogueBubble key={dialogue.at} text={dialogue.text} />}
      </group>

      {has('grass_patch') && <Grow position={[1.25, 0, -1.05]}><GrassPatch /></Grow>}
      {has('tiny_tree') && <Grow position={[-1.2, 0, 0.45]}><TinyTree /></Grow>}
      {has('flower_pot') && <Grow position={[1.75, 0, -0.55]}><FlowerPot /></Grow>}
      {has('sun_crystal') && <Grow position={[0.95, 1.75, -0.9]}><SunCrystal /></Grow>}
      {has('ecosystem') && <Grow><Ecosystem /></Grow>}

      <RewardStream key={rewardKey} active={rewardKey > 0} reducedMotion={reducedMotion} />
      {rewardKey > 0 && <BlownLeaf key={`leaf-${rewardKey}`} seed={rewardKey} reducedMotion={reducedMotion} />}
      <SunBeam on={visual === 'quest_success' || visual === 'level_up'} />
      <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={8} blur={2.4} far={2} resolution={512} />
    </>
  )
}

// ---- lighting & camera ------------------------------------------------------

function Lights({ phase, visual }: { phase: TimerPhase; visual: MossVisualState }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const night = (() => {
    const h = new Date().getHours()
    return h >= 20 || h < 6
  })()

  const target = useMemo(() => {
    if (visual === 'quest_success' || visual === 'level_up') return { sun: 3.8, sunColor: '#ffd59a', hemi: 1.3, lamp: 0.8 }
    if (phase === 'break') return { sun: 3.2, sunColor: '#ffe2b0', hemi: 1.2, lamp: 0.6 }
    if (night) return { sun: 0.6, sunColor: '#9fb6ff', hemi: 0.5, lamp: 2.6 }
    if (phase === 'focus') return { sun: 2.2, sunColor: '#fff1dc', hemi: 0.95, lamp: 1.1 }
    return { sun: 2.6, sunColor: '#fff0d8', hemi: 1.05, lamp: 0.9 }
  }, [phase, visual, night])
  const sunColor = useMemo(() => new THREE.Color(), [])

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 1.5)
    if (sun.current) {
      sun.current.intensity += (target.sun - sun.current.intensity) * k
      sun.current.color.lerp(sunColor.set(target.sunColor), k)
    }
    if (hemi.current) hemi.current.intensity += (target.hemi - hemi.current.intensity) * k
    if (lamp.current) lamp.current.intensity += (target.lamp - lamp.current.intensity) * k
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#f1f5ff', '#6a5038', 0.9]} />
      <directionalLight
        ref={sun}
        position={[-4, 6, -3]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0004}
      />
      <pointLight ref={lamp} position={[2.4, 2.4, 1.4]} color="#ffb766" intensity={0.7} distance={9} decay={1.6} />
      <directionalLight position={[3, 3, 5]} intensity={0.35} color="#cfe0ff" />
    </>
  )
}

function CameraRig({ phase, visual, reducedMotion }: { phase: TimerPhase; visual: MossVisualState; reducedMotion: boolean }) {
  const { camera, pointer } = useThree()
  const look = useMemo(() => new THREE.Vector3(-0.1, 1.05, 0), [])
  const base = useMemo(() => new THREE.Vector3(3.4, 2.7, 5.4), [])
  const desired = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    // Break / celebration: push gently toward Moss.
    const push = visual === 'quest_success' || visual === 'level_up' ? 0.72 : phase === 'break' ? 0.82 : 1
    desired.copy(base).multiplyScalar(push)
    if (!reducedMotion) {
      desired.x += pointer.x * 0.35
      desired.y += pointer.y * 0.2
      if (visual === 'quest_success') desired.x += Math.sin(state.clock.elapsedTime * 1.4) * 0.25
    }
    camera.position.lerp(desired, 1 - Math.exp(-delta * (reducedMotion ? 6 : 1.8)))
    camera.lookAt(look)
  })
  return null
}

// ---- room -------------------------------------------------------------------

function Desk() {
  const tex = useMemo(woodTexture, [])
  return (
    <group>
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[9, 0.32, 5.2]} />
        <meshStandardMaterial map={tex} roughness={0.65} />
      </mesh>
      {/* front edge highlight */}
      <mesh position={[0, -0.01, 2.6]}>
        <boxGeometry args={[9, 0.02, 0.02]} />
        <meshStandardMaterial color="#b0805a" roughness={0.4} />
      </mesh>
    </group>
  )
}

function Room({ phase, reducedMotion }: { phase: TimerPhase; reducedMotion: boolean }) {
  return (
    <group>
      {/* back wall with a window opening */}
      <WallWithWindow />
      <WindowView phase={phase} reducedMotion={reducedMotion} />
      {/* window frame */}
      <group position={WINDOW_POS}>
        {[
          [0, 1.05, 2.5, 0.12],
          [0, -1.05, 2.7, 0.18],
          [-1.25, 0, 0.12, 2.2],
          [1.25, 0, 0.12, 2.2],
          [0, 0, 0.06, 2.1],
          [0, 0, 2.4, 0.06],
        ].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x!, y!, 0.06]} castShadow receiveShadow>
            <boxGeometry args={[w!, h!, i === 1 ? 0.35 : 0.12]} />
            <meshStandardMaterial color="#efe4cc" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* shelf with tiny books on the right */}
      <group position={[2.4, 2.1, -2.3]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.07, 0.4]} />
          <meshStandardMaterial color="#6b4630" />
        </mesh>
        {['#b4553c', '#e2b04a', '#4d7a5a', '#7f5a9b', '#d9c7a5'].map((c, i) => (
          <mesh key={c} position={[-0.6 + i * 0.17, 0.2 + (i % 2) * 0.03, 0]} rotation={[0, 0, i === 4 ? 0.25 : 0]} castShadow>
            <boxGeometry args={[0.13, 0.36 + (i % 3) * 0.05, 0.28]} />
            <meshStandardMaterial color={c} roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function WallWithWindow() {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-6, -0.3)
    s.lineTo(6, -0.3)
    s.lineTo(6, 6)
    s.lineTo(-6, 6)
    s.lineTo(-6, -0.3)
    const hole = new THREE.Path()
    const { x, y } = WINDOW_POS
    hole.moveTo(x - 1.25, y - 1.05)
    hole.lineTo(x + 1.25, y - 1.05)
    hole.lineTo(x + 1.25, y + 1.05)
    hole.lineTo(x - 1.25, y + 1.05)
    hole.lineTo(x - 1.25, y - 1.05)
    s.holes.push(hole)
    return s
  }, [])
  return (
    <mesh position={[0, 0, -2.45]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#7d8a66" roughness={0.95} />
    </mesh>
  )
}

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 bottom;
varying vec2 vUv;
void main() { gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 1.0, vUv.y)), 1.0); }
`

/** Autumn landscape beyond the window — the Hacktoberfest build leans into fall. */
function WindowView({ phase, reducedMotion }: { phase: TimerPhase; reducedMotion: boolean }) {
  const uniforms = useMemo(() => ({ top: { value: new THREE.Color('#8fc0e8') }, bottom: { value: new THREE.Color('#f7d9a8') } }), [])
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta)
    const h = new Date().getHours()
    const night = h >= 20 || h < 6
    const [top, bottom] = night ? ['#1c2846', '#3b3a5a'] : phase === 'break' ? ['#7ab8ef', '#ffe0a3'] : ['#8fb7d9', '#f1d7ae']
    uniforms.top.value.lerp(new THREE.Color(top), k)
    uniforms.bottom.value.lerp(new THREE.Color(bottom), k)
  })
  const trees = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 14 }, (_, i) => ({
      x: -4.2 + i * 0.6 + r() * 0.3,
      z: -5 - r() * 2.5,
      s: 0.5 + r() * 0.7,
      color: ['#d9732e', '#e6a33a', '#b84a2a', '#8c9a3a', '#e88a3a'][Math.floor(r() * 5)]!,
    }))
  }, [])

  return (
    <group>
      <mesh position={[WINDOW_POS.x, WINDOW_POS.y + 0.5, -9]}>
        <planeGeometry args={[16, 9]} />
        <shaderMaterial vertexShader={SKY_VERT} fragmentShader={SKY_FRAG} uniforms={uniforms} fog={false} />
      </mesh>
      {/* rolling hills */}
      <mesh position={[WINDOW_POS.x, -1.6, -7.5]} scale={[9, 2.6, 2]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#7c8f45" roughness={1} />
      </mesh>
      <mesh position={[WINDOW_POS.x + 3, -2.2, -6.5]} scale={[6, 3, 2]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#93a04c" roughness={1} />
      </mesh>
      {trees.map((t, i) => (
        <group key={i} position={[WINDOW_POS.x + t.x, 0.65, t.z]} scale={t.s}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.6, 6]} />
            <meshStandardMaterial color="#5a3d27" />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <icosahedronGeometry args={[0.45, 1]} />
            <meshStandardMaterial color={t.color} roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
      <FallingLeaves reducedMotion={reducedMotion} />
    </group>
  )
}

function FallingLeaves({ reducedMotion }: { reducedMotion: boolean }) {
  const count = 26
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => leafGeometry(0.09, 0.05), [])
  const seeds = useMemo(() => {
    const r = rng(5)
    return Array.from({ length: count }, () => ({ x: r() * 3 - 1.5, phase: r(), speed: 0.08 + r() * 0.08, sway: r() * 6, z: -3 - r() * 2 }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const palette = ['#d9732e', '#e6a33a', '#b84a2a', '#f0b851']
    seeds.forEach((_, i) => m.setColorAt(i, new THREE.Color(palette[i % palette.length])))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [seeds])
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const t = clock.elapsedTime * (reducedMotion ? 0.2 : 1)
    seeds.forEach((s, i) => {
      const y = 1 - ((t * s.speed + s.phase) % 1)
      dummy.position.set(WINDOW_POS.x + s.x + Math.sin(t + s.sway) * 0.3, WINDOW_POS.y - 1.6 + y * 3.4, s.z)
      dummy.rotation.set(t * 2 + s.sway, t + s.sway, t * 1.5)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[geo, undefined, count]}>
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.8} />
    </instancedMesh>
  )
}

// ---- props ------------------------------------------------------------------

function Laptop({ on }: { on: boolean }) {
  const tex = useMemo(codeScreenTexture, [])
  const screen = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((_, delta) => {
    if (!screen.current) return
    const target = on ? 1.1 : 0.15
    screen.current.emissiveIntensity += (target - screen.current.emissiveIntensity) * (1 - Math.exp(-delta * 3))
  })
  return (
    <group position={[1.05, 0, 0.55]} rotation={[0, -0.75, 0]}>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.04, 0.42]} />
        <meshStandardMaterial color="#c9ccd1" metalness={0.6} roughness={0.35} />
      </mesh>
      <group position={[0, 0.04, -0.2]} rotation={[-0.25, 0, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.62, 0.4, 0.025]} />
          <meshStandardMaterial color="#b9bcc2" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.2, 0.014]}>
          <planeGeometry args={[0.56, 0.34]} />
          <meshStandardMaterial ref={screen} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  )
}

function Mug() {
  return (
    <group position={[-1.5, 0, 0.75]}>
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.13, 0.34, 24]} />
        <meshStandardMaterial color="#d9576b" roughness={0.45} />
      </mesh>
      <mesh position={[0.16, 0.18, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.07, 0.022, 8, 16]} />
        <meshStandardMaterial color="#d9576b" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 24]} />
        <meshStandardMaterial color="#4a2c1c" roughness={0.2} />
      </mesh>
      <Sparkles count={6} scale={[0.2, 0.5, 0.2]} position={[0, 0.6, 0]} size={3} speed={0.3} color="#ffffff" opacity={0.35} />
    </group>
  )
}

function Notebook() {
  return (
    <group position={[1.6, 0, 1.45]} rotation={[0, 0.35, 0]}>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.05, 0.5]} />
        <meshStandardMaterial color="#e2b04a" roughness={0.8} />
      </mesh>
      <mesh position={[0.05, 0.065, 0]} castShadow>
        <boxGeometry args={[0.6, 0.02, 0.46]} />
        <meshStandardMaterial color="#f6eedb" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.09, 0.05]} rotation={[0, 0.6, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.5, 6]} />
        <meshStandardMaterial color="#4d7a5a" />
      </mesh>
    </group>
  )
}

function Pot({ radius = 0.22, height = 0.3, color = '#c2673f' }: { radius?: number; height?: number; color?: string }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.75, height, 24]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[radius, 0.03, 8, 24]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, height - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.95, 24]} />
        <meshStandardMaterial color="#3d2a1c" roughness={1} />
      </mesh>
    </group>
  )
}

function DeskPlant({ big, lush }: { big: boolean; lush: boolean }) {
  const leaf = useMemo(() => leafGeometry(0.55, 0.18), [])
  const leaves = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: 11 }, (_, i) => ({ yaw: (i / 11) * Math.PI * 2 + r() * 0.4, tilt: 0.35 + r() * 0.5, s: 0.7 + r() * 0.5 }))
  }, [])
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    const target = lush ? 1.7 : big ? 1.35 : 1
    group.current.scale.setScalar(group.current.scale.x + (target - group.current.scale.x) * (1 - Math.exp(-delta * 1.2)))
  })
  return (
    <group position={[-2.6, 0, -0.9]}>
      <Pot radius={0.3} height={0.42} />
      <group ref={group} position={[0, 0.4, 0]}>
        {leaves.map((l, i) => (
          <group key={i} rotation={[0, l.yaw, 0]}>
            <mesh geometry={leaf} rotation={[l.tilt, 0, 0]} scale={l.s} castShadow>
              <meshStandardMaterial color={i % 2 ? '#5e9a3a' : '#4c8a30'} side={THREE.DoubleSide} roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

// ---- unlockable ecosystem ---------------------------------------------------

/** Springs children in from nothing the first time they appear. */
function Grow({ children, position }: { children: React.ReactNode; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  const progress = useRef(0)
  useFrame((_, delta) => {
    if (!ref.current || progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta * 0.8)
    const p = progress.current
    // easeOutBack
    const s = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2)
    ref.current.scale.setScalar(Math.max(0.001, s))
  })
  return (
    <group ref={ref} position={position} scale={0.001}>
      {children}
    </group>
  )
}

function TinyTree() {
  return (
    <group>
      <Pot radius={0.16} height={0.2} color="#b5603b" />
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.05, 0.5, 8]} />
        <meshStandardMaterial color="#6b4630" />
      </mesh>
      {[
        [0, 0.78, 0, 0.26],
        [-0.14, 0.66, 0.05, 0.18],
        [0.15, 0.68, -0.04, 0.2],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x!, y!, z!]} castShadow>
          <icosahedronGeometry args={[r!, 1]} />
          <meshStandardMaterial color={['#5d9a35', '#73ad3e', '#4f8a2e'][i]} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** A curved, tapered grass blade (4 segments), pointing up from the origin. */
function bladeGeometry(): THREE.BufferGeometry {
  const segments = 4
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const half = 0.012 * (1 - t) + 0.0015
    const bend = t * t * 0.035
    positions.push(-half, t, bend, half, t, bend)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Unlocked by the first grass quest: a little tray of real sod beside Moss. */
function GrassPatch() {
  const count = 320
  const mesh = useRef<THREE.InstancedMesh>(null)
  const blade = useMemo(bladeGeometry, [])
  const trayTop = 0.075
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const r = rng(21)
    const d = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      // Even spread over the tray (sqrt keeps the centre from clumping).
      const a = r() * Math.PI * 2
      const rad = Math.sqrt(r()) * 0.27
      d.position.set(Math.cos(a) * rad, trayTop, Math.sin(a) * rad)
      d.rotation.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5)
      const h = 0.09 + r() * 0.09
      d.scale.set(1, h, 1)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      m.setColorAt(i, new THREE.Color().setHSL(0.23 + r() * 0.06, 0.55, 0.28 + r() * 0.18))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [blade])
  return (
    <group>
      {/* shallow terracotta tray */}
      <mesh position={[0, trayTop / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.29, trayTop, 32]} />
        <meshStandardMaterial color="#b9653e" roughness={0.85} />
      </mesh>
      {/* sod surface so the blades sit on ground, not on air */}
      <mesh position={[0, trayTop + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.295, 32]} />
        <meshStandardMaterial color="#3f5e22" roughness={1} />
      </mesh>
      <instancedMesh ref={mesh} args={[blade, undefined, count]} castShadow>
        <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
}

function FlowerPot() {
  return (
    <group>
      <Pot radius={0.17} height={0.24} color="#6f8fb0" />
      {[
        [0, 0.55, 0, '#f2a7b8'],
        [-0.09, 0.47, 0.04, '#f5c451'],
        [0.09, 0.5, -0.03, '#e8823a'],
      ].map(([x, y, z, c], i) => (
        <group key={i} position={[x as number, y as number, z as number]}>
          <mesh position={[0, -0.14, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
            <meshStandardMaterial color="#4f7d28" />
          </mesh>
          {Array.from({ length: 6 }, (_, p) => (
            <mesh key={p} position={[Math.cos((p / 6) * Math.PI * 2) * 0.04, 0, Math.sin((p / 6) * Math.PI * 2) * 0.04]} scale={[0.035, 0.012, 0.035]} castShadow>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color={c as string} roughness={0.6} />
            </mesh>
          ))}
          <mesh>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshStandardMaterial color="#5a3d27" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function SunCrystal() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.y = clock.elapsedTime * 0.6
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.2) * 0.06
  })
  return (
    <group>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#f5c451" emissive="#f5b431" emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
      <pointLight color="#ffc861" intensity={0.8} distance={2.5} />
    </group>
  )
}

function Ecosystem() {
  return (
    <group>
      {[
        [-0.7, 0.9],
        [0.75, 1.0],
        [-1.9, 0.3],
      ].map(([x, z], i) => (
        <group key={i} position={[x!, 0, z!]} scale={0.7 + i * 0.15}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.14, 8]} />
            <meshStandardMaterial color="#efe4cc" />
          </mesh>
          <mesh position={[0, 0.15, 0]} scale={[1, 0.6, 1]} castShadow>
            <sphereGeometry args={[0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c2473a" roughness={0.6} />
          </mesh>
        </group>
      ))}
      <Sparkles count={30} scale={[5, 2, 3]} position={[0, 1.2, 0]} size={4} speed={0.4} color="#d8f28a" />
    </group>
  )
}

// ---- reward & dialogue ------------------------------------------------------

/** Nature energy flowing from the window into Moss when a quest completes. */
function RewardStream({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const count = reducedMotion ? 0 : 60
  const mesh = useRef<THREE.InstancedMesh>(null)
  const start = useRef<number | null>(null)
  const seeds = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: 60 }, () => ({ delay: r() * 0.8, arc: 0.6 + r() * 1.2, spread: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.8) }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const target = useMemo(() => new THREE.Vector3(0, 0.6, 0.2), [])
  const [done, setDone] = useState(false)

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!active || !m || done) return
    if (start.current === null) start.current = clock.elapsedTime
    const elapsed = clock.elapsedTime - start.current
    let alive = false
    seeds.forEach((s, i) => {
      const p = Math.min(1, Math.max(0, (elapsed - s.delay) / 1.4))
      if (p < 1) alive = true
      const e = p * p * (3 - 2 * p)
      dummy.position.lerpVectors(WINDOW_POS, target, e).addScaledVector(s.spread, Math.sin(p * Math.PI))
      dummy.position.y += Math.sin(p * Math.PI) * s.arc
      dummy.scale.setScalar(p <= 0 || p >= 1 ? 0.0001 : 0.012 + Math.sin(p * Math.PI) * 0.018)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    if (!alive) setDone(true)
  })

  if (!active || count === 0 || done) return null
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#d8f28a" toneMapped={false} />
    </instancedMesh>
  )
}

/** After a quest, one autumn leaf drifts in through the window and settles on the desk near Moss. */
function BlownLeaf({ seed, reducedMotion }: { seed: number; reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => leafGeometry(0.22, 0.12), [])
  const start = useRef<number | null>(null)
  const path = useMemo(() => {
    const r = rng(seed * 7 + 3)
    // Open desk to Moss's right, clear of the timer HUD.
    const land = new THREE.Vector3(0.5 + r() * 0.2, 0.012, -0.5 - r() * 0.2)
    return {
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(WINDOW_POS.x + 0.3, WINDOW_POS.y + 0.4, WINDOW_POS.z + 0.1),
        new THREE.Vector3(-0.6, 2.6, -1.2),
        new THREE.Vector3(1.1, 1.3, 0.2),
        land,
      ),
      spin: 2 + r() * 2,
      restYaw: r() * Math.PI * 2,
      color: ['#d9732e', '#e6a33a', '#b84a2a'][Math.floor(r() * 3)]!,
    }
  }, [seed])
  const FLIGHT = 3.2

  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    if (start.current === null) start.current = clock.elapsedTime
    // Lands just after the reward stream so the two don't compete.
    const p = reducedMotion ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - start.current - 0.6) / FLIGHT))
    m.visible = reducedMotion || clock.elapsedTime - start.current > 0.6
    const e = 1 - Math.pow(1 - p, 2)
    m.position.copy(path.curve.getPoint(e))
    if (p < 1) {
      // Flutter: side-to-side sway that calms as it nears the desk.
      const calm = 1 - e
      m.position.x += Math.sin(p * 18) * 0.12 * calm
      m.rotation.set(Math.sin(p * 14) * 1.2 * calm - Math.PI / 2 * e, p * path.spin * 6, Math.cos(p * 11) * 0.9 * calm)
    } else {
      m.rotation.set(-Math.PI / 2, 0, path.restYaw)
    }
  })

  return (
    <mesh ref={ref} geometry={geo} castShadow visible={false}>
      <meshStandardMaterial color={path.color} side={THREE.DoubleSide} roughness={0.75} />
    </mesh>
  )
}

/** A soft shaft of light through the window while Moss celebrates. */
function SunBeam({ on }: { on: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const geo = useMemo(() => {
    // A tapered quad from the window down onto the desk, fading toward the floor end.
    const g = new THREE.BufferGeometry()
    const top = [WINDOW_POS.x - 0.9, WINDOW_POS.y + 0.8, WINDOW_POS.z + 0.05, WINDOW_POS.x + 0.9, WINDOW_POS.y + 0.8, WINDOW_POS.z + 0.05]
    const bottom = [-0.6, 0.02, 0.9, 1.0, 0.02, 0.6]
    g.setAttribute('position', new THREE.Float32BufferAttribute([...top, ...bottom], 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], 3))
    g.setIndex([0, 2, 1, 1, 2, 3])
    return g
  }, [])
  useFrame((_, delta) => {
    if (!mat.current) return
    const target = on ? 0.22 : 0
    mat.current.opacity += (target - mat.current.opacity) * (1 - Math.exp(-delta * 1.6))
    mat.current.visible = mat.current.opacity > 0.005
  })
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        ref={mat}
        color="#ffe2a6"
        vertexColors
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function DialogueBubble({ text }: { text: string }) {
  return (
    <Html position={[0, 2.15, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none', transform: 'translateY(-50%)' }}>
      <div className="animate-pop relative w-max max-w-[280px] rounded-2xl bg-parchment px-4 py-2.5 text-center font-display text-base leading-snug text-ink shadow-xl">
        {text}
        <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-parchment" />
      </div>
    </Html>
  )
}
