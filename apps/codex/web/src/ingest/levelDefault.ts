import type { CodexEntity } from "../schema/entity";

export type ReportFn = (cls: string, detail: string) => void;

/**
 * D29-61(a) (R9, P6): the ingest-time "missing `level` -> `0`" default.
 * Runs as its own finalization pass — AFTER `join.ts`'s identity resolution
 * (R4's ritual move has already settled every entity's final `category`) and
 * AFTER `drop.ts`'s AoN-primary drop (so this sees the FINAL emitted entity
 * set, not a pre-drop superset) — and BEFORE `emit.ts` writes anything.
 *
 * ## The 23 level-bearing categories (≥40% real-corpus `level` coverage)
 *
 * Reuses the repo's own existing precedent floor — `schema/facetKeys.ts`'s
 * "coverage ≥40% of the category's final entities" classifier, quoted
 * verbatim in that file's own top comment — rather than inventing a new
 * threshold (spec §1.3's corrected scope). A full per-category sweep of the
 * real corpus (verified, spec §1.3) found a clean bimodal split: 19
 * categories at EXACTLY 100% coverage (kept below for forward-safety only —
 * this default never actually fires for them at this snapshot) plus 4 more
 * at 97.7–99.97% (`equipment` 99.97%, `creature` 99.93%, `curse` 97.83%,
 * `disease` 97.73% — the genuinely affected categories, 10 real entities
 * total this snapshot) = 23. `archetype` (26.06% — most archetypes carry no
 * level concept at all) and every 0%-coverage category (`deity`, `language`,
 * `rules`, ...) are explicitly EXCLUDED: `level` stays `undefined` there,
 * unchanged from today's behavior — defaulting them would fabricate a false
 * "level 0" for a category where level mostly isn't a real attribute.
 */
export const LEVEL_BEARING_CATEGORIES: ReadonlySet<string> = new Set([
  "animal-companion",
  "armor",
  "campsite-meal",
  "class-feature",
  "epithet",
  "feat",
  "hazard",
  "item-bonus",
  "kingdom-event",
  "kingdom-structure",
  "ritual",
  "shield",
  "siege-weapon",
  "spell",
  "vehicle",
  "warfare-army",
  "warfare-tactic",
  "weapon",
  "weather-hazard",
  "equipment",
  "creature",
  "curse",
  "disease",
]);

export interface LevelDefaultResult {
  entities: CodexEntity[];
  defaultedCount: number;
}

/**
 * Pure: defaults `level` to `0` for any entity whose `category` is one of
 * the 23 `LEVEL_BEARING_CATEGORIES` and whose `level` is missing; every
 * other entity is returned with the SAME object identity (no-op means
 * literally unchanged, `drop.ts`'s own convention).
 */
export function applyLevelDefault(
  entities: readonly CodexEntity[],
  report: ReportFn,
): LevelDefaultResult {
  let defaultedCount = 0;
  const out = entities.map((e) => {
    if (e.level !== undefined || !LEVEL_BEARING_CATEGORIES.has(e.category)) return e;
    defaultedCount++;
    report("levelDefaulted", e.id);
    return { ...e, level: 0 };
  });
  return { entities: out, defaultedCount };
}
