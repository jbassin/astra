/**
 * The wiki's sections: which section a slug belongs to, its label, its folder page and its
 * hue. Each section owns one hue, and a hue only ever carries information (the header's
 * current-section underline, link underlines, graph nodes, list dots, the tree tint).
 *
 * Pure and client-safe: no generated modules. The page counts come from the server
 * (`sectionCountsData` in `pageData.ts`, through the root route's loader).
 */

export type SectionId =
  | "bestiary"
  | "divinity"
  | "geography"
  | "org"
  | "people"
  | "phenomena"
  | "rules"
  | "sessions"
  | "timeline";

export interface Section {
  id: SectionId;
  /** The label in the header, the tree head and the menu. */
  label: string;
  /** The section's own page (a folder listing, the chronicle, or the Timeline page). */
  href: string;
  /** The CSS variable holding the section's hue, for `style={{ "--hue": section.hue }}`. */
  hue: string;
  /** The top-level slug segments that belong to the section. */
  roots: readonly string[];
  /** What the section's pages are called in counts: "19 pages", "98 transcripts". */
  unit: { one: string; many: string };
}

const PAGES_UNIT = { one: "page", many: "pages" } as const;

/** Every section in header nav order. The wiki sections come first, then Sessions and Timeline. */
export const SECTIONS: readonly Section[] = [
  {
    id: "bestiary",
    label: "Bestiary",
    href: "/Bestiary",
    hue: "var(--ak-bestiary)",
    roots: ["Bestiary"],
    unit: PAGES_UNIT,
  },
  {
    id: "divinity",
    label: "Divinity",
    href: "/Divinity",
    hue: "var(--ak-divinity)",
    roots: ["Divinity"],
    unit: PAGES_UNIT,
  },
  {
    id: "geography",
    label: "Geography",
    href: "/Geography",
    hue: "var(--ak-geography)",
    roots: ["Geography"],
    unit: PAGES_UNIT,
  },
  {
    id: "org",
    label: "Organisations",
    href: "/Org",
    hue: "var(--ak-org)",
    roots: ["Org"],
    unit: { one: "organisation", many: "organisations" },
  },
  {
    id: "people",
    label: "People",
    href: "/People",
    hue: "var(--ak-people)",
    roots: ["People"],
    unit: { one: "person", many: "people" },
  },
  {
    id: "phenomena",
    label: "Phenomena",
    href: "/Phenomena",
    hue: "var(--ak-phenomena)",
    roots: ["Phenomena"],
    unit: PAGES_UNIT,
  },
  {
    id: "rules",
    label: "Rules",
    href: "/Rules",
    hue: "var(--ak-rules)",
    roots: ["Rules"],
    unit: PAGES_UNIT,
  },
  {
    id: "sessions",
    label: "Sessions",
    href: "/chronicle",
    hue: "var(--ak-sessions)",
    roots: ["Script", "chronicle"],
    unit: { one: "transcript", many: "transcripts" },
  },
  {
    id: "timeline",
    label: "Timeline",
    href: "/Timeline",
    hue: "var(--ak-timeline)",
    roots: ["Timeline"],
    unit: PAGES_UNIT,
  },
];

/** The header draws a thin divider before this section (the wiki sections end here). */
export const NAV_DIVIDER_BEFORE: SectionId = "sessions";

const BY_ROOT = new Map(SECTIONS.flatMap((s) => s.roots.map((r) => [r, s] as const)));

/** A slug's segments, without a leading or trailing slash and without a final `index`. */
function segments(slug: string): string[] {
  const parts = slug.split("/").filter((p) => p.length > 0);
  if (parts.at(-1) === "index") parts.pop();
  return parts;
}

/**
 * The section a page belongs to, or null (home, tags, unknown). Takes any slug form: full
 * (`Org/Iridescent-Church/index`), simple (`Org/Iridescent-Church/`) or a path with a
 * leading slash. A page with a `People` segment below the top level is a person, wherever it
 * is filed (`Org/Amber-Call/People/Ossain-Madrun`).
 */
export function sectionOf(slug: string): Section | null {
  const parts = segments(slug);
  const top = parts[0];
  if (top === undefined) return null;
  return BY_ROOT.get(parts.slice(1).includes("People") ? "People" : top) ?? null;
}

/**
 * The section a link points to, from its href: decodes it, ignores the origin, the query, the
 * hash and a `.html` suffix (Pagefind result URLs end in `.html`).
 */
export function sectionOfHref(href: string): Section | null {
  const url = URL.parse(href, "https://akasha.invalid");
  if (!url) return null;
  return sectionOf(decodePath(url.pathname).replace(/\.html$/, ""));
}

const UTF8 = new TextDecoder();

/** Percent-decodes a path; unlike decodeURIComponent, a malformed sequence never throws. */
function decodePath(path: string): string {
  return path.replaceAll(/(?:%[0-9a-f]{2})+/gi, (run) =>
    UTF8.decode(Uint8Array.from(run.slice(1).split("%"), (hex) => Number.parseInt(hex, 16))),
  );
}

export type SectionCounts = Record<SectionId, number>;

/** Pages per section, over every page slug in the index. Slugs with no section are skipped. */
export function sectionCounts(slugs: Iterable<string>): SectionCounts {
  const counts: SectionCounts = {
    bestiary: 0,
    divinity: 0,
    geography: 0,
    org: 0,
    people: 0,
    phenomena: 0,
    rules: 0,
    sessions: 0,
    timeline: 0,
  };
  for (const slug of slugs) {
    const section = sectionOf(slug);
    if (section) counts[section.id] += 1;
  }
  return counts;
}

/** "1 page", "19 pages", "98 transcripts". */
export function countLabel(section: Section, n: number): string {
  return `${n} ${n === 1 ? section.unit.one : section.unit.many}`;
}

/**
 * The phone menu's link to a section's own page: "All 81 organisations", "All 19 Bestiary
 * pages". Sessions links to the chronicle, which lists episodes rather than transcripts.
 */
export function allPagesLabel(section: Section, n: number): string {
  if (section.id === "sessions") return "All sessions";
  if (section.unit === PAGES_UNIT) return `All ${n} ${section.label} ${PAGES_UNIT.many}`;
  return `All ${countLabel(section, n)}`;
}
