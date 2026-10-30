import { describe, expect, it } from "vitest";

import {
  allPagesLabel,
  countLabel,
  NAV_DIVIDER_BEFORE,
  type Section,
  type SectionId,
  SECTIONS,
  sectionCounts,
  sectionOf,
  sectionOfHref,
} from "./sections";

const idOf = (slug: string) => sectionOf(slug)?.id ?? null;
const byId = (id: SectionId): Section => {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`no section ${id}`);
  return section;
};

describe("sectionOf", () => {
  it("lists the sections in header order, wiki sections before the divider", () => {
    expect(SECTIONS.map((s) => s.label)).toEqual([
      "Bestiary",
      "Divinity",
      "Geography",
      "Organisations",
      "People",
      "Phenomena",
      "Rules",
      "Sessions",
      "Timeline",
    ]);
    expect(SECTIONS.findIndex((s) => s.id === NAV_DIVIDER_BEFORE)).toBe(7);
  });

  it("maps a top-level folder to its section, in every slug form", () => {
    expect(idOf("Bestiary/Auger")).toBe("bestiary");
    expect(idOf("Divinity/Outer-Gods/Iridescent-Host")).toBe("divinity");
    expect(idOf("Org/Iridescent-Church/index")).toBe("org");
    expect(idOf("Org/Iridescent-Church/")).toBe("org");
    expect(idOf("/Org/Iridescent-Church")).toBe("org");
    expect(idOf("Org")).toBe("org");
    expect(idOf("Geography/index")).toBe("geography");
    expect(idOf("Phenomena/Weave")).toBe("phenomena");
    expect(idOf("Rules/Hero-Points")).toBe("rules");
    expect(idOf("Timeline")).toBe("timeline");
  });

  it("files any page with a People segment under People", () => {
    expect(idOf("People/Galzu")).toBe("people");
    expect(idOf("Org/Amber-Call/People/Ossain-Madrun")).toBe("people");
    expect(idOf("Geography/Calaria/Hallia/Sableclutch/People/Shannon-Soul")).toBe("people");
    expect(idOf("Org/Iridescent-Church/People")).toBe("people");
    // Only a whole segment counts.
    expect(idOf("Org/Peoples-Front/index")).toBe("org");
  });

  it("files transcripts and the chronicle under Sessions", () => {
    expect(idOf("Script/Through-a-Song,-Darkly/2026-2-17")).toBe("sessions");
    expect(idOf("Script/Unsorted/index")).toBe("sessions");
    expect(idOf("chronicle")).toBe("sessions");
    expect(idOf("chronicle/through-a-song-darkly/s3/2026-2-17")).toBe("sessions");
  });

  it("gives home, tags and unknown folders no section", () => {
    expect(sectionOf("index")).toBeNull();
    expect(sectionOf("")).toBeNull();
    expect(sectionOf("/")).toBeNull();
    expect(sectionOf("tags")).toBeNull();
    expect(sectionOf("tags/Host")).toBeNull();
    expect(sectionOf("tags/index")).toBeNull();
    expect(sectionOf("Nowhere/Page")).toBeNull();
  });

  it("reads the section from an href, encoded or not", () => {
    expect(sectionOfHref("/Script/Through-a-Song%2C-Darkly/2026-2-17")?.id).toBe("sessions");
    expect(sectionOfHref("/Org/%C3%86therion-Limited.html")?.id).toBe("org");
    expect(sectionOfHref("https://akasha.iridi.cc/People/Galzu#history")?.id).toBe("people");
    // A malformed escape doesn't throw.
    expect(sectionOfHref("/Org/%E0%A4bad")?.id).toBe("org");
    expect(sectionOfHref("/tags/Host")).toBeNull();
    expect(sectionOfHref("/")).toBeNull();
  });
});

describe("section counts", () => {
  it("counts pages per section and skips pages with none", () => {
    const counts = sectionCounts([
      "Org/Iridescent-Church/index",
      "Org/Iridescent-Church/People/Walter-Stoke",
      "People/Galzu",
      "Script/Unsorted/2024-10-15",
      "index",
      "tags/Host",
    ]);
    expect(counts.org).toBe(1);
    expect(counts.people).toBe(2);
    expect(counts.sessions).toBe(1);
    expect(counts.bestiary).toBe(0);
    expect(Object.keys(counts)).toHaveLength(SECTIONS.length);
  });

  it("words counts per section", () => {
    expect(countLabel(byId("bestiary"), 1)).toBe("1 page");
    expect(countLabel(byId("sessions"), 98)).toBe("98 transcripts");
    expect(allPagesLabel(byId("org"), 81)).toBe("All 81 organisations");
    expect(allPagesLabel(byId("people"), 122)).toBe("All 122 people");
    expect(allPagesLabel(byId("bestiary"), 19)).toBe("All 19 Bestiary pages");
    expect(allPagesLabel(byId("sessions"), 98)).toBe("All sessions");
  });
});
