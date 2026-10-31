import { describe, expect, it } from "vitest";

import { ALIASES } from "@/generated/site";

import type { ChronicleEpisode, ChronicleShow } from "./chronicleTypes";
import {
  contentView,
  folderView,
  knownFromView,
  resolvePath,
  sessionsView,
  tagExists,
  tagIndexView,
  tagView,
} from "./runtimeSite";
import { sectionOfHref } from "./sections";
import type { SiteDoc } from "./site";
import { type FullSlug, simplifySlug } from "./slug";

// A page URL on the Iridescent Host's level, for resolving its relative backlink hrefs.
const BASE_HOST = "https://akasha.invalid/Divinity/Outer-Gods/Iridescent-Host";

/** A slug literal as the branded type the view builders take. */
const fullSlug = (s: string): FullSlug => s as FullSlug;

// runtimeSite reconstructs the index from the generated module (emitted by
// build-content via the global setup), so these assert the runtime resolver +
// view builders against the real snapshot-derived data.

describe("resolvePath — URL → page kind (faerrin's catch-all)", () => {
  it("maps the empty path to the home content page", () => {
    expect(resolvePath("")).toEqual({ kind: "content", slug: "index" });
    expect(resolvePath("/")).toEqual({ kind: "content", slug: "index" });
  });

  it("maps a content slug to a content page", () => {
    expect(resolvePath("Timeline")).toEqual({ kind: "content", slug: "Timeline" });
  });

  it("maps both Foo and Foo/index to the folder listing", () => {
    expect(resolvePath("Divinity")).toEqual({ kind: "folder", folder: "Divinity" });
    expect(resolvePath("Divinity/index")).toEqual({ kind: "folder", folder: "Divinity" });
    expect(resolvePath("/Divinity/")).toEqual({ kind: "folder", folder: "Divinity" });
  });

  it("decodes percent-encoded paths (Unicode/space/comma slugs)", () => {
    // "Mr.-Whiskers" lives under Org/Amber-Call/People; encoded request still resolves.
    const r = resolvePath(encodeURI("Org/Amber-Call/People/Mr.-Whiskers"));
    expect(r?.kind).toBe("content");
  });

  it("resolves an alias to its redirect (meta-refresh, not 301)", () => {
    const a = ALIASES[0];
    expect(a).toBeDefined();
    const r = resolvePath(a?.slug ?? "");
    expect(r).toEqual({ kind: "alias", redirUrl: a?.redirUrl, ogSlug: a?.ogSlug });
  });

  it("returns null for an unknown path (→ 404)", () => {
    expect(resolvePath("definitely/not/a/page")).toBeNull();
  });
});

describe("view builders", () => {
  it("contentView exposes title, tag links, breadcrumbs, sorted backlinks, rendered body", () => {
    const v = contentView(fullSlug("Timeline"));
    expect(v.title).toBe("Timeline");
    expect(v.showBreadcrumbs).toBe(true);
    expect(v.crumbs[0]?.displayName).toBe("Home");
    const titles = v.backlinks.map((b) => b.label);
    expect(titles.toSorted()).toEqual(titles); // sorted by title
    // the build-rendered vellum body + reading time
    expect(v.bodyHtml).toContain("data-vellum-export");
    expect(v.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("contentView splits backlinks: wiki pages (with their section), not transcripts", () => {
    const v = contentView(fullSlug("Divinity/Outer-Gods/Iridescent-Host"));
    expect(v.backlinks.length).toBeGreaterThan(0);
    for (const b of v.backlinks) {
      expect(b.href).not.toContain("Script/");
      expect(b.section).toBe(sectionOfHref(new URL(b.href, BASE_HOST).pathname)?.id ?? null);
    }
  });

  it("contentView lists the body's headings and block titles, each an id in the body", () => {
    const v = contentView(fullSlug("Divinity/Hierophant"));
    expect(v.toc.length).toBeGreaterThanOrEqual(2);
    for (const e of v.toc) expect(v.bodyHtml).toContain(`id="${e.id}"`);
  });

  it("the home content view hides breadcrumbs", () => {
    expect(contentView(fullSlug("index")).showBreadcrumbs).toBe(false);
  });

  it("folderView lists children with a count label + relative hrefs", () => {
    const v = folderView("Divinity");
    expect(v.title).toBe("Divinity");
    expect(v.entries.length).toBeGreaterThan(0);
    expect(v.itemsLabel).toMatch(/items? under this folder/);
    for (const e of v.entries)
      expect(e.href.startsWith("../") || e.href.startsWith("./")).toBe(true);
  });

  it("folderView carries its index page's facts and rail: tags, date, toc, backlinks", () => {
    const v = folderView("Org/Iridescent-Church");
    expect(v.tags.map((t) => t.label)).toEqual(["Host", "Religious"]);
    expect(v.date).toBeDefined();
    expect(v.toc.length).toBeGreaterThanOrEqual(2);
    for (const e of v.toc) expect(v.bodyHtml).toContain(`id="${e.id}"`);
    expect(v.backlinks.length).toBeGreaterThan(0);
    for (const b of v.backlinks) expect(b.href).not.toContain("Script/");
    // The fixture's transcripts link to no wiki page.
    expect(v.sessions).toBeNull();
  });

  it("folderView without an index page has no facts and no contents", () => {
    const v = folderView("Bestiary");
    expect(v.tags).toEqual([]);
    expect(v.knownFrom).toEqual([]);
    expect(v.toc).toEqual([]);
  });

  it("tagView + tagIndexView reflect real tags", () => {
    expect(tagExists("Catfolk")).toBe(true);
    expect(tagExists("NotARealTag")).toBe(false);
    const tv = tagView("Catfolk");
    expect(tv.title).toBe("Tag: Catfolk");
    expect(tv.entries.length).toBeGreaterThan(0);
    const idx = tagIndexView();
    expect(idx.sections.length).toBeGreaterThan(0);
    expect(idx.totalLabel).toMatch(/Found \d+ total tags/);
  });
});

describe("view builders — the Known from line", () => {
  it("contentView names the page's campaigns, linked to their Sessions page", () => {
    expect(contentView(fullSlug("Divinity/Outer-Gods/Iridescent-Host")).knownFrom).toEqual([
      { label: "Through a Song, Darkly", href: "/chronicle/through-a-song-darkly" },
    ]);
    expect(contentView(fullSlug("Timeline")).knownFrom).toEqual([]);
  });

  it("folderView names its index page's campaigns, oldest first", () => {
    // The fixture chronicle has no Fae and Forest show, so that name is not a link.
    expect(folderView("Org/Amber-Call").knownFrom).toEqual([
      { label: "Fae and Forest", href: null },
      { label: "Through a Song, Darkly", href: "/chronicle/through-a-song-darkly" },
    ]);
  });
});

// ── sessionsView, against a small hand-made chronicle ─────────────────────────────
function episode(date: string, title: string, href: string): ChronicleEpisode {
  return {
    date,
    episodeNumber: 1,
    title,
    synopsis: "",
    keyBeats: [],
    charactersPresent: [],
    locations: [],
    factions: [],
    items: [],
    cliffhanger: "",
    href,
  };
}

function show(slug: string, name: string, isMain: boolean, eps: ChronicleEpisode[]) {
  return {
    show: slug,
    name,
    isMain,
    campaignNumber: null,
    seasonCount: 1,
    episodeCount: eps.length,
    seasons: [{ number: 1, title: "One", arcSummary: "", episodes: eps }],
  } satisfies ChronicleShow;
}

/** A transcript page; its title is its session date. */
function transcript(campaign: string, date: string): SiteDoc {
  const slug = fullSlug(`Script/${campaign}/${date}`);
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return {
    rel: `${slug}.md`,
    slug,
    simple: simplifySlug(slug),
    title: date,
    tags: ["Script"],
    aliases: [],
    links: [],
    date: new Date(Date.UTC(y, m - 1, d)),
    campaigns: [],
  };
}

const SHOWS = [
  show("main", "Through a Song, Darkly", true, [
    episode("2025-8-28", "First", "/Script/Through-a-Song,-Darkly/2025-8-28"),
    // No summary: the chronicle's title falls back to the date.
    episode("2025-9-4", "2025-9-4", "/Script/Through-a-Song,-Darkly/2025-9-4"),
    episode("2026-10-1", "Last", "/Script/Through-a-Song,-Darkly/2026-10-1"),
  ]),
  show("spark", "The First Spark", false, [
    episode("2025-3-5", "Kindling", "/Script/The-First-Spark/2025-3-5"),
  ]),
];
const CHURCH = fullSlug("Org/Iridescent-Church/index");

describe("knownFromView — the campaigns a page draws on", () => {
  const names = { main: "Through a Song, Darkly", spark: "The First Spark", deep: "Deep Eyes" };

  it("keeps the frontmatter order and links only the chronicle's shows", () => {
    expect(knownFromView(["deep", "spark", "main"], names, SHOWS)).toEqual([
      { label: "Deep Eyes", href: null },
      { label: "The First Spark", href: "/chronicle/spark" },
      { label: "Through a Song, Darkly", href: "/chronicle/main" },
    ]);
  });

  it("shows a slug being.kdl doesn't know as the slug", () => {
    expect(knownFromView(["mystery-campaign"], names, SHOWS)).toEqual([
      { label: "mystery-campaign", href: null },
    ]);
  });

  it("is empty for a page with no campaigns", () => {
    expect(knownFromView([], names, SHOWS)).toEqual([]);
  });
});

describe("sessionsView — the main campaign strip", () => {
  it("is null when no transcript links to the page", () => {
    expect(sessionsView(CHURCH, [], SHOWS)).toBeNull();
  });

  it("ticks the main campaign's linking episodes and labels the axis by month", () => {
    const linking = [
      transcript("Through-a-Song,-Darkly", "2026-10-1"),
      transcript("Through-a-Song,-Darkly", "2025-8-28"),
    ];
    expect(sessionsView(CHURCH, linking, SHOWS)?.strip).toEqual({
      show: "Through a Song, Darkly",
      ticks: [
        { date: "2025-8-28", hit: true },
        { date: "2025-9-4", hit: false },
        { date: "2026-10-1", hit: true },
      ],
      hits: 2,
      start: "Aug 2025",
      end: "Oct 2026",
    });
  });
});

describe("sessionsView — the list of linking sessions", () => {
  it("lists every linking session oldest first, other campaigns named", () => {
    const linking = [
      transcript("Through-a-Song,-Darkly", "2025-9-4"),
      transcript("The-First-Spark", "2025-3-5"),
      transcript("Unsorted", "2024-10-15"),
    ];
    const v = sessionsView(CHURCH, linking, SHOWS);
    expect(v?.sessions).toEqual([
      {
        href: "../../Script/Unsorted/2024-10-15",
        date: "15 Oct 2024",
        title: null,
        show: "Unsorted",
      },
      {
        href: "../../Script/The-First-Spark/2025-3-5",
        date: "5 Mar 2025",
        title: "Kindling",
        show: "The First Spark",
      },
      {
        href: "../../Script/Through-a-Song,-Darkly/2025-9-4",
        date: "4 Sep 2025",
        title: null,
        show: null,
      },
    ]);
    expect(v?.strip?.hits).toBe(1);
  });
});
