// Pagefind search index (slice 8, N1). Runs AFTER `vite build` (so dist/client
// exists and the generated modules are present): builds the full `/pagefind/` bundle
// from in-memory rendered HTML via Pagefind's NodeJS Indexing API and writes it into
// dist/client/pagefind, where the SSR server static-serves it. No prerendered static
// HTML to index (Decision I) — we feed addHTMLFile({url, content}) per page.
//
// Build-time only (the `build` script); never the typecheck/test lanes, so the
// pagefind binary + the ~115 MB of transcript HTML never load under vitest.

import path from "node:path";
import { fileURLToPath } from "node:url";

import * as pagefind from "pagefind";

import { searchDoc, searchUrl } from "../src/domain/lib/searchDoc";
import { BODIES } from "../src/generated/bodies";
import { PAGES } from "../src/generated/site";
import { TRANSCRIPT_BODIES } from "../src/generated/transcripts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../dist/client/pagefind");

/** A page's rendered body: wiki bodies are in BODIES, transcript bodies are the
 *  code-split lazy chunks (slice 7). */
async function bodyFor(slug: string): Promise<string> {
  const baked = BODIES[slug];
  if (baked) return baked.html;
  const load = TRANSCRIPT_BODIES[slug];
  if (load) return (await load()).default;
  return "";
}

export async function main(): Promise<void> {
  const { index, errors } = await pagefind.createIndex();
  if (!index) throw new Error(`pagefind createIndex failed: ${errors.join(", ")}`);

  let indexed = 0;
  for (const page of PAGES) {
    const body = await bodyFor(page.slug);
    if (!body) continue;
    const { errors: addErrors } = await index.addHTMLFile({
      url: searchUrl(page.slug),
      content: searchDoc(page.title, body),
    });
    if (addErrors.length)
      throw new Error(`pagefind addHTMLFile (${page.slug}): ${addErrors.join(", ")}`);
    indexed += 1;
  }

  const { errors: writeErrors } = await index.writeFiles({ outputPath: OUT_DIR });
  if (writeErrors.length) throw new Error(`pagefind writeFiles failed: ${writeErrors.join(", ")}`);
  await pagefind.close();
  console.log(`  pagefind: indexed ${indexed} pages → ${OUT_DIR}`);
}

if (import.meta.main) await main();
