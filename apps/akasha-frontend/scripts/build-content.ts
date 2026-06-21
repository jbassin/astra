// Pre-build content pipeline (slice 1 — placeholder).
//
// Emits typed TS modules under src/generated/ that the runtime app imports — never
// the filesystem — so the production bundle has no fs/remark/gray-matter dependency.
// Slice 2+ replaces this placeholder with the real sources: the akasha snapshot
// (slug.ts/site.ts lift), the vellum corpus, and linguist transcripts.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");

// Placeholder site-meta source. Proves the @astra/content-build pipeline is wired
// (defineContentSource → emitModule → src/generated) before the real snapshot
// sources land in slice 2.
const siteSource = defineContentSource({
  name: "site",
  build() {
    const body = [
      "/** The akasha wiki read-surface (0011). Slice 1 placeholder site meta. */",
      "export const SITE = {",
      '  title: "Akasha",',
      '  description: "The Færrin wiki",',
      "} as const;",
      "",
    ].join("\n");
    emitModule(OUT_DIR, "site.ts", body);
    return "site: 1 module (placeholder)";
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
