import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSite } from "./site";
import { loadSnapshot } from "./snapshot";
import {
  buildContentIndex,
  escapeXml,
  renderRss,
  renderSitemap,
  type SiteMeta,
  stripToText,
} from "./staticEmit";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(HERE, "../../../../akasha-backend/snapshot/akasha-snapshot.json");
const site = buildSite(loadSnapshot(SNAPSHOT));
const meta: SiteMeta = { title: "Akasha", baseUrl: "https://akasha.iridi.cc" };

describe("staticEmit — string hygiene (ports faerrin desc/esc)", () => {
  it("escapes XML metacharacters", () => {
    expect(escapeXml(`a & b < c > d "e"`)).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("strips frontmatter + markdown to a flat ≤150-char snippet", () => {
    const out = stripToText("---\ndate: x\n---\n# Heading\n[[a link]] with *emphasis* and `code`.");
    expect(out).not.toContain("---");
    expect(out).not.toMatch(/[#*`[\]]/);
    expect(out.length).toBeLessThanOrEqual(150);
  });
});

describe("staticEmit — endpoints (N2)", () => {
  it("RSS lists ≤10 newest content pages with absolute URLs", () => {
    const xml = renderRss(site, meta, () => "body text");
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<title>Akasha</title>");
    expect((xml.match(/<item>/g) ?? []).length).toBe(10);
    expect(xml).toContain("https://akasha.iridi.cc/");
  });

  it("sitemap emits a <loc> per content page", () => {
    const xml = renderSitemap(site, meta);
    expect((xml.match(/<loc>/g) ?? []).length).toBe(site.docs.length);
    expect(xml).toContain("<urlset");
  });

  it("contentIndex is the {title,links,tags} subset keyed by FullSlug", () => {
    const idx = buildContentIndex(site);
    expect(Object.keys(idx)).toHaveLength(site.docs.length);
    const entry = idx.Timeline;
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty("title");
    expect(entry).toHaveProperty("links");
    expect(entry).toHaveProperty("tags");
    // the slim contract — NOT the full-text blob
    expect(Object.keys(entry ?? {}).sort()).toEqual(["links", "tags", "title"]);
  });
});
