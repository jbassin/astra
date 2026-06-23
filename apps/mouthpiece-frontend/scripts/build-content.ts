// Pre-build content pipeline. Emits the generated modules the runtime imports
// (@/generated/*), so fs/parsers never reach the client bundle (the strider/akasha
// template). contentWatchPlugin runs this at vite buildStart + re-runs on edits.
//
// Slice 2 (scaffold): a PLACEHOLDER episode catalog — an empty typed module so the
// route loaders + typecheck + the SSR skeleton have a stable shape to import. Slice 3
// replaces `build()` with the real reader of the backend `episodes-index.json` (D1) +
// each session's `script.json` turns (D4), porting `stripAudioTags`/`stripCampaignPrefix`.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");

// astra's brand for the podcast surface (faerrin shipped "Caster"; the rebuild is
// "Mouthpiece"). Not a parity gate.
const SITE_TITLE = "Mouthpiece";
const SITE_DESCRIPTION = "The Færrin podcast";

const episodesSource = defineContentSource({
  name: "episodes",
  build() {
    const body = [
      "/** The episode catalog (placeholder — slice 2). Slice 3 reads the backend",
      " *  episodes-index.json + per-session script.json into this shape. */",
      "export interface GeneratedHost {",
      "  name: string;",
      "  persona: string;",
      "}",
      "",
      "export interface GeneratedTranscriptLine {",
      "  speaker: string;",
      "  name: string;",
      "  text: string;",
      "}",
      "",
      "export interface GeneratedEpisode {",
      "  id: string;",
      "  arcNo: number;",
      "  arcSlug: string;",
      "  arcTitle: string;",
      "  episodeNo: number;",
      "  isMain: boolean;",
      "  date: string;",
      "  title: string;",
      "  episodeTitle: string;",
      "  hosts: Record<string, GeneratedHost>;",
      "  synopsis: string;",
      "  durationMs: number;",
      "  mp3Url: string;",
      "  transcript: GeneratedTranscriptLine[];",
      "}",
      "",
      `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
      "export const EPISODES: GeneratedEpisode[] = [];",
      "",
    ].join("\n");
    emitModule(OUT_DIR, "episodes.ts", body);
    return "episodes: 0 (placeholder)";
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [episodesSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
