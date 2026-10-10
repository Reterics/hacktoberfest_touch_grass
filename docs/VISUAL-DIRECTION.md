# Higgsfield Visual Experience System

## Goal

Moss should visually feel like a polished indie game rather than a productivity dashboard or hackathon prototype.

Use **Higgsfield MCP as the primary visual-development pipeline**.

Higgsfield is a development/design dependency, not a runtime requirement.

At runtime:

- Moss must not depend on Higgsfield
- visual state changes must be instant
- existing generated/rendered assets should be loaded locally
- Ollama/Gemma decides behavior and state
- the frontend chooses the appropriate visual asset or animation

Conceptually:

```text
Higgsfield MCP
      ↓
Visual development
      ↓
Images / Video / 3D / GLB
      ↓
Asset pipeline
      ↓
Optimized application assets
      ↓
React / Three.js frontend


Ollama / Gemma
      ↓
Moss state + dialogue + decisions
      ↓
Visual State Controller
      ↓
Existing Moss animation/state
```

---

# Visual Quality Is A Core Product Requirement

Do not treat visual polish as optional or as work to perform after functionality is complete.

Moss's emotional connection to the user is fundamental to the product.

The creature must communicate state through:

- pose
- expression
- animation
- movement
- environment
- lighting
- particles
- sound where appropriate

Whenever possible:

> Show Moss's state before describing it with UI.

Avoid presenting Moss primarily as numbers, progress bars, cards, and dashboard widgets.

---

# Visual Direction

Default visual direction:

**Premium stylized 3D miniature world**

Characteristics:

- stylized rather than photorealistic
- tactile materials
- soft shapes
- subtle natural imperfections
- cinematic lighting
- cozy workspace aesthetic
- rich foliage
- miniature diorama feeling
- expressive creature
- restrained UI overlays
- high-quality game presentation

Moss should feel suitable for an adult productivity application while remaining playful and charming.

Avoid:

- generic SaaS design
- flat corporate illustration
- childish clip-art aesthetics
- excessive neon gamer UI
- random AI-art style changes
- photorealistic animal appearance
- visual clutter

---

# Moss Character Design

Moss is a small fictional forest creature.

The exact design should be developed through Higgsfield rather than arbitrarily implemented in CSS.

Create a canonical Moss design before producing state variants.

The canonical design should specify:

```text
body proportions
face
eyes
limbs
leaf / moss elements
primary materials
texture
silhouette
scale
personality
default expression
default environment
```

Moss needs to be immediately recognizable from silhouette alone.

---

# Character Consistency

Visual consistency is more important than producing large quantities of artwork.

Once a canonical Moss image/model has been approved:

**always use it as the reference for further Higgsfield generations where the selected generation model supports reference media.**

Never independently regenerate Moss from text-only prompts for production assets unless intentionally redesigning the character.

Maintain:

```text
visuals/
├── references/
│   ├── moss-master-front.*
│   ├── moss-master-side.*
│   ├── moss-master-three-quarter.*
│   └── moss-character-sheet.*
```

These files form the visual source of truth.

---

# Higgsfield MCP Usage

Claude should use available Higgsfield MCP tools when producing or evolving Moss visual assets.

Relevant capabilities include:

- image generation
- reference-based image generation/editing
- batch image generation
- video generation
- reference/image-to-video animation
- model discovery when an appropriate generation model must be selected
- 3D Jutsu scene creation/editing
- GLB export
- Blender scene workflows
- generation canvases for visual exploration

Do not assume a model's exact capabilities.

When necessary, inspect available Higgsfield models and their supported:

```text
inputs
reference media
aspect ratios
resolution
duration
parameters
```

before choosing the generation strategy.

---

# Higgsfield Is Not Runtime AI

Do not call Higgsfield from normal Moss application behavior.

Incorrect:

```text
Moss becomes tired
      ↓
call Higgsfield
      ↓
wait for tired Moss image
```

Correct:

```text
Moss becomes tired
      ↓
VisualStateController
      ↓
play tired animation
```

Higgsfield creates that animation during development.

This preserves:

- instant interaction
- offline operation
- privacy
- predictable visual identity
- zero runtime generation cost

---

# Visual Bible

Before generating large amounts of media, create a **Moss Visual Bible**.

It should define:

## Character

- canonical Moss appearance
- proportions
- face
- materials
- silhouette
- expressions

## World

- desk
- plant life
- window
- outdoor environments
- props
- lighting language

## Camera

Desktop default:

```text
three-quarter view
slightly above Moss eye level
medium-wide miniature environment
```

Close-up moments:

```text
eye-level
character-focused
shallow visual depth
```

Quest cinematics may use more dynamic framing.

## Lighting

Work:

```text
soft indoor daylight
neutral / warm
```

Break available:

```text
brighter natural light entering environment
```

Successful outdoor quest:

```text
warm sunlight
richer foliage
stronger natural ambience
```

Night:

```text
soft moonlight
warm practical desk lighting
```

---

# Visual Asset Pipeline

Use the following visual-development phases.

## Phase 1 — Character Exploration

Use Higgsfield image generation to explore approximately 6-12 Moss concepts.

Evaluate primarily:

- silhouette
- emotional appeal
- ability to animate
- readability at small size
- adult-friendly visual style
- uniqueness

Do not create animations before locking the character.

---

# Phase 2 — Character Sheet

After selecting Moss:

Create consistent reference views:

```text
front
rear
left
right
3/4 front
3/4 rear
close-up face
neutral pose
```

Also create a basic expression sheet:

```text
neutral
happy
excited
tired
concerned
annoyed
curious
sleeping
```

These become references for later work.

---

# Phase 3 — Interactive 3D Moss

Preferred implementation:

Create a real 3D Moss character suitable for browser rendering.

Use Higgsfield 3D Jutsu when appropriate to:

- create the character scene
- refine geometry
- inspect materials
- establish scale
- create or edit supporting scene objects
- export GLB

Application target:

```text
Three.js
   ↓
GLB Moss
   ↓
React
```

Keep polygon count and textures suitable for real-time browser rendering.

The goal is not cinematic film geometry.

The goal is:

> excellent visual quality at interactive web performance.

---

# 3D Environment

Create a small Moss desktop diorama.

Possible environment:

```text
desk
├── Moss
├── tiny workstation
├── plant
├── cup
├── notebook
├── window
└── outdoor scenery beyond window
```

The environment can change subtly depending on:

```text
time of day
focus mode
break mode
Moss condition
completed quests
level/progression
season
```

Do not construct an enormous 3D world.

The creature remains the focus.

---

# Camera Interaction

Use subtle interactive camera behavior.

Examples:

Mouse movement:

```text
small parallax / camera orbit
```

Moss clicked:

```text
camera eases slightly toward Moss
```

Break begins:

```text
camera subtly pushes toward Moss
```

Quest complete:

```text
short celebratory camera movement
```

Avoid aggressive camera motion.

The application must remain usable while working.

---

# Core Moss Visual States

Create visual behavior for at least:

```text
idle
working
thinking
focused
happy
excited
tired
sleepy
restless
hungry
needs_bathroom
nature_deprived
curious
waiting_for_user
quest_ready
quest_success
quest_failed
level_up
sleeping
```

Not every state needs a completely unique animation.

Animations may share layers or transitions.

---

# Visual State Controller

Application state should map deterministically to visual presentation.

Example:

```ts
type MossVisualState =
  | 'idle'
  | 'working'
  | 'happy'
  | 'tired'
  | 'restless'
  | 'nature_deprived'
  | 'quest_ready'
  | 'quest_success'
  | 'sleeping'
```

The LLM does not directly select arbitrary animation filenames.

Instead:

```text
Gemma
↓
semantic creature behavior

Game Engine
↓
canonical game state

VisualStateController
↓
supported Moss visual state

Renderer
↓
animation
```

---

# Visual State Priority

Multiple needs may exist simultaneously.

Use deterministic priority.

Example:

```text
quest_success
level_up
urgent_need
break_ready
tired
working
idle
```

Avoid visually switching Moss between states every few seconds.

Use minimum animation/state durations to keep behavior natural.

---

# Visual Progression

Leveling should visually affect Moss.

Possible progression:

```text
Level 1
tiny sprout

Level 5
more foliage

Level 10
small flower / accessory

Level 20
richer moss texture

Level 30
subtle glowing nature elements
```

Do not make progression purely numerical.

Users should be able to recognize long-term progress by looking at Moss.

---

# Environment Progression

Completed outdoor activities can unlock environmental objects.

Examples:

```text
first tree quest
→ tiny tree appears near Moss

first flower quest
→ flower pot appears

10 outdoor quests
→ larger desk plant

50 outdoor quests
→ lush miniature ecosystem
```

This creates a strong feedback loop:

> Real-world activity grows Moss's virtual world.

This should be considered a major product mechanic.

---

# Quest Transition

When a work session ends, do not instantly replace the timer with a modal.

Use a visual transition.

Example:

```text
timer completes

Moss stops working

Moss stretches

looks toward window

small visual cue appears

Moss walks toward user / foreground

dialogue:

"Okay. I need a tree."

[ TAKE MOSS OUTSIDE ]
```

The transition should feel like Moss decided it was time to leave.

---

# Phone Companion Visual Direction

When the user scans the QR code, Moss conceptually travels from the laptop to the phone.

Make this transition feel intentional.

Laptop:

```text
Moss jumps / enters transport animation
```

Phone:

```text
Moss appears
```

The phone UI should be dramatically simpler than the desktop UI.

Primary layout:

```text
[Moss]

Quest title

Short instruction

[ Camera ]
```

Avoid:

- dashboard
- multiple navigation tabs
- statistics
- settings
- history

The phone exists to complete the real-world activity.

---

# Device Handoff Animation

Create a Moss handoff experience.

Possible transition:

```text
Laptop:
Moss becomes light / particle form
→ enters QR / phone icon

Phone:
particles appear
→ Moss materializes
```

This can be implemented with:

- Three.js
- pre-rendered Higgsfield animation
- lightweight shader/particles
- CSS effects

Do not require synchronized video playback between devices.

The illusion is enough.

---

# Higgsfield Video Assets

Use Higgsfield video generation selectively for high-value moments.

Good candidates:

```text
onboarding cinematic
Moss introduction
rare level-up sequence
major evolution
achievement reveal
device handoff inspiration/reference
Hacktoberfest demo trailer
```

Do not turn every interface action into generated video.

Most everyday interaction should remain real-time UI / Three.js animation.

---

# Micro-Cinematics

Short pre-rendered moments may be used where real-time animation would require excessive work.

Target:

```text
1-4 seconds
```

Examples:

```text
Moss waking up
Moss celebrating
Moss absorbing forest energy
Moss reacting to a completed tree quest
Moss evolving
```

These should remain visually consistent with the interactive creature.

---

# Reward Presentation

Quest completion must feel rewarding.

Weak:

```text
+40 XP
```

Preferred:

```text
photo validated
↓
phone haptic
↓
Moss reacts
↓
nature energy flows toward Moss
↓
environment visibly becomes slightly healthier
↓
+40 XP appears briefly
```

The emotional reward comes before the number.

---

# AI + Visual Interaction

Gemma may generate semantic reactions such as:

```json
{
  "emotion": "excited",
  "intensity": 0.7,
  "dialogue": "Now THAT is a tree.",
  "behavior": "celebrate"
}
```

Validate this output.

Map it to supported visual behavior.

Example:

```text
behavior=celebrate
    ↓
VisualStateController
    ↓
celebration animation #2
```

Gemma must never invent arbitrary visual assets.

---

# Dynamic Dialogue Presentation

Avoid conventional chat bubbles covering the interface.

Moss dialogue should appear naturally near the creature.

Example:

```text
          Moss
           ↓

      (tiny bubble)

"I need grass."

      [Let's go]
```

Dialogue should generally remain under 1-3 sentences.

---

# Background Generation

Use Higgsfield to create reference/background material for environments such as:

```text
cozy desk
garden
park
forest
sunny outdoor environment
rainy environment
autumn environment
evening environment
```

Use a consistent visual language.

Do not generate each environment independently without the approved visual references.

---

# Seasonal Visuals

If time allows, create seasonal variations:

```text
spring
summer
autumn
winter
```

The Hacktoberfest build should strongly consider an autumn version.

Examples:

```text
fall leaves outside window
warm sunlight
subtle orange/brown environment accents
Moss retains green identity
```

---

# Achievement Art

Important achievements may receive dedicated Higgsfield artwork.

Examples:

```text
ACTUALLY TOUCHED GRASS

FOREST FRIEND
Complete 10 tree quests

OUTDOOR ENGINEER
Complete 100 focus breaks outside

BUG FIXER
Find a real bug

PHOTOSYNTHESIS
Complete 7 sunlight quests

CHLOROPHYLL ADDICT
Complete 50 plant quests
```

Achievement artwork should feature Moss rather than generic badges where practical.

---

# Asset Manifest

Track generated production assets.

Example:

```ts
interface VisualAsset {
  id: string
  category:
    | 'character'
    | 'animation'
    | 'environment'
    | 'achievement'
    | 'cinematic'

  source: 'higgsfield' | 'threejs' | 'manual'
  state?: MossVisualState
  localPath: string
  width?: number
  height?: number
  duration?: number
  version: number
}
```

Do not reference temporary Higgsfield generation URLs directly from production code.

Production assets should be deliberately selected, downloaded, optimized, versioned, and stored with the project or its controlled asset pipeline.

---

# Asset Naming

Use stable semantic filenames.

Example:

```text
moss-idle.glb
moss-working.glb

moss-intro.webm
moss-level-up.webm

environment-desk-day.webp
environment-desk-evening.webp

achievement-touch-grass.webp
```

Never use generated job IDs as production filenames.

---

# Performance Budget

Visual quality must not destroy productivity-app performance.

Targets:

Initial application shell should appear quickly.

Lazy-load:

- rare animations
- cinematics
- achievements
- non-current environment variants

Prefer:

```text
WebP / AVIF for still images
WebM where appropriate for short video
GLB for 3D
compressed textures
```

Do not load the complete visual library at startup.

---

# Reduced Motion

Support:

```text
prefers-reduced-motion
```

When active:

- eliminate strong camera movement
- replace cinematic transitions with fades
- reduce particle movement
- keep Moss readable through static poses

---

# Mobile Performance

The mobile companion does not need the complete desktop 3D environment.

Prefer:

```text
small Moss render
sprite / lightweight model
simple animation
camera UI
```

Quest completion must remain fast even on modest phones.

---

# Development Workflow With Higgsfield

For new important visual features:

```text
1. Define visual purpose
2. Check existing visual bible
3. Reuse canonical Moss reference
4. Generate a small concept batch with Higgsfield
5. Select one direction
6. Iterate only that direction
7. Convert / model / animate as required
8. Optimize asset
9. Add asset to manifest
10. Integrate into application
11. Test on desktop and phone
```

Avoid generating dozens of unrelated variants without selecting a direction.

---

# Higgsfield Canvas

When visual exploration becomes substantial, use a Higgsfield Canvas as a visual design board.

Suggested layout:

```text
MOSS VISUAL BIBLE

Character
├── master
├── expressions
└── poses

Environment
├── desk
├── garden
└── seasonal

Animations
├── work
├── needs
└── rewards

Achievements

Phone companion

Marketing / Demo
```

Use the board to maintain visual consistency rather than relying solely on prompt history.

---

# Demo Experience

The Hacktoberfest demo should be visually staged.

Ideal sequence:

```text
1. Moss happily working beside developer

2. focus timer approaches zero

3. Moss becomes restless

4. Moss walks toward screen foreground

5. "I need a tree."

6. QR / Take Moss Outside

7. phone companion appears

8. user walks outside

9. camera photographs tree

10. Gemma validates tree locally

11. Moss reacts on phone

12. return to workstation

13. Moss has visibly recovered

14. desk ecosystem grows slightly

15. next focus session begins
```

The viewer should understand the concept even with the audio muted.

---

# Hacktoberfest Marketing Visuals

After the product works, use Higgsfield to create high-quality presentation material.

Potential assets:

- repository hero artwork
- README GIF/video
- 15-30 second product trailer
- social post imagery
- before/after Moss state comparison
- architecture illustration
- character introduction
- Touch Grass quest montage

Do not create these before the core visual identity is locked.

---

# Priority Order

Visual implementation priority:

```text
P0
Moss canonical design

P0
interactive Moss representation

P0
working / idle / tired / happy states

P0
quest-ready + quest-success

P0
phone companion Moss

P1
desk environment

P1
device handoff transition

P1
environment progression

P1
level-up

P2
achievements

P2
seasonal environments

P2
cinematics

P3
large visual variant library
```

---

# Visual Success Criteria

The visual experience succeeds if:

1. Moss is recognizable without UI text.
2. Users can approximately understand Moss's condition by looking at it.
3. Breaks feel like events rather than notifications.
4. Going outside visibly improves Moss and its environment.
5. Returning from a quest feels rewarding.
6. Desktop and phone feel like one continuous creature experience.
7. AI-generated artwork does not look visually inconsistent.
8. The application remains fast.
9. Higgsfield is never required for ordinary runtime operation.
10. Screenshots look like a game people would actually want to try.

The desired reaction is:

> "Wait — this is a productivity app?"

followed by:

> "I want that creature on my desktop."

---

Related: [Product](PRODUCT.md), [Architecture](ARCHITECTURE.md), and [Game Design](GAME-DESIGN.md).
