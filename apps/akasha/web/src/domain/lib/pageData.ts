/**
 * Page data for every route, built on the server. Route loaders reach these only through
 * the server functions in `pageDataFns.ts`, so the generated modules they read (`bodies.ts`,
 * the page index in `site.ts`, `chronicle.ts` and the lazy transcript bodies) stay out of
 * the client bundle. SSR runs the functions inline; a client navigation fetches them.
 *
 * Each function returns `null` for a page that doesn't exist; the route loader turns that
 * into `notFound()`.
 */
import { getLogger } from "@astra/observe";

import type { ChronicleEpisode, ChronicleSeason, ChronicleShow } from "@/domain/lib/chronicleTypes";
import { SHOWS } from "@/generated/chronicle";
import { PAGES } from "@/generated/site";
import { TRANSCRIPT_BODIES, TRANSCRIPT_META } from "@/generated/transcripts";

import {
  descendantCounts,
  folderDisplayTitle,
  type LatestSession,
  latestSession,
  type ListingRow,
  listingRows,
  pagesUpdatedOn,
  type UpdatedPage,
} from "./listingData";
import {
  type ContentView,
  contentView,
  type FolderView,
  folderView,
  resolvePath,
  tagExists,
  type TagIndexView,
  tagIndexView,
  type TagView,
  tagView,
} from "./runtimeSite";
import { type SectionCounts, sectionCounts } from "./sections";
import type { FullSlug } from "./slug";
import { type TranscriptPageView, transcriptPageView } from "./transcriptMeta";

/** Pages per section, for the section tree's head and the phone menu (root route loader). */
export function sectionCountsData(): SectionCounts {
  return sectionCounts(PAGES.map((p) => p.slug));
}

const log = getLogger("astra.akasha-frontend");

type WikiPageData =
  | {
      kind: "content";
      slug: string;
      title: string;
      view: ContentView;
      /** Set for a transcript page (`view.transcript`): its episode, speakers and sessions. */
      transcript?: TranscriptPageView;
    }
  | { kind: "folder"; slug: string; title: string; view: ListingFolderView }
  | { kind: "alias"; slug: string; title: string; redirUrl: string; ogSlug: string };

/** The catch-all route's page: a content page, a folder listing or an alias stub. */
export async function wikiPageData(path: string): Promise<WikiPageData | null> {
  const resolved = resolvePath(path);
  if (!resolved) return null;
  if (resolved.kind === "content") {
    const view = contentView(resolved.slug);
    if (view.transcript) {
      // Transcript bodies are one lazy module per session, loaded only here.
      view.bodyHtml = await transcriptBody(view.slug);
      const transcript = transcriptPageData(view.slug);
      if (transcript) {
        return { kind: "content", slug: view.slug, title: transcript.title, view, transcript };
      }
    }
    return { kind: "content", slug: view.slug, title: view.title, view };
  }
  if (resolved.kind === "folder") {
    const view = listingFolderView(folderView(resolved.folder));
    return { kind: "folder", slug: view.slug, title: view.title, view };
  }
  return {
    kind: "alias",
    slug: resolved.ogSlug,
    title: resolved.ogSlug,
    redirUrl: resolved.redirUrl,
    ogSlug: resolved.ogSlug,
  };
}

// ── listings: folder pages, tag pages and the tag index ───────────────────────────

/** Pages under each folder, for the child count on folder rows. */
const DESCENDANTS = descendantCounts(PAGES.map((p) => p.slug));

/** A folder page: its rows carry their section and child count, and its title has no
 *  "Folder: " prefix. */
export type ListingFolderView = Omit<FolderView, "entries"> & { entries: ListingRow[] };

function listingFolderView(view: FolderView): ListingFolderView {
  return {
    ...view,
    title: folderDisplayTitle(view.title, view.folder),
    entries: listingRows(view.slug, view.entries, DESCENDANTS),
  };
}

export type ListingTagView = Omit<TagView, "entries"> & { tag: string; entries: ListingRow[] };

export type ListingTagIndexView = Omit<TagIndexView, "sections"> & {
  sections: (Omit<TagIndexView["sections"][number], "entries"> & { entries: ListingRow[] })[];
};

// ── home ──────────────────────────────────────────────────────────────────────────

export interface HomePageData {
  slug: "index";
  /** The wiki's own front page (its body is the "Recovered Log" handout). */
  view: ContentView;
  /** The main campaign's latest session and the ones before it; null with no chronicle. */
  latest: LatestSession | null;
  /** Wiki pages changed on the latest session's day. */
  updated: UpdatedPage[];
}

/** The home page: the wiki's front page, the latest session and what changed after it. */
export function homePageData(): HomePageData {
  const latest = latestSession(SHOWS);
  return {
    slug: "index",
    view: contentView("index" as FullSlug),
    latest,
    updated: latest ? pagesUpdatedOn(PAGES, latest.date) : [],
  };
}

/**
 * A transcript page's episode, facts, speakers and the campaign's sessions, from the build's
 * TRANSCRIPT_META, the chronicle and the page index. Null when the build recorded no meta
 * for the slug (a stale build); the page then renders as a plain content page.
 */
function transcriptPageData(slug: string): TranscriptPageView | null {
  const meta = TRANSCRIPT_META[slug];
  if (!meta) return null;
  const folder = `${slug.split("/").slice(0, 2).join("/")}/`;
  const siblings = Object.entries(TRANSCRIPT_META)
    .filter(([s]) => s.startsWith(folder))
    .map(([s, m]) => ({ slug: s, date: m.date }));
  return transcriptPageView({ slug, meta, shows: SHOWS, siblings });
}

/** A transcript's body HTML, or "" when the slug has no code-split body. */
export async function transcriptBody(slug: string): Promise<string> {
  const load = TRANSCRIPT_BODIES[slug];
  if (load) return (await load()).default;
  // A transcript page with no code-split body: a stale build or a bad slug. The page
  // renders empty, so say so in SigNoz.
  log.emit({ severityText: "WARN", body: `transcript body not found for slug: ${slug}` });
  return "";
}

export function tagPageData(tag: string): ListingTagView | null {
  if (!tagExists(tag)) return null;
  const view = tagView(tag);
  return { ...view, tag, entries: listingRows(view.slug, view.entries, DESCENDANTS) };
}

export function tagIndexData(): ListingTagIndexView {
  const view = tagIndexView();
  return {
    ...view,
    sections: view.sections.map((s) => ({
      tag: s.tag,
      href: s.href,
      overflow: s.overflow,
      entries: listingRows(view.slug, s.entries, DESCENDANTS),
    })),
  };
}

export function chronicleIndexData(): ChronicleShow[] {
  return SHOWS;
}

export function chronicleShowData(show: string): ChronicleShow | null {
  return SHOWS.find((s) => s.show === show) ?? null;
}

interface ChronicleEpisodeData {
  slug: string;
  show: ChronicleShow;
  season: ChronicleSeason;
  episode: ChronicleEpisode;
}

/** One episode, located by its session date within the show. */
export function chronicleEpisodeData(showSlug: string, date: string): ChronicleEpisodeData | null {
  const show = chronicleShowData(showSlug);
  if (!show) return null;
  for (const season of show.seasons) {
    const episode = season.episodes.find((e) => e.date === date);
    // The slug nests under the season (matches the Explorer tree node), so the current
    // episode's folders auto-open and the leaf highlights.
    if (episode) {
      return {
        slug: `chronicle/${show.show}/s${season.number}/${episode.date}`,
        show,
        season,
        episode,
      };
    }
  }
  return null;
}
