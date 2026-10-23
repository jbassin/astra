# Preserve Foodstuffs

## Header block

- **Rank:** 1
- **Routing:** ledger:long-cast
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed, not quantitatively scored)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate (rarity: common)
- **Traditions:** arcane, primal
- **Cast:** 1 minute (`system.time.value = "1 minute"`, no action-count field)
- **Range:** touch
- **Target:** 1 container of up to 10 cubic feet volume
- **Area:** none
- **Defense:** none
- **Duration:** not sustained, "until opened"
- **Damage:** none
- **Heightening (structured):** `system.heightening = {"levels": {"3": {}}, "type": "fixed"}` — a fixed-rank trigger at rank 3 with an *empty* level payload (no structured mechanical content; see Open flags)
- **Seeded from:** convertedName "Preserve Foodstuffs" / originalName "Preserve Foodstuffs" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 1st
- **School:** Chronomancy (homebrew school)
- **Casting time:** 1 minute
- **Range:** Point, touch
- **Components:** V, S (no material)
- **Duration:** 24 hours, no concentration
- **Classes:** Bard, Druid, Wizard
- **Ritual:** Yes

> You freeze an object in time, completely preserving its insides. When you cast this spell on a container with a volume equal to or less than 10 cubic feet, you may stop the progression of time inside the container. Any item with a limited shelf-life will last indefinitely when preserved in this manner. The spell fails if a living creature is inside the container when the spell is cast. The spell ends when the container is opened.

No "At Higher Levels" entry in the 5e original — the base version has no explicit upcast text.

## The conversion (canonical store)

You freeze time within a closed container, perfectly preserving all contents inside. While the spell is active, nothing inside the container ages, spoils, rots, or changes state; perishables remain indefinitely fresh. The spell has no effect on living creatures (it automatically fails if any living creature is inside when the spell is cast). The spell ends immediately when the container is opened, at which point normal time resumes inside. This spell can preserve containers of up to 10 cubic feet in volume.

---

**Heightened (3rd)** The container volume increases to 50 cubic feet. You can also target multiple sealed containers up to that combined volume.

**Structured-field disagreement:** the store's structured `system.heightening.levels["3"]` object is empty (`{}`) — it registers *that* a rank-3 heightening trigger exists but carries none of the "volume increases to 50 cubic feet / multiple sealed containers" content that's actually in the prose. The mechanical substance of the heighten only lives in the description text, per the adapter warning.

## What changed, plain English

The core time-freeze-in-a-container fiction, the "no effect on living creatures / fails if one is inside" safety clause, the "ends when opened" termination trigger, and the 10-cubic-foot base volume limit are all preserved essentially verbatim.

- **Numbers:** casting time stays 1 minute (unchanged). Duration changes from 5e's flat "24 hours, no concentration" to PF2e's "until opened" (an indefinite/exploration-tier duration rather than a fixed real-world clock) — this is a meaningful functional expansion: the 5e version stops working after 24 hours even if the container is never opened, while the store version lasts indefinitely until opened, however long that takes.
- **Structure:** no save, no degrees of success in either version (pure utility effect). Action economy for the 1-minute cast has no PF2e action-count field (`system.time.value` is a duration string "1 minute," not an action-count number) — this matches the ledger:long-cast routing.
- **Content added:** the rank-3 heightening (container volume 10→50 cubic feet, plus the ability to target multiple sealed containers up to that combined volume) is entirely new — the 5e original has no "At Higher Levels" text at all, so this whole heighten tier was invented during conversion rather than adapted from an existing 5e upcast rule.
- **Ritual status dropped:** the 5e original is a **ritual** (castable without expending a spell slot, typically at greater time cost/risk); the PF2e store version is a normal prepared/spontaneous spell with no ritual-casting option and no corresponding PF2e ritual entry — this is a structural downgrade in casting flexibility that isn't called out in the converter's notes as an explicit trade (see Open flags).
</br>
- **Content dropped:** nothing substantive from the core effect description; the material-component field is moot since 5e had none (V, S only).

## Converter's notes

**Anchor:** "no clean analog — closest is Continual Flame (rank 2, permanent effect) for duration pattern"

**Archetype:** utility (time-stop preservation)

**Balance bullets:**
- "No PF2e combat analog; this is a pure exploration/downtime utility. Rank 1 is appropriate for a non-combat effect that merely preserves food."
- "Duration 'until opened' captures the narrative intent; the 5e 24-hour limit was a game-balance concession that feels wrong for a 'freeze time in a container' spell."
- "Time trait is a custom trait (no official PF2e 'time' trait); logged as overridable. Chronomancy spells in this collection may need a custom trait for tradition tracking."
- "Living-creature failure clause is an important safety valve against 'preserve a creature indefinitely' abuse."

**Overridable:**
- "The 'time' trait is not an official PF2e trait; the GM may want to replace it with the 'manipulate' trait only, or create a custom 'chronomancy' or 'temporal' trait for the school."
- "Duration could be reverted to 24 hours (as 5e) or extended to 1 week with a heightened option for permanent."

**Checklist failures:**
- "'Time' is not an official PF2e Remaster trait. Applied as a custom school tag to maintain the chronomancy identity. GM should decide whether to adopt a custom 'chronomancy' or 'temporal' trait, or simply drop it."

**Note on the store's actual traits:** the store's `system.traits.value` is `["chronomancy", "concentrate", "manipulate"]` — it uses **chronomancy**, not the literal **time** trait jmnario's notes/checklist-failure discuss. jmnario's intermediate conversion (`all_spells_pf2e.json`) does list `"traits": ["concentrate", "manipulate", "time"]` — so the store diverges from jmnario's own conversion by swapping "time" for "chronomancy" at some point in the astra adapter/store pipeline, resolving the checklist failure jmnario flagged, though this resolution isn't logged in `revisions.md` (see Open flags).

## Similar official spells

- **Cleanse Cuisine** (rank 1) — purifies food/drink and removes toxins/contamination but explicitly does *not* prevent future spoilage or decay; useful direct-rank contrast showing the boundary PF2e draws between "make food good now" (Cleanse Cuisine) and "stop time entirely" (Preserve Foodstuffs) utility spells.
- **Enhance Victuals** (rank 2) — transforms food/drink into gourmet fare and counteracts poisons, 1-hour duration; one rank up, shows a time-boxed food-utility spell for comparison against Preserve Foodstuffs' open-ended "until opened" duration.
- **Empty Pack** (rank 2) — renders a container's contents invisible/undetected, 1-hour duration; not a preservation effect, but the closest official "you touch a container and something abstractly happens to everything inside it" utility-spell shape, one rank above Preserve Foodstuffs.

## Prior astra touches

None found — no `preserve-foodstuffs` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- Structured `system.heightening.levels["3"]` is an empty object even though the rank-3 heighten has real mechanical content (volume 10→50 cubic feet, multi-container targeting) — the mechanical substance only exists in the description-text appendix, per the adapter warning.
- The 5e original is a **ritual** spell; the store conversion drops ritual status entirely with no corresponding PF2e ritual variant and no note in jmnario's `changedElements` acknowledging the loss of ritual-casting flexibility.
- The store's trait list uses **chronomancy** where jmnario's intermediate conversion and conversion-notes checklist-failure both reference **time** as the (non-official, overridable) custom trait — the store has evidently been changed from jmnario's version on this point, but there's no `revisions.md` entry documenting when/why, since the store's `chronomancy`+`concentrate`+`manipulate` traits match the *baseline re-conversion* exactly (0 deviations) — meaning this trait swap must have happened upstream, inside the `homebrew.convert_spell` adapter itself, not as a hand-edit.
- No "At Higher Levels" text exists in the 5e original at all — the rank-3 heighten is 100% new content invented during conversion, not adapted from any 5e source text.
