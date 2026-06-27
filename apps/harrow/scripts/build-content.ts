// Pre-build content pipeline. Emits the generated modules the runtime imports
// (@/generated/*), so the .card/.spread parsing + fs never reach the client bundle
// (the strider/akasha template). contentWatchPlugin runs this at vite buildStart +
// re-runs on content edits in dev.
//
// SLICE 1: emits only the static site metadata (src/generated/site.ts). Slice 2 adds
// the real .card/.spread parsers (→ src/generated/{cards,spreads}.ts) as further
// content sources; this file is the seam they plug into.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");

// astra's brand for the tarot surface (the source app's deployed page title is
// "Harrow"). Not a parity gate.
const SITE_TITLE = "Harrow";
const SITE_DESCRIPTION = "Draw a custom tarot reading and read your fortune.";

const siteSource = defineContentSource({
  name: "site",
  build() {
    const body = [
      "/** Static site metadata for harrow's masthead + document head. */",
      `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "site.ts", body);
    return `site: ${SITE_TITLE}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
