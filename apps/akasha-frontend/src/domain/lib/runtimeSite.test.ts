import { describe, expect, it } from "vitest";
import { ALIASES } from "@/generated/site";
import {
  contentView,
  folderView,
  resolvePath,
  tagExists,
  tagIndexView,
  tagView,
} from "./runtimeSite";
import type { FullSlug } from "./slug";

// runtimeSite reconstructs the index from the generated module (emitted by
// build-content via the global setup), so these assert the runtime resolver +
// view builders against the real snapshot-derived data.

describe("resolvePath — URL → page kind (faerrin's catch-all)", () => {
  it("maps the empty path to the home content page", () => {
    expect(resolvePath("")).toEqual({ kind: "content", slug: "index" });
    expect(resolvePath("/")).toEqual({ kind: "content", slug: "index" });
  });

  it("maps a content slug to a content page", () => {
    expect(resolvePath("Anzu")).toEqual({ kind: "content", slug: "Anzu" });
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
    const v = contentView("Anzu" as FullSlug);
    expect(v.title).toBe("Anzu");
    expect(v.showBreadcrumbs).toBe(true);
    expect(v.crumbs[0]?.displayName).toBe("Home");
    const titles = v.backlinks.map((b) => b.label);
    expect([...titles].sort()).toEqual(titles); // sorted by title
    // slice 4: the build-rendered vellum body + reading time
    expect(v.bodyHtml).toContain("data-vellum-export");
    expect(v.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("the home content view hides breadcrumbs", () => {
    expect(contentView("index" as FullSlug).showBreadcrumbs).toBe(false);
  });

  it("folderView lists children with a count label + relative hrefs", () => {
    const v = folderView("Divinity");
    expect(v.title).toBe("Divinity");
    expect(v.entries.length).toBeGreaterThan(0);
    expect(v.itemsLabel).toMatch(/items? under this folder/);
    for (const e of v.entries)
      expect(e.href.startsWith("../") || e.href.startsWith("./")).toBe(true);
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
