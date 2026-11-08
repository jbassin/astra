// The class option picks a player chooses from (fighting styles, Divine and Primal Orders,
// Eldritch Invocations, Metamagic), keyed by option id. Each has a gist (the pick card's short
// line) and a plain summary; the shortlist per class is in classes.ts, and nothing here is
// recommended or preselected. A fighting style's cantrips are chosen by the builder, in order
// (`CuratedSpellList`).

import type { CuratedOption } from "../src/domain/curationTypes";

export const OPTIONS: Record<string, CuratedOption> = {
  // ---- fighting styles ----
  defense: {
    kind: "fighting-style",
    from: { feat: "defense" },
    activation: "passive",
    gist: "Armor guards you better: +1 AC while you wear it.",
    summary: "While you wear armor, your Armor Class goes up by 1, so enemies miss you more often.",
  },
  "great-weapon-fighting": {
    kind: "fighting-style",
    from: { feat: "great-weapon-fighting" },
    activation: "passive",
    gist: "Two-handed swings never roll low: 1s and 2s count as 3s.",
    summary:
      "When you hit with a melee weapon held in two hands (Two-Handed or Versatile), any 1 or 2 on a damage die counts as a 3.",
  },
  "thrown-weapon-fighting": {
    kind: "fighting-style",
    from: { feat: "thrown-weapon-fighting" },
    activation: "passive",
    gist: "Thrown weapons like javelins deal 2 more damage.",
    summary: "When you hit with a thrown weapon such as a javelin, add 2 to the damage.",
  },
  dueling: {
    kind: "fighting-style",
    from: { feat: "dueling" },
    activation: "passive",
    gist: "Fight with one weapon in one hand for +2 damage.",
    summary:
      "When you hold a melee weapon in one hand and no other weapon, add 2 to its damage (a shield is fine).",
  },
  protection: {
    kind: "fighting-style",
    from: { feat: "protection" },
    activation: "reaction",
    gist: "Raise your shield so attacks on an ally beside you miss more.",
    summary:
      "When an enemy you can see attacks an ally within 5 feet of you, use your reaction and your shield to give that attack, and all others on that ally until your next turn, Disadvantage.",
  },
  archery: {
    kind: "fighting-style",
    from: { feat: "archery" },
    activation: "passive",
    gist: "+2 to hit with bows and other ranged weapons.",
    summary: "Add 2 to your attack rolls with ranged weapons like bows, so you hit more often.",
  },
  "two-weapon-fighting": {
    kind: "fighting-style",
    from: { feat: "two-weapon-fighting" },
    activation: "passive",
    gist: "Your extra attack with a second Light weapon hits harder.",
    summary:
      "When you make the extra attack from fighting with a Light weapon in each hand, add your ability modifier to its damage.",
  },
  "blessed-warrior": {
    kind: "fighting-style",
    from: { feat: "blessed-warrior" },
    activation: "passive",
    gist: "Learn two Cleric cantrips, cast with Charisma.",
    summary:
      "Learn two Cleric cantrips (small spells you can cast any time), using Charisma to cast them.",
    grantsCantrips: {
      list: "cleric",
      count: 2,
      ability: "cha",
      cantrips: ["guidance", "sacred-flame"],
    },
  },
  "druidic-warrior": {
    kind: "fighting-style",
    from: { feat: "druidic-warrior" },
    activation: "passive",
    gist: "Learn two Druid cantrips, cast with Wisdom.",
    summary:
      "Learn two Druid cantrips (small spells you can cast any time), using Wisdom to cast them.",
    grantsCantrips: {
      list: "druid",
      count: 2,
      ability: "wis",
      cantrips: ["guidance", "starry-wisp"],
    },
  },

  // ---- Divine Order (Cleric) ----
  protector: {
    kind: "divine-order",
    from: { classFeature: "cleric-protector" },
    activation: "passive",
    gist: "Trained for the front line: Martial weapons and Heavy armor.",
    summary: "Trained for battle: you can use Martial weapons and wear Heavy armor.",
  },
  thaumaturge: {
    kind: "divine-order",
    from: { classFeature: "cleric-thaumaturge" },
    activation: "passive",
    gist: "An extra cantrip, and a sharper mind for Arcana and Religion.",
    summary:
      "Learn one extra Cleric cantrip, and add your Wisdom modifier (at least +1) to Arcana and Religion checks.",
    extraCantrips: 1,
  },

  // ---- Primal Order (Druid) ----
  magician: {
    kind: "primal-order",
    from: { classFeature: "druid-magician" },
    activation: "passive",
    gist: "An extra cantrip, and a sharper mind for Arcana and Nature.",
    summary:
      "Learn one extra Druid cantrip, and add your Wisdom modifier (at least +1) to Arcana and Nature checks.",
    extraCantrips: 1,
  },
  warden: {
    kind: "primal-order",
    from: { classFeature: "druid-warden" },
    activation: "passive",
    gist: "Trained for battle: Martial weapons and Medium armor.",
    summary: "Trained for battle: you can use Martial weapons and wear Medium armor.",
  },

  // ---- Eldritch Invocations (Warlock) ----
  "agonizing-blast": {
    kind: "invocation",
    from: { optionalFeature: "agonizing-blast" },
    activation: "passive",
    gist: "Add your Charisma to a damage cantrip, like Eldritch Blast.",
    summary:
      "Pick one damage cantrip you know (usually Eldritch Blast): add your Charisma modifier to its damage.",
    requires: { damageCantrip: true },
  },
  "repelling-blast": {
    kind: "invocation",
    from: { optionalFeature: "repelling-blast" },
    activation: "passive",
    gist: "Your attack cantrip, like Eldritch Blast, shoves foes 10 feet back.",
    summary:
      "Pick one attack cantrip you know (usually Eldritch Blast): when it hits a Large or smaller creature, you can push it up to 10 feet away.",
    requires: { attackCantrip: true },
  },
  "armor-of-shadows": {
    kind: "invocation",
    from: { optionalFeature: "armor-of-shadows" },
    activation: "passive",
    gist: "Free Mage Armor on yourself, whenever you like.",
    summary:
      "Cast Mage Armor on yourself whenever you like without using a spell slot (Armor Class 13 + Dexterity when you wear no armor).",
    grantsSpell: {
      id: "mage-armor",
      note: "Armor of Shadows: cast it on yourself without a spell slot.",
    },
  },
  "eldritch-mind": {
    kind: "invocation",
    from: { optionalFeature: "eldritch-mind" },
    activation: "passive",
    gist: "Hold your focus: Advantage on saves to keep Concentration.",
    summary:
      "Roll with Advantage on Constitution saves to keep Concentration, so spells like Hex last longer.",
  },
  "pact-of-the-chain": {
    kind: "invocation",
    from: { optionalFeature: "pact-of-the-chain" },
    activation: "passive",
    gist: "A spirit familiar that scouts for you and can even attack.",
    summary:
      "Learn Find Familiar and cast it without a spell slot: a small spirit pet (an imp, sprite or the like) that scouts and helps, and can attack when you give up one of your attacks.",
    grantsSpell: {
      id: "find-familiar",
      note: "Pact of the Chain: cast it as an action without a spell slot.",
    },
  },
  "mask-of-many-faces": {
    kind: "invocation",
    from: { optionalFeature: "mask-of-many-faces" },
    activation: "passive",
    gist: "Disguise yourself as someone else whenever you like.",
    summary:
      "Cast Disguise Self whenever you like without using a spell slot to look like someone else.",
    grantsSpell: { id: "disguise-self", note: "Mask of Many Faces: cast it without a spell slot." },
  },

  // ---- Metamagic (Sorcerer) ----
  "quickened-spell": {
    kind: "metamagic",
    from: { optionalFeature: "quickened-spell" },
    cost: 2,
    activation: "bonus",
    gist: "Cast an action spell as a bonus action, for 2 Sorcery Points.",
    summary:
      "Spend 2 Sorcery Points to cast a spell that takes an action as a bonus action instead (no other level 1+ spell that turn).",
  },
  "seeking-spell": {
    kind: "metamagic",
    from: { optionalFeature: "seeking-spell" },
    cost: 1,
    activation: "passive",
    gist: "Missed with a spell attack? Pay 1 Sorcery Point to reroll.",
    summary: "When you miss with a spell attack, spend 1 Sorcery Point to reroll the d20.",
  },
  "empowered-spell": {
    kind: "metamagic",
    from: { optionalFeature: "empowered-spell" },
    cost: 1,
    activation: "passive",
    gist: "Reroll low spell damage dice for 1 Sorcery Point.",
    summary:
      "When you roll spell damage, spend 1 Sorcery Point to reroll up to your Charisma modifier's worth of the dice (at least one).",
  },
  "distant-spell": {
    kind: "metamagic",
    from: { optionalFeature: "distant-spell" },
    cost: 1,
    activation: "passive",
    gist: "Double a spell's range, or reach 30 feet with a Touch spell.",
    summary:
      "Spend 1 Sorcery Point to double a spell's range, or turn a Touch spell into a 30-foot range.",
  },
};
