import { describe, expect, it } from "vitest";
import { buildLinker, escapeHtml, type LinkEntry } from "./linker";
import type { FullSlug, SimpleSlug } from "./slug";

const entries: LinkEntry[] = [
  { name: "Raelion", slug: "Raelion" as FullSlug },
  { name: "Ghosts of Raelion", slug: "Org/Ghosts" as FullSlug },
  { name: "Anzu", slug: "Anzu" as FullSlug },
];

describe("buildLinker (faerrin proper-noun auto-linker)", () => {
  const linker = buildLinker(entries);
  const from = "Script/Camp/2025-1-1" as FullSlug;

  it("links a proper-noun mention to a resolved internal href", () => {
    const out = linker.link("Anzu walked in", from);
    expect(out).toContain('class="internal"');
    expect(out).toContain("Anzu</a>");
    // resolveRelative from the 3-segment Script/Camp/2025-1-1 climbs two ancestors.
    expect(out).toContain('href="../../Anzu"');
  });

  it("longest-first: the multi-word title wins over its substring", () => {
    const out = linker.link("the Ghosts of Raelion arrive", from);
    expect(out).toContain('href="../../Org/Ghosts"');
    expect(out).not.toContain('href="../../Raelion"');
  });

  it("preserves original casing and respects word boundaries", () => {
    const out = linker.link("ANZU and anzulike", from);
    expect(out).toContain(">ANZU</a>"); // case-insensitive match, casing preserved
    expect(out).toContain("anzulike"); // word boundary: no link inside a longer word
  });

  it("records linked target slugs in the hits set", () => {
    const hits = new Set<SimpleSlug>();
    linker.link("Anzu met Raelion", from, hits);
    expect([...hits].sort()).toEqual(["Anzu", "Raelion"]);
  });

  it("HTML-escapes the text and leaves non-matches alone", () => {
    expect(linker.link("a < b & c", from)).toBe("a &lt; b &amp; c");
    expect(escapeHtml('"x"')).toBe("&quot;x&quot;");
  });
});
