import { parseDocument } from "@astra/vellum-lang";
import type { Meta, StoryObj } from "@storybook/react";
import { DocumentView } from "../src/render";

/**
 * The vellum AST gallery — one story per `VellumDocument` node type, including
 * the four full-vellum constructs new in 0004 (frontmatter, crossref, fields,
 * timeline). Flip the **Mode** toolbar to see each in mechanical vs diegetic.
 * This gallery is 0004's deferred exit gate H: "gothic renders that AST."
 */
const meta: Meta = {
  title: "Vellum/Nodes",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

/** A story that renders a source string through the renderer at the global mode. */
function doc(source: string): Story {
  return {
    render: (_args, ctx) => {
      const mode = (ctx.globals.mode ?? "mechanical") as "mechanical" | "diegetic";
      return <DocumentView document={parseDocument(source, { mode })} />;
    },
  };
}

export const Statblock = doc(
  `:::statblock[Vox-Thrall Acolyte :action[free]]{level="Creature 2" traits="undead,mindless"}
A hollowed servitor wired to a vox-caster.

**Perception** +6; darkvision

## Actions
Strike :action[1] — a rusted blade.
Litany of Static :action[2] — grinding noise.
Flinch :action[reaction] — when struck, it recoils.
:::`,
);

export const Hazard = doc(
  `:::hazard[Collapsing Gantry]{level="Hazard 3" traits="environmental"}
A rusted walkway gives way underfoot.

**Stealth** DC 18 to notice the strain.
:::`,
);

export const Item = doc(
  `:::item[Boots of Speed :action[free]]{level="Item 4" tag="Consumable" price="45 gp"}
Once per day, gain a burst of supernatural quickness.
:::`,
);

export const Spell = doc(
  `:::spell[Litany of Static]{level="Spell 2" traits="sonic,mental"}
A #sonic wave of grinding noise. Cast :action[2].
:::`,
);

export const Handout = doc(
  `:::handout[+++ Inquisitorial Dispatch +++]
The observatory has gone dark. Trust no transmission that does not bear the
second cipher. The password is :redact[ashes to ashes].

— Interrogator Vael
:::`,
);

export const Edict = doc(
  `:::edict[Decree of the Provost]
By order of the Provost-Marshal, all vox-traffic through the Drowned Vault is
hereby interdicted until the censer is recovered.
:::`,
);

export const Prose = doc(
  `# The Drowned Vault

A real heading hierarchy, **bold**, *italic*, and a [link](https://example.com).

## Garrison
- two guards
- one cogitator-lock
- [x] outer seal set
- [ ] inner seal set

| Ability | Mod |
|:--------|----:|
| Str     | +4  |
| Dex     | +2  |

A claim that needs a source[^1].

[^1]: Recovered from a dead astropath.`,
);

export const Columns = doc(
  `# Encounter: The Drowned Vault

::::columns
:::statblock[Goblin A]{level="Creature 1"}
First card.
:::
:::statblock[Goblin B]{level="Creature 1"}
Stacked under the first.
:::

---

## Right brief
- two guards
- one cogitator-lock
::::`,
);

export const Fields = doc(
  `:::fields
Category :: Outer God
Domains :: [air](https://2e.aonprd.com), decay, and the [[Firmament|firmament]]
Edicts :: widen the crack, sing the static
:::`,
);

export const Timeline = doc(
  `:::timeline
- {Prehistory} The world is mundane.
- {0ag} The [[Iridescent Host]] instructs the Hierophant to widen the crack.
- {12ag} The censer is first lit in the nave.
- An entry with no marker is still an entry.
:::`,
);

export const CrossRef = doc(
  `See [[Belvedere]], the [[Firmament|firmament]], and [[Lore#origins|its origins]].
A pathed target works too: [[Geography/Calaria/index|Calaria]].`,
);

export const FrontmatterHeader = doc(
  `---
title: Belvedere
tags: [Watcher, Religious, Enclave]
aliases: The Enclave
---
The enclave watches the firmament from the high observatory.

It is the seat of the [[Iridescent Host]].`,
);

export const EveryNode = doc(
  `---
title: The Drowned Vault
tags: [Encounter, Aquatic]
---

# The Drowned Vault

Loose prose with a [[Belvedere#origins|crossref]] and a #fire trait.

:::statblock[Vox-Thrall :action[free]]{level="Creature 2" traits="undead"}
Strike :action[1], Litany :action[2].
:::

:::handout[+++ Dispatch +++]
The password is :redact[swordfish].
:::

:::fields
Category :: Outer God
:::

:::timeline
- {0ag} The Host widens the crack.
:::`,
);
