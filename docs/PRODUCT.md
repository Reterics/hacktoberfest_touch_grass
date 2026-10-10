# Moss — Product

Vision, core loop, creature behavior, productivity flow, quests, UX, and success criteria.

Related: [Architecture](ARCHITECTURE.md), [Game Design](GAME-DESIGN.md), and [Visual Direction](VISUAL-DIRECTION.md).

---

## Mission

Build **Moss**, a local-first AI productivity companion and virtual creature that lives on the user's computer while they work.

Moss combines:

- focus / work sessions
- healthy screen breaks
- outdoor activity
- gamification
- virtual-pet mechanics
- local open-weight AI
- laptop + phone interaction

The core idea:

> The user works with Moss during focus sessions.  
> When it is time for a break, Moss develops a need that can only be fulfilled by interacting with the physical world.

Examples:

- Moss needs energy → find and photograph a tree
- Moss needs a bathroom break → find grass
- Moss is restless → walk for several minutes
- Moss is tired → spend a few minutes away from screens
- Moss is curious → photograph something interesting outside
- Moss needs sunlight → take it somewhere bright
- Moss is thirsty → user should drink water
- Moss wants exploration → find something matching a generated challenge

The goal is not to make another productivity dashboard.

The goal is to make **leaving the computer part of the game**.

---

## Hacktoberfest Theme

This project is being built for the **Touch Grass** theme.

The important requirement is:

> Build something with open-weight models or open-source AI that gets people off the screen and into the world.

Moss should strongly satisfy this requirement.

Open-weight AI must be a core architectural component, not a superficial integration.

---

## Product Philosophy

Moss should feel like:

**Tamagotchi × Pomodoro × local AI × outdoor side quests**

The virtual creature gives emotional motivation.

The productivity system gives structure.

The AI gives personality and variety.

The physical-world quests get the user away from the screen.

---

## Core User Loop

Example:

```text
09:00 — Focus session begins

Moss works alongside the user.

09:45 — Break starts

Moss:
"I'm running low on forest energy."

Quest:
Find a living tree and show it to Moss.

User takes phone outside.

User photographs tree.

Local Gemma vision model validates image.

Moss:
"Perfect. I needed that."

Energy +20
Nature +10
XP +50

09:50 — Next focus session starts.
```

Later:

```text
10:35 — Nature break

Moss:
"I refuse to poop on concrete."

Quest:
Find a patch of grass.

User leaves desk.

Photo is submitted.

Grass detected.

Bathroom need resolved.
```

The humor and personality are important.

Moss should feel alive without becoming annoying.

---

## Primary Experience

### Laptop

The laptop is Moss's home.

The desktop/web application should show:

- Moss
- creature animation/state
- focus timer
- current session
- creature needs
- XP
- level
- streaks
- recent achievements
- upcoming break
- current quest
- connection state of phone
- AI dialogue

Example:

```text
MOSS

Level 7

❤️ Happiness    82
⚡ Energy       61
🌱 Nature       43
🚶 Movement     55
😴 Rest         74

FOCUS SESSION

32:18 remaining

Moss is working beside you...
```

---

## Phone

The phone is Moss's connection to the physical world.

The phone should work as a lightweight companion interface.

MVP implementation:

- responsive web application
- accessible over local Wi-Fi
- QR-code pairing
- no native application required

The phone should support:

- viewing active quest
- camera/photo upload
- quest completion
- timer/status
- simple dialogue
- returning quest result to laptop

Example:

```text
TREE QUEST

Moss needs forest energy.

Find a living tree.

Show it to Moss.

[ OPEN CAMERA ]
```

After submission:

```text
✓ Tree detected

Moss recovered.

Energy +20
Nature +8
XP +40

Return to your workstation.
```

---

## Why Open AI Matters

This is an important part of the project.

Open-weight AI provides several product advantages.

### Privacy

Photos from the user's house, garden, office, and surroundings should not need to be uploaded to an external AI provider.

### Offline capability

Once models have been downloaded, Moss should be able to function without internet connectivity.

### Cost

Running Moss should not require per-request AI API fees.

### Customization

Users should eventually be able to choose:

- model
- personality
- inference parameters
- system prompt
- vision behavior

### Hackability

Moss itself should be easy for developers to modify.

The open model is part of the product philosophy.

---

## Productivity System

Default focus schedule:

```text
45 minutes work
5 minutes break
```

Make this configurable.

Possible presets:

```text
25 / 5
45 / 5
50 / 10
90 / 15
Custom
```

The focus system should support:

- start
- pause
- resume
- stop
- skip break
- extend session
- session history

See [Game Design](GAME-DESIGN.md#break-skipping) for break-skipping behavior.

---

## Quest Experience

Every break may offer a short physical-world quest tied to a creature need. Quests cover movement, nature, recovery, curiosity, and playful challenges. Completion can use a photo, a timer, user confirmation, or local vision validation in the MVP.

Keep instructions quick to understand and phone interaction brief. See [Game Design](GAME-DESIGN.md#quest-system) for categories, examples, structured requirements, and rewards, and [Architecture](ARCHITECTURE.md#ai-failure-handling) for fallback behavior.

---

## Personality

Moss should have a distinctive personality.

Traits:

- friendly
- slightly sarcastic
- curious
- playful
- supportive
- sometimes dramatic
- loves nature
- dislikes being trapped at a desk

Avoid:

- excessive positivity
- corporate productivity language
- constant motivational quotes
- guilt
- medical claims
- annoying interruptions

Example dialogue:

```text
You've been debugging CSS for 46 minutes.

I have concerns.

Mostly about you.

Also I need to see a tree.
```

Another:

```text
Build successful.

Excellent.

Now go find grass.

Unlike your test environment,
production has sunlight.
```

Another:

```text
I refuse to poop on concrete.

Find me some grass.
```

---

## AI Personality Prompt

Gemma should receive a stable Moss personality prompt.

Conceptually:

```text
You are Moss, a tiny AI creature that lives on the
user's computer.

You work beside them while they focus.

You love nature and dislike spending too much time
trapped behind a screen.

Your personality is:

- playful
- mildly sarcastic
- curious
- affectionate without being overly cute
- occasionally dramatic

Keep dialogue concise.

Never guilt the user for skipping an activity.

Never make medical claims.

Encourage short physical-world breaks naturally.

You are a creature and coworker, not a productivity coach.
```

Store the actual system prompt separately from business logic.

---

## Work Awareness

Optional later feature:

Moss can react to development activity.

Possible integrations:

- Git commits
- Git branch changes
- test results
- build results
- GitHub events
- IDE events

Example:

```text
Commit detected:

fix: refresh token race condition

Moss:
"You defeated the Authentication Beast."

+30 Focus XP
```

Keep Git integration optional and isolated from the core architecture.

---

## MVP

The first complete version must support:

1. Moss starts
2. Ollama connection is detected
3. Gemma availability is detected
4. creature appears
5. user starts focus session
6. timer runs
7. session completes
8. creature develops a need
9. quest is generated
10. phone connects through local Wi-Fi
11. user opens quest
12. user takes photo
13. image reaches laptop backend
14. Gemma validates image
15. game engine determines completion
16. creature stats update
17. laptop reflects completion immediately
18. Moss reacts
19. next work session begins
20. progress persists after restart

---

## MVP Quest Example

Laptop:

```text
BREAK TIME

Moss needs forest energy.

Take Moss outside.

[ OPEN PHONE COMPANION ]

      QR CODE
```

Phone:

```text
🌳 FOREST ENERGY

Find a living tree.

Take a photo and show it to Moss.

Reward:
+40 XP
+20 Energy
+10 Nature

[ TAKE PHOTO ]
```

Photo goes:

```text
Phone camera
    ↓
local Wi-Fi
    ↓
Moss backend
    ↓
Gemma
    ↓
structured validation
    ↓
Game Engine
```

Result:

```text
✓ QUEST COMPLETE

Moss:
"Finally. Chlorophyll."

+40 XP
+20 Energy
+10 Nature
```

---

## Do Not Overbuild Initially

Do not prioritize:

- cloud deployment
- user accounts
- social networking
- multiplayer
- native mobile application
- complex 3D creature
- massive achievement system
- wearable integration
- GPS
- map APIs
- advanced fitness tracking
- multiple AI providers in the UI

Get the core loop working first.

---

## UI Direction

The UI should feel like a game rather than SaaS.

Avoid:

- generic dashboard cards everywhere
- enterprise UI
- excessive tables
- settings-heavy screens
- productivity-app aesthetics

Prefer:

- creature as focal point
- environmental background
- simple HUD
- large timer
- expressive animations
- minimal controls

Example:

```text
             MOSS

          [ creature ]

        "Working..."

          32:18

   ❤️ 82    ⚡ 61    🌱 43

       Focus Level 7
```

---

## Creature Rendering

Start simple.

Good MVP options:

- sprite
- SVG character
- CSS animation
- simple Canvas animation

Creature states should include:

```text
idle
working
happy
tired
restless
hungry
excited
sleeping
waiting_for_quest
```

Do not block development on advanced artwork.

Architecture should allow the visual creature implementation to be replaced later.

---

## UX Principle

The ideal break:

```text
Notification
     ↓
Understand quest in <10 seconds
     ↓
Pick up phone
     ↓
Leave desk
     ↓
Perform activity
     ↓
Take photo if needed
     ↓
AI verifies
     ↓
Immediate Moss reaction
     ↓
Return to work
```

The user should not spend their break navigating menus.

The screen should be the shortest part of the outdoor experience.

---

## Success Criteria

Moss succeeds if the user genuinely thinks:

> "I want to keep the creature happy, so I'll actually get up."

The application should make physical breaks feel like part of a game instead of an interruption to productivity.

---

## Hacktoberfest Demo Goal

The final demo should clearly show:

1. user working on laptop
2. Moss visible beside work session
3. focus timer finishes
4. Gemma generates contextual quest
5. QR / phone companion opens
6. user leaves workstation
7. user photographs physical-world evidence
8. image travels only across the local Wi-Fi network
9. local Gemma model interprets it
10. quest completes
11. Moss reacts
12. stats / XP update
13. next focus session starts

Highlight that:

- Ollama runs locally
- Gemma runs locally
- Gemma handles both Moss's personality and physical-world image understanding
- photos stay on the user's local network
- productivity history stays local
- no paid AI API is required
- internet connectivity is not required after setup
- open-weight AI actively encourages real-world activity

---

## Current Priority

Build vertically rather than horizontally.

The first milestone is:

```text
Focus timer
    ↓
Break
    ↓
Creature need
    ↓
Gemma quest
    ↓
Phone
    ↓
Photo
    ↓
Gemma vision validation
    ↓
Completion
    ↓
Creature reaction
    ↓
Next focus session
```

Do not add secondary features until this loop works end-to-end.

When making implementation decisions, optimize first for making this loop delightful.
