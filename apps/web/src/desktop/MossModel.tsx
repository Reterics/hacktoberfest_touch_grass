import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { VISUAL_PROFILES, type MossVisualState, type VisualProfile } from '../lib/visualState.ts'
import { MOSS_BODY_GLB, MOSS_RIG_GLB } from '../lib/assets.ts'

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
/** Where Moss walks to when it heads outside (desk spot below the window, in Moss-group space). */
const DOOR = new THREE.Vector3(-1.3, 0, -1.9)
const HOME = new THREE.Vector3(0, 0, 0)
const WALK_SECONDS = 2.6
/** Extra lift applied on top of the hop clip's own hip motion. */
const HOP_LIFT_BOOST = 2.5

interface Props {
  visual: MossVisualState
  level: number
  /** 0..1 average wellbeing, tints Moss. */
  health: number
  reducedMotion: boolean
  onPoke?: () => void
  /** Ref that receives Moss's head position (for dialogue / particles). */
  headRef?: React.RefObject<THREE.Object3D | null>
  /** True while Moss is outside with the user's phone: it walks off toward the window. */
  away: boolean
  /** Dev sprite baking: freeze Moss in the walk clip at an exact time and facing. */
  bake?: { clip: 'walk' | 'hop'; time: number; yaw: number } | null
}

/**
 * Shared choreography between the static body (all live expressions) and the rigged body
 * (Meshy walk / hop clips). Only one of them is visible at a time.
 */
interface Choreo {
  request: 'walk' | 'hop' | 'stop' | null
  rigged: boolean
  /** When set, the rigged body holds a clip at this time (sprite baking). */
  pose: { clip: 'walk' | 'hop'; time: number } | null
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

export function MossModel({ visual, level, health, reducedMotion, onPoke, headRef, away, bake = null }: Props) {
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
  const choreo = useRef<Choreo>({ request: null, rigged: false, pose: null })
  /** 0 = at home on the desk, 1 = gone outside. */
  const awayProgress = useRef(away ? 1 : 0)
  const walking = useRef(false)

  // Celebrate with the Meshy hop when a break quest appears or one completes.
  useEffect(() => {
    if (reducedMotion || awayProgress.current > 0) return
    if (visual === 'quest_ready' || visual === 'quest_success' || visual === 'level_up') choreo.current.request = 'hop'
  }, [visual, reducedMotion])

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

    choreo.current.pose = bake ? { clip: bake.clip, time: bake.time } : null
    if (bake && root.current && body.current) {
      live.current.blink = 0
      root.current.position.copy(HOME)
      root.current.scale.setScalar(1)
      root.current.rotation.y = bake.yaw
      body.current.position.set(0, 0, 0)
      body.current.scale.set(1, 1, 1)
      body.current.rotation.set(0, 0, 0)
      return
    }

    const motion = reducedMotion ? 0.25 : 1
    phase.current += delta * p.speed
    const ph = phase.current
    poke.current = Math.max(0, poke.current - delta * 2.5)
    const pokeHop = Math.sin(poke.current * Math.PI) * 0.25

    // Heading outside: walk to the window and shrink away; walk back in when the quest is done.
    const goal = away ? 1 : 0
    const ap = awayProgress.current
    if (ap !== goal) {
      const step = delta / (reducedMotion ? 0.6 : WALK_SECONDS)
      awayProgress.current = goal > ap ? Math.min(goal, ap + step) : Math.max(goal, ap - step)
      if (!walking.current && !reducedMotion) choreo.current.request = 'walk'
      walking.current = true
    } else if (walking.current) {
      walking.current = false
      choreo.current.request = 'stop'
    }
    const progress = awayProgress.current
    const eased = progress * progress * (3 - 2 * progress)

    if (root.current && body.current && (walking.current || progress > 0)) {
      root.current.position.lerpVectors(HOME, DOOR, eased)
      root.current.scale.setScalar(progress > 0.85 ? Math.max(0.001, 1 - (progress - 0.85) / 0.15) : 1)
      // Face the direction of travel: away from the camera when leaving, toward it when coming back.
      root.current.rotation.y = goal === 1 ? Math.atan2(DOOR.x - HOME.x, DOOR.z - HOME.z) : FACE_CAMERA_YAW
      body.current.position.y = 0
      body.current.scale.set(1, 1, 1)
      body.current.rotation.set(0, 0, 0)
    } else if (root.current && body.current) {
      root.current.position.copy(HOME)
      root.current.scale.setScalar(1)
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
            <GlbMoss live={live} health={health} tier={tier} reducedMotion={reducedMotion} choreo={choreo} />
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

function GlbMoss({
  live,
  health,
  tier,
  reducedMotion,
  choreo,
}: {
  live: React.RefObject<Live>
  health: number
  tier: number
  reducedMotion: boolean
  choreo: React.RefObject<Choreo>
}) {
  // Meshopt decoding is bundled locally (no CDN), keeping Moss offline-capable.
  const gltf = useGLTF(MOSS_BODY_GLB, false, true)
  const metrics = useMemo(() => measureBody(gltf.scene), [gltf.scene])
  const tint = useMemo(() => new THREE.Color(), [])
  const staticBody = useRef<THREE.Group>(null)

  useFrame(() => {
    if (staticBody.current) staticBody.current.visible = !choreo.current.rigged
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
    <>
      <group ref={staticBody}>
        <mesh geometry={metrics.geometry} material={metrics.material} castShadow receiveShadow />
        <Face metrics={metrics} live={live} />
        {tier >= 2 && <Flower y={metrics.bodyTop + 0.02} glow={tier >= 4} />}
      </group>
      <Suspense fallback={null}>
        <RiggedMoss metrics={metrics} live={live} choreo={choreo} />
      </Suspense>
    </>
  )
}

// ---- rigged body (Meshy walk / hop) -----------------------------------------

/**
 * The Meshy-rigged Moss, normalised to the same space as the static body so the live face lines up.
 * The face follows whichever bone drives the face area most strongly.
 */
function RiggedMoss({ metrics, live, choreo }: { metrics: BodyMetrics; live: React.RefObject<Live>; choreo: React.RefObject<Choreo> }) {
  const gltf = useGLTF(MOSS_RIG_GLB, false, true)
  const root = useRef<THREE.Group>(null)
  const faceAnchor = useRef<THREE.Group>(null)
  const bindInverse = useRef<THREE.Matrix4 | null>(null)
  const hopEndsAt = useRef(0)
  const scratch = useMemo(() => new THREE.Matrix4(), [])

  const rig = useMemo(() => {
    const scene = cloneSkinned(gltf.scene)
    const wrapper = new THREE.Group()
    wrapper.add(scene)
    wrapper.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const s = TARGET_HEIGHT / (box.max.y - box.min.y)
    scene.scale.multiplyScalar(s)
    scene.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s)
    wrapper.updateMatrixWorld(true)

    // Keep the rigged mesh's OWN material: its texture carries the UV decode (offset/scale) that matches
    // this file's quantized UVs. Borrowing the static body's material samples the texture in the wrong
    // places, which made the rigged Moss render darker and flatter. Only the look is copied over.
    let material: THREE.MeshStandardMaterial | null = null
    let faceBone: THREE.Bone | null = null
    scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      if (!material) {
        material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
        material = material.clone()
        material.roughness = metrics.material.roughness
        material.metalness = metrics.material.metalness
        material.side = metrics.material.side
        material.emissive = metrics.material.emissive.clone()
        material.emissiveMap = material.map
      }
      mesh.material = material
      mesh.castShadow = true
      mesh.frustumCulled = false
      faceBone ??= softenAndFindFaceBone(mesh, metrics)
    })

    const mixer = new THREE.AnimationMixer(scene)
    const find = (name: string) => gltf.animations.find((a) => a.name === name)
    const walkClip = find('walk')
    const hopClip = find('hop')
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const hop = hopClip ? mixer.clipAction(hopClip) : null
    if (hop) {
      hop.setLoop(THREE.LoopOnce, 1)
      hop.clampWhenFinished = true
    }
    // Meshy's hop is human-scale: the hips rise ~9% of Moss's height. Amplify the clip's own vertical
    // motion so the feet visibly leave the desk, in time with the animation.
    const hips = scene.getObjectByName('Hips') ?? null
    const hipsRestY = hips?.position.y ?? 0
    const hipsToMoss = hips?.parent ? hips.parent.getWorldScale(new THREE.Vector3()).y : 0
    return { wrapper, mixer, walk, hop, material: material as THREE.MeshStandardMaterial | null, faceBone: faceBone as THREE.Bone | null, hips, hipsRestY, hipsToMoss }
  }, [gltf, metrics])

  // Capture the face bone's rest pose relative to the body before any clip plays.
  useEffect(() => {
    const bone = rig.faceBone
    if (!bone || !root.current) return
    root.current.updateMatrixWorld(true)
    bindInverse.current = new THREE.Matrix4().copy(root.current.matrixWorld).invert().multiply(bone.matrixWorld).invert()
  }, [rig])

  useFrame((state, delta) => {
    const c = choreo.current
    const t = state.clock.elapsedTime
    const posed = c.pose ? rig[c.pose.clip] : null
    if (c.pose && posed) {
      if (!posed.isRunning()) {
        rig.mixer.stopAllAction()
        posed.reset().play()
      }
      c.rigged = true
      posed.time = Math.min(c.pose.time, posed.getClip().duration - 0.001)
      rig.mixer.update(0)
    } else if (c.request) {
      const request = c.request
      c.request = null
      rig.mixer.stopAllAction()
      if (request === 'walk' && rig.walk) {
        rig.walk.reset().play()
        c.rigged = true
      } else if (request === 'hop' && rig.hop) {
        rig.hop.reset().play()
        hopEndsAt.current = t + rig.hop.getClip().duration
        c.rigged = true
      } else {
        c.rigged = false
      }
    }
    // A finished hop hands Moss back to the static body (and its full set of expressions).
    if (!c.pose && c.rigged && !rig.walk?.isRunning() && t >= hopEndsAt.current) {
      rig.mixer.stopAllAction()
      c.rigged = false
    }
    if (root.current) root.current.visible = c.rigged
    if (rig.material) {
      rig.material.color.copy(metrics.material.color)
      rig.material.emissiveIntensity = metrics.material.emissiveIntensity
    }
    if (!c.rigged) return
    if (!c.pose) rig.mixer.update(delta)
    const hopping = rig.hop?.isRunning() || c.pose?.clip === 'hop'
    const lift = hopping && rig.hips ? Math.max(0, rig.hips.position.y - rig.hipsRestY) * rig.hipsToMoss * HOP_LIFT_BOOST : 0
    rig.wrapper.position.y = lift

    // Keep the live face glued to the face bone.
    const bone = rig.faceBone
    if (!bone || !root.current || !faceAnchor.current || !bindInverse.current) return
    root.current.updateMatrixWorld(true)
    scratch.copy(root.current.matrixWorld).invert().multiply(bone.matrixWorld)
    faceAnchor.current.matrix.copy(scratch).multiply(bindInverse.current)
  })

  return (
    <group ref={root} visible={false}>
      <primitive object={rig.wrapper} />
      <group ref={faceAnchor} matrixAutoUpdate={false}>
        <Face metrics={metrics} live={live} />
      </group>
    </group>
  )
}

/**
 * Softens the rigged mesh's normals like the static body, and returns the bone with the strongest
 * influence on the face, using bind-pose positions in Moss space.
 */
function softenAndFindFaceBone(mesh: THREE.SkinnedMesh, metrics: BodyMetrics): THREE.Bone | null {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position')
  const normals = geo.getAttribute('normal')
  const skinIndex = geo.getAttribute('skinIndex')
  const skinWeight = geo.getAttribute('skinWeight')
  if (!skinIndex || !skinWeight) return null

  // Geometry of a skinned mesh lives in bind space; the GPU maps it through
  // bindMatrixInverse * (bone.matrixWorld * boneInverse) * bindMatrix, then the mesh's world matrix.
  // Build that rest-pose matrix per bone so positions and normals are measured in Moss space.
  mesh.skeleton.update()
  const restToMoss = mesh.skeleton.bones.map((bone, i) =>
    new THREE.Matrix4()
      .copy(mesh.matrixWorld)
      .multiply(mesh.bindMatrixInverse)
      .multiply(bone.matrixWorld)
      .multiply(mesh.skeleton.boneInverses[i]!)
      .multiply(mesh.bindMatrix),
  )
  const normalToMoss = restToMoss.map((m) => new THREE.Matrix3().getNormalMatrix(m))
  const normalFromMoss = normalToMoss.map((m) => m.clone().invert())
  const topBone = (i: number) => {
    let best = 0
    let bestWeight = -1
    for (let k = 0; k < skinIndex.itemSize; k++) {
      const w = skinWeight.getComponent(i, k)
      if (w > bestWeight) {
        bestWeight = w
        best = skinIndex.getComponent(i, k)
      }
    }
    return best
  }

  const center = new THREE.Vector3(0, metrics.bodyTop * 0.55, 0)
  const face = new THREE.Vector3(0, metrics.eyeY, (metrics.eyeZ[0] + metrics.eyeZ[1]) / 2)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const radial = new THREE.Vector3()
  let nearest = -1
  let nearestDist = Infinity

  for (let i = 0; i < pos.count; i++) {
    const b = topBone(i)
    p.fromBufferAttribute(pos, i).applyMatrix4(restToMoss[b]!)
    const d = p.distanceToSquared(face)
    if (d < nearestDist) {
      nearestDist = d
      nearest = i
    }
    // Same softening as the static body, so both bodies shade identically.
    if (!normals || p.y > metrics.bodyTop) continue
    radial.copy(p).sub(center).normalize()
    n.fromBufferAttribute(normals, i).applyMatrix3(normalToMoss[b]!).normalize().lerp(radial, 0.8).normalize()
    n.applyMatrix3(normalFromMoss[b]!).normalize()
    normals.setXYZ(i, n.x, n.y, n.z)
  }
  if (normals) normals.needsUpdate = true
  return nearest < 0 ? null : (mesh.skeleton.bones[topBone(nearest)] ?? null)
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
useGLTF.preload(MOSS_RIG_GLB, false, true)

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
