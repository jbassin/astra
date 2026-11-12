// Origin feat curation: a plain summary of each origin feat a background (or Human Versatile)
// can give, checked against content/5etools/feats.json, plus the builder's tool preferences for
// feats that grant tool proficiencies. Fighting styles live in content/options.ts.

import type { CuratedFeat } from "../src/domain/curationTypes";

export const FEATS: Record<string, CuratedFeat> = {
  alert: {
    activation: "passive",
    summary:
      "Add your Proficiency Bonus to your Initiative rolls, so you tend to act early in a fight. Right after rolling Initiative, you can swap your result with a willing ally's.",
  },
  crafter: {
    activation: "passive",
    summary:
      "You are trained with three kinds of artisan's tools and get 20 percent off nonmagical items you buy.",
    tools: [
      "carpenters-tools",
      "tinkers-tools",
      "leatherworkers-tools",
      "woodcarvers-tools",
      "weavers-tools",
    ],
  },
  healer: {
    activation: "action",
    summary:
      "As an action, use one charge of a Healer's Kit on a creature within 5 feet: it spends one of its Hit Point Dice, you roll it, and it regains that much plus your Proficiency Bonus. When you roll a 1 on a healing die, reroll it.",
  },
  lucky: {
    activation: "passive",
    summary:
      "Spend a Luck Point to give yourself Advantage on a d20 roll, or to give Disadvantage to an attack roll made against you.",
    uses: { count: "pb", unit: "Luck Point" },
  },
  "magic-initiate": {
    applied: "Already in your spells; the level 1 spell's card counts the free cast.",
    activation: "passive",
    summary:
      "You learn two cantrips and one level 1 spell from one class's spell list. You can cast the level 1 spell once for free; you can also cast it with spell slots if you have them.",
  },
  musician: {
    applied: 'Already in your gear\'s "Trained with" line.',
    activation: "passive",
    summary: "You can play three musical instruments.",
    tools: ["flute", "drum", "lyre", "horn", "viol"],
  },
  "savage-attacker": {
    activation: "passive",
    summary:
      "Once per turn when you hit with a weapon, roll its damage dice twice and use the better result.",
  },
  skilled: {
    applied: "Already in your skills.",
    activation: "passive",
    summary: "You are trained in three extra skills (already on your sheet).",
  },
  "tavern-brawler": {
    activation: "passive",
    summary:
      "Your punches deal 1d4 plus your Strength modifier Bludgeoning damage, and you reroll 1s on that die. Once per turn when you punch someone during the Attack action, you can also shove them 5 feet away. You can fight well with improvised weapons like chairs and bottles.",
  },
  tough: {
    applied: "Already in your Hit Points.",
    activation: "passive",
    summary:
      "Your Hit Point maximum goes up by 2 for every level you have (already added to your total).",
  },
};
