/**
 * `query-player`'s `stats` and `skills` sections: the derived numbers, read off the LIVE
 * prepared actor (`doc.system`, never `toObject()`), each one fail-soft.
 */
import {
  type PlayerSaveRow,
  type PlayerSkillRow,
  type PlayerSkillsSection,
  type PlayerStatsSection,
} from "@astra/portal-shared";

import { MODULE_ID } from "../constants";
import { liveNumberAt, liveSkills, liveSystem, type Pf2eSystem } from "../pf2e";

/** Reads a dot-path off the LIVE prepared actor's `system` tree — fail-soft:
 * a missing/wrong-shaped path logs a module `console.warn` naming the path and
 * returns `undefined`, NEVER throws (pf2e-internal derived paths
 * can drift across system majors, and a familiar/edge-case actor may legitimately
 * lack a path like `attributes.classDC`). `warnings` collects the same message the
 * console gets, so `query-player`'s `stats` result carries a machine-readable record
 * of what came back missing alongside the human-readable console line. */
function readDerivedNumber(
  live: Pf2eSystem<"live"> | undefined,
  path: string,
  warnings: string[],
): number | undefined {
  const value = liveNumberAt(live, path);
  if (value !== undefined) return value;
  const message = `query-player stats: missing/invalid derived path "system.${path}"`;
  warnings.push(message);
  // oxlint-disable-next-line no-console -- Foundry module: the browser console is the GM's log
  console.warn(`[${MODULE_ID}] ${message}`);
  return undefined;
}

const SAVE_SLUGS = ["fortitude", "reflex", "will"];
const ABILITY_SLUGS = ["str", "dex", "con", "int", "wis", "cha"];

/** `query-player`'s `stats` section — the curated derived-stats
 * projection, read off the LIVE prepared actor (`doc.system`, never `toObject()`):
 * AC, saves, perception, ability modifiers, class DC, spell DC. Every individual
 * field is read via {@link readDerivedNumber} — fail-soft per field, never throws. */
export function buildStats(doc: FoundryDocumentLike): PlayerStatsSection {
  const live = liveSystem(doc);
  const warnings: string[] = [];
  const read = (path: string): number | undefined => readDerivedNumber(live, path, warnings);

  const saves: PlayerSaveRow[] = SAVE_SLUGS.map((type) => ({
    type,
    value: read(`saves.${type}.value`),
    dc: read(`saves.${type}.dc`),
  }));
  const abilityMods: Record<string, number> = {};
  for (const slug of ABILITY_SLUGS) {
    const mod = read(`abilities.${slug}.mod`);
    if (mod !== undefined) abilityMods[slug] = mod;
  }

  return {
    section: "stats",
    ac: read("attributes.ac.value"),
    perception: { value: read("perception.value"), dc: read("perception.dc") },
    saves,
    abilityMods,
    classDC: { value: read("attributes.classDC.value"), rank: read("attributes.classDC.rank") },
    spellDC: { value: read("attributes.spellDC.value") },
    warnings,
  };
}

/** `query-player`'s `skills` section — the LIVE `system.skills` map, which
 * (unlike stored source) carries a total `value`/`dc` per skill AND every lore skill
 * (added by `prepareSkills()`'s loreItems merge, verified in pf2e.mjs). */
export function buildSkills(doc: FoundryDocumentLike): PlayerSkillsSection {
  const skills: PlayerSkillRow[] = liveSkills(liveSystem(doc)).map((s) => ({
    slug: s.slug,
    label: s.label,
    rank: s.rank,
    value: s.value,
    dc: s.dc,
    lore: s.lore,
  }));
  skills.sort((a, b) => a.slug.localeCompare(b.slug));
  return { section: "skills", skills };
}
