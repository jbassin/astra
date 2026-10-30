/**
 * The transcript page's data, apart from the lines: its title, facts, chronicle entry,
 * speakers and the campaign's sessions for the left rail.
 *
 * Pure and free of generated modules, so tests can feed it small inputs. The build writes
 * one `TranscriptMeta` per session (`TRANSCRIPT_META` in `generated/transcripts.ts`);
 * `pageData.ts` passes it here with the chronicle and the session's siblings, on the server.
 * Dates are parsed and formatted in UTC (README trap).
 */
import type { ChronicleSeason, ChronicleShow } from "./chronicleTypes";

/** One speaker in a session: the real name, the campaign character, the line count. */
export interface TranscriptSpeaker {
  user: string;
  char: string;
  lines: number;
}

/** What the build records about each session (TRANSCRIPT_META). */
export interface TranscriptMeta {
  /** The session date as the slug spells it, e.g. "2026-2-17". */
  date: string;
  /** The end of the last line, in seconds. */
  durationSeconds: number;
  /** Most lines first. */
  speakers: TranscriptSpeaker[];
}

interface SessionLink {
  title: string;
  /** "17 Feb 2026" under an episode title; null when the title is the date. */
  date: string | null;
  href: string;
  current: boolean;
}

interface SessionGroup {
  /** The season number; null for the sessions the chronicle doesn't know. */
  number: number | null;
  /** "Keystones and Fractures", "Season 1", "Other sessions"; null for an ungrouped list. */
  label: string | null;
  /** True when the group holds the page on screen. */
  open: boolean;
  items: SessionLink[];
}

export interface SessionsRail {
  heading: string;
  href: string;
  /** "Main campaign, 49 sessions", "3 sessions". */
  subtitle: string;
  groups: SessionGroup[];
}

export interface TranscriptPageView {
  /** The episode title, or "Session of 17 February 2026". */
  title: string;
  campaign: string;
  campaignHref: string;
  season: number | null;
  /** "Tuesday 17 February 2026". */
  dateLabel: string;
  /** "2026-02-17", for `<time dateTime>`. */
  dateTime: string;
  /** "Session 17, season 3 episode 3"; null when the chronicle doesn't know the session. */
  sessionLabel: string | null;
  /** "3 h 34 min". */
  durationLabel: string;
  durationSeconds: number;
  synopsis: string | null;
  chronicleHref: string | null;
  speakers: TranscriptSpeaker[];
  /** True when some speaker's character name differs from their real name. */
  hasCharacters: boolean;
  rail: SessionsRail;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A session date ("2026-2-17") as a UTC date, or null when it isn't one. */
function parseDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** "Tuesday 17 February 2026". */
export function longDate(date: string): string {
  const d = parseDate(date);
  if (!d) return date;
  return `${WEEKDAYS[d.getUTCDay()]} ${dayMonthYear(d)}`;
}

/** "17 February 2026". */
function plainDate(date: string): string {
  const d = parseDate(date);
  return d ? dayMonthYear(d) : date;
}

/** "17 Feb 2026". */
export function shortDate(date: string): string {
  const d = parseDate(date);
  if (!d) return date;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]?.slice(0, 3)} ${d.getUTCFullYear()}`;
}

/** "2026-02-17". */
function isoDate(date: string): string {
  const d = parseDate(date);
  return d ? d.toISOString().slice(0, 10) : date;
}

function dayMonthYear(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "3 h 34 min", "47 min", "2 h", to the nearest minute. */
export function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** An episode's title, or null when the chronicle has no summary for it (the title is the date). */
function episodeTitle(ep: { title: string; date: string }): string | null {
  return ep.title && ep.title !== ep.date ? ep.title : null;
}

/** A season's own name, or null when the chronicle calls it just "Season n". */
function seasonName(season: ChronicleSeason): string | null {
  return season.title === `Season ${season.number}` ? null : season.title;
}

/** The campaign folder of a transcript slug, as the tree shows it ("Through a Song, Darkly"). */
function campaignOf(slug: string): { folder: string; name: string } {
  const folder = slug.split("/")[1] ?? "";
  return { folder, name: folder.replaceAll("-", " ") };
}

/** A transcript page's link, as the chronicle writes it. */
function transcriptHref(slug: string): string {
  return `/${encodeURI(slug)}`;
}

interface Located {
  show: ChronicleShow;
  season: ChronicleSeason;
  /** The episode's place in its season, from 1. */
  episode: number;
  /** The episode's place in the whole show, from 1. */
  session: number;
}

/** Where the chronicle files a session date within a show, or null. */
function locate(show: ChronicleShow, date: string): Located | null {
  let session = 0;
  for (const season of show.seasons) {
    for (const [i, ep] of season.episodes.entries()) {
      session += 1;
      if (ep.date === date) return { show, season, episode: i + 1, session };
    }
  }
  return null;
}

interface TranscriptPageInput {
  slug: string;
  meta: TranscriptMeta;
  shows: readonly ChronicleShow[];
  /** Every transcript in the same campaign folder, the page on screen included. */
  siblings: readonly { slug: string; date: string }[];
}

const showHref = (s: ChronicleShow) => `/chronicle/${encodeURIComponent(s.show)}`;

/** What the chronicle says about the session: its title, season, number and synopsis. */
function episodeFacts(
  here: Located | null,
  date: string,
): Pick<TranscriptPageView, "title" | "season" | "sessionLabel" | "synopsis" | "chronicleHref"> {
  const fallback = `Session of ${plainDate(date)}`;
  if (!here) {
    return {
      title: fallback,
      season: null,
      sessionLabel: null,
      synopsis: null,
      chronicleHref: null,
    };
  }
  const { show, season, episode, session } = here;
  const ep = season.episodes[episode - 1];
  return {
    title: (ep && episodeTitle(ep)) ?? fallback,
    season: season.number,
    sessionLabel: `Session ${session}, season ${season.number} episode ${episode}`,
    synopsis: ep?.synopsis || null,
    chronicleHref: `${showHref(show)}/${date}`,
  };
}

/** Builds the transcript page's view from its meta, the chronicle and its siblings. */
export function transcriptPageView({
  slug,
  meta,
  shows,
  siblings,
}: TranscriptPageInput): TranscriptPageView {
  const { folder, name } = campaignOf(slug);
  // The show whose name is the folder's; else the show that lists this date (a transcript
  // filed under another folder than its show, such as Unsorted).
  const named = shows.find((s) => s.name === name) ?? null;
  const show = named ?? shows.find((s) => locate(s, meta.date) !== null) ?? null;
  const here = show ? locate(show, meta.date) : null;
  const folderHref = `/${encodeURI(`Script/${folder}`)}`;

  return {
    ...episodeFacts(here, meta.date),
    campaign: show?.name ?? name,
    campaignHref: show ? showHref(show) : folderHref,
    dateLabel: longDate(meta.date),
    dateTime: isoDate(meta.date),
    durationLabel: durationLabel(meta.durationSeconds),
    durationSeconds: meta.durationSeconds,
    speakers: meta.speakers,
    hasCharacters: meta.speakers.some((s) => s.char !== s.user),
    // The rail lists the folder's transcripts, so it is headed by the folder's own show.
    rail: sessionsRail({
      slug,
      heading: named?.name ?? name,
      href: named ? showHref(named) : folderHref,
      isMain: named?.isMain ?? false,
      show,
      siblings,
    }),
  };
}

/** The left rail: the campaign's sessions, by season where the chronicle knows them. */
function sessionsRail({
  slug,
  heading,
  href,
  isMain,
  show,
  siblings,
}: {
  slug: string;
  heading: string;
  href: string;
  isMain: boolean;
  show: ChronicleShow | null;
  siblings: readonly { slug: string; date: string }[];
}): SessionsRail {
  const byDate = new Map(siblings.map((s) => [s.date, s.slug]));
  const placed = new Set<string>();
  const groups: SessionGroup[] = [];

  for (const season of show?.seasons ?? []) {
    const items: SessionLink[] = [];
    for (const ep of season.episodes) {
      const sib = byDate.get(ep.date);
      if (sib === undefined) continue;
      placed.add(ep.date);
      items.push({
        title: episodeTitle(ep) ?? plainDate(ep.date),
        date: shortDate(ep.date),
        href: transcriptHref(sib),
        current: sib === slug,
      });
    }
    if (items.length === 0) continue;
    groups.push({
      number: season.number,
      label: seasonName(season) ?? `Season ${season.number}`,
      open: items.some((i) => i.current),
      items,
    });
  }

  const rest: SessionLink[] = siblings
    .filter((s) => !placed.has(s.date))
    .toSorted((a, b) => (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0))
    .map((s) => ({
      title: plainDate(s.date),
      date: null,
      href: transcriptHref(s.slug),
      current: s.slug === slug,
    }));
  if (rest.length > 0) {
    groups.push({
      number: null,
      label: groups.length > 0 ? "Other sessions" : null,
      open: rest.some((i) => i.current),
      items: rest,
    });
  }

  const n = siblings.length;
  const count = `${n} ${n === 1 ? "session" : "sessions"}`;
  return { heading, href, subtitle: isMain ? `Main campaign, ${count}` : count, groups };
}

/**
 * The tree label for a transcript (the Script subtree of EXPLORER_TREE, which the phone
 * menu and the Script folder pages show): its episode title, else its date.
 */
export function transcriptTreeLabel(date: string, shows: readonly ChronicleShow[]): string {
  for (const show of shows) {
    const here = locate(show, date);
    const ep = here?.season.episodes[here.episode - 1];
    const title = ep ? episodeTitle(ep) : null;
    if (title) return title;
  }
  return plainDate(date);
}

interface LabelNode {
  slug: string;
  displayName: string;
  isFolder: boolean;
  children: LabelNode[];
}

/**
 * Labels each transcript in the Script subtree of the Explorer tree with its
 * `transcriptTreeLabel`. The tree is already sorted by date, and relabelling keeps that order.
 */
export function labelScriptTree(tree: LabelNode[], shows: readonly ChronicleShow[]): void {
  const relabel = (nodes: LabelNode[]) => {
    for (const n of nodes) {
      if (n.isFolder) relabel(n.children);
      else n.displayName = transcriptTreeLabel(n.slug.split("/").at(-1) ?? "", shows);
    }
  };
  relabel(tree.find((n) => n.slug === "Script")?.children ?? []);
}
