import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AttachedSidebarView } from "../../server/entityPageData";
import { AttachedSidebars } from "./AttachedSidebars";
import { rootRenderCtx } from "./nodes";

function sidebar(overrides: Partial<AttachedSidebarView> = {}): AttachedSidebarView {
  return {
    id: "sidebar/dice",
    name: "Dice",
    body: [
      {
        kind: "paragraph",
        children: [
          {
            kind: "text",
            content: "Roll dice.",
            marks: { bold: false, italic: false, superscript: false },
          },
        ],
      },
    ],
    source: { book: "Player Core", license: "ORC", page: 6 },
    superseded: false,
    ...overrides,
  };
}

const ctx = rootRenderCtx({ resolveEmbed: () => undefined, knownTraitIds: new Set() });

function html(sidebars: readonly AttachedSidebarView[], legacy: boolean): string {
  return renderToStaticMarkup(<AttachedSidebars sidebars={sidebars} legacy={legacy} ctx={ctx} />);
}

describe("AttachedSidebars (D29-42)", () => {
  it("renders nothing for an empty list", () => {
    expect(html([], true)).toBe("");
  });

  it("renders a title, full body, citation, and a standalone-page link for a visible sidebar", () => {
    const out = html([sidebar()], true);
    expect(out).toContain("codex-attached-sidebar");
    expect(out).toContain("Dice");
    expect(out).toContain("Roll dice.");
    expect(out).toContain("Player Core");
    expect(out).toContain('href="/sidebar/dice"');
  });

  it("a non-superseded sidebar renders under legacy=false with no hidden note", () => {
    const out = html([sidebar({ superseded: false })], false);
    expect(out).toContain("Dice");
    expect(out).not.toContain("codex-rules-hidden-note");
  });

  it("a superseded sidebar is hidden under legacy=false, with an 'N hidden' note", () => {
    const out = html([sidebar({ superseded: true })], false);
    expect(out).not.toContain("Dice");
    expect(out).toContain("codex-rules-hidden-note");
    expect(out).toContain("all 1 hidden");
  });

  it("a superseded sidebar renders under legacy=true, with its own Legacy pill", () => {
    const out = html([sidebar({ superseded: true })], true);
    expect(out).toContain("Dice");
    expect(out).toContain("codex-edition-legacy");
    expect(out).not.toContain("codex-rules-hidden-note");
  });

  it("a mix of visible + hidden sidebars renders the partial 'N hidden' wording (not 'all')", () => {
    const out = html(
      [
        sidebar({ id: "sidebar/a", name: "Visible One", superseded: false }),
        sidebar({ id: "sidebar/b", name: "Hidden One", superseded: true }),
      ],
      false,
    );
    expect(out).toContain("Visible One");
    expect(out).not.toContain("Hidden One");
    expect(out).toContain("1 hidden");
    expect(out).not.toContain("all 1 hidden");
  });

  it("multiple visible sidebars all render as separate aside cards, each linking its own standalone page", () => {
    const out = html(
      [sidebar({ id: "sidebar/a", name: "First" }), sidebar({ id: "sidebar/b", name: "Second" })],
      true,
    );
    expect(out).toContain("First");
    expect(out).toContain("Second");
    expect(out).toContain('href="/sidebar/a"');
    expect(out).toContain('href="/sidebar/b"');
  });
});
