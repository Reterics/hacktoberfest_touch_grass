# Moss

Moss is a local-first AI productivity companion combining:
Tamagotchi × focus timer × outdoor quests.

## Core loop

Focus
→ Moss develops a need
→ break quest
→ user takes phone outside
→ photo/activity
→ Gemma validates where required
→ Moss recovers
→ virtual ecosystem grows
→ next focus session

## Stack

- React
- TypeScript
- Vite
- Three.js
- Node
- WebSockets
- SQLite
- Ollama
- Gemma 3 4B

## Architecture Rules

- Critical game state is deterministic.
- AI never directly modifies XP/stats.
- Gemma handles personality, quest wording and vision.
- Ollama runs locally.
- Phone communicates with laptop over local Wi-Fi.
- No cloud AI required.
- Higgsfield is design-time only, never runtime.

## Visual Direction

Moss should feel like a polished indie game, not SaaS.

Use Higgsfield MCP for:
- canonical Moss character design
- character sheets
- visual exploration
- animation references
- environments
- achievement art
- promotional visuals
- 3D Jutsu where useful

Runtime visuals should use local assets / Three.js.

The real-world activity should visibly grow Moss's virtual ecosystem.

## Development Priority

Always build vertically:

Focus timer
→ break
→ creature need
→ Gemma quest
→ phone
→ photo
→ Gemma validation
→ Moss reaction
→ environment progression
→ next focus session

Do not prioritize secondary features until this loop works.

## Additional Documentation

Read relevant documentation before implementing larger features:

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/GAME-DESIGN.md`
- `docs/VISUAL-DIRECTION.md`