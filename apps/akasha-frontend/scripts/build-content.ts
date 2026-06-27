// Pre-build content pipeline (slices 2–4 — the akasha snapshot → generated modules
// + static endpoints).
//
// Reads the committed akasha-backend snapshot, lifts faerrin's slug.ts/site.ts to
// derive the URL slugs + the page graph (backlinks/folders/tags/Explorer/aliases),
// and emits:
//   - src/generated/site.ts — the page index (the runtime imports it, never the
//     snapshot/fs — so the production bundle has no build-time data dependency);
//   - src/generated/bodies.ts — each page's vellum body rendered through gothic
//     (DocumentView + the N3 resolveCrossref seam) to static HTML (slice 4);
//   - the static endpoints into public/ (RSS index.xml, sitemap.xml,
//     static/contentIndex.json) at the exact faerrin paths (N2) — vite copies
//     public/ into dist/client, where the Bun server static-serves them.
//
// Transcript pages + Pagefind land in later slices.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";
import type { CrossRefResolver } from "@astra/gothic";
import { type Being, loadBeing } from "@astra/ontology";
import { loadSiteConfig } from "@astra/site-kit";
import { buildResolvers } from "../src/domain/lib/crossref";
import { readingMinutes, renderBody } from "../src/domain/lib/renderBody";
import {
  type AliasRedirect,
  allFolders,
  allTags,
  buildAliases,
  buildExplorerTree,
  buildSite,
  indexDocs,
  type SiteData,
  type SiteDoc,
} from "../src/domain/lib/site";
import { simplifySlug } from "../src/domain/lib/slug";
import { loadSnapshot, type Snapshot } from "../src/domain/lib/snapshot";
import {
  buildContentIndex,
  renderRss,
  renderSitemap,
  type SiteMeta,
} from "../src/domain/lib/staticEmit";
import { buildTranscripts } from "../src/domain/lib/transcriptBuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");
const PUBLIC_DIR = path.resolve(HERE, "../public");
const SNAPSHOT = path.resolve(HERE, "../../akasha-backend/snapshot/akasha-snapshot.json");
const CORPUS_DIR = path.resolve(HERE, "../../akasha-backend/content");
const DATA_DIR = path.resolve(HERE, "../../linguist/data");
const TIMELINE_DIR = path.resolve(HERE, "../../linguist/timeline");
// Explicit being.kdl path: loadBeing()'s default uses Bun's import.meta.dir (undefined
// under vitest, which runs build-content.test.ts); import.meta.url works in both.
const BEING = path.resolve(HERE, "../../../ontology/ontology-being/being.kdl");

// astra's brand for the wiki (faerrin shipped "Heart of Hearts"; the rebuild is
// "Akasha" — matches __root.tsx + the slice-2 SITE const). Not a parity gate.
const SITE_TITLE = "Akasha";
const SITE_DESCRIPTION = "The Færrin wiki";

/** Serializable page record (Date → ISO string) the runtime imports + reconstructs. */
interface GeneratedPage {
  rel: string;
  slug: string;
  simple: string;
  title: string;
  tags: string[];
  aliases: string[];
  img?: string;
  links: string[];
  date?: string;
}

const toGenerated = (d: SiteDoc): GeneratedPage => ({
  rel: d.rel,
  slug: d.slug,
  simple: d.simple,
  title: d.title,
  tags: d.tags,
  aliases: d.aliases,
  ...(d.img ? { img: d.img } : {}),
  links: d.links,
  ...(d.date ? { date: d.date.toISOString() } : {}),
});

const toGeneratedAlias = (a: AliasRedirect) => ({
  slug: a.slug,
  redirUrl: a.redirUrl,
  ogSlug: a.ogSlug,
});

/** Read a page's raw `.vellum` body (for the RSS description snippet); "" if absent. */
function bodyOf(doc: SiteDoc): string {
  const file = path.join(CORPUS_DIR, `${doc.rel.replace(/\.md$/, "")}.vellum`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** The generated runtime module (slugs/backlinks/folders/tags/Explorer/aliases). */
function emitGeneratedModule(site: SiteData): string {
  const pages = site.docs.map(toGenerated);
  const tree = buildExplorerTree(site);
  const tags = allTags(site);
  const folders = allFolders(site);
  const aliases = buildAliases(site).map(toGeneratedAlias);

  const body = [
    "/** The akasha wiki index — slugs/backlinks/folders/tags/Explorer/aliases derived",
    " *  from the akasha-backend snapshot via the lifted slug.ts/site.ts (0011). The",
    " *  runtime reconstructs a queryable SiteData from PAGES (see runtimeSite.ts). */",
    "",
    "export interface GeneratedPage {",
    "  rel: string;",
    "  slug: string;",
    "  simple: string;",
    "  title: string;",
    "  tags: string[];",
    "  aliases: string[];",
    "  img?: string;",
    "  links: string[];",
    "  date?: string;",
    "}",
    "",
    "export interface TreeNode {",
    "  slug: string;",
    "  displayName: string;",
    "  isFolder: boolean;",
    "  children: TreeNode[];",
    "}",
    "",
    "export interface AliasRedirect {",
    "  slug: string;",
    "  redirUrl: string;",
    "  ogSlug: string;",
    "}",
    "",
    `export const SITE = { title: ${JSON.stringify(SITE_TITLE)}, description: ${JSON.stringify(SITE_DESCRIPTION)} } as const;`,
    `export const PAGES: GeneratedPage[] = ${JSON.stringify(pages, null, 2)};`,
    `export const EXPLORER_TREE: TreeNode[] = ${JSON.stringify(tree, null, 2)};`,
    `export const ALL_TAGS: string[] = ${JSON.stringify(tags)};`,
    `export const ALL_FOLDERS: string[] = ${JSON.stringify(folders)};`,
    `export const ALIASES: AliasRedirect[] = ${JSON.stringify(aliases, null, 2)};`,
    "",
  ].join("\n");
  emitModule(OUT_DIR, "site.ts", body);
  return `site: ${pages.length} pages, ${folders.length} folders, ${tags.length} tags, ${aliases.length} aliases`;
}

/**
 * Render every page's `.vellum` body through gothic (DocumentView + the N3
 * resolveCrossref seam) to a static HTML string, baked by FullSlug. The route
 * injects it (dangerouslySetInnerHTML) — build-only render keeps react-dom/server +
 * gothic's renderer + vellum-lang out of the client bundle. Covers content pages AND
 * folder-index pages (a folder's own body renders above its listing).
 */
function emitBodies(site: SiteData, snapshot: Snapshot, skip: Set<string>): string {
  const resolvers = buildResolvers(snapshot);
  const noResolver: CrossRefResolver = () => null;
  const bodies: Record<string, { html: string; minutes: number }> = {};
  for (const d of site.docs) {
    // Transcript pages are code-split + server-loaded (emitTranscriptBodies), NOT
    // baked here — 76 × ~1 MB would blow up the BODIES bundle (+ client/SSR builds).
    if (skip.has(d.slug)) continue;
    const src = bodyOf(d);
    const pagePath = d.rel.replace(/\.md$/, "");
    bodies[d.slug] = {
      html: renderBody(src, resolvers.get(pagePath) ?? noResolver),
      minutes: readingMinutes(src),
    };
  }
  emitModule(
    OUT_DIR,
    "bodies.ts",
    [
      "/** Build-rendered vellum bodies (gothic DocumentView + resolved crossref hrefs,",
      " *  N3) keyed by FullSlug — injected into the page via dangerouslySetInnerHTML. */",
      "export interface RenderedBody {",
      "  html: string;",
      "  minutes: number;",
      "}",
      `export const BODIES: Record<string, RenderedBody> = ${JSON.stringify(bodies)};`,
      "",
    ].join("\n"),
  );
  return `bodies: ${Object.keys(bodies).length} rendered`;
}

/**
 * Emit transcript bodies code-split: one lazy module per session under
 * `generated/transcripts/<i>.ts` (each ~1 MB), plus an index module of dynamic-import
 * thunks (`TRANSCRIPT_BODIES`) + a small minutes map (`TRANSCRIPT_MINUTES`). The
 * transcriptBody server fn imports the thunks (server-only), so the heavy HTML never
 * enters the main or client bundle. Returns the count.
 */
function emitTranscriptBodies(bodies: Record<string, { html: string; minutes: number }>): string {
  const dir = path.join(OUT_DIR, "transcripts");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const entries = Object.entries(bodies);
  const thunks: string[] = [];
  const minutes: Record<string, number> = {};
  entries.forEach(([slug, body], i) => {
    fs.writeFileSync(
      path.join(dir, `${i}.ts`),
      `// AUTO-GENERATED by @astra/content-build. Do not edit.\nexport default ${JSON.stringify(body.html)};\n`,
    );
    thunks.push(`  ${JSON.stringify(slug)}: () => import("./transcripts/${i}"),`);
    minutes[slug] = body.minutes;
  });

  emitModule(
    OUT_DIR,
    "transcripts.ts",
    [
      "/** Transcript bodies, code-split one lazy module per session (each ~1 MB) so the",
      " *  ~115 MB of HTML never enters the main bundle. transcriptBodyFn imports these",
      " *  server-side; the route loader injects the body at SSR (slice 7). */",
      "export const TRANSCRIPT_BODIES: Record<string, () => Promise<{ default: string }>> = {",
      ...thunks,
      "};",
      `export const TRANSCRIPT_MINUTES: Record<string, number> = ${JSON.stringify(minutes)};`,
      "",
    ].join("\n"),
  );
  return `transcripts: ${entries.length} bodies code-split`;
}

/**
 * Emit the speaker-color module (I5): `--text<Name>` CSS vars + the per-speaker
 * `.transcript-name`/`.tp-chip`/`hide-` rules from ontology-being. faerrin keyed
 * these off a hardcoded SCSS `$speakers` list + `theme.scss` vars; astra derives
 * them from being.kdl (the single source of truth). Injected as a <style> in __root.
 */
function emitSpeakers(being: Being): string {
  const speakers = [
    ...being.players.map((p) => ({ name: p.name, color: p.color })),
    { name: "Guest", color: being.guest_color },
  ];
  const vars = speakers.map((s) => `  --text${s.name}: ${s.color};`).join("\n");
  const rules = speakers
    .map(
      (s) =>
        `.transcript-name.${s.name}{color:var(--text${s.name})}` +
        `.tp-chip.${s.name} .tp-chip-dot{background:var(--text${s.name})}` +
        `.transcript-root.hide-${s.name} .transcript-line.${s.name}{display:none}`,
    )
    .join("\n");
  const css = `:root{\n${vars}\n}\n${rules}\n`;
  emitModule(
    OUT_DIR,
    "speakers.ts",
    [
      "/** Speaker colors + per-speaker transcript rules, derived from ontology-being",
      " *  (I5). Injected as a <style> in __root.tsx. */",
      `export const SPEAKER_CSS = ${JSON.stringify(css)};`,
      "",
    ].join("\n"),
  );
  return `speakers: ${being.players.length} players + guest`;
}

/** Emit the static endpoints into public/ (vite copies them into dist/client). */
function emitStatic(site: SiteData, meta: SiteMeta): string {
  const writePublic = (rel: string, content: string) => {
    const file = path.join(PUBLIC_DIR, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  writePublic("index.xml", renderRss(site, meta, bodyOf));
  writePublic("sitemap.xml", renderSitemap(site, meta));
  writePublic("static/contentIndex.json", JSON.stringify(buildContentIndex(site)));
  return `static: index.xml, sitemap.xml, static/contentIndex.json @ ${meta.baseUrl}`;
}

// ── chronicle (0019): the Show → Season → Episode campaign timeline ──────────
// Reads linguist's committed timeline artifacts (the GLM-5.2 episode summaries +
// season grouping) and emits a single typed module the /chronicle routes import.
// Each episode links to its existing transcript page (by date). Degrades to an empty
// SHOWS list when the artifacts aren't present yet (e.g. a fresh checkout pre-backfill).
interface RawEpisodeSummary {
  title: string;
  synopsis: string;
  key_beats: string[];
  characters_present: string[];
  locations: string[];
  factions: string[];
  items: string[];
  cliffhanger: string;
}
interface RawEpisodeEntry {
  date: string;
  show: string;
  summary: RawEpisodeSummary;
}
interface RawSeason {
  number: number;
  title: string;
  arc_summary: string;
  episode_dates: string[];
}
interface RawShowChronicle {
  show: string;
  name: string;
  is_main: boolean;
  seasons: RawSeason[];
}
interface RawChronicle {
  shows: RawShowChronicle[];
}

const CHRONICLE_TYPES = [
  "export interface ChronicleEpisode {",
  "  date: string;",
  "  episodeNumber: number;",
  "  title: string;",
  "  synopsis: string;",
  "  keyBeats: string[];",
  "  charactersPresent: string[];",
  "  locations: string[];",
  "  factions: string[];",
  "  items: string[];",
  "  cliffhanger: string;",
  "  href: string | null;",
  "}",
  "",
  "export interface ChronicleSeason {",
  "  number: number;",
  "  title: string;",
  "  arcSummary: string;",
  "  episodes: ChronicleEpisode[];",
  "}",
  "",
  "export interface ChronicleShow {",
  "  show: string;",
  "  name: string;",
  "  isMain: boolean;",
  "  seasonCount: number;",
  "  episodeCount: number;",
  "  seasons: ChronicleSeason[];",
  "}",
];

/** Build the /chronicle data module from linguist's timeline artifacts. */
function emitChronicle(hrefByDate: Map<string, string>): string {
  const seasonsPath = path.join(TIMELINE_DIR, "seasons.json");
  const episodesDir = path.join(TIMELINE_DIR, "episodes");

  const chronicle: RawChronicle = fs.existsSync(seasonsPath)
    ? JSON.parse(fs.readFileSync(seasonsPath, "utf8"))
    : { shows: [] };

  const byDate = new Map<string, RawEpisodeEntry>();
  if (fs.existsSync(episodesDir)) {
    for (const f of fs.readdirSync(episodesDir)) {
      if (!f.endsWith(".json")) continue;
      const entry: RawEpisodeEntry = JSON.parse(fs.readFileSync(path.join(episodesDir, f), "utf8"));
      byDate.set(entry.date, entry);
    }
  }

  const shows = chronicle.shows.map((sh) => {
    let episodeCount = 0;
    const seasons = sh.seasons.map((se) => {
      const episodes = se.episode_dates.map((date, i) => {
        const s = byDate.get(date)?.summary;
        episodeCount += 1;
        return {
          date,
          episodeNumber: i + 1,
          title: s?.title ?? date,
          synopsis: s?.synopsis ?? "",
          keyBeats: s?.key_beats ?? [],
          charactersPresent: s?.characters_present ?? [],
          locations: s?.locations ?? [],
          factions: s?.factions ?? [],
          items: s?.items ?? [],
          cliffhanger: s?.cliffhanger ?? "",
          href: hrefByDate.get(date) ?? null,
        };
      });
      return { number: se.number, title: se.title, arcSummary: se.arc_summary, episodes };
    });
    return {
      show: sh.show,
      name: sh.name,
      isMain: sh.is_main,
      seasonCount: sh.seasons.length,
      episodeCount,
      seasons,
    };
  });

  emitModule(
    OUT_DIR,
    "chronicle.ts",
    [
      "/** The campaign chronicle (0019): Show → Season → Episode, structured by GLM-5.2",
      " *  in linguist and read here at build time. Episodes link to transcript pages. */",
      "",
      ...CHRONICLE_TYPES,
      "",
      `export const SHOWS: ChronicleShow[] = ${JSON.stringify(shows, null, 2)};`,
      "",
    ].join("\n"),
  );
  const eps = shows.reduce((n, s) => n + s.episodeCount, 0);
  return `chronicle: ${shows.length} shows, ${eps} episodes`;
}

const siteSource = defineContentSource({
  name: "site",
  build() {
    const snapshot = loadSnapshot(SNAPSHOT);
    const wiki = buildSite(snapshot);
    const being = loadBeing(BEING);
    // Reconstitute transcript pages (D4/N7) and merge them into the same graph as
    // the snapshot pages — routing/edges/backlinks/Explorer/contentIndex all follow.
    const transcripts = buildTranscripts(DATA_DIR, wiki.docs, being);
    const site = indexDocs([...wiki.docs, ...transcripts.docs]);
    const transcriptSlugs = new Set(transcripts.docs.map((d) => d.slug));
    // Node-safe config locator (works under bun-run, vite, and vitest — unlike
    // @astra/config's Bun-only default path resolution).
    const baseUrl = loadSiteConfig().akashaFrontend.publicOrigin.replace(/\/$/, "");
    const meta: SiteMeta = { title: SITE_TITLE, baseUrl };
    // Episode → transcript-page href, keyed by session date (the transcript doc's
    // title IS its date), formed the same way as the static endpoints (N2).
    const hrefByDate = new Map(
      transcripts.docs.map((d) => [d.title, `/${encodeURI(simplifySlug(d.slug))}`]),
    );
    const moduleSummary = emitGeneratedModule(site);
    const bodiesSummary = emitBodies(site, snapshot, transcriptSlugs);
    const transcriptSummary = emitTranscriptBodies(transcripts.bodies);
    const speakersSummary = emitSpeakers(being);
    const staticSummary = emitStatic(site, meta);
    const chronicleSummary = emitChronicle(hrefByDate);
    return `${moduleSummary} (+${transcripts.docs.length} transcripts)\n  ${bodiesSummary}\n  ${transcriptSummary}\n  ${speakersSummary}\n  ${staticSummary}\n  ${chronicleSummary}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
