import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allFolders,
  allTags,
  backlinksFor,
  buildAliases,
  buildExplorerTree,
  buildSite,
} from "./site";
import { loadSnapshot } from "./snapshot";

// The akasha snapshot (committed, deterministic) is the build-time source. Read it from
// the workspace — same path the build-content step uses.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(HERE, "../../../../akasha-backend/snapshot/akasha-snapshot.json");
const site = buildSite(loadSnapshot(SNAPSHOT));

// faerrin's authoritative shipped slugs (the 141 non-Script contentIndex keys).
const faerrinSlugs = JSON.parse(
  readFileSync(path.join(HERE, "__fixtures__/faerrin-slugs.json"), "utf8"),
) as string[];

describe("site index — URL slug parity (the cutover gate)", () => {
  it("computes the EXACT faerrin non-Script wiki slug set (byte-for-byte)", () => {
    // faerrin shipped 217 slugs = 141 non-Script wiki + 76 Script transcripts. The
    // akasha snapshot holds exactly the 141 wiki pages (Script transcripts are a separate
    // artifact reconstituted in a later slice), so akasha-fe's slug set must equal
    // faerrin's 141 non-Script slugs verbatim. Any divergence breaks inbound links.
    const computed = site.docs.map((d) => d.slug).sort();
    const authoritative = [...(faerrinSlugs as string[])].sort();
    expect(computed).toEqual(authoritative);
  });

  it("has 141 pages and unique slugs", () => {
    expect(site.docs).toHaveLength(141);
    expect(new Set(site.docs.map((d) => d.slug)).size).toBe(141);
  });

  it("preserves Unicode/space/apostrophe filenames through sluggify", () => {
    // e.g. "Org/Amber Call/People/Mr. Whiskers" → "Org/Amber-Call/People/Mr.-Whiskers"
    expect(site.docs.some((d) => d.slug.includes("Mr.-Whiskers"))).toBe(true);
  });
});

describe("site index — derived structure (lifted Quartz semantics)", () => {
  it("folder index pages take their parent-folder name as title + implicit alias", () => {
    const divinity = site.bySlug.get("Divinity/index" as never);
    expect(divinity?.title).toBe("Divinity");
    expect(divinity?.aliases).toContain("Divinity");
  });

  it("derives folders, tags, an Explorer tree, and a backlink index", () => {
    expect(allFolders(site)).toContain("Divinity");
    expect(allTags(site).length).toBeGreaterThan(0);
    const tree = buildExplorerTree(site);
    expect(tree.some((n) => n.isFolder && n.displayName === "Divinity")).toBe(true);
    // backlinks invert the snapshot edges: some page links to the Iridescent Host.
    const host = site.docs.find((d) => d.slug.endsWith("Iridescent-Host"));
    expect(host && backlinksFor(site, host.slug).length).toBeGreaterThan(0);
  });

  it("bakes the snapshot git date (committer date — N4) onto dated pages", () => {
    const dated = site.docs.find((d) => d.date);
    expect(dated?.date).toBeInstanceOf(Date);
  });

  it("builds alias redirects, skipping ones that collide with real pages", () => {
    const aliases = buildAliases(site);
    expect(aliases.length).toBeGreaterThan(0);
    // every alias points somewhere and never shadows a real content/folder slug
    const realSlugs = new Set(site.docs.map((d) => d.slug));
    for (const a of aliases) {
      expect(a.redirUrl.length).toBeGreaterThan(0);
      expect(realSlugs.has(a.slug as never)).toBe(false);
    }
    // alias slugs are unique (first-wins on collision)
    expect(new Set(aliases.map((a) => a.slug)).size).toBe(aliases.length);
  });
});

// Read the snapshot file directly to assert the fixture matches the live snapshot count
// (guards against the snapshot regenerating with a different page set).
it("the parity fixture count matches the live snapshot page count", () => {
  const raw = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { pages: unknown[] };
  expect(raw.pages.length).toBe((faerrinSlugs as string[]).length);
});
