// Species curation: a one-line pitch, a plain summary of every trait a level 2 character has,
// and a summary of every sub-option (lineage, ancestry, legacy). Each summary is checked
// against the trait text in content/5etools/species.json. The player never picks a sub-option:
// the builder gives the one the class names (`speciesOptions` in classes.ts).

import type { CuratedSpecies } from "../src/domain/curationTypes";

export const SPECIES: CuratedSpecies[] = [
  {
    id: "aasimar",
    blurb: "A mortal touched by the heavens, with a healing touch and a glow of holy light.",
    size: "Medium",
    traits: {
      "celestial-resistance": {
        applied: "Already under your key numbers, as damage you take half of.",
        activation: "passive",
        summary: "Necrotic and Radiant damage hurt you less: you take only half of it.",
      },
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 60 feet away as if it were dim light, though only in shades of gray.",
      },
      "healing-hands": {
        activation: "action",
        summary:
          "As an action, touch a creature and roll 2d4 (one d4 per point of your Proficiency Bonus); it regains that many Hit Points. Use it when a friend is badly hurt.",
        uses: { count: 1 },
      },
      "light-bearer": {
        applied: "Already in your spells.",
        activation: "passive",
        summary:
          "You know the Light cantrip, so you can make an object glow like a torch whenever you need to see. Charisma powers it.",
      },
      "celestial-revelation": { hidden: "Starts at character level 3." },
    },
    languages: [],
  },
  {
    id: "dragonborn",
    blurb: "Proud and scaled, with a dragon ancestor and a breath of raw elemental power.",
    size: "Medium",
    traits: {
      "draconic-ancestry": {
        activation: "passive",
        summary:
          "You descend from one kind of dragon. Its colour sets the damage type of your Breath Weapon and the damage you resist.",
      },
      "breath-weapon": {
        activation: "action",
        summary:
          "When you take the Attack action, swap one attack for a breath: a 15-foot cone or a 30-foot line 5 feet wide. Everyone in it makes a Dexterity save, taking 1d10 damage on a failure or half on a success.",
        uses: { count: "pb" },
      },
      "damage-resistance": {
        applied: "Already under your key numbers, as damage you take half of.",
        activation: "passive",
        summary: "You take only half damage of your dragon's damage type.",
      },
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 60 feet away as if it were dim light, though only in shades of gray.",
      },
      "draconic-flight": { hidden: "Starts at character level 5." },
    },
    option: {
      choices: {
        black: {
          activation: "passive",
          summary: "Black dragon: your Breath Weapon deals Acid damage, and you resist Acid.",
        },
        blue: {
          activation: "passive",
          summary:
            "Blue dragon: your Breath Weapon deals Lightning damage, and you resist Lightning.",
        },
        brass: {
          activation: "passive",
          summary: "Brass dragon: your Breath Weapon deals Fire damage, and you resist Fire.",
        },
        bronze: {
          activation: "passive",
          summary:
            "Bronze dragon: your Breath Weapon deals Lightning damage, and you resist Lightning.",
        },
        copper: {
          activation: "passive",
          summary: "Copper dragon: your Breath Weapon deals Acid damage, and you resist Acid.",
        },
        gold: {
          activation: "passive",
          summary: "Gold dragon: your Breath Weapon deals Fire damage, and you resist Fire.",
        },
        green: {
          activation: "passive",
          summary: "Green dragon: your Breath Weapon deals Poison damage, and you resist Poison.",
        },
        red: {
          activation: "passive",
          summary: "Red dragon: your Breath Weapon deals Fire damage, and you resist Fire.",
        },
        silver: {
          activation: "passive",
          summary: "Silver dragon: your Breath Weapon deals Cold damage, and you resist Cold.",
        },
        white: {
          activation: "passive",
          summary: "White dragon: your Breath Weapon deals Cold damage, and you resist Cold.",
        },
      },
    },
    languages: ["draconic"],
  },
  {
    id: "dwarf",
    blurb: "Tough, stubborn folk of stone and forge who shrug off poison and see far in the dark.",
    size: "Medium",
    traits: {
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 120 feet away as if it were dim light, though only in shades of gray.",
      },
      "dwarven-resilience": {
        activation: "passive",
        summary:
          "You take only half Poison damage, and you roll with Advantage on saves against being Poisoned.",
      },
      "dwarven-toughness": {
        applied: "Already in your Hit Points.",
        activation: "passive",
        summary:
          "You have 1 extra Hit Point for every level you have (already added to your total).",
      },
      stonecunning: {
        activation: "bonus",
        summary:
          "As a bonus action while touching stone, you sense creatures moving on the ground within 60 feet for 10 minutes, even ones you can't see.",
        uses: { count: "pb" },
      },
    },
    languages: ["dwarvish"],
  },
  {
    id: "elf",
    blurb: "Graceful, long-lived and sharp-eyed, with a touch of fey magic in the blood.",
    size: "Medium",
    traits: {
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 60 feet away as if it were dim light, though only in shades of gray.",
      },
      "elven-lineage": {
        activation: "passive",
        summary:
          "Your elven family line gives you a magic trick: a cantrip, and for some lineages better darkvision or more speed.",
      },
      "fey-ancestry": {
        activation: "passive",
        summary: "You roll with Advantage on saves to avoid or end being Charmed.",
      },
      "keen-senses": {
        applied: "Already in your skills.",
        activation: "passive",
        summary:
          "You are trained in one of Insight, Perception or Survival (already on your sheet).",
      },
      trance: {
        activation: "passive",
        summary: "You don't need to sleep and magic can't put you to sleep.",
      },
    },
    option: {
      choices: {
        drow: {
          applied: "Already under your key numbers (Darkvision) and in your spells.",
          activation: "passive",
          summary:
            "Drow: you see in the dark up to 120 feet instead of 60, and you know the Dancing Lights cantrip.",
        },
        "high-elf": {
          applied: "Already in your spells.",
          activation: "passive",
          summary: "High elf: you know the Prestidigitation cantrip.",
        },
        "wood-elf": {
          applied: "Already in your speed and your spells.",
          activation: "passive",
          summary:
            "Wood elf: your speed is 35 feet instead of 30, and you know the Druidcraft cantrip.",
        },
      },
    },
    skillChoice: ["insight", "perception", "survival"],
    languages: ["elvish"],
  },
  {
    id: "gnome",
    blurb: "Small, curious and clever, with a mind that magic struggles to fool.",
    size: "Small",
    traits: {
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 60 feet away as if it were dim light, though only in shades of gray.",
      },
      "gnomish-cunning": {
        activation: "passive",
        summary: "You roll with Advantage on Intelligence, Wisdom and Charisma saving throws.",
      },
      "gnomish-lineage": {
        activation: "passive",
        summary: "Your gnome family line gives you a little magic: cantrips and a special trick.",
      },
    },
    option: {
      choices: {
        "forest-gnome": {
          applied: "Already in your spells; Speak with Animals' card counts the free casts.",
          activation: "passive",
          summary:
            "Forest gnome: you know the Minor Illusion cantrip, and you can cast Speak with Animals without a spell slot.",
        },
        "rock-gnome": {
          activation: "passive",
          summary:
            "Rock gnome: you know the Mending and Prestidigitation cantrips. With 10 minutes of tinkering you can build a tiny clockwork toy that does one Prestidigitation trick (up to three at a time, each lasts 8 hours).",
        },
      },
    },
    languages: ["gnomish"],
  },
  {
    id: "goliath",
    blurb: "Towering descendants of giants, strong and fast, with a giant's gift in their blood.",
    size: "Medium",
    traits: {
      "giant-ancestry": {
        activation: "passive",
        summary:
          "Your giant ancestors give you one supernatural boon you can use a few times a day.",
      },
      "large-form": { hidden: "Starts at character level 5." },
      "powerful-build": {
        activation: "passive",
        summary:
          "You roll with Advantage on checks to break free of a grapple, and you can carry as much as a creature one size larger.",
      },
    },
    option: {
      // A giant ancestry is a boon, not a kind of Goliath: the player's species stays "Goliath".
      inName: false,
      choices: {
        "cloud-giant": {
          activation: "bonus",
          summary:
            "Cloud's Jaunt: as a bonus action, teleport up to 30 feet to a spot you can see.",
          uses: { count: "pb" },
        },
        "fire-giant": {
          activation: "passive",
          summary:
            "Fire's Burn: when you hit with an attack roll and deal damage, add 1d10 Fire damage.",
          uses: { count: "pb" },
        },
        "frost-giant": {
          activation: "passive",
          summary:
            "Frost's Chill: when you hit with an attack roll and deal damage, add 1d6 Cold damage and cut the target's speed by 10 feet until the start of your next turn.",
          uses: { count: "pb" },
        },
        "hill-giant": {
          activation: "passive",
          summary:
            "Hill's Tumble: when you hit a Large or smaller creature with an attack roll and deal damage, you can knock it Prone.",
          uses: { count: "pb" },
        },
        "stone-giant": {
          activation: "reaction",
          summary:
            "Stone's Endurance: when you take damage, use your reaction to roll 1d12, add your Constitution modifier, and take that much less damage.",
          uses: { count: "pb" },
        },
        "storm-giant": {
          activation: "reaction",
          summary:
            "Storm's Thunder: when a creature within 60 feet damages you, use your reaction to deal it 1d8 Thunder damage.",
          uses: { count: "pb" },
        },
      },
    },
    languages: ["giant"],
  },
  {
    id: "halfling",
    blurb: "Small, cheerful and brave, with luck that turns bad rolls around.",
    size: "Small",
    traits: {
      brave: {
        activation: "passive",
        summary: "You roll with Advantage on saves to avoid or end being Frightened.",
      },
      "halfling-nimbleness": {
        activation: "passive",
        summary:
          "You can move through the space of any creature bigger than you, but you can't stop there.",
      },
      luck: {
        activation: "passive",
        summary:
          "When you roll a 1 on the d20 for an attack, check or save, you can reroll it, and you must use the new roll.",
      },
      "naturally-stealthy": {
        activation: "passive",
        summary:
          "You can try to Hide even when the only thing hiding you is a creature at least one size bigger than you.",
      },
    },
    languages: ["halfling"],
  },
  {
    id: "human",
    blurb: "Adaptable and ambitious, good at a bit of everything and quick to learn.",
    size: "Medium",
    traits: {
      resourceful: {
        activation: "passive",
        summary: "You have Heroic Inspiration: spend it to reroll any one die you just rolled.",
        uses: { count: 1 },
      },
      skillful: {
        applied: "Already in your skills.",
        activation: "passive",
        summary: "You are trained in one extra skill (already on your sheet).",
      },
      versatile: {
        applied: "The extra feat shows on its own.",
        activation: "passive",
        summary: "You get an extra origin feat (shown with your feats).",
      },
    },
    skillChoice: "any",
    languages: [],
  },
  {
    id: "orc",
    blurb: "Strong and tireless, built to charge into a fight and keep standing.",
    size: "Medium",
    traits: {
      "adrenaline-rush": {
        activation: "bonus",
        summary:
          "Take the Dash action as a bonus action to move twice as far, and gain Temporary Hit Points equal to your Proficiency Bonus when you do.",
        uses: { count: "pb" },
      },
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 120 feet away as if it were dim light, though only in shades of gray.",
      },
      "relentless-endurance": {
        activation: "passive",
        summary:
          "When something drops you to 0 Hit Points without killing you outright, you can drop to 1 Hit Point instead.",
        uses: { count: 1 },
      },
    },
    languages: ["orc"],
  },
  {
    id: "tiefling",
    blurb: "Marked by a fiendish ancestor, with horns, a tail and a spark of dark magic.",
    size: "Medium",
    traits: {
      darkvision: {
        applied: "Already under your key numbers, as Darkvision.",
        activation: "passive",
        summary:
          "You can see in the dark up to 60 feet away as if it were dim light, though only in shades of gray.",
      },
      "fiendish-legacy": {
        activation: "passive",
        summary:
          "Your fiendish legacy gives you resistance to one damage type and an attack cantrip.",
      },
      "otherworldly-presence": {
        applied: "Already in your spells.",
        activation: "passive",
        summary:
          "You know the Thaumaturgy cantrip: small spooky wonders like a booming voice, flickering flames or tremors underfoot.",
      },
    },
    option: {
      choices: {
        abyssal: {
          applied: "Already under your key numbers (half damage) and in your spells.",
          activation: "passive",
          summary:
            "Abyssal: you take only half Poison damage, and you know the Poison Spray cantrip.",
        },
        chthonic: {
          applied: "Already under your key numbers (half damage) and in your spells.",
          activation: "passive",
          summary:
            "Chthonic: you take only half Necrotic damage, and you know the Chill Touch cantrip.",
        },
        infernal: {
          applied: "Already under your key numbers (half damage) and in your spells.",
          activation: "passive",
          summary: "Infernal: you take only half Fire damage, and you know the Fire Bolt cantrip.",
        },
      },
    },
    languages: [],
  },
];
