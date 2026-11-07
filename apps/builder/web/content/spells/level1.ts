// The level 1 spells the builder offers or grants, keyed by spell id
// (content/5etools/spells.json): a one-line gist for the pick card and a plain-language summary.
// Each is checked against that rules text; dice, ranges, areas and durations must match it
// exactly. Character numbers (to-hit, save DC) come from the engine, so they never appear here.

import type { CuratedSpell } from "../../src/domain/curationTypes";

export const LEVEL1_SPELLS: Record<string, CuratedSpell> = {
  "healing-word": {
    gist: "Quickly heal a friend you can see, even from across the room.",
    summary:
      "Bonus action. Pick a creature you can see within 60 feet; it regains 2d4 plus your spellcasting modifier in Hit Points. Quick healing to get a fallen friend back up from a distance.",
  },
  "dissonant-whispers": {
    gist: "A maddening melody hurts a foe and sends it running from you.",
    summary:
      "Action. One creature you can see within 60 feet makes a Wisdom save. On a fail it takes 3d6 Psychic damage and must use its reaction to run as far from you as it can; on a success it takes half damage.",
  },
  "faerie-fire": {
    gist: "Outline foes in glowing light so attacks on them have Advantage.",
    summary:
      "Action. Light up a 20-foot cube within 60 feet; each creature in it makes a Dexterity save or glows. Attacks against glowing targets have Advantage, and they can't be invisible. Needs Concentration, up to 1 minute.",
  },
  "charm-person": {
    gist: "Charm a person into treating you as a friend for an hour.",
    summary:
      "Action. One humanoid you can see within 30 feet makes a Wisdom save (with Advantage if you're fighting it). On a fail it is Charmed and friendly to you for 1 hour, until you or your allies hurt it. It knows you charmed it when the spell ends.",
  },
  thunderwave: {
    gist: "A wave of thunder that hurts and shoves everyone near you away.",
    summary:
      "Action. A boom bursts from you: each creature in a 15-foot cube next to you makes a Constitution save. On a fail it takes 2d8 Thunder damage and is pushed 10 feet away; on a success it takes half damage and isn't pushed. Heard up to 300 feet away.",
  },
  sleep: {
    gist: "Put a cluster of creatures to sleep: dazed first, then out cold.",
    summary:
      "Action. Choose creatures in a 5-foot-radius sphere within 60 feet; each makes a Wisdom save or is Incapacitated until the end of its next turn, then saves again or falls Unconscious. Damage or a shake wakes them. Elves and creatures that don't sleep are unaffected. Needs Concentration, up to 1 minute.",
  },
  heroism: {
    gist: "Fill an ally with courage: fearless, with Temporary Hit Points each turn.",
    summary:
      "Action. Touch a willing creature: it can't be Frightened, and at the start of each of its turns it gains Temporary Hit Points equal to your spellcasting modifier. Needs Concentration, up to 1 minute.",
  },
  command: {
    gist: "Bark one word, like Flee or Drop, and a foe must obey.",
    summary:
      "Action. Speak one word to a creature you can see within 60 feet; it makes a Wisdom save or obeys on its next turn. Pick Approach, Drop (what it holds), Flee, Grovel (falls Prone) or Halt (does nothing).",
  },
  "disguise-self": {
    gist: "Look like someone else, clothes and all, for an hour.",
    summary:
      "Action. For 1 hour you look like someone else, clothes and gear included, up to 1 foot shorter or taller. It's only an illusion: touch passes through it, and a creature that studies you can see through it with an Investigation check against your spell save DC.",
  },
  bless: {
    gist: "Up to three allies add 1d4 to their attacks and saves.",
    summary:
      "Action. Bless up to three creatures within 30 feet. Whenever they make an attack roll or a saving throw, they roll 1d4 and add it. Needs Concentration, up to 1 minute. Cast it at the start of a fight.",
  },
  "guiding-bolt": {
    gist: "A bolt of light that hits hard and leaves the target easy to hit.",
    summary:
      "Action. Make a ranged spell attack at a creature within 120 feet. On a hit it takes 4d6 Radiant damage, and the next attack roll against it before the end of your next turn has Advantage.",
  },
  "cure-wounds": {
    gist: "A healing touch, stronger than Healing Word.",
    summary:
      "Action. Touch a creature; it regains 2d8 plus your spellcasting modifier in Hit Points. Bigger healing than Healing Word, but you have to be next to them.",
  },
  "shield-of-faith": {
    gist: "A shimmering field gives one creature +2 AC.",
    summary:
      "Bonus action. A creature of your choice within 60 feet gets +2 to its Armor Class, making it harder to hit. Needs Concentration, up to 10 minutes.",
  },
  sanctuary: {
    gist: "Ward an ally so attackers must pass a save to target it.",
    summary:
      "Bonus action. Protect a creature within 30 feet for 1 minute: anyone who targets it with an attack or a damaging spell must pass a Wisdom save or pick a new target or lose the attack. It ends if the protected creature attacks, casts a spell or deals damage, and doesn't stop area spells.",
  },
  "inflict-wounds": {
    gist: "A withering touch of necrotic energy that hits hard.",
    summary:
      "Action. Touch a creature; it makes a Constitution save, taking 2d10 Necrotic damage on a fail or half as much on a success.",
  },
  bane: {
    gist: "Curse up to three foes to subtract 1d4 from attacks and saves.",
    summary:
      "Action. Up to three creatures you can see within 30 feet make a Charisma save. Each that fails subtracts 1d4 from its attack rolls and saving throws. Needs Concentration, up to 1 minute.",
  },
  entangle: {
    gist: "Grasping plants snare foes in an area and hold them fast.",
    summary:
      "Action. Plants fill a 20-foot square within 90 feet and make it Difficult Terrain. Each creature in it when you cast makes a Strength save or is Restrained; it can use its action on an Athletics check against your spell save DC to break free. Needs Concentration, up to 1 minute.",
  },
  goodberry: {
    gist: "Ten magic berries; each heals 1 Hit Point and feeds for a day.",
    summary:
      "Action. Ten magic berries appear in your hand and last 24 hours. Anyone can eat one as a bonus action to regain 1 Hit Point, and one berry feeds a creature for a day.",
  },
  "ice-knife": {
    gist: "A shard of ice that bursts into a freezing blast around the target.",
    summary:
      "Action. Make a ranged spell attack at a creature within 60 feet; on a hit it takes 1d10 Piercing damage. Hit or miss, the shard explodes: the target and each creature within 5 feet of it make a Dexterity save or take 2d6 Cold damage.",
  },
  "fog-cloud": {
    gist: "A big sphere of thick fog nobody can see through.",
    summary:
      "Action. Fill a 20-foot-radius sphere within 120 feet with thick fog nobody can see through. Good for escaping or blocking archers. Needs Concentration, up to 1 hour.",
  },
  "animal-friendship": {
    gist: "Charm a beast into friendship for a day.",
    summary:
      "Action. A beast you can see within 30 feet makes a Wisdom save or is Charmed for 24 hours. The spell ends if you or an ally hurts it.",
  },
  "searing-smite": {
    gist: "Set a foe ablaze with a weapon hit; it keeps burning.",
    summary:
      "Bonus action, right after you hit with a melee weapon or an unarmed strike. The target takes an extra 1d6 Fire damage. At the start of each of its turns it takes 1d6 Fire damage again, then makes a Constitution save; a success ends the spell. Lasts up to 1 minute.",
  },
  "ensnaring-strike": {
    gist: "Your weapon hit sprouts vines that hold the target fast.",
    summary:
      "Bonus action, right after you hit a creature with a weapon. Vines grab it: it makes a Strength save (Large or bigger creatures get Advantage) or is Restrained and takes 1d6 Piercing damage at the start of each of its turns. Breaking free takes an action and an Athletics check against your spell save DC. Needs Concentration, up to 1 minute.",
  },
  "hail-of-thorns": {
    gist: "Your ranged hit bursts into thorns that hit everyone near the target.",
    summary:
      "Bonus action, right after you hit a creature with a ranged weapon. The target and each creature within 5 feet of it make a Dexterity save, taking 1d10 Piercing damage on a fail or half as much on a success.",
  },
  longstrider: {
    gist: "Touch a creature to make it 10 feet faster for an hour.",
    summary: "Action. Touch a creature: its Speed goes up by 10 feet for 1 hour.",
  },
  "magic-missile": {
    gist: "Three glowing darts that always hit.",
    summary:
      "Action. Three darts of force fly at creatures you can see within 120 feet and never miss. Each dart deals 1d4 + 1 Force damage; send them all at one target or split them up.",
  },
  shield: {
    gist: "Snap up a barrier: +5 AC until your next turn.",
    summary:
      "Reaction, when an attack roll hits you or Magic Missile targets you. You get +5 to your Armor Class until the start of your next turn, which can turn that hit into a miss, and Magic Missile does no damage to you.",
  },
  "burning-hands": {
    gist: "A fan of flame that scorches everyone in front of you.",
    summary:
      "Action. Flames shoot from your hands in a 15-foot cone. Each creature in it makes a Dexterity save, taking 3d6 Fire damage on a fail or half as much on a success. Unattended flammable things catch fire.",
  },
  "mage-armor": {
    gist: "Magic armor for 8 hours, for someone who wears none.",
    summary:
      "Action. Touch a willing creature that isn't wearing armor: for 8 hours its base Armor Class becomes 13 plus its Dexterity modifier. It ends if the creature puts on armor. Cast it in the morning.",
  },
  hex: {
    gist: "Curse a foe so each of your hits on it deals extra damage.",
    summary:
      "Bonus action. Curse a creature you can see within 90 feet: whenever you hit it with an attack roll, it takes an extra 1d6 Necrotic damage, and it has Disadvantage on checks with one ability you choose. If it drops to 0 Hit Points, you can move the curse to a new creature with a bonus action later. Needs Concentration, up to 1 hour.",
  },
  "hellish-rebuke": {
    gist: "Hit back with hellfire at whoever just hurt you.",
    summary:
      "Reaction, when a creature you can see within 60 feet damages you. Green flames surround it: it makes a Dexterity save, taking 2d10 Fire damage on a fail or half as much on a success.",
  },
  "armor-of-agathys": {
    gist: "Frost armor that shields you and bites whoever hits you in melee.",
    summary:
      "Bonus action. Frost covers you and you gain 5 Temporary Hit Points for up to 1 hour. Any creature that hits you with a melee attack takes 5 Cold damage. The spell ends when those Temporary Hit Points are gone.",
  },
  "tashas-hideous-laughter": {
    gist: "Make a foe collapse laughing, helpless on the ground.",
    summary:
      "Action. One creature you can see within 30 feet makes a Wisdom save. On a fail it falls Prone laughing and is Incapacitated. It saves again at the end of each of its turns and whenever it takes damage (with Advantage then); a success ends it. Needs Concentration, up to 1 minute.",
  },
  "expeditious-retreat": {
    gist: "Run at magic speed: Dash now, and as a bonus action later.",
    summary:
      "Bonus action. You Dash right away, and on later turns you can Dash as a bonus action, letting you move twice as far. Needs Concentration, up to 10 minutes.",
  },
  "find-familiar": {
    gist: "Summon a spirit animal that scouts and spies for you.",
    summary:
      "Takes 1 hour to cast (best done as a ritual during downtime). A spirit animal of your choice (cat, owl, raven, rat and the like) appears within 10 feet and serves you. It can't attack, but it can scout: within 100 feet you talk to it in your mind and, as a bonus action, see and hear through it. It can also deliver your touch spells.",
  },
  "detect-magic": {
    gist: "Sense magic nearby and see it glow on things and creatures.",
    summary:
      "Action (or a ritual, which takes 10 minutes longer but uses no slot). For up to 10 minutes you sense magic within 30 feet and can see a faint glow on magic things and creatures. Needs Concentration. Use it to find magic items and hidden spells.",
  },
  "feather-fall": {
    gist: "Up to five falling creatures float down safely.",
    summary:
      "Reaction, when you or a creature you can see within 60 feet falls. Up to five falling creatures within 60 feet float down at 60 feet per round for up to 1 minute and take no damage when they land.",
  },
  "hunters-mark": {
    gist: "Mark your quarry: extra damage on each hit, and it's easier to track.",
    summary:
      "Bonus action. Mark a creature you can see within 90 feet: whenever you hit it with an attack roll, it takes an extra 1d6 Force damage, and you have Advantage on Perception and Survival checks to find it. If it drops to 0 Hit Points, move the mark to a new creature with a bonus action. Needs Concentration, up to 1 hour.",
  },
  "divine-smite": {
    gist: "Pour holy light into a melee hit for extra Radiant damage.",
    summary:
      "Bonus action, right after you hit with a melee weapon or an unarmed strike. The target takes an extra 2d8 Radiant damage, or 3d8 if it is a Fiend or an Undead.",
  },
  "speak-with-animals": {
    gist: "Talk with animals and ask what they've seen.",
    summary:
      "Action (or a ritual). For 10 minutes you can talk with beasts and use your social skills on them. Animals know little beyond survival, but they can tell you about nearby places and monsters they've seen in the last day.",
  },
};
