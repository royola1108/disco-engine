// Disco Elysium character builds — default attribute allocation.
// The original game lets you pick one of 3 archetypes at character creation.
// Each archetype distributes 24 skills across 4 attributes: Intellect, Psyche, Physique, Motorics.
// We use the "Balanced" build as default: even spread with slight emphasis on key skills.

export interface SkillBuild {
  name: string;
  description: string;
  attributes: Record<string, number>;
}

// Original game's three archetypes:
// Thinker (Intellect 5, Psyche 4, Physique 2, Motorics 1)
// Sensitive (Intellect 1, Psyche 5, Physique 4, Motorics 2)
// Physical (Intellect 1, Psyche 2, Physique 5, Motorics 4)

// Skill → attribute mapping (from the original game):
const SKILL_ATTRIBUTE: Record<string, string> = {
  // Intellect
  "Logic": "intellect", "Encyclopedia": "intellect", "Rhetoric": "intellect",
  "Drama": "intellect", "Conceptualization": "intellect", "Visual Calculus": "intellect",
  // Psyche
  "Volition": "psyche", "Inland Empire": "psyche", "Empathy": "psyche",
  "Authority": "psyche", "Esprit de Corps": "psyche", "Suggestion": "psyche",
  // Physique
  "Endurance": "physique", "Pain Threshold": "physique", "Physical Instrument": "physique",
  "Electrochemistry": "physique", "Shivers": "physique", "Half Light": "physique",
  // Motorics
  "Hand/Eye Coordination": "motorics", "Perception": "motorics",
  "Perception (Hearing)": "motorics", "Perception (Sight)": "motorics",
  "Reaction Speed": "motorics", "Savoir Faire": "motorics",
  "Interfacing": "motorics", "Composure": "motorics",
};

export const ALL_SKILLS = Object.keys(SKILL_ATTRIBUTE);

export const BUILDS: Record<string, SkillBuild> = {
  thinker: {
    name: "Thinker",
    description: "Intellect 5, Psyche 4, Physique 2, Motorics 1",
    attributes: { intellect: 5, psyche: 4, physique: 2, motorics: 1 },
  },
  sensitive: {
    name: "Sensitive",
    description: "Intellect 1, Psyche 5, Physique 4, Motorics 2",
    attributes: { intellect: 1, psyche: 5, physique: 4, motorics: 2 },
  },
  physical: {
    name: "Physical",
    description: "Intellect 1, Psyche 2, Physique 5, Motorics 4",
    attributes: { intellect: 1, psyche: 2, physique: 5, motorics: 4 },
  },
  balanced: {
    name: "Balanced",
    description: "Intellect 3, Psyche 3, Physique 3, Motorics 3",
    attributes: { intellect: 3, psyche: 3, physique: 3, motorics: 3 },
  },
};

export function getSkillAttribute(skillName: string): string {
  return SKILL_ATTRIBUTE[skillName] ?? "intellect";
}

export function getSkillValue(skillName: string, buildName: string = "balanced"): number {
  const build = BUILDS[buildName];
  if (!build) return 1;
  const attr = getSkillAttribute(skillName);
  const attrValue = build.attributes[attr] ?? 1;
  // In the original game, skill level = attribute base + skill points allocated
  // We approximate: attribute value as the base skill level
  return attrValue;
}
