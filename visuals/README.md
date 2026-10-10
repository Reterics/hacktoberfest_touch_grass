# Moss Visual Bible

The source of truth for how Moss looks. These files are design-time references, not runtime dependencies (see `docs/VISUAL-DIRECTION.md`).

## Canonical character

![Moss master](references/moss-master-front.png)

**Moss** is a fluffy round puff of spring-green velvety moss with two curled fern fiddleheads on top of its head.

- **Silhouette:** a round body plus two tall curled fronds. It reads instantly at small sizes.
- **Body:** a slightly bottom-heavy sphere with tiny nub arms and two short round moss feet.
- **Face:** heavy half-lidded glossy dark eyes with whitish sclera. One lid sits a touch lower than the other. A small flat mouth, faint rosy cheeks.
- **Personality:** deadpan, dry and slightly sarcastic, but affectionate. The resting face is *unimpressed*, not cute-smiley, which matches Moss's voice in `packages/ai/src/prompts.ts`.
- **Fronds are expressive.** They droop outward when Moss is tired or asleep and straighten when it's excited.

The design merges concept **05 Fern sprite** (anatomy) with concept **06 Turf block** (personality).

## Files

| File | What it is |
|---|---|
| `references/moss-master-front.png` | Canonical master: front view, deadpan expression. **Always use this as the reference for new generations.** |
| `references/moss-turnaround.webp` | Turnaround: front, three-quarter front, side, three-quarter rear, back |
| `references/moss-expressions.webp` | Expressions: neutral, happy, excited, tired, concerned, annoyed, curious, sleeping |
| `references/moss-expressions-cutout.webp` | Expression sheet with the background removed (source of the phone sprites) |
| `references/moss-base-front.webp`, `moss-base-side.webp` | Faceless body views used as Meshy input |
| `references/master-candidate-b.webp` | The runner-up master candidate (candidate A became the master) |
| `concepts/moss-concept-0*.webp` | The six exploration concepts |
| `meshy/moss-body-raw.glb` | Raw Meshy 7.1 output (12.4k triangles, embedded 2K texture) |

The master is a lossless PNG. The other references are stored as quality-92 WebP to keep the repository small.

## Runtime assets

| Asset | Path | Source |
|---|---|---|
| 3D body (faceless) | `apps/web/public/assets/models/moss-body.glb` | Meshy, optimized with gltf-transform (meshopt + 1024px WebP, 301 KB) |
| Phone mood sprites | `apps/web/public/assets/moss/mood-*.webp` | Cut from the expression-sheet cutout, 384px tall |

The 3D body is deliberately **faceless**. Eyes, heavy upper lids, mouth and cheeks are rendered live in Three.js (`apps/web/src/desktop/MossModel.tsx`), so blinking and every expression stay dynamic. The fern fronds bend in a vertex shader driven by each visual state's `droop` value. Expression values per state live in `VISUAL_PROFILES` (`apps/web/src/lib/visualState.ts`). Preview any state with `http://localhost:5173/?visual=<state>`.

## Pipeline used

1. **Higgsfield, Nano Banana Pro:** 6 concepts, then a hybrid master from concepts 05 and 06 (2 variants).
2. Turnaround and expression sheet, generated with the master as the reference image.
3. Faceless front and side views, then **Meshy multi-image-to-3D** (Meshy 7.1, textured, remeshed to about 12k faces), exported as GLB.
4. `npx @gltf-transform/cli optimize ... --texture-compress webp --texture-size 1024 --compress meshopt`
5. Background removal on the expression sheet, then cropping into WebP mood sprites.

## Rules

- Keep Moss consistent. Never regenerate it from text alone; always pass `moss-master-front.png` as a reference.
- Name production assets semantically (`moss-body.glb`, `mood-tired.webp`), never by generation job ID.
- Higgsfield and Meshy are design-time only. The app loads everything locally.
