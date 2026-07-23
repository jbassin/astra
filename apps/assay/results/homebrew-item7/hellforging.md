# Hellforging

## Header block

- **Rank:** 7 (store `system.level.value = 7`)
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual figure supplied in the chunk 6 manifest for this spell — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "excluded 2 self-directed damage dice from EV (3d10 mental, 2d10 mental) — a cost paid by the caster, not the spell's output"
  - "cast time '24 hours' isn't a shape assay's own action-time parser recognizes — defaults to the 2-action structural multiplier"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics (custom trait) — rarity common
- **Traditions:** arcane, occult
- **Cast:** `24 hours` (system.time.value; not a discrete action count the assay's parser recognizes)
- **Range:** touch
- **Targets:** 1 inert constructed body
- **Defense:** none (no `system.defense` — the Will save described in the prose is not represented in the structured defense field)
- **Duration:** "permanent", `sustained: false`
- **Cost:** "a complete mechanical body worth 50,000 gp containing a core of refined Phlogiston (consumed)"
- **Heightening:** fixed-rank, at 9th

## The 5e original

- **Level:** 7 · **School:** memetics (source: `tfc`)
- **Casting time:** 24 hours
- **Range:** touch
- **Components:** V, S, M — "a complete mechanical body worth 100,000gp containing a core of refined Phlogiston" (cost 100,000 gp)
- **Duration:** instant
- **Classes:** Bard, Seeker (SW), Wizard

**Entries:**

> You spend a day inscribing an arcane contract into the core of an inert Hellforged Titan. At the end of that time, you must make a DC 20 Charisma saving throw to complete the process. If the saving throw fails, you take 3d10 psychic damage plus 2d10 necrotic damage from waves of uncontrolled energy rippling out from the core. You can maintain the spell, repeating the saving throw at the end of each of your turns, with the same consequence to you for each failure. If you choose not to maintain the spell or are unable to do so, the core shatters and renders the entire construct unusable.
>
> If the saving throw succeeds, you complete the construction process and animate the Titan. The Titan is friendly to you, but not under your control.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> You spend 24 hours inscribing an arcane contract into the core of a prepared mechanical body, binding a sliver of extraplanar will to animate it. At the end of the casting period, attempt a DC 25 Will saving throw. On a failure, you take 3d10 psychic damage and 2d10 mental damage as uncontrolled energies surge through you; you may choose to continue the casting and attempt the save again at the start of each subsequent hour (taking damage on each failure), or you may abandon the casting (destroying the core and the mechanical body). On a success, you complete the inscription and animate the construct. The resulting Hellforged Titan (use an appropriate construct stat block of level 14) is friendly toward you but is not under your control — it has its own will and motivations shaped by the contract you inscribed.
>
> **Heightened (9th)** The construct's level increases to 16 and you may write one binding clause into the contract, compelling the construct to follow one standing order (no combat-suicidal orders permitted).

The Will save (DC 25) and its damage-on-failure are entirely prose-only; `system.defense` is `null` and `system.damage` is `{}` in the structured fields, so nothing in the store's structured JSON represents the save, its DC, or the 3d10/2d10 damage dice — all of it lives only in the description text.

## What changed, plain English

- **Save type & organ:** 5e is a DC 20 **Charisma** save; the store retypes it as a DC 25 **Will** save. Both the ability score AND the DC increased (5→25 vs 20).
- **Damage typing:** 5e deals 3d10 psychic + 2d10 **necrotic**. The store keeps 3d10 psychic but retypes the second die to **2d10 mental** (necrotic → mental).
- **Repeat-save cadence:** 5e repeats the save "at the end of each of your turns" (i.e., every round) if the caster chooses to keep trying. The store instead repeats the save "at the start of each subsequent **hour**" — a dramatically slower failure/retry cadence (once per hour instead of once per round).
- **Material cost:** 5e's 100,000 gp mechanical-body cost is halved to 50,000 gp in the store.
- **Construct level:** 5e never states a level for the resulting Titan at all — it's left undefined in the 5e text. The store ADDS a specific "level 14" (heightened to 16 at rank 9) with no 5e basis; this number comes entirely from the PF2e conversion's own judgment (see converter's notes — jmnario flagged this as above the standard rank-7 summon table's level-9 expectation).
- **Heightening ADDED:** the 5e original has no higher-level text whatsoever. The store adds an entire rank-9 heightened tier (level 16 construct + one binding-clause standing order) that is wholly new content with no 5e source.
- **Cast-time structural encoding:** 5e's "24 hours" cast time is preserved verbatim as the store's `time.value`, but the assay's own parser can't recognize it as an action-time value and falls back to a 2-action structural multiplier for scoring purposes (adapter warning, not a store defect).

## Converter's notes

- **Anchor:** "no clean analog — 24-hour ritual to animate a major construct; closest is Animate Object (rank 2, arcane) or Golem-creation rituals in PF2e lore"
- **Archetype:** utility/ritual (construct creation)
- **Balance bullets:**
  - "24-hour cast time, 50,000 gp material cost, and a Will save with real damage on failure are three separate costs that justify animating a friendly (not controlled) rank-7 construct."
  - "The Titan being friendly but not controlled is the primary balance mechanism — the caster gains a powerful ally but cannot direct it tactically."
  - "Will save DC 25 is appropriate for a rank-7 ritual-tier effect; the repeated hourly saves create a tension mechanic without requiring a GM to adjudicate one-time success/failure."
  - "Mental damage on failure preserves the 5e psychic/necrotic surge flavor without using void (the original necrotic damage was from magical surge, not undead energy)."
  - "Material cost at 50,000 gp is equivalent to a major magic item; appropriate for a permanent rank-7 creation."
- **Overridable:**
  - "The construct level (14) is above the standard rank-7 summon table (level 9); justified by the 24-hour cast time, gp cost, and friendly-not-controlled status. GM may reduce to level 9 for stricter adherence."
  - "Could be redesigned as a PF2e downtime ritual rather than a spell — that's the more idiomatic format for 24-hour creation activities."
  - "The 'repeating hourly saves' mechanic has no PF2e precedent; could simplify to 'one save at the end of 24 hours.'"
- **Checklist failures:** none recorded.

## Similar official spells

- **Create Mycoguardian (ritual, base rank 1, scaling)** — the official "Creature Creation Rituals" table (also used by Create Undead, Animate Object, etc.) directly ties **creature level required** to **ritual rank required**: a level-14 creature officially requires **ritual rank 9**, not rank 7, and costs **13,500 gp** (not Hellforging's 50,000 gp material). A level-16 creature (Hellforging's own heightened-9th result) sits between the table's rank-9 (levels 14–15) and rank-10 (levels 16–17, cost 30,000–45,000 gp) rows. On success (non-minion) the created creature becomes "friendly" to the caster if intelligent — the same friendly-but-uncontrolled framing Hellforging uses.
- **Create Undead (ritual, base rank 2, same scaling table)** — same creature-level-to-ritual-rank table as above; cited here as confirmation the table is the shared PF2e-wide convention, not a one-off.
- **Animate Object (ritual, base rank 2)** — jmnario's own cited "closest analog"; also uses the same Creature Creation Rituals table and the same critical-success/success/failure/critical-failure structure (minion vs. friendly vs. hostile-critical-failure outcome).

## Prior astra touches

None found — `Hellforging` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- The DC-25 Will save, its damage dice, and the hourly-repeat mechanic exist ONLY in the description prose — `system.defense` is `null` and `system.damage` is `{}`, so none of this is represented in any structured field.
- The resulting construct's level (14, heightened 16) has no 5e source and sits well above the official Creature Creation Rituals table's rank-for-level correspondence (rank 7 → level 10–11 on that table, not 14).
- The `memetics` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- The repeat-save cadence changed units entirely (5e: every round; store: every hour) — a much more forgiving retry rate than the source, not merely a renamed mechanic.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose; no curse-removal language present.
