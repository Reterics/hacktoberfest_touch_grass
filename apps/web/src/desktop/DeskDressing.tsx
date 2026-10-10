import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'

/*
 * Set dressing: small, quiet props that make the room feel lived in without competing with Moss.
 * Everything stays clear of the unlock spots (tiny tree, grass tray, flower pot, sun crystal) and of
 * the spot where the reward leaf lands.
 */
export function DeskDressing({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      <DeskMat />
      <Mouse />
      <BookStack />
      <DeskLamp />
      <Acorn position={[-0.62, 0, 0.62]} rotation={0.6} />
      <Pebble position={[-0.48, 0, 0.86]} />
      <Twig position={[-1.0, 0, 1.15]} />
      <Succulent position={[-0.78, 0, -1.25]} />
      <WallClock />
      <FramedPhoto />
      <StickyNote position={[1.02, 2.05, -2.43]} rotation={0.08} color="#f5d76e" />
      <StickyNote position={[1.2, 1.78, -2.43]} rotation={-0.12} color="#a8d8b0" />
      {/* Dust drifting in the window light. */}
      {!reducedMotion && <Sparkles count={45} scale={[3.2, 2.4, 3]} position={[-0.9, 1.4, -0.9]} size={2.2} speed={0.15} opacity={0.45} color="#ffe2a6" />}
    </group>
  )
}

/** A woven felt runner that breaks up the big wooden surface under Moss and the laptop. */
function DeskMat() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#7a8462'
    g.fillRect(0, 0, 256, 256)
    // Fine weave so it reads as fabric up close.
    for (let i = 0; i < 256; i += 4) {
      g.fillStyle = i % 8 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'
      g.fillRect(i, 0, 2, 256)
      g.fillRect(0, i, 256, 2)
    }
    // Stitched border.
    g.strokeStyle = 'rgba(246,238,219,0.55)'
    g.setLineDash([6, 5])
    g.lineWidth = 2
    g.strokeRect(12, 12, 232, 232)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [])
  return (
    <mesh position={[0.4, 0.004, 0.55]} rotation={[-Math.PI / 2, 0, 0.12]} receiveShadow>
      <planeGeometry args={[2.7, 1.55]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  )
}

function Mouse() {
  return (
    <group position={[1.82, 0, 0.92]} rotation={[0, -0.5, 0]}>
      <mesh position={[0, 0.03, 0]} scale={[0.065, 0.034, 0.1]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.058, -0.04]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.004, 0.004, 0.05]} />
        <meshStandardMaterial color="#b9b2a6" />
      </mesh>
    </group>
  )
}

function BookStack() {
  const books = [
    { w: 0.62, d: 0.44, h: 0.09, color: '#7b4a3a', yaw: 0.05 },
    { w: 0.56, d: 0.4, h: 0.07, color: '#4d6b58', yaw: -0.12 },
    { w: 0.5, d: 0.36, h: 0.06, color: '#d9b45a', yaw: 0.2 },
  ]
  let y = 0
  return (
    <group position={[-2.35, 0, 0.55]} rotation={[0, 0.4, 0]}>
      {books.map((b, i) => {
        const at = y + b.h / 2
        y += b.h
        return (
          <group key={i} position={[0, at, 0]} rotation={[0, b.yaw, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[b.w, b.h, b.d]} />
              <meshStandardMaterial color={b.color} roughness={0.8} />
            </mesh>
            {/* page block */}
            <mesh position={[0.012, 0, 0]}>
              <boxGeometry args={[b.w - 0.03, b.h - 0.018, b.d + 0.002]} />
              <meshStandardMaterial color="#efe6cf" roughness={0.9} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** A small brass desk lamp in the back corner, adding a warm pool of light. */
function DeskLamp() {
  const brass = <meshStandardMaterial color="#b98d4a" metalness={0.6} roughness={0.35} />
  return (
    <group position={[2.65, 0, -1.45]} rotation={[0, -0.6, 0]}>
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.05, 28]} />
        {brass}
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.8, 10]} />
        {brass}
      </mesh>
      <group position={[-0.08, 0.82, 0]} rotation={[0, 0, 0.9]}>
        <mesh castShadow>
          <coneGeometry args={[0.2, 0.26, 28, 1, true]} />
          <meshStandardMaterial color="#3f5a46" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.06, 0]}>
          <sphereGeometry args={[0.06, 14, 10]} />
          <meshStandardMaterial color="#fff2cf" emissive="#ffcf7a" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[-0.25, 0.7, 0]} color="#ffc070" intensity={0.9} distance={3.2} decay={1.8} />
    </group>
  )
}

function Acorn({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, Math.PI / 2.3]}>
      <mesh position={[0, 0.045, 0]} scale={[0.042, 0.055, 0.042]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#a8642c" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.088, 0]} scale={[0.048, 0.026, 0.048]} castShadow>
        <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#6b4a2c" roughness={1} />
      </mesh>
      <mesh position={[0, 0.118, 0]}>
        <cylinderGeometry args={[0.005, 0.006, 0.03, 6]} />
        <meshStandardMaterial color="#5a3d27" />
      </mesh>
    </group>
  )
}

function Pebble({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.022, position[2]]} scale={[0.07, 0.03, 0.052]} rotation={[0, 0.7, 0]} castShadow receiveShadow>
      <sphereGeometry args={[1, 18, 12]} />
      <meshStandardMaterial color="#9a9890" roughness={0.75} />
    </mesh>
  )
}

function Twig({ position }: { position: [number, number, number] }) {
  return (
    <group position={[position[0], 0.012, position[2]]} rotation={[0, -0.9, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.008, 0.011, 0.34, 6]} />
        <meshStandardMaterial color="#6b4a2c" roughness={1} />
      </mesh>
      <mesh position={[0.06, 0.01, 0.03]} rotation={[0, 0.7, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.005, 0.007, 0.12, 5]} />
        <meshStandardMaterial color="#6b4a2c" roughness={1} />
      </mesh>
    </group>
  )
}

/** A second, smaller plant: a rosette succulent in a stoneware pot. */
function Succulent({ position }: { position: [number, number, number] }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const ring = i < 8 ? 0 : 1
        const n = ring ? 6 : 8
        const k = ring ? i - 8 : i
        return { yaw: (k / n) * Math.PI * 2 + ring * 0.3, tilt: ring ? 0.5 : 1.0, s: ring ? 0.75 : 1 }
      }),
    [],
  )
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.11, 0.16, 20]} />
        <meshStandardMaterial color="#d8d0c0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.158, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 20]} />
        <meshStandardMaterial color="#4a3526" roughness={1} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} position={[0, 0.17, 0]} rotation={[0, l.yaw, 0]}>
          <mesh position={[0, 0.03 * l.s, 0.05 * l.s]} rotation={[l.tilt, 0, 0]} scale={[0.035 * l.s, 0.012, 0.07 * l.s]} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={i < 8 ? '#7fa58a' : '#9cc0a0'} roughness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** A round wall clock that shows the real local time. */
function WallClock() {
  const hour = useRef<THREE.Group>(null)
  const minute = useRef<THREE.Group>(null)
  useFrame(() => {
    const d = new Date()
    const m = d.getMinutes() + d.getSeconds() / 60
    const h = (d.getHours() % 12) + m / 60
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2
  })
  return (
    <group position={[-3.75, 2.45, -2.42]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.05, 40]} />
        <meshStandardMaterial color="#6b4630" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.027]}>
        <circleGeometry args={[0.31, 40]} />
        <meshStandardMaterial color="#f6eedb" roughness={0.8} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[Math.sin((i / 12) * Math.PI * 2) * 0.26, Math.cos((i / 12) * Math.PI * 2) * 0.26, 0.03]} rotation={[0, 0, -(i / 12) * Math.PI * 2]}>
          <planeGeometry args={[0.012, i % 3 ? 0.03 : 0.055]} />
          <meshBasicMaterial color="#2a2117" />
        </mesh>
      ))}
      <group position={[0, 0, 0.034]}>
        {/* Hands pivot at the clock centre: each mesh is offset by half its length. */}
        <group ref={hour}>
          <mesh position={[0, 0.07, 0]}>
            <planeGeometry args={[0.022, 0.16]} />
            <meshBasicMaterial color="#2a2117" />
          </mesh>
        </group>
        <group ref={minute} position={[0, 0, 0.001]}>
          <mesh position={[0, 0.1, 0]}>
            <planeGeometry args={[0.014, 0.23]} />
            <meshBasicMaterial color="#2a2117" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** A small framed photo of a tree on the wall: a hint of what Moss misses. */
function FramedPhoto() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 160
    c.height = 128
    const g = c.getContext('2d')!
    const sky = g.createLinearGradient(0, 0, 0, 128)
    sky.addColorStop(0, '#9cc6e6')
    sky.addColorStop(1, '#f4dcae')
    g.fillStyle = sky
    g.fillRect(0, 0, 160, 128)
    g.fillStyle = '#7c9a45'
    g.beginPath()
    g.ellipse(80, 140, 120, 50, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#5a3d27'
    g.fillRect(76, 62, 8, 34)
    g.fillStyle = '#d9822e'
    g.beginPath()
    g.arc(80, 52, 28, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e6a33a'
    g.beginPath()
    g.arc(66, 60, 16, 0, Math.PI * 2)
    g.arc(96, 58, 17, 0, Math.PI * 2)
    g.fill()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <group position={[0.5, 1.75, -2.42]} rotation={[0, 0, -0.03]}>
      <mesh castShadow>
        <boxGeometry args={[0.56, 0.46, 0.04]} />
        <meshStandardMaterial color="#3b2a1e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[0.46, 0.36]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  )
}

function StickyNote({ position, rotation, color }: { position: [number, number, number]; rotation: number; color: string }) {
  return (
    <group position={position} rotation={[0, 0, rotation]}>
      <mesh position={[0, 0, 0.004]} castShadow>
        <planeGeometry args={[0.2, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* scribbled lines */}
      {[0.04, 0, -0.04].map((y, i) => (
        <mesh key={i} position={[-0.01 + i * 0.006, y, 0.006]}>
          <planeGeometry args={[0.13 - i * 0.03, 0.008]} />
          <meshBasicMaterial color="#5a4a3a" transparent opacity={0.55} />
        </mesh>
      ))}
      <mesh position={[0, 0.085, 0.012]}>
        <sphereGeometry args={[0.014, 10, 8]} />
        <meshStandardMaterial color="#d9576b" roughness={0.4} />
      </mesh>
    </group>
  )
}
