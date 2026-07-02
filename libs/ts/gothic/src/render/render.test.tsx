import { parseDocument } from "@astra/vellum-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DocumentView } from "./components/DocumentView";

/**
 * The CI-enforced "gothic renders that AST" gate (0004 exit gate H) — browser-free.
 * One fixture exercises EVERY VellumDocument node type + the 4 new constructs;
 * we render it through `react-dom/server` and assert structure + totality. The
 * human visual gallery is Storybook; the PNG goldens are vellum-frontend's.
 */
const EVERY_NODE = `---
title: The Drowned Vault
tags: [Encounter, Aquatic]
aliases: [The Vault]
folder: Encounters
---

# The Drowned Vault

Loose prose with a [[Belvedere#origins|crossref]], a #fire trait, and ||a secret||.

| Ability | Mod |
|:--------|----:|
| Str     | +4  |

- [x] sealed
- [ ] open

A note[^1].

[^1]: the footnote.

:::statblock[Vox-Thrall :action[free]]{level="Creature 2" traits="undead,mindless" tag="Foe"}
A hollowed servitor. Strike :action[1], Litany :action[2], Flinch :action[reaction].
:::

:::handout[+++ Dispatch +++]
The observatory has gone dark. The password is :redact[swordfish].
:::

::::columns
:::item[Boots]{level="Item 4"}
First.
:::

---

## Right
- two guards
::::

:::fields
Category :: Outer God
Domains :: [air](https://2e.aonprd.com), decay, and the [[Firmament|firmament]]
:::

:::timeline
- {Prehistory} The world is mundane.
- {0ag} The [[Iridescent Host]] widens the crack.
- An entry with no marker.
:::

:::deity[Eternal Pulse]{category="Outer God"}
Edicts :: Heal wounds, pursue undeath
Anathema :: Abandon the dying

### Devotee Benefits
Divine Skill :: [Medicine](https://2e.aonprd.com)
:::
`;

describe("DocumentView renders every AST node", () => {
  for (const mode of ["mechanical", "diegetic"] as const) {
    test(`renders the full corpus in ${mode} mode without throwing`, () => {
      const doc = parseDocument(EVERY_NODE, { mode });
      const html = renderToStaticMarkup(<DocumentView document={doc} />);

      // Export boundary + theme axis.
      expect(html).toContain("data-vellum-export");
      expect(html).toContain(`data-mode="${mode}"`);
      // Frontmatter header (title + a tag pill).
      expect(html).toContain("The Drowned Vault");
      expect(html).toContain("Encounter");
      // Block kinds + tag override.
      expect(html).toContain('data-kind="statblock"');
      expect(html).toContain('data-kind="handout"');
      expect(html).toContain('data-kind="item"');
      expect(html).toContain("Foe");
      // Inline directives: action glyph (inline SVG), trait pill, redaction.
      expect(html).toContain("<svg");
      expect(html).toContain('aria-label="free action"');
      expect(html).toContain("[DATA EXPUNGED]");
      // The 4 new constructs.
      expect(html).toContain("data-crossref-target");
      expect(html).toContain("Outer God"); // fields term
      expect(html).toContain("Prehistory"); // timeline marker
      // Deity card: corner tag, name, the brace category, + the section sub-label.
      expect(html).toContain('data-kind="deity"');
      expect(html).toContain("Eternal Pulse");
      expect(html).toContain("Devotee Benefits");
      // GFM.
      expect(html).toContain("<table");
      expect(html).toContain('type="checkbox"');
      expect(html).toContain("data-footnote");
    });
  }
});

describe("renderer is total", () => {
  test("malformed inline directive becomes a visible error chip, never throws", () => {
    const doc = parseDocument(":::statblock[X]\nCast :action[seven] now.\n:::");
    const html = renderToStaticMarkup(<DocumentView document={doc} />);
    expect(html).toContain("?action[seven]");
  });

  test("a misplaced :::columns inside a card flags but still renders content", () => {
    const doc = parseDocument(":::statblock[X]\n:::columns\noops\n:::\n:::");
    const html = renderToStaticMarkup(<DocumentView document={doc} />);
    expect(html).toContain("only at top level");
    expect(html).toContain("oops");
  });

  test("empty document renders just the export frame", () => {
    const doc = parseDocument("");
    const html = renderToStaticMarkup(<DocumentView document={doc} />);
    expect(html).toContain("data-vellum-export");
  });
});
