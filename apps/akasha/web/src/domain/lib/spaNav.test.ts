import { describe, expect, it } from "vitest";

import { isBrowserClick, spaHref } from "./spaNav";

const here = new URL("https://akasha.iridi.cc/Bestiary/Beasts");
const to = (href: string) => new URL(href, here);

describe("spaHref", () => {
  it("routes an internal page, keeping query and hash", () => {
    expect(spaHref(to("../Timeline"), here)).toBe("/Timeline");
    expect(spaHref(to("/Script/Unsorted/2025-3-5#12-Mike"), here)).toBe(
      "/Script/Unsorted/2025-3-5#12-Mike",
    );
    expect(spaHref(to("/tags/Fey?x=1"), here)).toBe("/tags/Fey?x=1");
  });

  it("routes slugs that contain dots or commas", () => {
    expect(spaHref(to("/Org/Amber-Call/People/Mr.-Whiskers"), here)).toBe(
      "/Org/Amber-Call/People/Mr.-Whiskers",
    );
    expect(spaHref(to("/Script/Through-a-Song,-Darkly/2025-10-20"), here)).toBe(
      "/Script/Through-a-Song,-Darkly/2025-10-20",
    );
  });

  it("leaves other origins and static files to the browser", () => {
    expect(spaHref(new URL("https://2e.aonprd.com/Spells.aspx?ID=1"), here)).toBeNull();
    expect(spaHref(to("/audio/2025-3-5.mp3"), here)).toBeNull();
    expect(spaHref(to("/index.xml"), here)).toBeNull();
    expect(spaHref(to("/static/contentIndex.json"), here)).toBeNull();
    expect(spaHref(to("/pagefind/pagefind.js"), here)).toBeNull();
  });

  it("leaves a jump to an anchor on the current page to the browser", () => {
    expect(spaHref(to("#12-Mike"), here)).toBeNull();
    // The same page without a hash is a real navigation (back to the top, a fresh mount).
    expect(spaHref(to("/Bestiary/Beasts"), here)).toBe("/Bestiary/Beasts");
  });
});

const anchor = (attrs: Record<string, string> = {}) => {
  const a = document.createElement("a");
  a.href = "/Timeline";
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  return a;
};
const click = (init: MouseEventInit = {}) => new MouseEvent("click", { button: 0, ...init });

describe("isBrowserClick", () => {
  it("takes a plain left click", () => {
    expect(isBrowserClick(click(), anchor())).toBe(false);
    expect(isBrowserClick(click(), anchor({ target: "_self" }))).toBe(false);
  });

  it("leaves modified clicks, new-tab targets and downloads to the browser", () => {
    expect(isBrowserClick(click({ ctrlKey: true }), anchor())).toBe(true);
    expect(isBrowserClick(click({ metaKey: true }), anchor())).toBe(true);
    expect(isBrowserClick(click({ shiftKey: true }), anchor())).toBe(true);
    expect(isBrowserClick(click({ button: 1 }), anchor())).toBe(true);
    expect(isBrowserClick(click(), anchor({ target: "_blank" }))).toBe(true);
    expect(isBrowserClick(click(), anchor({ download: "" }))).toBe(true);
  });
});
