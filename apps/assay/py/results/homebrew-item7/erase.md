# Erase

## Header block

- **Rank:** 1 (store: `system.level.value = 1`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** touch
- **Target:** "1 written or inscribed object or surface"
- **Defense:** `system.defense = null` (no save)
- **Duration:** "" (instantaneous, not sustained)
- **Heightening:** fixed, levels "3" and "5" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 1st
- **School:** Memetics
- **Casting time:** 1 action
- **Range:** Touch
- **Components:** V, S (no material)
- **Duration:** Instantaneous
- **Classes:** Bard, Seeker, Wizard
- **Ritual:** Yes (the 5e original is castable as a ritual)

> This spell destroys any writing or drawing on an object you touch, so long as the object has less than 100 pages or the surface area of the object is less than 50 square feet. The object itself is unharmed, and appears to have never been written on in the first place. This can effect magical writing, including spellbooks and glyphs.

No entriesHigherLevel; the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> You touch an object or surface bearing writing, drawing, or inscription and erase it entirely. The writing vanishes as if it had never been made; the underlying object or surface is completely unharmed. You can erase up to 100 pages of text or a surface area of up to 50 square feet in one casting. Mundane writing is erased automatically. Magical writing (including glyphs, sigils, and spellbook pages) is also erased; if the writing was a prepared magical effect (such as a glyph of warding), erasing it counteracts the effect at the spell's rank (rank 1 counteract). The object or surface appears virgin to all mundane inspection; a Detect Magic or Recall Knowledge check against your spell DC reveals only that something has been erased.
>
> ---
> **Heightened (3rd)** You can erase magical writing from prepared scrolls and formula books; a magical scroll erased this way is destroyed without activating.
> **Heightened (5th)** You can erase runes and property runes inscribed on weapons and armor; each rune erased is permanently destroyed.

No `@UUID` links present. No success-tier structure at all (no save, so no degrees of success) — consistent with `system.defense = null`.

## What changed, plain English

The core function is preserved: touch a surface/object, erase mundane or magical writing entirely and invisibly, up to 100 pages or 50 sq ft, object unharmed. The page/area caps carried over unchanged.

Structure/mechanics:
- 5e "castable as a ritual" (`meta.ritual: true`) → PF2e version is a plain spell (`type: "spell"`), not built as a PF2e ritual. This is a category change, not just a numeric one.
- 5e no game-mechanical interaction for erasing "magical" writing beyond flavor text → PF2e adds an explicit **counteract mechanic**: erasing a prepared magical effect (e.g., glyph of warding) counteracts it at the spell's rank (rank 1 counteract). This is wholly new content with no 5e basis — the 5e text just says magical writing "can" be affected with no game-system hook.
- PF2e adds a **Detect Magic / Recall Knowledge counterplay clause** ("reveals only that something has been erased") — new content, no 5e equivalent; the 5e original says nothing about how erasure is detected afterward.
- 5e non-scaling spell → PF2e adds two heighten tiers with no 5e basis: rank 3 (erase scrolls/formula books, destroying an erased scroll without activating it) and rank 5 (erase and permanently destroy runes/property runes on weapons/armor). Both interact with PF2e-specific systems (scrolls, runes) that don't exist in the 5e rules the spell was converted from.
- Traits added with no direct 5e basis: memetics (school-as-trait replacing the 5e "Memetics" school field), concentrate/manipulate. Traditions arcane+occult replace the 5e Bard/Seeker/Wizard class list.

## Converter's notes

- **Anchor:** "no clean analog — closest is Illusory Writing (rank 1) or Prestidigitation for text effects"
- **Archetype:** utility (information destruction)
- **Balance bullets:**
  - "No direct PF2e analog; designed from the utility-spell budget for rank 1 (non-combat, touch, instantaneous)."
  - "Counteract rank 1 is the appropriate level for erasing rank-1 magical effects (glyphs, sigils); it cannot erase rank-2+ magical writing at base."
  - "Heightened 3rd (scroll destruction) and 5th (rune erasure) give the spell relevant PF2e system interactions that the 5e original couldn't have (PF2e's rune/scroll economy)."
  - "Detect Magic interaction added as a safety valve; without it, a rank-1 Erase that leaves zero trace would trivially defeat all investigation spells."
- **Overridable:**
  - "Could be rank 0 (cantrip) limited to 1 page per casting with no magical-writing interaction."
  - "The rune-erasure at rank 5 could be restricted to only property runes (not fundamental runes) to preserve weapon/armor progression."
- **Checklist failures:** none

## Similar official spells

- **Erase Trail (rank 2)** — name-adjacent but functionally different: reduces signs of a creature's *physical passage* (footprints, disturbed grass) rather than erasing written text; burst 40 ft area, no save. Loosely comparable as "information-destruction utility," not a close mechanical match.
- **Mending (rank 1)** — opposite-direction utility at the same rank: repairs/restores a damaged object rather than erasing its contents. Useful as a rank-1-utility-spell scale reference (touch/2-action, narrow practical effect).
- No exact "erase written/magical text" analog exists in the sampled official spell/ritual/focus folders — this matches the converter's own "no clean analog" note.

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

None found in `revisions.md` — Erase matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- The 5e original is ritual-castable (`meta.ritual: true`); the PF2e conversion is a plain spell with no ritual variant or note about the dropped ritual-casting option.
- `heightening.levels["3"]` and `["5"]` are both empty objects; both heighten effects (scroll destruction at 3rd, rune erasure at 5th) live only in the description HTML (per the adapter warning).
- `system.defense = null` (no save) is consistent with the description having no success-tier structure — no disagreement there, noted for completeness.
