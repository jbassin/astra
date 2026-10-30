/**
 * Runtime site index — the server-side view layer over the generated module.
 *
 * The generated `src/generated/site.ts` bakes the snapshot-derived PAGES (+ aliases,
 * Explorer tree, tag/folder lists). Here we reconstruct a queryable {@link SiteData}
 * from PAGES (reusing site.ts's `indexDocs`, so the backlink/lookup semantics are the
 * SAME ones the build used) and expose serializable *view models* that the route
 * loaders return. Components stay dumb: every href is pre-resolved here via the lifted
 * `resolveRelative`, and dates are ISO strings (formatted deterministically in the UI).
 *
 * Only `pageData.ts` imports this module, and only the page-data server functions reach
 * that, so PAGES and BODIES stay in the server build. Components import its types alone.
 */
import { BODIES } from "@/generated/bodies";
import { SHOWS } from "@/generated/chronicle";
import { ALIASES, type GeneratedPage, PAGES } from "@/generated/site";
import { TRANSCRIPT_MINUTES } from "@/generated/transcripts";

import type { ChronicleEpisode, ChronicleShow } from "./chronicleTypes";
import type { TocEntry } from "./renderBody";
import { type SectionId, sectionOf } from "./sections";
import {
  allFolders,
  allTags,
  backlinksFor,
  breadcrumbsFor,
  type Crumb,
  folderTitle,
  indexDocs,
  listFolderChildren,
  type PageEntry,
  pagesWithTag,
  type SiteData,
  type SiteDoc,
} from "./site";
import { type FullSlug, resolveRelative, type SimpleSlug, simplifySlug } from "./slug";

// ── reconstruct the queryable index from the generated pages ──────────────────────
function reconstruct(pages: GeneratedPage[]): SiteData {
  const docs: SiteDoc[] = pages.map((p) => ({
    rel: p.rel,
    slug: p.slug as FullSlug,
    simple: p.simple as SimpleSlug,
    title: p.title,
    tags: p.tags,
    aliases: p.aliases,
    img: p.img,
    links: p.links as SimpleSlug[],
    date: p.date ? new Date(p.date) : undefined,
  }));
  return indexDocs(docs);
}

const SITE_DATA = reconstruct(PAGES);
const FOLDER_SET = new Set(allFolders(SITE_DATA));
const ALIAS_BY_SLUG = new Map(ALIASES.map((a) => [a.slug, a]));

// ── serializable view models (what loaders return) ────────────────────────────────
export interface LinkView {
  label: string;
  href: string;
}

export interface PageEntryView {
  title: string;
  href: string;
  tags: LinkView[];
  date?: string;
  isFolder: boolean;
}

/** A link to a page, with the page's section for its hue dot. */
export interface PageLinkView extends LinkView {
  section: SectionId | null;
}

/** One session whose transcript links to the page. */
export interface SessionLinkView {
  href: string;
  /** "17 Feb 2026" */
  date: string;
  /** The chronicle's episode title, when the chronicle has the session. */
  title: string | null;
  /** The show's name, for a session outside the main campaign. */
  show: string | null;
}

/** The right rail's "Sessions" block: which sessions' transcripts link to the page. */
export interface SessionsView {
  /** The main campaign strip: one tick per chronicle episode in order; null without one. */
  strip: {
    show: string;
    /** One per episode, by session date; `hit` where its transcript links to the page. */
    ticks: { date: string; hit: boolean }[];
    hits: number;
    /** "Aug 2025", "Oct 2026" */
    start: string;
    end: string;
  } | null;
  /** Every linking session, oldest first, other campaigns included. */
  sessions: SessionLinkView[];
}

/** What the wiki page's right rail shows (WikiRail), for content pages and folder pages. */
interface PageRail {
  /** Wiki pages that link here, by title ("Mentioned on"). Transcripts are in `sessions`. */
  backlinks: PageLinkView[];
  /** Transcripts that link here; null when none do. */
  sessions: SessionsView | null;
  /** The body's headings and block titles ("On this page"). */
  toc: TocEntry[];
}

export interface ContentView extends PageRail {
  slug: string;
  title: string;
  tags: LinkView[];
  img?: string;
  /** the page's baked committer date (ISO), if any */
  date?: string;
  /** approximate reading time (minutes); no longer shown on wiki pages */
  readingMinutes: number;
  /** build-rendered vellum body HTML (gothic + resolved crossrefs, N3). For a
   *  transcript this is "" from contentView — `wikiPageData` (pageData.ts) fills in
   *  the much larger code-split body (see `transcript`). */
  bodyHtml: string;
  /** true for a reconstituted transcript page (Script/<campaign>/<date>) — its body
   *  is code-split + server-loaded, not baked into the BODIES bundle. */
  transcript: boolean;
  showBreadcrumbs: boolean;
  crumbs: Crumb[];
}

export interface FolderView extends PageRail {
  slug: string;
  folder: string;
  title: string;
  crumbs: Crumb[];
  /** the folder index's own vellum body HTML (empty if the folder has no index page) */
  bodyHtml: string;
  /** the folder index's tags and date, for the facts row (none without an index page) */
  tags: LinkView[];
  date?: string;
  itemsLabel: string;
  entries: PageEntryView[];
}

export interface TagView {
  slug: string;
  title: string;
  itemsLabel: string;
  entries: PageEntryView[];
}

export interface TagIndexView {
  slug: string;
  title: string;
  totalLabel: string;
  sections: { tag: string; href: string; entries: PageEntryView[]; overflow: number }[];
}

// ── href helpers (Quartz resolveRelative, relative to the current page's slug) ─────
const tagsLink = (current: FullSlug, tag: string): LinkView => ({
  label: tag,
  href: resolveRelative(current, `tags/${tag}` as SimpleSlug),
});

function entryView(current: FullSlug, e: PageEntry): PageEntryView {
  return {
    title: e.title,
    href: resolveRelative(current, e.slug),
    tags: e.tags.map((t) => tagsLink(current, t)),
    date: e.date?.toISOString(),
    isFolder: e.isFolder,
  };
}

// ── resolver: URL path → page kind ────────────────────────────────────────────────
type Resolved =
  | { kind: "content"; slug: FullSlug }
  | { kind: "folder"; folder: string }
  | { kind: "alias"; redirUrl: string; ogSlug: string };

/**
 * Map a request path to a page (mirrors faerrin's catch-all `[...slug].astro`):
 * content page, folder listing (`Foo` or `Foo/index`, both served by the folder
 * page — Astro's `format:"file"` emits `Foo/index.html`), or an alias redirect.
 * Returns null for an unknown path (→ 404).
 */
export function resolvePath(rawPath: string): Resolved | null {
  let norm: string;
  try {
    norm = decodeURIComponent(rawPath);
  } catch {
    norm = rawPath;
  }
  norm = norm.replaceAll(/^\/+|\/+$/g, "");
  const slug = norm === "" ? "index" : norm;

  // content page (the root index, or any non-folder-index page)
  const doc = SITE_DATA.bySlug.get(slug as FullSlug);
  if (doc && (slug === "index" || !slug.endsWith("/index"))) {
    return { kind: "content", slug: slug as FullSlug };
  }
  // folder listing — reached as `Foo` …
  if (FOLDER_SET.has(slug)) return { kind: "folder", folder: slug };
  // … or directly as `Foo/index`
  if (slug.endsWith("/index")) {
    const folder = slug.slice(0, -"/index".length);
    if (FOLDER_SET.has(folder)) return { kind: "folder", folder };
  }
  // alias redirect stub
  const alias = ALIAS_BY_SLUG.get(slug);
  if (alias) return { kind: "alias", redirUrl: alias.redirUrl, ogSlug: alias.ogSlug };

  return null;
}

// ── the "Sessions" rail block ───────────────────────────────────────────────────
const isTranscriptSlug = (s: string): boolean => TRANSCRIPT_MINUTES[s] !== undefined;

/** A transcript page's URL path, formed as build-content forms the chronicle's `href`. */
const transcriptHref = (s: FullSlug): string => `/${encodeURI(simplifySlug(s))}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A session date ("2026-2-17", unpadded) as "Feb 2026" or "17 Feb 2026". */
function sessionDate(date: string, withDay: boolean): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const month = `${MONTHS[m - 1] ?? ""} ${y}`;
  return withDay ? `${d} ${month}` : month;
}

/**
 * The "Sessions" block for page `slug`, from the transcripts that link to it: a strip of the
 * main campaign's episodes (from the chronicle `shows`) and the list of every linking
 * session, oldest first. Null when no transcript links to the page.
 */
export function sessionsView(
  slug: FullSlug,
  transcripts: SiteDoc[],
  shows: ChronicleShow[] = SHOWS,
): SessionsView | null {
  if (transcripts.length === 0) return null;
  const main = shows.find((s) => s.isMain);
  const episodes: ChronicleEpisode[] = main?.seasons.flatMap((s) => s.episodes) ?? [];
  const byHref = new Map(
    shows.flatMap((show) =>
      show.seasons.flatMap((season) =>
        season.episodes.flatMap((episode) =>
          episode.href ? [[episode.href, { show, episode }] as const] : [],
        ),
      ),
    ),
  );
  const linked = new Set(transcripts.map((t) => transcriptHref(t.slug)));
  const ticks = episodes.map((e) => ({ date: e.date, hit: e.href !== null && linked.has(e.href) }));
  const first = episodes[0];
  const last = episodes.at(-1);
  const strip =
    main && first && last
      ? {
          show: main.name,
          ticks,
          hits: ticks.filter((t) => t.hit).length,
          start: sessionDate(first.date, false),
          end: sessionDate(last.date, false),
        }
      : null;
  const sessions = transcripts
    .toSorted((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
    .map((t): SessionLinkView => {
      const hit = byHref.get(transcriptHref(t.slug));
      // The chronicle falls back to the date for an episode it has no summary for.
      const title = hit && hit.episode.title !== hit.episode.date ? hit.episode.title : null;
      // A session the chronicle lacks: Script/<campaign>/<date> names its campaign.
      const folder = t.slug.split("/")[1]?.replaceAll("-", " ") ?? null;
      const showName = hit ? hit.show.name : folder;
      return {
        href: resolveRelative(slug, t.slug),
        // A transcript's title is its session date.
        date: sessionDate(t.title, true),
        title,
        show: showName === main?.name ? null : showName,
      };
    });
  return { strip, sessions };
}

// ── view builders ─────────────────────────────────────────────────────────────────
/** The rail for a page (a content page or a folder's index): its backlinks split into wiki
 *  pages and transcripts, and its body's contents. */
function pageRail(slug: FullSlug): PageRail {
  const linking = backlinksFor(SITE_DATA, slug);
  const backlinks = linking
    .filter((f) => !isTranscriptSlug(f.slug))
    .toSorted((a, b) => a.title.localeCompare(b.title))
    .map((f) => ({
      label: f.title,
      href: resolveRelative(slug, f.slug),
      section: sectionOf(f.slug)?.id ?? null,
    }));
  const transcripts = linking.filter((f) => isTranscriptSlug(f.slug));
  return { backlinks, sessions: sessionsView(slug, transcripts), toc: BODIES[slug]?.toc ?? [] };
}

export function contentView(slug: FullSlug): ContentView {
  const doc = SITE_DATA.bySlug.get(slug);
  if (!doc) throw new Error(`no content doc for slug ${slug}`);
  const transcriptMinutes = TRANSCRIPT_MINUTES[slug];
  const isTranscript = transcriptMinutes !== undefined;
  const body = BODIES[slug];
  return {
    slug,
    title: doc.title,
    tags: doc.tags.map((t) => tagsLink(slug, t)),
    img: doc.img,
    date: doc.date?.toISOString(),
    // Transcript bodies are code-split + server-loaded by the route loader, so their
    // 115 MB of HTML never enters the BODIES bundle; minutes come from the small map.
    readingMinutes: isTranscript ? transcriptMinutes : (body?.minutes ?? 0),
    bodyHtml: body?.html ?? "",
    transcript: isTranscript,
    showBreadcrumbs: slug !== "index",
    crumbs: breadcrumbsFor(SITE_DATA, slug, doc.title),
    ...pageRail(slug),
  };
}

export function folderView(folder: string): FolderView {
  const slug = `${folder}/index` as FullSlug;
  const idx = SITE_DATA.bySlug.get(slug) ?? null;
  const title = folderTitle(SITE_DATA, folder);
  const children = listFolderChildren(SITE_DATA, folder);
  // Breadcrumb current-crumb display: the index title or the dash→space folder
  // segment (NOT the "Folder: x" h1), mirroring faerrin.
  const crumbTitle = idx?.title ?? (folder.split("/").at(-1) ?? "").replaceAll("-", " ");
  return {
    slug,
    folder,
    title,
    crumbs: breadcrumbsFor(SITE_DATA, slug, crumbTitle),
    bodyHtml: BODIES[slug]?.html ?? "",
    tags: idx ? idx.tags.map((t) => tagsLink(slug, t)) : [],
    date: idx?.date?.toISOString(),
    ...pageRail(slug),
    itemsLabel:
      children.length === 1
        ? "1 item under this folder"
        : `${children.length} items under this folder`,
    entries: children.map((e) => entryView(slug, e)),
  };
}

export function tagView(tag: string): TagView {
  const slug = `tags/${tag}` as FullSlug;
  const pages = pagesWithTag(SITE_DATA, tag);
  return {
    slug,
    title: `Tag: ${tag}`,
    itemsLabel: pages.length === 1 ? "1 item with this tag" : `${pages.length} items with this tag`,
    entries: pages.map((e) => entryView(slug, e)),
  };
}

const TAG_INDEX_NUM_PAGES = 10;

export function tagIndexView(): TagIndexView {
  const slug = "tags/index" as FullSlug;
  const tags = allTags(SITE_DATA);
  const sections = tags.map((tag) => {
    const pages = pagesWithTag(SITE_DATA, tag);
    return {
      tag,
      href: resolveRelative(slug, `tags/${tag}` as SimpleSlug),
      entries: pages.slice(0, TAG_INDEX_NUM_PAGES).map((e) => entryView(slug, e)),
      overflow: Math.max(0, pages.length - TAG_INDEX_NUM_PAGES),
    };
  });
  return {
    slug,
    title: "Tag Index",
    totalLabel: `Found ${tags.length} total tags`,
    sections,
  };
}

/** Whether a tag exists (for the tag route's 404 check). */
export function tagExists(tag: string): boolean {
  return allTags(SITE_DATA).includes(tag);
}

export type { Crumb, TocEntry };
