// Everything hand-written under content/, gathered into one value. scripts/build-content.ts
// joins it with the imported 5etools data; tests pass it a modified copy.

import { BACKGROUNDS } from "../content/backgrounds";
import { CLASSES } from "../content/classes";
import { FEATS } from "../content/feats";
import { MASTERY_SUMMARIES } from "../content/masteries";
import { OPTIONS } from "../content/options";
import { SPECIES } from "../content/species";
import { CANTRIPS } from "../content/spells/cantrips";
import { LEVEL1_SPELLS } from "../content/spells/level1";
import { SPELL_ROLLS } from "../content/spells/rolls";
import type {
  CuratedBackground,
  CuratedClass,
  CuratedFeat,
  CuratedOption,
  CuratedSpecies,
  CuratedSpell,
  CuratedSpellRoll,
} from "../src/domain/curationTypes";

export interface Curation {
  classes: CuratedClass[];
  species: CuratedSpecies[];
  backgrounds: CuratedBackground[];
  feats: Record<string, CuratedFeat>;
  options: Record<string, CuratedOption>;
  masteries: Record<string, string>;
  cantrips: Record<string, CuratedSpell>;
  level1: Record<string, CuratedSpell>;
  spellRolls: Record<string, CuratedSpellRoll>;
}

export const CURATION: Curation = {
  classes: CLASSES,
  species: SPECIES,
  backgrounds: BACKGROUNDS,
  feats: FEATS,
  options: OPTIONS,
  masteries: MASTERY_SUMMARIES,
  cantrips: CANTRIPS,
  level1: LEVEL1_SPELLS,
  spellRolls: SPELL_ROLLS,
};
