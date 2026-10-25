/**
 * Actor accessors. Each one names, in its signature, the side it may read:
 * `Pf2eSystem<"live">` for fields pf2e derives during data prep, `Pf2eSystem<"source">` for
 * fields only the stored source holds, and `Pf2eSystem` (either side) for stored fields that
 * data prep leaves alone. See `index.ts` for the full ownership table.
 */
import {
  at,
  numberOrUndefined,
  type Pf2eSource,
  type Pf2eSystem,
  record,
  recordOrUndefined,
  sourceItems,
  stringOrUndefined,
  stringsOrUndefined,
} from "./data";

interface Pf2eHp {
  readonly value?: number;
  readonly max?: number;
  readonly temp?: number;
}

interface Pf2ePool {
  readonly value?: number;
  readonly max?: number;
}

/** `system.details.level.value`. */
export function actorLevel(sys: Pf2eSystem): number | undefined {
  return numberOrUndefined(at(sys, "details.level.value"));
}

/** `system.attributes.hp`, or `undefined` when it is not an object. A PC's `max` exists only
 * on the live side (pf2e derives it); an NPC stores `max` in its source. */
export function actorHp(sys: Pf2eSystem): Pf2eHp | undefined {
  const hp = recordOrUndefined(record(sys.attributes).hp);
  if (!hp) return undefined;
  return {
    value: numberOrUndefined(hp.value),
    max: numberOrUndefined(hp.max),
    temp: numberOrUndefined(hp.temp),
  };
}

/** `system.details.xp` (a PC's `{value, max}`). */
export function actorXp(sys: Pf2eSystem): Pf2ePool | undefined {
  const xp = recordOrUndefined(record(sys.details).xp);
  if (!xp) return undefined;
  return { value: numberOrUndefined(xp.value), max: numberOrUndefined(xp.max) };
}

/** `system.resources.heroPoints`. Hero points are GM-awarded and live only in the stored
 * source: pf2e's data prep leaves the live value at 0/0. `fallback` is read only when the
 * source has no `resources` block at all (a familiar); `query-player`'s summary passes the
 * tree it reads everything else from, which keeps its pre-layer behaviour. */
export function actorHeroPoints(
  source: Pf2eSystem<"source">,
  fallback?: Pf2eSystem,
): Pf2ePool | undefined {
  const resources = source.resources ?? fallback?.resources;
  const heroPoints = recordOrUndefined(record(resources).heroPoints);
  if (!heroPoints) return undefined;
  return { value: numberOrUndefined(heroPoints.value), max: numberOrUndefined(heroPoints.max) };
}

/** `system.details.languages.value`, string entries only. */
export function actorLanguages(sys: Pf2eSystem): string[] | undefined {
  return stringsOrUndefined(at(sys, "details.languages.value"));
}

/** `system.details.alliance` (`"party"`, `"opposition"`, ...). */
export function actorAlliance(sys: Pf2eSystem): string | undefined {
  return stringOrUndefined(record(sys.details).alliance);
}

/** A familiar's `system.master.id` (a world actor id). */
export function familiarMasterId(sys: Pf2eSystem): string | undefined {
  return stringOrUndefined(at(sys, "master.id"));
}

/** A party actor's stored `system.details.members[].uuid`, string entries only. */
export function partyMemberUuids(sys: Pf2eSystem<"source">): string[] {
  const members = record(sys.details).members;
  if (!Array.isArray(members)) return [];
  const uuids: string[] = [];
  for (const member of members) {
    const uuid = record(member).uuid;
    if (typeof uuid === "string") uuids.push(uuid);
  }
  return uuids;
}

/** The name of the actor's first embedded item of `type` (`"ancestry"`, `"class"`,
 * `"deity"`, ...), or `undefined` when there is none or its name is not a string. */
export function firstItemName(src: Pf2eSource, type: string): string | undefined {
  return stringOrUndefined(sourceItems(src).find((i) => i.type === type)?.name);
}

/** A number at a dot path under the live `system` tree (`"saves.will.dc"`). Derived stats
 * (AC, saves, perception, ability modifiers, class and spell DC) exist only on this side;
 * the stored source has `abilities: null` and no totals at all. */
export function liveNumberAt(
  live: Pf2eSystem<"live"> | undefined,
  path: string,
): number | undefined {
  return numberOrUndefined(at(live ?? {}, path));
}

interface Pf2eSkill {
  readonly slug: string;
  readonly label?: string;
  readonly rank?: number;
  readonly value?: number;
  readonly dc?: number;
  readonly lore: boolean;
}

/** The live `system.skills` map, in stored key order. Only the live side carries the totals
 * (`value`, `dc`) and the lore skills, which pf2e merges in from lore items. */
export function liveSkills(live: Pf2eSystem<"live"> | undefined): Pf2eSkill[] {
  const skills: Pf2eSkill[] = [];
  for (const [slug, raw] of Object.entries(record(live?.skills))) {
    const s = recordOrUndefined(raw);
    if (!s) continue;
    skills.push({
      slug,
      label: stringOrUndefined(s.label),
      rank: numberOrUndefined(s.rank),
      value: numberOrUndefined(s.value),
      dc: numberOrUndefined(s.dc),
      lore: s.lore === true,
    });
  }
  return skills;
}

/** The update paths that are derived on a player character. pf2e's
 * `CharacterSystemSource` types `perception`/`saves`/`traits` as `never`, and AC and class
 * DC are recomputed every data-prep cycle, so a write to any of them on a `character` actor
 * is discarded or corrupts data prep. NPCs store these and may be written. */
const PC_DERIVED_PATH_PREFIXES = [
  "system.saves",
  "system.perception",
  "system.traits",
  "system.attributes.ac",
  "system.attributes.classDC",
] as const;

/** Whether an `update()` dot path lands on a derived PC field. Matched on segment
 * boundaries, so `"system.perceptionFoo"` is not caught. */
export function isDerivedPcPath(path: string): boolean {
  return PC_DERIVED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}.`),
  );
}

/** pf2e's stored defaults for `system.details.biography.visibility` (template.json):
 * appearance starts visible to players, every other subsection starts GM-only. The sheet's
 * `biography.hbs` shows a subsection to a non-owner only when its flag is true, and a GM-only
 * "eye" toggle writes the flag (verified against the live container, 2026-07-11). A missing
 * or wrong-shaped flag falls back to this default, never to "visible". */
const BIOGRAPHY_VISIBILITY_DEFAULTS: Readonly<Record<string, boolean>> = {
  appearance: true,
  backstory: false,
  personality: false,
  campaign: false,
};

export type BiographySection = "appearance" | "backstory" | "personality" | "campaign";

interface Pf2eBiography {
  readonly appearance?: string;
  readonly backstory?: string;
  readonly likes?: string;
  readonly dislikes?: string;
  readonly campaignNotes?: string;
  /** Whether players may see a subsection: the stored GM toggle, or pf2e's default for that
   * subsection when the toggle is absent or not a boolean. */
  readonly visible: (section: BiographySection) => boolean;
}

/** The stored `system.details.biography` prose and its per-subsection visibility. */
export function actorBiography(sys: Pf2eSystem<"source">): Pf2eBiography {
  const bio = record(record(sys.details).biography);
  const visibility = recordOrUndefined(bio.visibility);
  return {
    appearance: stringOrUndefined(bio.appearance),
    backstory: stringOrUndefined(bio.backstory),
    likes: stringOrUndefined(bio.likes),
    dislikes: stringOrUndefined(bio.dislikes),
    campaignNotes: stringOrUndefined(bio.campaignNotes),
    visible: (section) => {
      const value = visibility?.[section];
      return typeof value === "boolean" ? value : (BIOGRAPHY_VISIBILITY_DEFAULTS[section] ?? false);
    },
  };
}
