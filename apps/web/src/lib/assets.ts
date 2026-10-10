import type { AchievementId } from '@moss/shared'
import type { MossVisualState, SpriteMood } from './visualState.ts'

/**
 * Production visual assets (docs/VISUAL-DIRECTION.md#asset-manifest).
 * Generated at design time with Higgsfield (2D) and Meshy (3D), optimised and stored locally.
 * Never reference temporary generation URLs from code.
 */
export interface VisualAsset {
  id: string
  category: 'character' | 'animation' | 'environment' | 'achievement' | 'cinematic'
  source: 'higgsfield' | 'meshy' | 'threejs' | 'manual'
  state?: MossVisualState
  localPath: string
  width?: number
  height?: number
  version: number
}

export const MOSS_BODY_GLB = '/assets/models/moss-body.glb'
/** Same body, rigged by Meshy, with `walk` and `hop` clips. */
export const MOSS_RIG_GLB = '/assets/models/moss-rigged.glb'

export function moodSprite(mood: SpriteMood): string {
  return `/assets/moss/mood-${mood}.webp`
}

export type MotionClip = 'walk' | 'hop'

/** Sprite strips baked from the rigged Moss (320x384 frames, side by side). */
export const MOTION_SPRITES: Record<MotionClip, { frames: number; seconds: number }> = {
  walk: { frames: 12, seconds: 1 },
  hop: { frames: 24, seconds: 2 },
}

export function motionSprite(clip: MotionClip): string {
  return `/assets/moss/moss-${clip}.webp`
}

export function achievementArt(id: AchievementId): string {
  return `/assets/achievements/${id}.webp`
}

const ACHIEVEMENTS: AchievementId[] = ['touched_grass', 'forest_friend', 'photosynthesis', 'chlorophyll_addict', 'outdoor_engineer']

const MOODS: SpriteMood[] = ['neutral', 'happy', 'excited', 'tired', 'concerned', 'annoyed', 'curious', 'sleeping']

export const ASSET_MANIFEST: VisualAsset[] = [
  {
    // Faceless body; eyes, lids and mouth are rendered live so expressions stay dynamic.
    id: 'moss-body',
    category: 'character',
    source: 'meshy',
    localPath: MOSS_BODY_GLB,
    version: 1,
  },
  {
    id: 'moss-rigged',
    category: 'animation',
    source: 'meshy',
    localPath: MOSS_RIG_GLB,
    version: 1,
  },
  ...MOODS.map<VisualAsset>((mood) => ({
    id: `moss-mood-${mood}`,
    category: 'character',
    source: 'higgsfield',
    localPath: moodSprite(mood),
    height: 384,
    version: 1,
  })),
  ...(['walk', 'hop'] as const).map<VisualAsset>((clip) => ({
    id: `moss-${clip}-sprite`,
    category: 'animation',
    source: 'meshy',
    localPath: motionSprite(clip),
    width: 320,
    height: 384,
    version: 1,
  })),
  ...ACHIEVEMENTS.map<VisualAsset>((id) => ({
    id: `achievement-${id}`,
    category: 'achievement',
    source: 'higgsfield',
    localPath: achievementArt(id),
    width: 512,
    height: 512,
    version: 1,
  })),
]
