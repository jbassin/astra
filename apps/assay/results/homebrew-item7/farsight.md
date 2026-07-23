# Farsight

## Header block

- **Rank:** 4 (store: `system.level.value = 4`)
- **Routing:** ledger:long-cast — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, detection, manipulate, memetics, scrying
- **Traditions:** arcane, occult
- **Rarity:** uncommon
- **Cast:** time.value = "1 minute"
- **Range:** "planetary"
- **Target:** "you"
- **Cost:** "sigils of seeing (100 gp per sigil in special ink) and a 250 gp magic circle (one-time construction cost)"
- **Defense:** `system.defense = null` (no save)
- **Duration:** "8 hours", not sustained
- **Heightening:** fixed, level "6" (empty object — appendix-only text)

## The 5e original

- **Level:** 4th
- **School:** Memetics
- **Casting time:** 1 minute
- **Range:** Self
- **Components:** V, S (no material — though gp costs are described in prose)
- **Duration:** Concentration, up to 8 hours
- **Classes:** Bard, Seeker, Wizard

> You empower a magic circle that links to sigils of seeing you previously created. You can select a number of sigils up to your Intelligence modifier (minimum of 1). The distance between the circle of scrying and the sigils of seeing is not a factor, and the sigils can even be on other planes of existence.
>
> When you stand inside your circle of scrying, you can view the area around any of the linked sigils as if you were actually standing at the location of the sigil. You can switch between different sigils as an action.
>
> The casting time for the spell depends on whether the circle is being drawn anew or a previously placed, permanent circle is being empowered. Drawing a new circle takes one day. Empowering a previously placed, permanent circle takes 1 minute.
>
> Drawing a new circle requires material components costing 250 gold pieces. The circle is typically a flat design of a geometric shape with a 5-foot radius.
>
> A sigil of seeing is created spending one minute drawing the sigil on a flat surface. Each sigil requires special ink that costs 100 gold pieces per sigil. The sigil disappears within moments of being drawn, but it reappears when you are scrying through it. A sigil is typically no more an inch in diameter. While a sigil is in use, it can be noticed by anyone who examines the spot where it's drawn and makes a successful DC 10 Wisdom (Perception) or Intelligence (Investigation) check. While the sigil isn't in use, finding it requires a deliberate search of the correct area and a successful Intelligence (Investigation) check against your spell saving throw DC.

No entriesHigherLevel; the 5e original has no upcast/heightening text.

## The conversion (canonical store)

> You empower a magic circle you previously constructed, linking it to sigils of seeing you have previously placed at remote locations. When you stand inside your empowered circle, you can choose to perceive the area around any linked sigil as if you were physically present at the sigil's location. You can see and hear the area as if using your normal senses. You can switch between linked sigils by using a 1-action Interact activity while inside the circle.
>
> The number of sigils you can link per casting equals your Intelligence modifier (minimum 1). Sigils can be on other planes of existence; the distance between circle and sigil is not a factor.
>
> **Constructing a sigil:** Each sigil requires 1 minute and 100 gp of special ink. The ink makes the sigil nearly invisible once applied; it requires a DC 10 Perception check to notice while the sigil is active, or a Seek action using your spell DC as the DC to find it while inactive.
>
> **Constructing a new circle:** Drawing a new circle requires 1 day and 250 gp. Empowering a previously placed circle takes only 1 minute.
>
> ---
> **Heightened (6th)** You can link one additional sigil per casting beyond your Intelligence modifier, and you can switch between sigils as a free action instead of an Interact action.

No `@UUID` links present. No success-tier structure (no save, so no degrees of success) — consistent with `system.defense = null`.

## What changed, plain English

The infrastructure-scrying fiction is preserved essentially verbatim: pre-placed 100-gp sigils linked to a 250-gp circle, Intelligence-modifier sigil cap (minimum 1), planar/distance-irrelevant linking, 1-day new-circle / 1-minute re-empower casting split. The gp costs carried over unchanged (100 gp/sigil, 250 gp/circle).

Structure/mechanics and content:
- 5e "concentration, up to 8 hours" → PF2e "8 hours" **not sustained** (`duration.sustained: false`) — the concentration requirement is dropped entirely, not converted to PF2e's sustain mechanic. This is a real mechanical change: the 5e version demands ongoing concentration (interruptible, competes with other concentration spells) for the full 8 hours, while the PF2e version runs for a flat 8 hours with no ongoing action-economy cost.
- 5e "sight only" ("view the area... as if you were actually standing at the location") → PF2e explicitly adds **hearing**: "You can see and hear the area as if using your normal senses." This is new content — the 5e text never mentions sound.
- 5e "switch between sigils as an action" (undefined action count) → PF2e "1-action Interact activity" (explicit action-cost translation).
- 5e sigil-detection rules (DC 10 Wisdom/Perception or Intelligence/Investigation while active; Investigation vs. spell DC while inactive) → PF2e collapses this to a single mechanic: "DC 10 Perception check to notice while active, or a Seek action using your spell DC... while inactive." The two 5e skill options (Perception-or-Investigation) are reduced to Perception-only in the PF2e active-state case.
- 5e non-scaling spell → PF2e adds one heighten tier with no 5e basis: rank 6 grants +1 sigil beyond the Intelligence modifier and upgrades sigil-switching from a 1-action Interact to a free action. Wholly new content.
- Traits added with no direct 5e basis: detection, memetics (school-as-trait replacing the 5e "Memetics" school field), scrying, concentrate/manipulate. Traditions arcane+occult replace the 5e Bard/Seeker/Wizard class list. Uncommon rarity is new (5e original has no rarity concept).

## Converter's notes

- **Anchor:** "Scrying (rank 6, uncommon, observe one named creature for 1 minute) — Farsight uses a pre-placed infrastructure system to achieve similar remote viewing at rank 4, constrained by the material and time investment in sigil placement"
- **Archetype:** utility/divination (remote sensing via infrastructure)
- **Balance bullets:**
  - "The sigil infrastructure cost (250 gp circle + 100 gp per sigil) is the primary balance lever — unlike Scrying, Farsight requires significant prior investment to function. A caster with no pre-placed sigils cannot use this spell."
  - "8-hour duration without concentration is appropriate for a utility scrying network — the investment in setup justifies the long-duration payoff."
  - "Intelligence-modifier-limited sigil count (min 1) creates meaningful character-build stakes — a wizard who invested in Int can monitor more locations."
  - "Uncommon rarity matches Scrying — remote sensing is inherently a GM-permission-required tool with story implications."
- **Overridable:**
  - "The 1-minute cast time (to empower an existing circle) could be increased to 10 minutes to make mid-adventure deployment less trivial."
  - "Sigil construction could require the caster to be physically present at the sigil location when drawing it — preventing remote sigil placement via other magic."
- **Checklist failures:**
  - "Checklist item 9 — strict upgrade concern: Farsight at rank 4 arguably exceeds Scrying (rank 6) in total capability (multiple sensors, 8-hour duration, planar range) — the infrastructure cost is the only balancing factor. Flagged as a potential power concern. The GM should ensure the material costs are enforced; if they are not, this spell outclasses Scrying at 2 ranks lower."

## Similar official spells

- **Scrying (rank 6)** — the converter's own anchor: single named/touched-possession target, sustained 10 minutes, Will save with degrees of success (temporary immunity/counter-scrying on the target's crit success). No pre-placement required, but higher rank, single target, and save-contested (Farsight has no save at all).
- **Clairvoyance (rank 4)** — exact-rank comparable: creates an invisible floating eye at a location within 500 ft, 10-minute duration, no save, no pre-placement or infrastructure cost. Farsight trades an up-front gp/time investment for planetary range, multiple simultaneous linked sensors (Int-mod count), and an 8-hour duration.
- **Clairaudience (rank 3)** — sibling to Clairvoyance, hearing-only floating ear at a location within 500 ft, 10 minutes, no save. Comparable to the auditory half of Farsight's sensor function.

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

None found in `revisions.md` — Farsight matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- The converter's own checklist-failures entry flags Farsight as *potentially exceeding* Scrying (rank 6) in total capability at rank 4, with the gp infrastructure cost as the sole balancing lever — the converter explicitly notes this is contingent on the GM enforcing those material costs at the table.
- `system.cost.value` carries an explicit gp-cost narrative (100 gp/sigil, 250 gp/circle) on a `type: "spell"` item — this differs from most other spells in this chunk (Do My Bidding, Ebb and Flow, Excavation), where 5e material components were dropped entirely under the Remaster no-material-components convention. Farsight instead preserves the costs as a structured `cost.value` field rather than dropping them.
- The 5e concentration requirement (8 hours of concentration) was dropped without becoming a PF2e sustain — `duration.sustained: false` for a flat 8-hour non-concentration effect. This removes an action-economy cost (competing with other concentration spells) that the 5e original had.
- `heightening.levels["6"]` is an empty object; the heighten effect lives only in the description HTML (per the adapter warning).

## Options & staff lean (enrichment, 2026-07-23)

The converter's OWN checklistFailures flags the real issue: at r4 this arguably exceeds
Scrying r6 (multi-sensor, planetary, 8 hours, NO save), with the gp infrastructure as
the only governor — and the conversion also silently deleted 5e's biggest cost, the
8-hour concentration lock. The partial defense the dossier undersells: the caster must
stand in the circle to perceive anything, which is a real session-scale cost (stationary,
vulnerable, out of the action) — the honest PF2e analog of the concentration lock.

- **A. Keep rank 4; harden the text per his own overridables** — (1) sigils must be
  drawn by you, physically present at the location (kills remote-placement exploits, the
  gap he named); (2) state explicitly that the remote perception functions only while
  you remain inside the circle (currently implied). With those pinned, the
  infrastructure + circle-bound costs justify r4 vs Clairvoyance r4's single free eye.
- **B. Rank 4 → 5** — blunt, and double-charges once A's constraints are explicit.
- **C. Keep as-is** — leaves the remote-sigil gap his notes warned about.

**Lean: A.**
