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

export function moodSprite(mood: SpriteMood): string {
  return `/assets/moss/mood-${mood}.webp`
}

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
  ...MOODS.map<VisualAsset>((mood) => ({
    id: `moss-mood-${mood}`,
    category: 'character',
    source: 'higgsfield',
    localPath: moodSprite(mood),
    height: 384,
    version: 1,
  })),
]
