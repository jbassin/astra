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
  type SiteData,
  type SiteDoc,
} from "../src/domain/lib/site";
import { loadSnapshot, type Snapshot } from "../src/domain/lib/snapshot";
import {
  buildContentIndex,
  renderRss,
  renderSitemap,
  type SiteMeta,
} from "../src/domain/lib/staticEmit";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");
const PUBLIC_DIR = path.resolve(HERE, "../public");
const SNAPSHOT = path.resolve(HERE, "../../akasha-backend/snapshot/akasha-snapshot.json");
const CORPUS_DIR = path.resolve(HERE, "../../akasha-backend/content");

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
function emitBodies(site: SiteData, snapshot: Snapshot): string {
  const resolvers = buildResolvers(snapshot);
  const noResolver: CrossRefResolver = () => null;
  const bodies: Record<string, { html: string; minutes: number }> = {};
  for (const d of site.docs) {
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

const siteSource = defineContentSource({
  name: "site",
  build() {
    const snapshot = loadSnapshot(SNAPSHOT);
    const site = buildSite(snapshot);
    // Node-safe config locator (works under bun-run, vite, and vitest — unlike
    // @astra/config's Bun-only default path resolution).
    const baseUrl = loadSiteConfig().akashaFrontend.publicOrigin.replace(/\/$/, "");
    const meta: SiteMeta = { title: SITE_TITLE, baseUrl };
    const moduleSummary = emitGeneratedModule(site);
    const bodiesSummary = emitBodies(site, snapshot);
    const staticSummary = emitStatic(site, meta);
    return `${moduleSummary}\n  ${bodiesSummary}\n  ${staticSummary}`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
