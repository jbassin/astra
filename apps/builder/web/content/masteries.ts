// Plain-language summaries of the weapon mastery properties, keyed by id
// (content/5etools/masteries.json). The sheet shows one next to each weapon you have mastery
// with.

export const MASTERY_SUMMARIES: Record<string, string> = {
  cleave:
    "When you hit a creature with a melee attack, you can attack a second creature within 5 feet of it; on a hit it takes the weapon's damage without your ability modifier. Once per turn.",
  graze:
    "When you miss a creature, it still takes damage equal to the ability modifier you attacked with.",
  nick: "The extra attack from a Light weapon can be part of your Attack action instead of using your bonus action. Once per turn.",
  push: "When you hit a Large or smaller creature, you can push it up to 10 feet straight away from you.",
  sap: "When you hit a creature, it has Disadvantage on its next attack roll before the start of your next turn.",
  slow: "When you hit and damage a creature, you can cut its Speed by 10 feet until the start of your next turn.",
  topple:
    "When you hit a creature, you can make it roll a Constitution save (DC 8 + the ability modifier you attacked with + your Proficiency Bonus); on a fail it falls Prone.",
  vex: "When you hit and damage a creature, you have Advantage on your next attack roll against it before the end of your next turn.",
};
