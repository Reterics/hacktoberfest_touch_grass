import type { CompletionType, QuestCategory, StatKey, StatModifier, VisionTarget } from '@moss/shared'

/**
 * Quest templates are the deterministic backbone of every break.
 * The engine picks a template (and therefore rewards); the AI may only rephrase the wording.
 * The wording here doubles as the fallback when the model is unavailable.
 */
export interface QuestTemplate {
  id: string
  need: StatKey
  category: QuestCategory
  completionType: CompletionType
  visionTarget?: VisionTarget
  durationMinutes?: number
  xpReward: number
  affectedStats: StatModifier[]
  title: string
  description: string
  mossLine: string
  /** Short environment hint passed to the AI as a constraint. */
  environment: string
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    id: 'tree',
    need: 'energy',
    category: 'nature',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'tree',
    xpReward: 40,
    affectedStats: [
      { stat: 'energy', delta: 20 },
      { stat: 'nature', delta: 10 },
    ],
    title: 'Forest Energy',
    description: 'Find a living tree and show it to Moss.',
    mossLine: "I'm running low on forest energy.",
    environment: 'garden, street, park or courtyard',
  },
  {
    id: 'sky',
    need: 'energy',
    category: 'nature',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'sky',
    xpReward: 30,
    affectedStats: [
      { stat: 'energy', delta: 18 },
      { stat: 'rest', delta: 5 },
    ],
    title: 'Solar Recharge',
    description: 'Step outside and show Moss the open sky.',
    mossLine: 'My leaves are filing a complaint about the lighting in here.',
    environment: 'any outdoor spot or open window',
  },
  {
    id: 'walk',
    need: 'movement',
    category: 'movement',
    completionType: 'TIMER',
    durationMinutes: 4,
    xpReward: 30,
    affectedStats: [
      { stat: 'movement', delta: 25 },
      { stat: 'energy', delta: 5 },
    ],
    title: 'Leg Day for Moss',
    description: 'Walk somewhere you cannot see your desk. Start the timer and keep moving.',
    mossLine: 'I have been sitting so long I am becoming furniture.',
    environment: 'hallway, street, garden or neighborhood',
  },
  {
    id: 'grass',
    need: 'bathroom',
    category: 'nature',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'grass',
    xpReward: 35,
    affectedStats: [
      { stat: 'bathroom', delta: 30 },
      { stat: 'nature', delta: 8 },
    ],
    title: 'Nature Calls',
    description: 'Find a patch of grass. Moss has standards.',
    mossLine: 'I refuse to poop on concrete.',
    environment: 'lawn, park, roadside verge or garden',
  },
  {
    id: 'flower',
    need: 'nature',
    category: 'nature',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'flower',
    xpReward: 35,
    affectedStats: [
      { stat: 'nature', delta: 18 },
      { stat: 'happiness', delta: 6 },
    ],
    title: 'Petal Patrol',
    description: 'Find a flower, any flower, and introduce it to Moss.',
    mossLine: 'I would like to see something that photosynthesises on purpose.',
    environment: 'garden, park, balcony or flower bed',
  },
  {
    id: 'leaf',
    need: 'nature',
    category: 'nature',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'leaf',
    xpReward: 30,
    affectedStats: [
      { stat: 'nature', delta: 15 },
      { stat: 'curiosity', delta: 5 },
    ],
    title: 'Leaf Inspector',
    description: 'Find a leaf with character and photograph it up close.',
    mossLine: 'I need to check on my cousins.',
    environment: 'anywhere with trees or plants',
  },
  {
    id: 'yellow',
    need: 'curiosity',
    category: 'curiosity',
    completionType: 'VISION_VALIDATION',
    visionTarget: 'yellow object',
    xpReward: 30,
    affectedStats: [
      { stat: 'curiosity', delta: 20 },
      { stat: 'happiness', delta: 4 },
    ],
    title: 'Yellow Hunt',
    description: 'Find something yellow out in the world and show Moss.',
    mossLine: 'I am curious. Specifically, about yellow.',
    environment: 'outdoors or anywhere away from the desk',
  },
  {
    id: 'hat',
    need: 'curiosity',
    category: 'playful',
    completionType: 'PHOTO',
    xpReward: 25,
    affectedStats: [
      { stat: 'curiosity', delta: 15 },
      { stat: 'happiness', delta: 10 },
    ],
    title: 'Fashion Week',
    description: 'Find something Moss could wear as a hat. Take a photo.',
    mossLine: 'I have nothing to wear.',
    environment: 'outdoors, a garden or a park',
  },
  {
    id: 'screen-free',
    need: 'rest',
    category: 'recovery',
    completionType: 'TIMER',
    durationMinutes: 3,
    xpReward: 25,
    affectedStats: [
      { stat: 'rest', delta: 25 },
      { stat: 'happiness', delta: 4 },
    ],
    title: 'Look Far Away',
    description: 'Start the timer, pocket the phone and look at something far away until it buzzes.',
    mossLine: 'My eyes are tired. Yours probably are too.',
    environment: 'a window, balcony or outdoor spot',
  },
  {
    id: 'water',
    need: 'hunger',
    category: 'recovery',
    completionType: 'USER_CONFIRMATION',
    xpReward: 20,
    affectedStats: [
      { stat: 'hunger', delta: 25 },
      { stat: 'rest', delta: 5 },
    ],
    title: 'Hydration Station',
    description: 'Go get a glass of water and drink it away from the screen.',
    mossLine: 'I am a plant. You are mostly water. We both need some.',
    environment: 'kitchen or water cooler',
  },
  {
    id: 'cheer',
    need: 'happiness',
    category: 'playful',
    completionType: 'PHOTO',
    xpReward: 25,
    affectedStats: [
      { stat: 'happiness', delta: 20 },
      { stat: 'curiosity', delta: 5 },
    ],
    title: 'Find a Face',
    description: 'Find something out there that looks like a face. Photograph it.',
    mossLine: 'I need a friend who is not a keyboard.',
    environment: 'outdoors, a street or a garden',
  },
]

export function getTemplate(id: string): QuestTemplate | undefined {
  return QUEST_TEMPLATES.find((t) => t.id === id)
}
