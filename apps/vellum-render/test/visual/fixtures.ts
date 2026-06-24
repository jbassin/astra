import type { ThemeMode } from "@astra/vellum-lang";

/** Golden-image fixtures (NFR-9). Cover both skins + a multi-kind layout + the
 *  full-vellum fields/timeline constructs (0013 D4/D6). Ported from faerrin
 *  pkg/vellum, ThemeMode now from @astra/vellum-lang. */
export interface VisualFixture {
  name: string;
  source: string;
  mode: ThemeMode;
  scale?: number;
}

export const FIXTURES: VisualFixture[] = [
  {
    name: "statblock-mechanical",
    mode: "mechanical",
    source: `:::statblock[Vox-Thrall Acolyte]{level="Creature 2" traits="undead,mindless"}
A hollowed servitor wired to a vox-caster.

## Actions
Strike :action[1] — a rusted blade.
Litany of Static :action[2] — grinding noise.
Flinch :action[reaction] — when struck.
:::`,
  },
  {
    name: "statblock-diegetic",
    mode: "diegetic",
    source: `:::statblock[Censer-Wraith]{level="Creature 4" traits="undead,incorporeal,fire"}
A coil of burning incense-smoke that remembers being a priest.

## Actions
Smoke Lash :action[1] — reach 10 ft.
:::`,
  },
  {
    name: "handout-diegetic",
    mode: "diegetic",
    source: `:::handout[+++ Inquisitorial Dispatch +++]
The observatory has gone dark. Three cogitator-shrines remain unaccounted
for, last logged near :redact[Sub-Sector Coram]. Trust no transmission.

— Interrogator Vael
:::`,
  },
  {
    name: "zoo-mechanical",
    mode: "mechanical",
    source: `:::hazard[Censer of Ash]{level="Hazard 3" traits="trap,fire"}
**Stealth** +12
The plate triggers a 15-foot burst of searing ash.
:::

:::spell[Auspex Scan]{level="2" traits="divination"}
**Cast** :action[2]
Learn the position of every heat-source for 1 round.
:::`,
  },
  {
    name: "gfm-mechanical",
    mode: "mechanical",
    source: `:::item[Targeting Auspex]{level="3"}
| Range | Bonus |
|:------|------:|
| Close | +4 |
| Far | +2 |

- [x] calibrated
- [ ] aligned

~~Obsolete pattern.~~ See cogitator log www.example.com for details.
:::`,
  },
  {
    name: "fields-mechanical",
    mode: "mechanical",
    source: `:::fields
Price :: 25 gp
Usage :: held in 1 hand; Bulk L
Activate :: :action[1] Interact, command the seal
Traits :: magical, consumable
:::`,
  },
  {
    name: "timeline-diegetic",
    mode: "diegetic",
    source: `:::timeline
- {Age of Static} The vox-shrines first fall silent across the sub-sector.
- {1 Calistril} Interrogator Vael logs the observatory blackout.
- {Now} Three cogitator-shrines remain unaccounted for.
:::`,
  },
];
