// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { noEmbedsCtx } from "@/testSupport";

import { renderNodes } from "../domain/render/nodes";

const CSS = readFileSync(join(import.meta.dirname, "globals.css"), "utf8").replaceAll(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The selector of the one rule that styles broken references. */
function brokenRefSelector(): string {
  const selectors = [...CSS.matchAll(/([^{}]*broken-ref[^{}]*)\{/g)].map((m) => m[1]?.trim());
  expect(selectors).toHaveLength(1);
  return selectors[0] ?? "";
}

describe("broken references", () => {
  it("the stylesheet's broken-ref rule matches the element the renderer emits", () => {
    const ctx = noEmbedsCtx();
    const markup = renderToStaticMarkup(
      <>{renderNodes([{ kind: "brokenRef", target: "spell/gone", display: "Gone Spell" }], ctx)}</>,
    );
    const host = document.createElement("div");
    host.innerHTML = markup;
    const el = host.firstElementChild;
    expect(el?.textContent).toBe("Gone Spell");
    expect(el?.matches(brokenRefSelector())).toBe(true);
  });
});
