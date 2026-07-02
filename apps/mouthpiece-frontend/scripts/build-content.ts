// Pre-build content pipeline. Emits the generated modules the runtime imports
// (@/generated/*), so fs/JSON-parsing never reach the client bundle (the strider/
// akasha template). contentWatchPlugin runs this at vite buildStart + re-runs on
// edits in dev.
//
// Reads ONE committed build artifact — mouthpiece-backend's `episodes-index.json`
// (the akasha-snapshot pattern: deterministic, no live backend at build). The
// backend owns all the shaping (sort, arc titles, episode numbers, ffprobe
// duration, the stripped + name-resolved transcript — D1/D4/D5/D6); the frontend is
// a pure consumer and ports no helpers. Emits:
//   - src/generated/episodes.ts    — the lean catalog (grid + episode header);
//   - src/generated/transcripts.ts — id → transcript lines (episode page only, so
//     the ~440 KB of transcripts code-splits out of the grid bundle);
//   - public/episodes.json         — the date→{link,title} deep-link map (D7), the
//     wiki/Discord contract; vite copies public/ into dist/client.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, defineContentSource, emitModule } from "@astra/content-build";
import { loadSiteConfig } from "@astra/site-kit";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");
const PUBLIC_DIR = path.resolve(HERE, "../public");
const SNAPSHOT = path.resolve(HERE, "../../mouthpiece-backend/snapshot/episodes-index.json");

// astra's brand for the podcast surface (faerrin shipped "Caster"; the rebuild is
// "Mouthpiece"). Not a parity gate.
const SITE_TITLE = "Mouthpiece";
const SITE_DESCRIPTION = "The Færrin podcast";

interface ManifestHost {
  name: string;
  persona: string;
}
interface ManifestLine {
  speaker: string;
  name: string;
  text: string;
}
interface ManifestEpisode {
  id: string;
  arcNo: number;
  arcSlug: string;
  arcTitle: string;
  episodeNo: number;
  isMain: boolean;
  date: string;
  dateSortKey: number;
  title: string;
  episodeTitle: string;
  hosts: Record<string, ManifestHost>;
  synopsis: string;
  durationMs: number;
  hasAudio: boolean;
  hasTranscript: boolean;
  audioVersion: string;
  transcript: ManifestLine[];
}
interface Manifest {
  episodes: ManifestEpisode[];
}

/** Same-origin audio URL with face's `?v=` cache-bust (D2 — served off the mounted
 *  volume at /audio/<id>.mp3; the 173 MB never enters the bundle or the image). */
function mp3Url(id: string, audioVersion: string): string {
  const base = `/audio/${id}.mp3`;
  return audioVersion ? `${base}?v=${audioVersion}` : base;
}

/** The lean catalog module (grid + episode header) — transcript split out. */
function emitEpisodes(episodes: ManifestEpisode[]): string {
  const catalog = episodes.map(({ transcript: _t, ...rest }) => ({
    ...rest,
    mp3Url: mp3Url(rest.id, rest.audioVersion),
  }));
  const body = [
    "/** The episode catalog, read from mouthpiece-backend's episodes-index.json (D1).",
    " *  Sorted arc-then-date with recaps as arc capstones; the backend owns all the",
    " *  shaping. Transcript lines live in ./transcripts (split out of the grid bundle). */",
    "export interface GeneratedHost {",
    "  name: string;",
    "  persona: string;",
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
    "  dateSortKey: number;",
    "  title: string;",
    "  episodeTitle: string;",
    "  hosts: Record<string, GeneratedHost>;",
    "  synopsis: string;",
    "  durationMs: number;",
    "  hasAudio: boolean;",
    "  hasTranscript: boolean;",
    "  audioVersion: string;",
    "  /** Same-origin audio URL with a content cache-bust (D2). */",
    "  mp3Url: string;",
    "}",
    "",
    `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
    `export const EPISODES: GeneratedEpisode[] = ${JSON.stringify(catalog, null, 2)};`,
    "",
  ].join("\n");
  emitModule(OUT_DIR, "episodes.ts", body);
  return `episodes: ${catalog.length}`;
}

/** id → transcript lines (the episode page imports this; ~440 KB stays out of grid). */
function emitTranscripts(episodes: ManifestEpisode[]): string {
  const byId: Record<string, ManifestLine[]> = {};
  for (const e of episodes) byId[e.id] = e.transcript;
  const body = [
    "/** Episode transcripts (speaker-attributed, audio-tags stripped, host names",
    " *  resolved — all by the backend, D4), keyed by episode id. Imported only by the",
    " *  episode route so the grid bundle stays lean. */",
    "export interface GeneratedTranscriptLine {",
    "  speaker: string;",
    "  name: string;",
    "  text: string;",
    "}",
    "",
    `export const TRANSCRIPTS: Record<string, GeneratedTranscriptLine[]> = ${JSON.stringify(byId)};`,
    "",
  ].join("\n");
  emitModule(OUT_DIR, "transcripts.ts", body);
  return `transcripts: ${Object.keys(byId).length}`;
}

/** The /episodes.json deep-link map (D7) — date→{link,title} against public-origin,
 *  the wiki/Discord cross-system contract (faerrin face/src/pages/episodes.json.ts).
 *  Distinct from the build-INPUT episodes-index.json. */
function emitDeepLinks(episodes: ManifestEpisode[], baseUrl: string): string {
  const map: Record<string, { link: string; title: string }> = {};
  for (const e of episodes) {
    map[e.date] = { link: `${baseUrl}/episode/${e.id}`, title: e.episodeTitle };
  }
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, "episodes.json"), JSON.stringify(map));
  return `episodes.json: ${Object.keys(map).length} deep-links @ ${baseUrl}`;
}

const episodesSource = defineContentSource({
  name: "episodes",
  build() {
    const manifest = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as Manifest;
    const episodes = manifest.episodes;
    // Node-safe config locator (works under bun-run, vite, and vitest).
    const baseUrl = loadSiteConfig().mouthpieceFrontend.publicOrigin.replace(/\/$/, "");
    const catalogSummary = emitEpisodes(episodes);
    const transcriptSummary = emitTranscripts(episodes);
    const deepLinkSummary = emitDeepLinks(episodes, baseUrl);
    return `${catalogSummary}\n  ${transcriptSummary}\n  ${deepLinkSummary}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [episodesSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
