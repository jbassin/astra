// The twelve classes as Josh offers them: archetype, his one-line pitch, the primary ability
// the player sees, and everything the builder decides so the player never has to (ability
// order, skills, expertise, weapon masteries, tools). Every level 1–2 feature the imported
// data has is listed under `features`, with a plain summary or the reason it is hidden.
// Pick counts (cantrips, prepared spells, invocations, metamagic, slots) are NOT written here:
// scripts/build-content.ts reads them from the imported class table.
//
// Summaries are checked against the rules text in content/5etools/classes.json; keep every
// number exact when editing. Spells: the builder chooses them, taking each list in order
// (`CuratedSpellList`): the first entries up to the pick count are the character's spells, and
// any after them are backups for a cantrip the species already gives.
// Class options work the same way: each option group's `choices` is best first, and the builder
// gives the first `count` (`chosenOptions`). To change a pick, reorder the list.

import type { CuratedClass } from "../src/domain/curationTypes";

export const CLASSES: CuratedClass[] = [
  {
    id: "fighter",
    archetype: "warrior",
    blurb: "Be a master of all weapons, beat your opponents into submission.",
    primary: "str",
    abilityPriority: ["str", "con", "dex", "wis", "int", "cha"],
    skillPreference: [
      "athletics",
      "perception",
      "intimidation",
      "survival",
      "acrobatics",
      "insight",
      "animal-handling",
      "history",
      "persuasion",
    ],
    masteryWeapons: ["greatsword", "flail", "javelin"],
    tools: [],
    speciesOptions: {
      dragonborn: "blue",
      elf: "high-elf",
      gnome: "rock-gnome",
      goliath: "fire-giant",
      tiefling: "infernal",
    },
    humanFeat: ["tough", "alert"],
    features: {
      "fighter-fighting-style": { hidden: "Shown as the Fighting Style the player picks." },
      "fighter-second-wind": {
        activation: "bonus",
        summary:
          "As a bonus action, catch your breath and regain 1d10 + 2 Hit Points (1d10 plus your Fighter level). Use it when you're hurt in a fight.",
        uses: {
          count: { table: "Second Wind" },
        },
      },
      "fighter-weapon-mastery": { hidden: "Already on your attacks: each weapon's Mastery line." },
      "fighter-action-surge": {
        activation: "action",
        summary:
          "On your turn, take one extra action, such as a second Attack. It can't be the Magic action (casting a spell).",
        uses: { count: 1 },
      },
      "fighter-tactical-mind": {
        activation: "passive",
        summary:
          "When you fail an ability check, you can spend a use of Second Wind to roll 1d10 and add it to the check. If you still fail, you keep that use.",
      },
    },
    optionGroups: [
      {
        key: "fightingStyle",
        label: "Fighting Style",
        prompt: "Pick the way you like to fight.",
        count: { featProgression: "Fighting Style" },
        choices: ["defense", "great-weapon-fighting", "thrown-weapon-fighting"],
      },
    ],
  },
  {
    id: "barbarian",
    archetype: "warrior",
    blurb: "Tank your enemies' attacks with ease, fight with reckless abandon.",
    primary: "str",
    abilityPriority: ["str", "con", "dex", "wis", "cha", "int"],
    skillPreference: [
      "athletics",
      "perception",
      "intimidation",
      "survival",
      "animal-handling",
      "nature",
    ],
    masteryWeapons: ["greataxe", "handaxe"],
    tools: [],
    speciesOptions: {
      dragonborn: "white",
      elf: "wood-elf",
      gnome: "forest-gnome",
      goliath: "hill-giant",
      tiefling: "abyssal",
    },
    humanFeat: ["tough", "alert"],
    features: {
      "barbarian-rage": {
        activation: "bonus",
        summary:
          "As a bonus action, fly into a Rage (not while wearing Heavy armor). While raging you take half damage from Bludgeoning, Piercing and Slashing attacks, add +2 to the damage of attacks that use Strength, and have advantage on Strength checks and saves, but you can't cast spells or concentrate. It lasts until the end of your next turn and keeps going each turn you attack an enemy, force an enemy to make a save, or spend a bonus action, for up to 10 minutes.",
        uses: {
          count: { table: "Rages" },
        },
      },
      "barbarian-unarmored-defense": { hidden: "Already in your Armor Class." },
      "barbarian-weapon-mastery": {
        hidden: "Already on your attacks: each weapon's Mastery line.",
      },
      "barbarian-danger-sense": {
        activation: "passive",
        summary:
          "You have advantage on Dexterity saving throws (dodging traps, explosions and the like) unless you are Incapacitated.",
      },
      "barbarian-reckless-attack": {
        activation: "passive",
        summary:
          "When you make your first attack on your turn, you can attack recklessly: you get advantage on attack rolls that use Strength until your next turn, but attacks against you have advantage too.",
      },
    },
  },
  {
    id: "monk",
    archetype: "warrior",
    blurb:
      "Attack your foes' weak spots in a flurry of blows. Move around the battlefield unaccosted.",
    primary: "dex",
    abilityPriority: ["dex", "wis", "con", "str", "int", "cha"],
    skillPreference: ["stealth", "acrobatics", "insight", "athletics", "religion", "history"],
    tools: ["flute"],
    equipmentChoices: { "instrumentMusical|toolArtisan": "flute" },
    speciesOptions: {
      dragonborn: "gold",
      elf: "wood-elf",
      gnome: "forest-gnome",
      goliath: "frost-giant",
      tiefling: "chthonic",
    },
    humanFeat: ["tough", "alert"],
    features: {
      "monk-martial-arts": {
        activation: "bonus",
        summary:
          "While you wear no armor, carry no shield and fight unarmed or with monk weapons (simple melee weapons, and martial melee weapons with the Light property): you can make an Unarmed Strike as a bonus action, you can roll 1d6 for the damage of those attacks, and you can use Dexterity instead of Strength for their attack and damage rolls.",
      },
      "monk-bonus-unarmed-strike": { hidden: "Part of Martial Arts." },
      "monk-martial-arts-die": { hidden: "Part of Martial Arts." },
      "monk-dexterous-attacks": { hidden: "Part of Martial Arts." },
      "monk-unarmored-defense": { hidden: "Already in your Armor Class." },
      "monk-monks-focus": {
        activation: "passive",
        summary:
          "You have Focus Points to fuel Flurry of Blows, Patient Defense and Step of the Wind.",
        uses: { count: { table: "Focus Points" }, unit: "Focus Point" },
      },
      "monk-flurry-of-blows": {
        activation: "bonus",
        summary: "Spend 1 Focus Point to make two Unarmed Strikes as a bonus action.",
      },
      "monk-patient-defense": {
        activation: "bonus",
        summary:
          "Take the Disengage action as a bonus action, or spend 1 Focus Point to take both Disengage and Dodge as a bonus action.",
      },
      "monk-step-of-the-wind": {
        activation: "bonus",
        summary:
          "Take the Dash action as a bonus action, or spend 1 Focus Point to take both Disengage and Dash as a bonus action and double your jump distance for the turn.",
      },
      "monk-unarmored-movement": { hidden: "Already in your speed." },
      "monk-uncanny-metabolism": {
        activation: "passive",
        summary:
          "When you roll Initiative, you can regain all your spent Focus Points and heal 1d6 + 2 Hit Points (your Martial Arts die plus your Monk level).",
        uses: { count: 1 },
      },
    },
  },
  {
    id: "rogue",
    archetype: "scoundrel",
    blurb: "Take down your adversary with a sneak attack. Skulk through the shadows.",
    primary: "dex",
    abilityPriority: ["dex", "con", "wis", "int", "cha", "str"],
    skillPreference: [
      "stealth",
      "perception",
      "sleight-of-hand",
      "acrobatics",
      "deception",
      "insight",
      "investigation",
      "persuasion",
      "athletics",
      "intimidation",
    ],
    expertisePreference: ["stealth", "sleight-of-hand", "perception", "acrobatics"],
    masteryWeapons: ["shortsword", "shortbow", "dagger"],
    tools: ["thieves-tools"],
    speciesOptions: {
      dragonborn: "black",
      elf: "drow",
      gnome: "forest-gnome",
      goliath: "cloud-giant",
      tiefling: "infernal",
    },
    humanFeat: ["alert", "tough"],
    languages: { fixed: ["thieves-cant"], extra: 1 },
    features: {
      "rogue-expertise": { hidden: "Already in your skills, marked expert." },
      "rogue-sneak-attack": {
        activation: "passive",
        summary:
          "Once per turn, deal an extra 1d6 damage when you hit with a finesse or ranged weapon and you have advantage on the attack, or when an ally of yours is within 5 feet of the target (and you don't have disadvantage).",
      },
      "rogue-thieves-cant": { hidden: "Already in your languages." },
      "rogue-weapon-mastery": { hidden: "Already on your attacks: each weapon's Mastery line." },
      "rogue-cunning-action": {
        activation: "bonus",
        summary: "On your turn, you can take the Dash, Disengage or Hide action as a bonus action.",
      },
    },
  },
  {
    id: "ranger",
    archetype: "scoundrel",
    blurb: "Mark your enemies for the hunt, then run them down. Entrap others with nature magic.",
    primary: "dex",
    abilityPriority: ["dex", "wis", "con", "str", "int", "cha"],
    skillPreference: [
      "perception",
      "stealth",
      "survival",
      "nature",
      "animal-handling",
      "athletics",
      "insight",
      "investigation",
    ],
    expertisePreference: ["perception", "stealth", "survival"],
    masteryWeapons: ["longbow", "shortsword", "scimitar"],
    tools: [],
    speciesOptions: {
      dragonborn: "green",
      elf: "wood-elf",
      gnome: "forest-gnome",
      goliath: "frost-giant",
      tiefling: "abyssal",
    },
    humanFeat: ["alert", "tough"],
    languages: { fixed: [], extra: 2 },
    features: {
      "ranger-favored-enemy": {
        hidden: "Hunter's Mark is in your spells, and its card counts the free casts.",
      },
      "ranger-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "ranger-weapon-mastery": { hidden: "Already on your attacks: each weapon's Mastery line." },
      "ranger-deft-explorer": {
        hidden: "Already in your skills (marked expert) and your languages.",
      },
      "ranger-fighting-style": { hidden: "Shown as the Fighting Style the player picks." },
    },
    optionGroups: [
      {
        key: "fightingStyle",
        label: "Fighting Style",
        prompt: "Pick the way you like to fight.",
        count: { featProgression: "Fighting Style" },
        choices: ["archery", "two-weapon-fighting", "druidic-warrior"],
      },
    ],
    spells: {
      level1: ["cure-wounds", "entangle", "goodberry"],
      alwaysPrepared: [
        {
          id: "hunters-mark",
          freeCasts: { count: { table: "Favored Enemy" } },
        },
      ],
    },
  },
  {
    id: "bard",
    archetype: "scoundrel",
    blurb: "Cast spells to inspire your allies and trick your enemies. Be a convincing liar.",
    primary: "cha",
    abilityPriority: ["cha", "dex", "con", "wis", "int", "str"],
    skillPreference: [
      "persuasion",
      "deception",
      "performance",
      "insight",
      "perception",
      "stealth",
      "acrobatics",
      "sleight-of-hand",
      "arcana",
      "history",
    ],
    expertisePreference: ["persuasion", "performance", "deception", "perception"],
    tools: ["lute", "flute", "drum"],
    equipmentChoices: { instrumentMusical: "lute" },
    speciesOptions: {
      dragonborn: "copper",
      elf: "drow",
      gnome: "forest-gnome",
      goliath: "cloud-giant",
      tiefling: "infernal",
    },
    humanFeat: ["lucky", "alert"],
    features: {
      "bard-bardic-inspiration": {
        activation: "bonus",
        summary:
          "As a bonus action, inspire a creature within 60 feet that can see or hear you: it gets a d6. Once within the next hour, when it fails a d20 roll (an attack, check or save), it can roll the d6 and add it, maybe turning the failure into a success.",
        uses: { count: "cha" },
      },
      "bard-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "bard-expertise": { hidden: "Already in your skills, marked expert." },
      "bard-jack-of-all-trades": {
        activation: "passive",
        summary:
          "Add half your Proficiency Bonus (rounded down) to any ability check that uses a skill you aren't proficient in.",
      },
    },
    spells: {
      cantrips: ["vicious-mockery", "starry-wisp"],
      level1: ["healing-word", "dissonant-whispers", "faerie-fire", "sleep", "charm-person"],
    },
  },
  {
    id: "sorcerer",
    archetype: "mage",
    blurb:
      "Master the elements, shape magic to your will. Hit foes from far away or wrap your spells around your friends.",
    primary: "cha",
    abilityPriority: ["cha", "con", "dex", "wis", "int", "str"],
    skillPreference: ["persuasion", "deception", "insight", "arcana", "intimidation", "religion"],
    tools: [],
    speciesOptions: {
      dragonborn: "red",
      elf: "high-elf",
      gnome: "rock-gnome",
      goliath: "fire-giant",
      tiefling: "abyssal",
    },
    humanFeat: ["alert", "tough"],
    features: {
      "sorcerer-innate-sorcery": {
        activation: "bonus",
        summary:
          "As a bonus action, unleash your inner magic for 1 minute: the save DC of your Sorcerer spells goes up by 1 and you have advantage on their attack rolls.",
        uses: { count: 2 },
      },
      "sorcerer-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "sorcerer-font-of-magic": {
        activation: "bonus",
        summary:
          "You have Sorcery Points to spend on Metamagic. You can also turn a spell slot into Sorcery Points equal to its level (no action), or spend 2 points as a bonus action to make a level 1 spell slot.",
        uses: { count: { table: "Sorcery Points" }, unit: "Sorcery Point" },
      },
      "sorcerer-metamagic": { hidden: "Each Metamagic pick has its own card." },
      "sorcerer-metamagic-options": { hidden: "The list the player picks Metamagic from." },
    },
    optionGroups: [
      {
        key: "metamagic",
        label: "Metamagic",
        prompt: "Pick two ways to bend your spells.",
        count: { optionalFeature: "Metamagic" },
        choices: ["quickened-spell", "seeking-spell", "empowered-spell", "distant-spell"],
      },
    ],
    spells: {
      cantrips: ["fire-bolt", "shocking-grasp", "mage-hand", "minor-illusion", "ray-of-frost"],
      level1: ["magic-missile", "shield", "burning-hands", "mage-armor"],
    },
  },
  {
    id: "druid",
    archetype: "mage",
    blurb: "Transform into beasts, summon nature spirits to aid you in your quest.",
    primary: "wis",
    abilityPriority: ["wis", "con", "dex", "int", "str", "cha"],
    skillPreference: [
      "perception",
      "animal-handling",
      "nature",
      "medicine",
      "survival",
      "insight",
      "arcana",
      "religion",
    ],
    tools: ["herbalism-kit"],
    // The rules give "Druidic Focus (Quarterstaff)": a quarterstaff that is also the focus.
    equipmentSwaps: {
      "druidic-focus": { item: "quarterstaff", name: "Quarterstaff (druidic focus)" },
    },
    speciesOptions: {
      dragonborn: "bronze",
      elf: "wood-elf",
      gnome: "forest-gnome",
      goliath: "storm-giant",
      tiefling: "abyssal",
    },
    humanFeat: ["alert", "tough"],
    languages: { fixed: ["druidic"], extra: 0 },
    features: {
      "druid-druidic": {
        hidden: "Already in your languages and your spells (Speak with Animals).",
      },
      "druid-primal-order": { hidden: "Shown as the Primal Order the player picks." },
      "druid-magician": { hidden: "Shown through the Primal Order pick." },
      "druid-warden": { hidden: "Shown through the Primal Order pick." },
      "druid-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "druid-wild-companion": {
        activation: "action",
        summary:
          "As an action, spend a spell slot or a use of Wild Shape to cast Find Familiar without its material component: a nature spirit appears as a small animal helper.",
      },
      "druid-wild-shape": {
        activation: "bonus",
        summary:
          "As a bonus action, turn into a beast form you know (you know four, such as Rat, Riding Horse, Spider or Wolf) for up to 1 hour. You gain 2 Temporary Hit Points and use the beast's body, but keep your own Hit Points, mind and skills. You can't cast spells in beast form. Turn back early as a bonus action.",
        uses: {
          count: { table: "Wild Shape" },
        },
      },
    },
    optionGroups: [
      {
        key: "primalOrder",
        label: "Primal Order",
        prompt: "Pick your role in the circle of druids.",
        count: 1,
        choices: ["magician", "warden"],
      },
    ],
    spells: {
      cantrips: ["produce-flame", "guidance", "thorn-whip"],
      level1: ["entangle", "healing-word", "thunderwave", "cure-wounds", "goodberry"],
      alwaysPrepared: [
        {
          id: "speak-with-animals",
        },
        {
          id: "find-familiar",
          cost: "Spend a spell slot or a use of Wild Shape",
        },
      ],
    },
  },
  {
    id: "wizard",
    archetype: "mage",
    blurb: "Know more spells than anyone else, pick out the right one for any scenario.",
    primary: "int",
    abilityPriority: ["int", "con", "dex", "wis", "cha", "str"],
    skillPreference: [
      "arcana",
      "investigation",
      "history",
      "insight",
      "medicine",
      "nature",
      "religion",
    ],
    expertisePreference: ["arcana", "investigation", "history", "nature", "religion", "medicine"],
    tools: [],
    speciesOptions: {
      dragonborn: "brass",
      elf: "high-elf",
      gnome: "rock-gnome",
      goliath: "cloud-giant",
      tiefling: "chthonic",
    },
    humanFeat: ["alert", "tough"],
    features: {
      "wizard-arcane-recovery": { hidden: "Works only on a rest; the one-shot has none." },
      "wizard-ritual-adept": {
        activation: "passive",
        summary:
          "You can cast any spell in your spellbook that has the Ritual tag as a ritual, without preparing it, by reading it from the book. A ritual takes longer but uses no spell slot.",
      },
      "wizard-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "wizard-scholar": { hidden: "Already in your skills, marked expert." },
    },
    spells: {
      cantrips: ["fire-bolt", "mage-hand", "ray-of-frost", "shocking-grasp"],
      level1: [
        "magic-missile",
        "shield",
        "sleep",
        "mage-armor",
        "burning-hands",
        "thunderwave",
        "find-familiar",
        "detect-magic",
      ],
      // The first five are prepared; the rest are alternates.
    },
  },
  {
    id: "warlock",
    archetype: "mage",
    blurb: "Shoot beams of eldritch light, make friends with anyone, curse your opponents.",
    primary: "cha",
    abilityPriority: ["cha", "con", "dex", "wis", "int", "str"],
    skillPreference: [
      "deception",
      "intimidation",
      "arcana",
      "investigation",
      "history",
      "nature",
      "religion",
    ],
    tools: [],
    speciesOptions: {
      dragonborn: "green",
      elf: "drow",
      gnome: "forest-gnome",
      goliath: "fire-giant",
      tiefling: "infernal",
    },
    humanFeat: ["alert", "tough"],
    features: {
      "warlock-eldritch-invocations": {
        hidden: "Each invocation shows on its own card or in a number.",
      },
      "warlock-eldritch-invocation-options": {
        hidden: "The list the player picks invocations from.",
      },
      "warlock-pact-magic": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "warlock-magical-cunning": {
        activation: "minute",
        summary:
          "Perform a 1-minute eerie rite to regain spent Pact Magic spell slots, up to half your maximum (rounded up).",
        uses: { count: 1 },
      },
    },
    optionGroups: [
      {
        key: "invocations",
        label: "Eldritch Invocations",
        prompt: "Pick three magical tricks your patron taught you.",
        count: { table: "Invocations" },
        choices: [
          "agonizing-blast",
          "repelling-blast",
          "armor-of-shadows",
          "eldritch-mind",
          "pact-of-the-chain",
          "mask-of-many-faces",
        ],
      },
    ],
    spells: {
      cantrips: ["eldritch-blast", "prestidigitation", "mage-hand"],
      level1: ["hex", "hellish-rebuke", "armor-of-agathys"],
    },
  },
  {
    id: "cleric",
    archetype: "healer",
    blurb: "Keep your allies fighting in top shape. Repel the undead. See what others do not.",
    primary: "wis",
    abilityPriority: ["wis", "con", "dex", "str", "cha", "int"],
    skillPreference: ["insight", "medicine", "religion", "persuasion", "history"],
    tools: [],
    speciesOptions: {
      dragonborn: "gold",
      elf: "wood-elf",
      gnome: "rock-gnome",
      goliath: "stone-giant",
      tiefling: "chthonic",
    },
    humanFeat: ["tough", "alert"],
    features: {
      "cleric-divine-order": { hidden: "Shown as the Divine Order the player picks." },
      "cleric-protector": { hidden: "Shown through the Divine Order pick." },
      "cleric-thaumaturge": { hidden: "Shown through the Divine Order pick." },
      "cleric-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "cleric-channel-divinity": {
        activation: "passive",
        summary:
          "You can channel divine power. Each use creates one effect of your choice: Divine Spark or Turn Undead.",
        uses: {
          count: { table: "Channel Divinity" },
        },
      },
      "cleric-divine-spark": {
        activation: "action",
        summary:
          "Channel Divinity, as an action: point your holy symbol at a creature within 30 feet and roll 1d8 + your Wisdom modifier. Either heal it that much, or it makes a Constitution save and takes that much Necrotic or Radiant damage (half on a success).",
      },
      "cleric-turn-undead": {
        activation: "action",
        summary:
          "Channel Divinity, as an action: each Undead you choose within 30 feet makes a Wisdom save. On a failure it is Frightened and Incapacitated for 1 minute and tries to flee from you; this ends early if it takes damage.",
      },
    },
    optionGroups: [
      {
        key: "divineOrder",
        label: "Divine Order",
        prompt: "Pick your sacred role.",
        count: 1,
        choices: ["thaumaturge", "protector"],
      },
    ],
    spells: {
      cantrips: ["sacred-flame", "guidance", "toll-the-dead", "light", "thaumaturgy"],
      level1: ["bless", "healing-word", "guiding-bolt", "cure-wounds", "shield-of-faith"],
    },
  },
  {
    id: "paladin",
    archetype: "healer",
    blurb: "Smite your foes in holy melee combat. Heal yourself and your friends.",
    primary: "str",
    abilityPriority: ["str", "con", "cha", "wis", "dex", "int"],
    skillPreference: ["athletics", "persuasion", "insight", "intimidation", "medicine", "religion"],
    masteryWeapons: ["longsword", "javelin"],
    tools: [],
    speciesOptions: {
      dragonborn: "silver",
      elf: "high-elf",
      gnome: "rock-gnome",
      goliath: "stone-giant",
      tiefling: "infernal",
    },
    humanFeat: ["tough", "alert"],
    features: {
      "paladin-lay-on-hands": {
        activation: "bonus",
        summary:
          "You have a pool of healing that holds 10 Hit Points (5 times your Paladin level). As a bonus action, touch a creature (or yourself) and spend any amount from the pool to heal it, or spend 5 to end the Poisoned condition.",
        uses: { count: 10, unit: "Hit Point" },
      },
      "paladin-spellcasting": {
        hidden:
          "Already in your spells: the ability, save DC, spell attack, slots and spell names.",
      },
      "paladin-weapon-mastery": { hidden: "Already on your attacks: each weapon's Mastery line." },
      "paladin-fighting-style": { hidden: "Shown as the Fighting Style the player picks." },
      "paladin-paladins-smite": {
        hidden: "Divine Smite is in your spells, and its card counts the free cast.",
      },
    },
    optionGroups: [
      {
        key: "fightingStyle",
        label: "Fighting Style",
        prompt: "Pick the way you like to fight.",
        count: { featProgression: "Fighting Style" },
        choices: ["dueling", "protection", "blessed-warrior"],
      },
    ],
    spells: {
      level1: ["bless", "cure-wounds", "shield-of-faith"],
      alwaysPrepared: [
        {
          id: "divine-smite",
          freeCasts: { count: 1 },
        },
      ],
    },
  },
];
