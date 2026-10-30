import type { CrossRef } from "@astra/vellum-lang";
import { describe, expect, it } from "vitest";

import { buildResolvers, linkSection } from "./crossref";
import { decorateBody, readingMinutes, renderBody } from "./renderBody";
import type { Snapshot } from "./snapshot";

const fm = { title: null, tags: [], aliases: [], img: null, extra: {} };
const snapshot: Snapshot = {
  pages: [
    { path: "A", date: null, frontmatter: fm, crossrefs: [] },
    { path: "Sub/B", date: null, frontmatter: fm, crossrefs: [] },
  ],
  edges: [
    { source: "A", target: "B", resolved: "Sub/B", heading: null, alias: null },
    { source: "A", target: "Ghost", resolved: null, heading: null, alias: null },
  ],
  unresolved: [],
};
const xref = (target: string, heading?: string): CrossRef => ({
  type: "crossref",
  target,
  heading,
});

describe("buildResolvers (N3 crossref → href)", () => {
  const resolve = buildResolvers(snapshot).get("A");

  it("resolves a snapshot edge to a relative href", () => {
    expect(resolve).toBeDefined();
    const r = resolve?.(xref("B"));
    expect(r?.href).toBeTruthy();
    expect(r?.href).toContain("Sub/B");
  });

  it("returns null for a dangling (resolved=null) edge → placeholder", () => {
    expect(resolve?.(xref("Ghost"))).toBeNull();
  });

  it("returns null for a target with no edge at all", () => {
    expect(resolve?.(xref("Nonexistent"))).toBeNull();
  });
});

describe("renderBody (gothic DocumentView + resolver, build-time)", () => {
  it("renders a resolved crossref as a real <a href> carrying data-crossref", () => {
    const resolve = buildResolvers(snapshot).get("A");
    if (!resolve) throw new Error("no resolver");
    const html = renderBody("---\n---\nSee [[B]] now.", resolve);
    expect(html).toContain("data-vellum-export");
    expect(html).toMatch(/<a [^>]*data-crossref-target="B"/);
    expect(html).toContain("See");
  });

  it("leaves a dangling crossref as a placeholder span (no href)", () => {
    const resolve = buildResolvers(snapshot).get("A");
    if (!resolve) throw new Error("no resolver");
    const html = renderBody("---\n---\nThe [[Ghost]] fades.", resolve);
    expect(html).toMatch(/<span [^>]*data-crossref-target="Ghost"/);
  });

  it("counts reading minutes (≥1)", () => {
    expect(readingMinutes("---\n---\n")).toBe(1);
    expect(readingMinutes(`---\n---\n${"word ".repeat(450)}`)).toBeGreaterThanOrEqual(2);
  });
});

describe("linkSection (the section a rendered link points to)", () => {
  const host = "Divinity/Outer-Gods/Iridescent-Host";

  it("resolves a relative href against the page and names the target's section", () => {
    expect(linkSection(host, "../../Org/Iridescent-Church/")).toBe("org");
    expect(linkSection("Org/Iridescent-Church/index", "../../Divinity/Hierophant")).toBe(
      "divinity",
    );
    expect(linkSection(host, "/Geography/Calaria/")).toBe("geography");
  });

  it("files a page with a People segment under People, wherever it lives", () => {
    expect(linkSection(host, "../../Org/Amber-Call/People/Ossain-Madrun")).toBe("people");
  });

  it("decodes percent-encoded hrefs", () => {
    expect(linkSection(host, "../../Geography/Tormer%C3%A9/")).toBe("geography");
  });

  it("returns null for other sites, same-page anchors and pages in no section", () => {
    expect(linkSection(host, "https://2e.aonprd.com/Weapons.aspx?ID=362")).toBeNull();
    expect(linkSection(host, "mailto:someone@example.com")).toBeNull();
    expect(linkSection(host, "#edicts")).toBeNull();
    expect(linkSection(host, "../../")).toBeNull();
    expect(linkSection(host, "../../tags/Religious")).toBeNull();
  });
});

// ── decorateBody: link sections, heading ids and the contents list ───────────────
function orgResolver() {
  const withOrg: Snapshot = {
    ...snapshot,
    pages: [...snapshot.pages, { path: "Org/C/index", date: null, frontmatter: fm, crossrefs: [] }],
    edges: [
      ...snapshot.edges,
      { source: "A", target: "C", resolved: "Org/C/index", heading: null, alias: null },
    ],
  };
  const resolve = buildResolvers(withOrg).get("A");
  if (!resolve) throw new Error("no resolver");
  return resolve;
}
const RESOLVE = orgResolver();
const decorate = (source: string) => decorateBody(renderBody(source, RESOLVE), "A");

const PAGE = decorate(
  [
    "---",
    "---",
    "See [[C]] and [AoN](https://2e.aonprd.com/Spells.aspx?ID=1) or [[Ghost]].",
    "",
    "## The Convoxes & More",
    "",
    "Text.",
    "",
    '@handout "Dissident Church"',
    "{",
    "## Inside the card",
    "",
    "Body.",
    "}",
    "",
    "### The Convoxes & More",
    "",
    "Again.",
  ].join("\n"),
);

describe("decorateBody — links", () => {
  it("marks a link into a section with data-section and keeps data-crossref-*", () => {
    expect(PAGE.html).toMatch(
      /<a data-section="org" href="\.\/Org\/C\/"[^>]*data-crossref-target="C"/,
    );
  });

  it("leaves links to other sites and dangling placeholders unmarked", () => {
    expect(PAGE.html).toContain('<a href="https://2e.aonprd.com/Spells.aspx?ID=1">');
    expect(PAGE.html).toMatch(/<span [^>]*data-crossref-target="Ghost"/);
    expect(PAGE.html.match(/data-section=/g)).toHaveLength(1);
  });
});

describe("decorateBody — headings and blocks", () => {
  it("gives prose headings and blocks unique ids and lists them in order", () => {
    expect(PAGE.toc).toEqual([
      { id: "the-convoxes-more", text: "The Convoxes & More", level: 2 },
      { id: "dissident-church", text: "Dissident Church", level: 2 },
      { id: "the-convoxes-more-2", text: "The Convoxes & More", level: 3 },
    ]);
    expect(PAGE.html).toContain('<h2 id="the-convoxes-more">The Convoxes &amp; More</h2>');
    expect(PAGE.html).toContain('<h3 id="the-convoxes-more-2">');
    expect(PAGE.html).toMatch(/<section id="dissident-church" data-kind="handout"/);
  });

  it("leaves headings inside a block out of the contents and without an id", () => {
    expect(PAGE.html).toContain("<h2>Inside the card</h2>");
    expect(PAGE.toc.map((e) => e.text)).not.toContain("Inside the card");
  });

  it("adds a kind label to the handout header without changing its title", () => {
    expect(PAGE.html).toMatch(
      /<header [^>]*><span class="ak-block-title">Dissident Church<\/span><span class="ak-block-kind">Handout<\/span><\/header>/,
    );
  });

  it("puts a block at the level of the page's top headings", () => {
    const out = decorate(
      '---\n---\n### First\n\nText.\n\n@handout "Note"\n{\nBody.\n}\n\n### Second\n',
    );
    expect(out.toc.map((e) => e.level)).toEqual([3, 3, 3]);
  });

  it("takes a deity's title from the header's first span", () => {
    const out = decorate(
      '---\n---\n@deity "Iridescent Host"\n| category: Outer God\n{\nEdicts :: Create\n}',
    );
    expect(out.toc).toEqual([{ id: "iridescent-host", text: "Iridescent Host", level: 2 }]);
    expect(out.html).not.toContain("ak-block-kind");
  });
});
