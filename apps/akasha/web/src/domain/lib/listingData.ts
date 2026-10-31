/**
 * The data the home page and the listings add to the runtime site views: each listing
 * row's section and child count, the latest session, and the pages updated on its day.
 * Pure functions over plain inputs; `pageData.ts` calls them with the generated modules,
 * so this file imports none of them (and the tests can feed it small inputs).
 */
import type { ChronicleShow } from "./chronicleTypes";
import { isoDay, pagesLabel, parseDay } from "./listingFormat";
import type { PageEntryView } from "./runtimeSite";
import { SECTIONS, type SectionId, sectionOf } from "./sections";

// ── listing rows (folder pages, tag pages, the tag index) ─────────────────────────

/** A listing row: the runtime entry plus its section (the hue dot) and, for a folder, a
 *  faint count of the pages under it ("12 pages"). */
export interface ListingRow extends PageEntryView {
  section: SectionId | null;
  childLabel: string | null;
}

/**
 * Pages under each folder, for the child count on a folder row. A page counts toward every
 * folder above it, except a folder's own index page.
 */
export function descendantCounts(slugs: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slug of slugs) {
    const parts = slug.split("/");
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (slug === `${folder}/index`) continue;
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The page a listing row points to, as a path without slashes at either end. Listing
 * hrefs are relative to the listing's own slug (runtimeSite's `resolveRelative`), so they
 * resolve against it the way the browser resolves them.
 */
export function hrefPath(listSlug: string, href: string): string {
  const path = new URL(href, `https://akasha.invalid/${listSlug}`).pathname;
  return decodePath(path).replaceAll(/^\/+|\/+$/g, "");
}

const UTF8 = new TextDecoder();

/** Percent-decodes a path; unlike decodeURIComponent, a malformed sequence never throws. */
function decodePath(path: string): string {
  return path.replaceAll(/(?:%[0-9a-f]{2})+/gi, (run) =>
    UTF8.decode(Uint8Array.from(run.slice(1).split("%"), (hex) => Number.parseInt(hex, 16))),
  );
}

// Case- and accent-insensitive: "Æther" sorts with A, "ethervolt" with "Ethervolt".
const TITLE_ORDER = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * Adds each entry's section and, for folders, the pages under it, and orders the rows by
 * title, folders and pages together. runtimeSite orders them by date, newest first, which
 * reads as random with no dates on screen (the corpus was bulk-imported).
 */
export function listingRows(
  listSlug: string,
  entries: PageEntryView[],
  counts: Map<string, number>,
): ListingRow[] {
  const rows = entries.map((entry) => {
    const path = hrefPath(listSlug, entry.href);
    const section = sectionOf(path)?.id ?? null;
    // A folder with nothing under it but its own index page shows no count.
    const children = entry.isFolder ? (counts.get(path.replace(/\/index$/, "")) ?? 0) : 0;
    const childLabel = children > 0 ? pagesLabel(children, section === "sessions") : null;
    return { ...entry, section, childLabel };
  });
  return rows.toSorted((a, b) => TITLE_ORDER.compare(a.title, b.title));
}

/**
 * A folder page's title: a section's own folder takes the section's label ("Org" is
 * "Organisations", as in the header); a folder with no index page drops the "Folder: "
 * prefix site.ts gives it and shows its last segment, dashes as spaces.
 */
export function folderDisplayTitle(title: string, folder: string): string {
  // Only a section's own page: `Script` keeps its title, since Sessions is the chronicle.
  const section = sectionOf(folder);
  if (section && section.href === `/${folder}`) return section.label;
  if (!title.startsWith("Folder: ")) return title;
  return (folder.split("/").at(-1) ?? folder).replaceAll("-", " ");
}

// ── home: the latest session and the pages updated on its day ─────────────────────

export interface SessionLink {
  date: string;
  title: string;
  href: string;
}

export interface LatestSession {
  /** The show's slug and display name. */
  show: string;
  showName: string;
  seasonNumber: number;
  seasonTitle: string;
  episodeNumber: number;
  date: string;
  title: string;
  synopsis: string;
  /** The transcript page, or null when the session has no transcript. */
  transcriptHref: string | null;
  /** The episode's chronicle page. */
  chronicleHref: string;
  /** The sessions before it, newest first; each links to its transcript (or its chronicle
   *  page when it has none). */
  earlier: SessionLink[];
}

const dayTime = (date: string) => parseDay(date)?.getTime() ?? Number.NEGATIVE_INFINITY;

/** The main campaign's latest episode and the `earlierCount` before it, by date. */
export function latestSession(shows: ChronicleShow[], earlierCount = 4): LatestSession | null {
  const show = shows.find((s) => s.isMain) ?? shows[0];
  if (!show) return null;
  const episodes = show.seasons
    .flatMap((season) => season.episodes.map((episode) => ({ season, episode })))
    .toSorted((a, b) => dayTime(b.episode.date) - dayTime(a.episode.date));
  const [latest, ...rest] = episodes;
  if (!latest) return null;
  const chronicleHref = (date: string) => `/chronicle/${show.show}/${date}`;
  return {
    show: show.show,
    showName: show.name,
    seasonNumber: latest.season.number,
    seasonTitle: latest.season.title,
    episodeNumber: latest.episode.episodeNumber,
    date: latest.episode.date,
    title: latest.episode.title,
    synopsis: latest.episode.synopsis,
    transcriptHref: latest.episode.href,
    chronicleHref: chronicleHref(latest.episode.date),
    earlier: rest.slice(0, earlierCount).map(({ episode }) => ({
      date: episode.date,
      title: episode.title,
      href: episode.href ?? chronicleHref(episode.date),
    })),
  };
}

export interface UpdatedPage {
  title: string;
  href: string;
  section: SectionId;
}

/** The fields of a generated page this needs (`GeneratedPage` in `site.ts`). */
interface DatedPage {
  slug: string;
  simple: string;
  title: string;
  date?: string;
}

const SECTION_ORDER = new Map(SECTIONS.map((s, i) => [s.id, i]));

/**
 * Wiki pages whose date (the commit that last changed them) falls on `day`: the pages the
 * wiki keeper updated after that session. Transcripts and the home page are left out.
 * Ordered by section (header order), then title.
 */
export function pagesUpdatedOn(pages: Iterable<DatedPage>, day: string): UpdatedPage[] {
  const want = isoDay(day);
  if (!want) return [];
  const out: UpdatedPage[] = [];
  for (const page of pages) {
    if (!page.date || page.slug === "index" || isoDay(page.date) !== want) continue;
    const section = sectionOf(page.slug);
    if (!section || section.id === "sessions") continue;
    out.push({
      title: page.title,
      href: `/${encodeURI(page.simple.replace(/\/$/, ""))}`,
      section: section.id,
    });
  }
  return out.toSorted(
    (a, b) =>
      (SECTION_ORDER.get(a.section) ?? 0) - (SECTION_ORDER.get(b.section) ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

/** "Campaign 3 · the main campaign", "Campaign 2", "The main campaign" or "" (a one-shot). */
export function campaignLabel(show: ChronicleShow): string {
  const parts = [
    show.campaignNumber === null ? "" : `Campaign ${show.campaignNumber}`,
    show.isMain ? "the main campaign" : "",
  ].filter(Boolean);
  const label = parts.join(" · ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The Sessions page's groups: the main campaign, the earlier numbered campaigns (newest
 *  first) and the one-shots (in their chronicle order). */
export function groupShows(shows: ChronicleShow[]): {
  main: ChronicleShow | undefined;
  earlier: ChronicleShow[];
  oneShots: ChronicleShow[];
} {
  const main = shows.find((s) => s.isMain);
  const others = shows.filter((s) => s !== main);
  const earlier = others
    .filter((s) => s.campaignNumber !== null)
    .toSorted((a, b) => (b.campaignNumber ?? 0) - (a.campaignNumber ?? 0));
  return { main, earlier, oneShots: others.filter((s) => s.campaignNumber === null) };
}
