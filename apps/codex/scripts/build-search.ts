// D29-34 (P3 S2) — the offline Pagefind index build over the corpus.
//
// HOST-ONLY: the native Pagefind indexer peaks at ~3.8 GB RSS during
// `writeFiles` at the full 46,192-entity corpus (measured, spec §1/§6) —
// this script must NEVER be wired into `vite build`, a CI lane, or a Docker
// build step (P5's compose/bind-mount design inherits this constraint
// unchanged). Run it via `just codex-search-index` (host only).
//
// Walks the corpus via `createCorpusReader` — the SAME fs layer P2's routes
// read through (D29-23), not a second ad-hoc reader — extracts plain text
// per entity via the generalized `collectText`/`statsText` helpers in
// `src/domain/render/text.ts` (adversarial N9: no `collectText` symbol
// existed before this slice), and calls Pagefind's NodeJS `addCustomRecord`
// directly with structured `meta`/`filters` — unlike akasha's
// `build-search.ts` precedent (`addHTMLFile` over rendered HTML: akasha has
// no structured facet data to carry), codex has real per-entity
// meta/filters and skips the synthetic HTML round-trip entirely.
//
// `buildSearchIndex()` is pure over its `(reader, outDir)` inputs — same
// "paths passed in, `main()` resolves the real ones from config" split as
// `scripts/transform.ts`'s `runTransform`/`main()` — so the CI-hermetic
// fixture test (`build-search.test.ts`) can call it against the committed
// fixture corpus + a fresh temp dir with zero `data/` reads (D29-12).

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "@astra/config";
import * as pagefind from "pagefind";

import { collectText, statsText } from "../src/domain/render/text";
import { createCorpusReader, type CorpusReader } from "../src/server/corpusFs";

/** Trait case-folding for the search FILTER only (D29-32/D29-34: "trait
 * case-folding lives at the UI layer" / "traits (case-folded)") — lowercase
 * fold, matching the browse-layer convention exactly (1,082 raw strings ->
 * 644 distinct, measured). Corpus data itself, and the indexed CONTENT text,
 * stay verbatim; only the filter value is folded. */
function foldTrait(trait: string): string {
  return trait.toLowerCase();
}

export interface BuildSearchIndexResult {
  pageCount: number;
  outDir: string;
}

/**
 * Build the Pagefind index for every entity in `reader`'s corpus and write
 * it to `outDir`. Pure over its inputs (no config/env reads) — the fixture
 * test calls this directly against a fresh fixture reader + temp dir.
 */
export async function buildSearchIndex(
  reader: CorpusReader,
  outDir: string,
): Promise<BuildSearchIndexResult> {
  const { index, errors } = await pagefind.createIndex();
  if (!index) throw new Error(`pagefind createIndex failed: ${errors.join(", ")}`);

  let indexed = 0;
  for (const category of reader.categories()) {
    for (const row of reader.index(category)) {
      // `row.id` is `"{category}/{slug}"` (optionally `@legacy`-suffixed) —
      // the slug segment (needed for `reader.entity()`) is everything after
      // the first "/"; a real `sluggify()` slug can never itself contain a
      // "/" (D29-23's own traversal guard), so this split is exact.
      const slug = row.id.slice(category.length + 1);
      const entity = reader.entity(category, slug);

      const bodyText = collectText(entity.body);
      const loreText = entity.loreBody !== undefined ? collectText(entity.loreBody) : "";
      // Category-gated per D29-34's "a statsText() for creature/hazard": since
      // S1's gap extractors, hp/size/ac/save facet fields also appear on
      // ancestry/class/vehicle/warfare-army — calling statsText unconditionally
      // would index spurious "HP 8 Size med" fragments on those categories.
      const stats =
        category === "creature" || category === "hazard"
          ? statsText(entity.facets, entity.stats)
          : "";
      const content = [bodyText, loreText, stats].filter((s) => s.length > 0).join("\n\n");

      // meta/filters read off the already-loaded `IndexRow` (`row`), not a
      // second copy off `entity` — `row` already carries every scalar field
      // needed here (name/level/rarity/source/edition/traits/superseded,
      // D29-33c); `entity` is fetched solely for body/loreBody/stats text.
      const meta: Record<string, string> = {
        title: row.name,
        category,
        edition: row.edition,
        book: row.source.book,
      };
      if (row.level !== undefined) meta.level = String(row.level);
      if (row.rarity !== undefined) meta.rarity = row.rarity;

      const filters: Record<string, string[]> = {
        category: [category],
        edition: [row.edition],
        superseded: [String(row.superseded)],
        traits: row.traits.map(foldTrait),
      };
      if (row.level !== undefined) filters.level = [String(row.level)];
      if (row.rarity !== undefined) filters.rarity = [row.rarity];

      // A `content: ""` record is legal but useless (nothing to match on) —
      // fall back to the name so every entity is at least name-searchable
      // (a handful of proseOnly/thin pages have no body paragraph at all).
      const { errors: addErrors } = await index.addCustomRecord({
        url: `/${row.id}`,
        content: content.length > 0 ? content : row.name,
        language: "en",
        meta,
        filters,
      });
      if (addErrors.length > 0) {
        throw new Error(`pagefind addCustomRecord (${row.id}): ${addErrors.join(", ")}`);
      }
      indexed += 1;
    }
  }

  await mkdir(outDir, { recursive: true });
  const { errors: writeErrors } = await index.writeFiles({ outputPath: outDir });
  if (writeErrors.length > 0) {
    throw new Error(`pagefind writeFiles failed: ${writeErrors.join(", ")}`);
  }
  await pagefind.close();
  return { pageCount: indexed, outDir };
}

// ---------------------------------------------------------------------------
// CLI wrapper (the real host run: `just codex-search-index`)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dataPath = loadConfig().codex.dataPath;
  const corpusRoot = path.join(dataPath, "corpus");
  const outDir = path.join(dataPath, "search", "pagefind");
  const reader = createCorpusReader(corpusRoot);

  console.log(`build-search: reading corpus from ${corpusRoot}`);
  const started = Date.now();
  const result = await buildSearchIndex(reader, outDir);
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`build-search: indexed ${result.pageCount} pages -> ${result.outDir} (${elapsedS}s)`);
}

if (import.meta.main) {
  await main().catch((e: unknown) => {
    console.error(`build-search failed: ${String(e)}`);
    process.exit(1);
  });
}
