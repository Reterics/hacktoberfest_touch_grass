# Moss — Game Design

Creature stats, needs, XP, quests, progression, cooldowns, and deterministic rules.

Related: [Product](PRODUCT.md), [Architecture](ARCHITECTURE.md), and [Visual Direction](VISUAL-DIRECTION.md).

Numeric rewards and penalties below are illustrative examples from the original plan, not a finalized balance table.

---

## Creature State

Initial creature stats:

```text
Happiness
Energy
Nature
Movement
Rest
Curiosity
Hunger
Bathroom
```

Do not expose every stat constantly if that makes the interface noisy.

Some stats may be hidden or represented through creature behavior.

---

## Need Mapping

| Creature Need | Real-World Action |
|---|---|
| Energy | sunlight, outdoor environment, tree |
| Nature | plant, flower, grass, tree |
| Movement | walk |
| Bathroom | grass or soil |
| Curiosity | photograph something unusual |
| Rest | screen-free break |
| Hunger | food-related quest |
| Hydration | user drinks water |
| Happiness | playful challenge |

Needs should degrade over time.

Work sessions should affect needs.

Example:

```text
45 minutes of work

Energy       -8
Movement     -12
Curiosity    -3

Focus XP     +30
```

---

## Break Skipping

Skipping too many breaks can have playful consequences.

Example:

```text
SEDENTARY DEBUFF

Moss has been ignored for 3 breaks.

-20% Happiness
```

Avoid punishing users aggressively.

The game should encourage behavior, not guilt the user.

---

## Quest System

Every break may generate a quest.

### Movement

Examples:

- walk for five minutes
- walk 200 steps
- walk to the furthest visible tree
- walk somewhere you cannot see the workstation

### Nature

Examples:

- find a tree
- find grass
- find a flower
- find three different leaves
- find something naturally symmetrical

### Recovery

Examples:

- spend three minutes without looking at a screen
- look into the distance
- sit outside quietly
- identify three sounds

### Curiosity

Examples:

- find something unusual
- find something yellow
- photograph an interesting texture
- find something smaller than your thumb

### Playful

Examples:

- find something Moss would use as a hat
- find a place Moss would hide
- find something that looks like a face
- find the weirdest plant nearby

---

## Quest Requirements

Every quest should contain structured data.

Example:

```ts
interface Quest {
  id: string
  category: QuestCategory
  title: string
  description: string
  completionType: CompletionType
  durationMinutes?: number
  xpReward: number
  affectedStats: StatModifier[]
}
```

Possible completion types:

```text
PHOTO
TIMER
USER_CONFIRMATION
VISION_VALIDATION
STEP_COUNT
TEXT_RESPONSE
```

MVP should focus on:

```text
PHOTO
TIMER
USER_CONFIRMATION
VISION_VALIDATION
```

Gemma's image capability makes `VISION_VALIDATION` particularly valuable for the MVP.


---

## Deterministic Rules

The game engine owns timers, break scheduling, focus duration, creature stats, XP, leveling, cooldowns, achievements, quest eligibility, quest completion state, streaks, and persistence.

AI supplies dialogue, personality, quest wording and variations, contextual reactions, and interpretations of text or photo evidence. It operates within engine-supplied constraints. It must not directly modify game state or award rewards.

Validate every generated quest and vision result before using it. The engine determines completion and applies rewards. If quest generation fails, choose a deterministic fallback quest; a technical image-validation failure should allow retry or manual completion.

See [Architecture](ARCHITECTURE.md#architecture-philosophy) for the engine/AI boundary and validation flows.

## XP and Rewards

Completed focus sessions and quests can award XP. Each quest declares its `xpReward` and `affectedStats` in structured data.

Examples from the plan:

- A 45-minute work session grants +30 Focus XP while reducing Energy by 8, Movement by 12, and Curiosity by 3.
- The MVP tree quest grants +40 XP, +20 Energy, and +10 Nature.
- Other illustrative tree quests use +50 XP / +20 Energy / +10 Nature or +40 XP / +20 Energy / +8 Nature.
- Optional work awareness shows a commit reaction with +30 Focus XP; this remains a later feature.

These examples need a single balance table before implementation. The model does not choose reward amounts independently.

## Progression

Track levels, streaks, achievements, and quest completions. Progress should be visible in Moss and its environment, alongside numerical rewards.

The visual extension proposes:

| Level | Visible progression |
|---|---|
| 1 | Tiny sprout |
| 5 | More foliage |
| 10 | Small flower or accessory |
| 20 | Richer moss texture |
| 30 | Subtle glowing nature elements |

Outdoor activities may unlock environment objects:

- First tree quest: a tiny tree near Moss.
- First flower quest: a flower pot.
- 10 outdoor quests: a larger desk plant.
- 50 outdoor quests: a lush miniature ecosystem.

These are proposed milestones, not finalized rules. See [Visual Progression](VISUAL-DIRECTION.md#visual-progression), [Environment Progression](VISUAL-DIRECTION.md#environment-progression), and [Achievement Art](VISUAL-DIRECTION.md#achievement-art) for presentation examples.

## Cooldowns and Quest Eligibility

The deterministic engine controls cooldowns and quest eligibility. Need, available break duration, difficulty, environment, and recent quests constrain generation. Avoid repeating recent quests.

The original plan does not specify cooldown durations, eligibility thresholds, or exact repeat limits; these remain design decisions.

## Balance Decisions Still Open

- Stat ranges, degradation rates, and need thresholds beyond the illustrative 45-minute session.
- Whether Hydration, which appears in the need mapping, is a separate stat; it is absent from the initial stat list.
- XP thresholds for each level and final reward amounts.
- Cooldown durations and repeat limits.
- Streak definitions and the final achievement/unlock rules.
- Final break-skipping penalties and their recovery rules.

Keep these rules deterministic and test stat degradation, timer transitions, XP, leveling, quest selection, cooldowns, streaks, break scheduling, and fallback behavior. Core tests must not depend on Ollama.
