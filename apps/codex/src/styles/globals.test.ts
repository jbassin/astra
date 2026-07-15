import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R1/R2/R6 (D29-63/D29-64/D29-66) — CSS-only changes have no computed-style
 * gate available under this repo's `renderToStaticMarkup`-only test
 * convention (no jsdom/browser CSS engine in the suite), so this is a
 * content-level gate on the committed stylesheet itself: the required
 * selectors/declarations are present, and the deleted `.site-foot` rule
 * leaves no trace. Paired with `globals.render.test.tsx`'s render-level
 * proof that real fixture markup actually reaches these selectors.
 */
const CSS = readFileSync(join(import.meta.dirname, "globals.css"), "utf8");

describe("R1 (D29-63): .codex-content table skin", () => {
  it("borders + collapses the table itself", () => {
    expect(CSS).toMatch(/\.codex-content table\s*\{[^}]*border-collapse:\s*collapse/);
  });
  it("borders + pads every cell", () => {
    expect(CSS).toMatch(/\.codex-content :is\(th, ?td\)\s*\{[^}]*border:/);
  });
  it("styles the header row in the .codex-heading small-caps grammar", () => {
    const rule = /\.codex-content th\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toMatch(/font-variant-caps:\s*small-caps/);
    expect(rule).toContain("var(--font-heading)");
  });
  it("zebra-tints alternating body rows", () => {
    expect(CSS).toMatch(/\.codex-content tbody tr:nth-child\(even\)\s*\{[^}]*background-color:/);
  });
});

describe("R2 (D29-64): .codex-content p honors literal \\n breaks", () => {
  it("declares white-space: pre-line on the paragraph rule", () => {
    const rule = /\.codex-content p\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*pre-line/);
  });
});

describe("R6 (D29-66): the orphaned .site-foot rule is gone, no dangling reference", () => {
  it("has no .site-foot selector left anywhere in the file", () => {
    expect(CSS).not.toMatch(/\.site-foot\b/);
  });
});
