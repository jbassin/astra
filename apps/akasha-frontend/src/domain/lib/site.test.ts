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

describe("site index — slug invariants", () => {
  // The faerrin→astra cutover parity gates were retired once the migration finished;
  // astra now owns its content and pages are added/removed editorially. What remains is
  // the durable invariant: slugs are non-empty and unique.
  it("derives a non-empty set of unique slugs", () => {
    expect(site.docs.length).toBeGreaterThan(0);
    expect(new Set(site.docs.map((d) => d.slug)).size).toBe(site.docs.length);
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
