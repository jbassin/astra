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
import { TRANSCRIPT_BODIES } from "@/generated/transcripts";

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
import type { FullSlug } from "./slug";

const log = getLogger("astra.akasha-frontend");

type WikiPageData =
  | { kind: "content"; slug: string; title: string; view: ContentView }
  | { kind: "folder"; slug: string; title: string; view: FolderView }
  | { kind: "alias"; slug: string; title: string; redirUrl: string; ogSlug: string };

/** The catch-all route's page: a content page, a folder listing or an alias stub. */
export async function wikiPageData(path: string): Promise<WikiPageData | null> {
  const resolved = resolvePath(path);
  if (!resolved) return null;
  if (resolved.kind === "content") {
    const view = contentView(resolved.slug);
    // Transcript bodies are one lazy module per session, loaded only here.
    if (view.transcript) view.bodyHtml = await transcriptBody(view.slug);
    return { kind: "content", slug: view.slug, title: view.title, view };
  }
  if (resolved.kind === "folder") {
    const view = folderView(resolved.folder);
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

/** The wiki home: the content page with slug "index". */
export function homePageData(): ContentView {
  return contentView("index" as FullSlug);
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

export function tagPageData(tag: string): TagView | null {
  return tagExists(tag) ? tagView(tag) : null;
}

export function tagIndexData(): TagIndexView {
  return tagIndexView();
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
