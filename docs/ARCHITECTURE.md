# Moss — Architecture

Local AI, backend, realtime communication, persistence, provider abstraction, and security.

Related: [Product](PRODUCT.md), [Game Design](GAME-DESIGN.md), and [Visual Direction](VISUAL-DIRECTION.md).

---

## Local-First Principle

Moss should work primarily on the user's local machine.

Private information should not need to leave the user's network.

This includes:

- work habits
- focus session history
- photographs
- creature state
- AI conversations
- productivity data

Avoid cloud services unless absolutely necessary.

If a cloud dependency can reasonably be replaced with a local/open alternative, prefer the local/open alternative.

---

## Suggested Technology Stack

Prefer TypeScript where reasonable.

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

Preferred:

- Node.js
- TypeScript

Possible framework:

- Fastify
- Express
- NestJS if architecture justifies it

Avoid unnecessary framework complexity.

### Realtime

- WebSockets

Socket.IO is acceptable if it significantly simplifies implementation.

### Database

- SQLite
- Prisma or lightweight equivalent

### AI

- Ollama
- Gemma 3 4B by default

### Mobile Companion

- responsive React web interface

Do not build React Native for MVP.

---

## Repository Structure

Prefer a monorepo.

Example:

```text
moss/
├── apps/
│   ├── web/
│   └── server/
│
├── packages/
│   ├── game-engine/
│   ├── ai/
│   ├── shared/
│   └── ui/
│
├── docs/
│
├── CLAUDE.md
├── README.md
└── package.json
```

Prefer one responsive React application capable of displaying both desktop and companion experiences if doing so keeps the architecture simpler.

Do not duplicate components unnecessarily.

---

## Networking

Laptop and phone should communicate across the same local network.

Example architecture:

```text
Laptop
│
├── React UI
│
├── Backend
│
├── Game Engine
│
├── SQLite
│
├── Ollama
│     └── Gemma 3 4B
│
└── WebSocket Server
        │
        │ Local Wi-Fi
        │
        ▼
      Phone
```

The backend should expose the companion interface to the LAN.

Example:

```text
http://192.168.x.x:3000
```

The desktop interface should provide a QR code containing the mobile companion URL.

Prefer WebSockets for synchronized game state.

Updates made on the phone should immediately appear on the laptop.

---

## Architecture Philosophy

Do **not** let the LLM control critical game mechanics.

Separate the deterministic game engine from AI behavior.

### Deterministic Game Engine

Responsible for:

- timers
- break scheduling
- focus duration
- creature stats
- XP
- leveling
- cooldowns
- achievements
- quest eligibility
- quest completion state
- streaks
- persistence

### AI Layer

Responsible for:

- dialogue
- personality
- quest wording
- quest variations
- contextual reactions
- creative descriptions
- interpreting user input
- interpreting images
- optional work-session summaries

The LLM should operate within constraints supplied by the game engine.

Example:

```json
{
  "need": "movement",
  "durationMinutes": 5,
  "difficulty": "easy",
  "environment": "garden_or_neighborhood",
  "recentQuests": [
    "find a tree",
    "find grass"
  ]
}
```

Gemma can transform this into:

```text
Moss has been sitting beside you for 47 minutes
and is beginning to question its life choices.

Take Moss outside.

Walk for five minutes and find the strangest-shaped
plant you can.

Bring back a photo.
```

---

## AI Runtime

Primary AI runtime:

- Ollama

Default model:

- **Gemma 3 4B (`gemma3:4b`)**

Gemma is preferred because the multimodal variants can handle both text and image input locally, allowing Moss to use one model family for:

- dialogue
- personality
- quest generation
- contextual reactions
- photo understanding
- quest verification

The model provider must remain configurable.

Potential alternative Ollama-compatible models may be supported later, but do not architect Moss around a specific model API beyond the provider abstraction.

Optional later capabilities:

- local speech-to-text
- local text-to-speech

---

## Why Gemma

Use **Gemma 3 4B** as the default Moss model.

The main architectural advantage is multimodality.

The same local model can potentially perform:

```text
Text
├── Moss dialogue
├── quest generation
├── work reactions
└── structured reasoning

Images
├── tree detection
├── grass detection
├── object verification
└── general quest evidence
```

This avoids requiring separate text and vision models for the MVP.

However:

**do not couple the application architecture directly to Gemma.**

Gemma is the default implementation.

`AIProvider` remains the abstraction.

---

## Ollama Integration

Backend should detect whether Ollama is available.

Expected development endpoint:

```text
http://localhost:11434
```

Create an abstraction around model providers.

Example:

```ts
interface AIProvider {
  generateText(
    request: GenerateTextRequest
  ): Promise<string>

  generateStructured<T>(
    request: StructuredRequest
  ): Promise<T>

  analyzeImage<T>(
    request: ImageAnalysisRequest
  ): Promise<T>
}
```

Initial implementation:

```text
OllamaProvider
      ↓
Gemma 3 4B
```

Do not scatter Ollama-specific API calls throughout the codebase.

---

## Model Configuration

Allow model selection via configuration.

Default:

```env
OLLAMA_HOST=http://localhost:11434

OLLAMA_TEXT_MODEL=gemma3:4b
OLLAMA_VISION_MODEL=gemma3:4b
```

Even though the same model is initially used for both, preserve separate configuration variables.

This allows future configurations such as:

```env
OLLAMA_TEXT_MODEL=some-small-text-model
OLLAMA_VISION_MODEL=gemma3:4b
```

without architectural changes.

---

## Ollama Startup Validation

At application startup:

```text
Check Ollama
     ↓
available?
 ┌───┴────┐
yes       no
 │         │
check     show setup state
model
 │
available?
 ┌───┴────┐
yes       no
 │         │
start     explain required
Moss      model
```

Provide meaningful errors when:

- Ollama isn't installed
- Ollama isn't running
- configured model isn't available
- image capability isn't supported
- inference fails

Do not crash the application because Ollama is temporarily unavailable.

---

## AI Quest Generation

Never depend entirely on AI-generated structured output without validation.

Flow:

```text
Game Engine
    ↓
determine creature need
    ↓
determine quest constraints
    ↓
Gemma
    ↓
generate structured candidate quest
    ↓
schema validation
    ↓
valid?
 ┌──┴──┐
yes    no
 │      │
use    deterministic fallback
```

Prefer structured JSON responses where practical.

All AI-generated structures must be validated before entering game state.

---

## Vision Validation

Photo validation is a high-value feature and should be supported early.

Because Gemma 3 4B supports image input, try using the same model for both text and visual verification.

Example:

```text
Quest requirement:

TREE

User uploads image.

Gemma receives:

- image
- required object: living tree
- validation instructions
```

Expected structured response:

```json
{
  "success": true,
  "confidence": 0.94,
  "detected": ["tree", "grass", "sky"],
  "reason": "A living tree is clearly visible in the image."
}
```

The application then determines whether the quest passes.

The model should not directly modify game state.

---

## Vision Guardrails

Vision validation should be intentionally simple.

Use it for broad concepts such as:

```text
tree
grass
flower
sky
outdoor environment
leaf
plant
water
food
yellow object
red object
```

Avoid requiring highly precise visual classification.

Don't make quests depend on identifying:

- exact plant species
- dangerous plants
- medical conditions
- edible vs poisonous objects
- exact distances
- exact quantities when ambiguous

Moss is a game, not a scientific identification system.

---

## AI Context

Moss should receive limited relevant context.

Example:

```json
{
  "creature": {
    "name": "Moss",
    "level": 7,
    "energy": 42,
    "nature": 38,
    "movement": 29
  },
  "session": {
    "durationMinutes": 45,
    "completed": true
  },
  "recentQuests": [
    "find grass",
    "find a tree"
  ],
  "requiredQuestCategory": "movement"
}
```

Avoid sending unnecessary historical data.

Summarize long history rather than continuously growing context.

---

## AI Prompting Principle

Do not simply ask:

```text
Generate an outdoor quest.
```

Constrain generation.

Example:

```text
Generate exactly one playful outdoor break quest.

Constraints:

- Category: movement
- Maximum duration: 5 minutes
- No special equipment
- Must be possible near a house, office, garden, or park
- User should spend as little time looking at the phone as possible
- Do not repeat recent quests
- Keep instructions under 50 words
- Moss should speak in a playful, mildly sarcastic voice

Return structured JSON only.
```

Then validate the result.

---

## Image Validation Prompting

Keep image validation narrow.

Example:

```text
You are validating evidence for a Moss quest.

Quest requirement:

The user must find a living tree.

Inspect the supplied image.

Return JSON:

{
  "success": boolean,
  "confidence": number,
  "detected": string[],
  "reason": string
}

Only return success=true if a living tree is clearly visible.

Do not award XP.
Do not modify creature state.
Do not generate a new quest.
```

The deterministic game engine remains responsible for rewards.

---

## AI Failure Handling

AI failure must never block the productivity cycle.

If quest generation fails:

```text
AI quest failed
      ↓
choose deterministic quest
```

Example fallback:

```text
Moss needs movement.

Go outside for three minutes.

Come back when you're ready.
```

If image validation fails technically:

Offer:

```text
Couldn't inspect the photo.

[ TRY AGAIN ]
[ COMPLETE MANUALLY ]
```

Moss should remain usable even when the model is unavailable.

---

## Persistence

Persist locally.

Recommended storage:

- SQLite

Store:

```text
settings
creature
stats
sessions
quests
quest completions
achievements
AI conversation state
model configuration
```

Design migrations properly.

Do not rely on browser localStorage as the primary persistent database.

---

## Security

Because the server is exposed on the local network:

- do not expose Ollama directly to LAN unnecessarily
- proxy AI calls through the Moss backend
- validate uploaded files
- limit file size
- restrict supported image formats
- prevent path traversal
- sanitize user input
- do not expose arbitrary filesystem access
- bind sensitive internal services appropriately

Phone pairing should use a short-lived token.

Example QR URL:

```text
http://192.168.1.50:3000/companion?token=...
```

The companion token should:

- expire
- be difficult to guess
- map to the current Moss instance
- not expose Ollama credentials or endpoints

---

## Testing

Write tests for deterministic logic.

High-priority:

- stat degradation
- timer transitions
- XP calculation
- leveling
- quest selection
- cooldowns
- streaks
- persistence
- break scheduling
- AI schema validation
- fallback behavior

Do not make core tests dependent on Ollama.

Mock `AIProvider`.

AI integration tests may run separately when Ollama is available.

---

## Development Principles

When implementing:

1. favor simple architecture
2. avoid premature abstractions
3. keep game rules deterministic
4. isolate AI integrations
5. preserve local-first behavior
6. make mobile interaction extremely quick
7. minimize screen time during physical quests
8. prioritize personality
9. make failure states graceful
10. maintain TypeScript type safety
11. validate every AI-generated structure
12. treat AI as creative intelligence, not application state
13. preserve model interchangeability
14. use Gemma as the default, not as architectural coupling
