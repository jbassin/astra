// D30-39 — the assay artifact's own `node:fs` seam, a SIBLING of
// `corpusFs.ts` (deliberately its own file, not a new `CorpusReader` method):
// the artifact lives at `<data-path>/assay/spell-power.json`, a THIRD
// identical-path bind alongside `corpus/`/`search/` (D30-41), not nested
// under `corpus/` the way `CorpusReader`'s own root is — so it needs its own
// root resolution, not a path relative to `createCorpusReader`'s `rootDir`.
//
// THE load-bearing difference from `corpusFs.ts`'s own `resolveCorpusRoot`:
// **no fixture fallback.** D30-39's own text: "the assay loader must NOT
// mirror corpusFs's fixture fallback" — absent/unparseable collapses to
// "no assay data at all" (every spell page's block renders nothing), never
// a substitute fixture corpus. This keeps CI/ssrSmoke/a fresh clone
// presence-agnostic (W-E's own gate) instead of silently serving fixture
// assay numbers that were never run through the real join.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import { AssayExportFileSchema, type AssayEntry } from "../schema/assay";

export interface AssayReader {
  /** `undefined` for an entity with no assay entry at all (not a spell,
   * genuinely un-assayed, or the whole artifact is absent/malformed) — the
   * caller (`entityPageData.ts`'s `resolveEntityPageData`) treats this
   * exactly like every other "nothing to render" fail-soft result. */
  entry(entityId: string): AssayEntry | undefined;
}

/** D30-39/D30-40 — the trivial default `resolveEntityPageData` falls back
 * to when its caller doesn't supply a real reader: every existing 2-arg
 * call site (the 7 flagship goldens' bare `EntityPage` construction,
 * `entityPageData.test.ts`'s many direct calls, `regen-goldens.ts`) keeps
 * resolving to "no assay data", so the optional `EntityPageData.assay`
 * field stays byte-identically absent for every one of them without
 * threading a mock reader through — the D30-40 "goldens/fixtures
 * byte-identical untouched" requirement, satisfied structurally rather than
 * by hand-auditing every call site. */
export const emptyAssayReader: AssayReader = {
  entry: () => undefined,
};

/**
 * Pure-ish factory over an explicit `dataDir` (the `codex.data-path` root,
 * i.e. the PARENT of `assay/`, `corpus/`, and `search/` — not the `assay/`
 * dir itself) — directly unit-testable against a fixture dir with zero
 * mocking, the same `createCorpusReader(rootDir)` posture. Cache-on-SUCCESS
 * only: a successful parse is cached forever per reader instance (the
 * artifact is immutable per process, same `corpusFs.ts` convention — D30-39's
 * "artifact regeneration therefore requires a container restart," folded
 * into `codex-refresh`, which already restarts the container for exactly
 * this reason, D29-57). A FAILED read is deliberately NOT cached: every call
 * re-attempts the file read (cheap — one small JSON file, read at most once
 * per request) so the artifact can go from absent to present the moment
 * `apps/codex/data/assay/spell-power.json` is placed, with no restart
 * needed to pick up the FIRST successful read — only the console warning is
 * one-shot (`warned`, below), so a genuinely-still-missing artifact doesn't
 * spam a line on every spell-page request for the rest of the process's
 * life (the `listingData.ts` `bookToProductLine`/D29-121 idiom this
 * mirrors).
 */
export function createAssayReader(dataDir: string): AssayReader {
  let cache: ReadonlyMap<string, AssayEntry> | undefined;
  let warned = false;
  const path = join(dataDir, "assay", "spell-power.json");

  function load(): ReadonlyMap<string, AssayEntry> | undefined {
    if (cache) return cache;
    try {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      const parsed = AssayExportFileSchema.parse(raw);
      const map = new Map(Object.entries(parsed.entries));
      cache = map;
      return map;
    } catch (err) {
      // Absent (ENOENT, pre-integration/fixture-only dev) AND unparseable
      // (malformed JSON, schema-invalid) collapse to the SAME fail-soft
      // outcome — D30-39's own "absent/unparseable -> null" makes no
      // distinction between the two, and neither should this loader.
      if (!warned) {
        warned = true;
        console.warn(
          `[codex] no assay/spell-power.json (or it's malformed) at "${path}" — every spell ` +
            'page\'s "Assay (experimental)" block will be omitted (fail-soft, D30-39; no fixture ' +
            "fallback, unlike corpusFs.ts's corpus root). Expected pre-integration (the artifact " +
            "hasn't landed in the data mount yet) or a fixture-only dev run; check the real data " +
            `mount if this is a live deploy after the artifact lands. (${String(err)})`,
        );
      }
      return undefined;
    }
  }

  return {
    entry(entityId: string): AssayEntry | undefined {
      return load()?.get(entityId);
    },
  };
}

/** The lazily-constructed singleton `corpusFns.ts` reads from — resolved on
 * FIRST USE, not at module-import time (the same client-bundle-leak guard
 * `corpusFs.ts`'s own `getCorpusReader()` doc comment explains), cached
 * forever after that (one `createAssayReader` per process). */
let cachedReader: AssayReader | undefined;
export function getAssayReader(): AssayReader {
  cachedReader ??= createAssayReader(loadConfig().codex.dataPath);
  return cachedReader;
}
