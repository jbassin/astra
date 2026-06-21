/**
 * Build-time static endpoints — ports faerrin aether's `pages/index.xml.ts`,
 * `pages/sitemap.xml.ts`, and `pages/static/contentIndex.json.ts` (N2). Astro
 * generated these as SSG endpoints; under astra's SSR (Decision I) there are no
 * file server routes (the pinned react-start has none), so build-content emits
 * them as static files into the client output dir at the exact faerrin paths
 * (`/index.xml`, `/sitemap.xml`, `/static/contentIndex.json`); the Bun server
 * static-serves them.
 *
 * Pure (no fs) so they're unit-testable; build-content supplies the body-text
 * provider (RSS descriptions read the raw `.vellum` corpus).
 */
import type { SiteData, SiteDoc } from "./site";
import { simplifySlug } from "./slug";

/** Site-level constants the emitters need (baked from config.kdl at build). */
export interface SiteMeta {
  title: string;
  /** absolute base URL incl. scheme, no trailing slash (config publicOrigin) */
  baseUrl: string;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Strip a markdown/vellum body to a flat ≤150-char description (ports faerrin's
 * `desc()`): drop frontmatter, strip markdown punctuation, collapse whitespace.
 */
export function stripToText(body: string): string {
  return body
    .replace(/^---[\s\S]*?---/, "")
    .replace(/[#>*_`[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/** RSS items are the content pages, newest first, then alphabetical (faerrin order). */
function rssSorted(docs: SiteDoc[]): SiteDoc[] {
  return [...docs].sort((a, b) => {
    if (a.date && b.date) return b.date.getTime() - a.date.getTime();
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * `/index.xml` — ports ContentIndex.generateRSSFeed (rssLimit 10, rssFullHtml
 * false). `bodyOf` returns a page's raw body for the description snippet.
 */
export function renderRss(
  site: SiteData,
  meta: SiteMeta,
  bodyOf: (doc: SiteDoc) => string,
): string {
  const limit = 10;
  const items = rssSorted(site.docs)
    .slice(0, limit)
    .map((d) => {
      const url = `${meta.baseUrl}/${encodeURI(simplifySlug(d.slug))}`;
      const date = d.date ?? new Date(0);
      return `<item>
    <title>${escapeXml(d.title)}</title>
    <link>${url}</link>
    <guid>${url}</guid>
    <description><![CDATA[ ${stripToText(bodyOf(d))} ]]></description>
    <pubDate>${date.toUTCString()}</pubDate>
  </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
    <channel>
      <title>${escapeXml(meta.title)}</title>
      <link>${meta.baseUrl}</link>
      <description>Last ${limit} notes on ${escapeXml(meta.title)}</description>
      <generator>Quartz -- quartz.jzhao.xyz</generator>
      ${items}
    </channel>
  </rss>`;
}

/** `/sitemap.xml` — ports ContentIndex.generateSiteMap over the content pages. */
export function renderSitemap(site: SiteData, meta: SiteMeta): string {
  const urls = site.docs
    .map((d) => {
      const loc = `${meta.baseUrl}/${encodeURI(simplifySlug(d.slug))}`;
      const lastmod = d.date ? `<lastmod>${d.date.toISOString()}</lastmod>` : "";
      return `<url>
    <loc>${loc}</loc>
    ${lastmod}
  </url>`;
    })
    .join("");
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}

/** One content-graph entry — the `{title, links, tags}` subset the Graph fetches. */
export interface ContentIndexEntry {
  title: string;
  links: string[];
  tags: string[];
}

/**
 * `/static/contentIndex.json` — the slim link-graph the Graph island fetches
 * (ports contentIndex.json.ts): the `{title, links, tags}` subset keyed by
 * FullSlug, NOT the full-text blob. The links are the snapshot's parity-gated
 * edges (N6), so the graph data is parity-guaranteed.
 */
export function buildContentIndex(site: SiteData): Record<string, ContentIndexEntry> {
  const index: Record<string, ContentIndexEntry> = {};
  for (const d of site.docs) {
    index[d.slug] = { title: d.title, links: d.links, tags: d.tags };
  }
  return index;
}
