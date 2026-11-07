// The cantrips a player can pick or gets from a species, keyed by spell id
// (content/5etools/spells.json): a one-line gist for the pick card and a plain-language summary.
// Numbers are the character level 1–4 values; the engine adds the character's own attack bonus
// and save DC.

import type { CuratedSpell } from "../../src/domain/curationTypes";

export const CANTRIPS: Record<string, CuratedSpell> = {
  "vicious-mockery": {
    gist: "An insult so cutting it hurts, and the foe's next attack falters.",
    summary:
      "As an action, insult one creature within 60 feet that can see or hear you. It makes a Wisdom save; on a fail it takes 1d6 Psychic damage and has Disadvantage on its next attack roll before the end of its next turn.",
  },
  "starry-wisp": {
    gist: "Fling a mote of starlight that hurts and makes the target glow.",
    summary:
      "As an action, throw a mote of light at a target within 60 feet: make a ranged spell attack, and on a hit roll 1d8 Radiant damage. Until the end of your next turn the target glows and can't be Invisible.",
  },
  "minor-illusion": {
    gist: "Conjure a fake sound or a fake object to fool or distract.",
    summary:
      "As an action, create a fake sound or a fake image of an object (no bigger than a 5-foot cube) within 30 feet for 1 minute. Use it to distract guards or hide behind a fake crate; anyone who touches the image or studies it closely can see through it.",
  },
  "mage-hand": {
    gist: "A floating ghostly hand that fetches, opens and carries for you.",
    summary:
      "As an action, make a floating ghostly hand appear within 30 feet for 1 minute. It can open unlocked doors, pick up or move things up to 10 pounds, and pour out vials, but it can't attack. Use an action on later turns to move it up to 30 feet and use it again.",
  },
  prestidigitation: {
    gist: "Little magic tricks: sparks, cleaning, warming, flavoring, marks.",
    summary:
      "As an action, do a small magic trick within 10 feet: light or snuff a candle, clean or dirty a small object, warm or flavor food, make a little mark, a harmless puff of sparks, or a tiny trinket. Great for showing off and small chores; it can't hurt anyone.",
  },
  light: {
    gist: "Make an object shine like a torch for an hour.",
    summary:
      "As an action, touch an object to make it glow like a torch for 1 hour: bright light 20 feet around it and dim light 20 feet beyond that. Cover it to hide the light.",
  },
  "sacred-flame": {
    gist: "Holy fire falls on a foe; hiding behind cover won't help it.",
    summary:
      "As an action, call down holy fire on a creature you can see within 60 feet. It makes a Dexterity save; on a fail it takes 1d8 Radiant damage. Hiding behind cover doesn't help it.",
  },
  guidance: {
    gist: "Touch an ally: they add 1d4 to checks with one skill you pick.",
    summary:
      "As an action, touch a willing ally (or yourself) and pick a skill. For up to 1 minute, they add 1d4 to any check with that skill. Needs Concentration: you can only keep one such spell going, and taking damage can break it.",
  },
  "toll-the-dead": {
    gist: "A ghostly bell tolls for a foe, and hurts more if it's already wounded.",
    summary:
      "As an action, ring a ghostly bell at a creature you can see within 60 feet. It makes a Wisdom save; on a fail it takes 1d8 Necrotic damage, or 1d12 if it was already hurt.",
  },
  thaumaturgy: {
    gist: "Small wonders: a booming voice, flickering flames, tremors, slams.",
    summary:
      "As an action, make a small wonder within 30 feet: boom your voice (Advantage on Intimidation checks for 1 minute), change your eyes, make flames flicker, slam an unlocked door or window, make the ground tremble, or make a spooky sound. Good for impressing or scaring people.",
  },
  "spare-the-dying": {
    gist: "Keep a friend at 0 Hit Points from slipping away.",
    summary:
      "As an action, pick a creature within 15 feet that is at 0 Hit Points but not dead. It becomes stable, so it stops making death saves. Use it to save a fallen friend when you can't heal them.",
  },
  "word-of-radiance": {
    gist: "Burst with holy light that sears the foes crowding around you.",
    summary:
      "As an action, burst with holy light. Each creature you choose within 5 feet of you makes a Constitution save; on a fail it takes 1d6 Radiant damage. Good when enemies crowd around you.",
  },
  "produce-flame": {
    gist: "A flame in your hand that lights the way, then flies at foes.",
    summary:
      "As a bonus action, light a flame in your hand that lasts 10 minutes and shines like a torch. While it lasts, use an action to throw fire at a target within 60 feet: make a ranged spell attack, and on a hit roll 1d8 Fire damage.",
  },
  shillelagh: {
    gist: "Charge your club or staff so it strikes with your spell power.",
    summary:
      "As a bonus action, empower the club or quarterstaff in your hand for 1 minute. Its attacks use your spellcasting ability instead of Strength, its damage die becomes a d8, and it can deal Force damage. Ends if you let go of it.",
  },
  "thorn-whip": {
    gist: "Lash a foe with a thorny vine and drag it toward you.",
    summary:
      "As an action, lash a thorny vine at a creature within 30 feet: make a melee spell attack, and on a hit roll 1d6 Piercing damage. If it is Large or smaller, you can pull it up to 10 feet toward you.",
  },
  druidcraft: {
    gist: "Small nature tricks: forecast weather, bloom flowers, light fires.",
    summary:
      "As an action, do a small nature trick within 30 feet: predict tomorrow's weather, make a flower bloom, light or snuff a candle or campfire, or make a harmless effect like falling leaves or an animal sound.",
  },
  "fire-bolt": {
    gist: "Hurl fire at a distant foe; your go-to attack.",
    summary:
      "As an action, hurl fire at a target within 120 feet: make a ranged spell attack, and on a hit roll 1d10 Fire damage. Your go-to attack from far away; it can also set unattended things alight.",
  },
  "shocking-grasp": {
    gist: "A shocking touch that stops a foe from striking as you step away.",
    summary:
      "As an action, try to touch a creature with lightning: make a melee spell attack, and on a hit roll 1d8 Lightning damage. It can't make Opportunity Attacks until its next turn, so you can step away safely.",
  },
  "ray-of-frost": {
    gist: "An icy beam that hurts and slows the target down.",
    summary:
      "As an action, shoot an icy beam at a creature within 60 feet: make a ranged spell attack, and on a hit roll 1d8 Cold damage. Its Speed drops by 10 feet until the start of your next turn.",
  },
  thunderclap: {
    gist: "A thunderous boom that hits everyone right next to you.",
    summary:
      "As an action, make a thunderous boom. Each creature within 5 feet of you makes a Constitution save; on a fail it takes 1d6 Thunder damage. It can be heard 100 feet away.",
  },
  "eldritch-blast": {
    gist: "A beam of crackling force; your main attack, every turn.",
    summary:
      "As an action, fire a beam of crackling energy at a target within 120 feet: make a ranged spell attack, and on a hit roll 1d10 Force damage. Your main attack; you can use it every turn.",
  },
  "chill-touch": {
    gist: "A grave-cold touch that hurts and stops the target healing.",
    summary:
      "As an action, touch a creature with grave-cold: make a melee spell attack, and on a hit roll 1d10 Necrotic damage. It can't regain Hit Points until the end of your next turn.",
  },
  "dancing-lights": {
    gist: "Up to four floating lights you can steer around.",
    summary:
      "As an action, create up to four floating torch-like lights (or one glowing human shape) within 120 feet, each giving dim light 10 feet around it. Move them up to 60 feet as a bonus action. Needs Concentration, up to 1 minute.",
  },
  mending: {
    gist: "Fix one break or tear: a snapped chain, a torn cloak, a key.",
    summary:
      "Spend 1 minute touching a broken object to fix one break or tear no bigger than 1 foot, like a snapped chain link, a torn cloak or a broken key.",
  },
  "poison-spray": {
    gist: "Spray a foe with a mist of poison.",
    summary:
      "As an action, spray toxic mist at a creature within 30 feet: make a ranged spell attack, and on a hit roll 1d12 Poison damage.",
  },
};
