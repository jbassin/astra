import { describe, expect, it } from "vitest";

import { errorAction, pageData } from "./staleBuild";

describe("pageData", () => {
  it("throws when the call returned nothing (an unknown server function)", () => {
    expect(() => pageData(undefined)).toThrow("page data request returned nothing");
  });

  it("passes page data, arrays and null (a missing page) through", () => {
    const view = { slug: "Timeline", title: "Timeline" };
    expect(pageData(view)).toBe(view);
    expect(pageData([])).toEqual([]);
    expect(pageData(null)).toBeNull();
  });
});

const u = (path: string) => new URL(path, "https://akasha.iridi.cc");

describe("errorAction", () => {
  it("reloads when a client navigation to another page fails", () => {
    // The router has already pushed the target, so the browser's URL is the target.
    expect(errorAction(u("/Timeline"), u("/Timeline"), u("/Bestiary/Beasts"))).toBe("reload");
  });

  it("loads the target when the browser's URL is still the old page", () => {
    expect(errorAction(u("/Timeline"), u("/Bestiary/Beasts"), u("/Bestiary/Beasts"))).toBe("load");
  });

  it("reloads rather than assigns when the target differs only by its hash", () => {
    expect(
      errorAction(
        u("/Script/Unsorted/2025-3-5#12-Mike"),
        u("/Script/Unsorted/2025-3-5#12-Mike"),
        u("/"),
      ),
    ).toBe("reload");
  });

  it("shows the error page when the failing page is the one the document loaded", () => {
    // A 5xx on a fresh load, a Retry on it, or a failure right after a reload: no loop.
    expect(errorAction(u("/Timeline"), u("/Timeline"), u("/Timeline"))).toBe("show-error");
    expect(errorAction(u("/Timeline#top"), u("/Timeline#top"), u("/Timeline"))).toBe("show-error");
  });

  it("treats a different query as a different page", () => {
    expect(errorAction(u("/tags?x=1"), u("/tags?x=1"), u("/tags"))).toBe("reload");
  });

  it("never leaves the origin", () => {
    expect(errorAction(new URL("https://example.com/x"), u("/Timeline"), u("/Timeline"))).toBe(
      "show-error",
    );
  });
});
