// What the sheet's roll line for a spell can't read from the data, keyed by spell id
// (content/5etools/spells.json). The build takes the damage dice, healing dice and how the
// damage lands from the imported data: a spell attack lands on a hit, a spell that adds to a
// weapon attack lands on that hit, a save spell on a failed save, anything else with no roll.
// `on` corrects that when it's wrong; `note` gives every roll beyond the first, and the build
// fails when a damage or healing roll in the rules text appears nowhere on the sheet.
// Numbers in a note must match the rules text, like a summary's.

import type { CuratedSpellRoll } from "../../src/domain/curationTypes";

export const SPELL_ROLLS: Record<string, CuratedSpellRoll> = {
  "divine-smite": { note: "1d8 more if the target is a Fiend or an Undead." },
  "ensnaring-strike": { on: "each-turn" },
  hex: { note: "Add it to every hit on the target until the spell ends." },
  "hunters-mark": { note: "Add it to every hit on the target until the spell ends." },
  "ice-knife": {
    note: "Hit or miss, the target and each creature within 5 feet of it then make a Dexterity save or take 2d6 Cold damage.",
  },
  "magic-missile": {
    note: "You make three darts and pick a creature for each; every dart deals that damage.",
  },
  "searing-smite": {
    note: "At the start of each of its turns it takes 1d6 Fire damage again, then makes a Constitution save; a success ends the spell.",
  },
  shillelagh: { on: "weapon-die" },
  "toll-the-dead": { note: "1d12 instead if the target is missing any Hit Points." },
};
