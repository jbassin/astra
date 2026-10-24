# Jolt

## Header block

- **Rank:** 5 (store `system.level.value = 5`)
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual figure supplied in the chunk 6 manifest for this spell — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy (custom trait), concentrate, manipulate — rarity common
- **Traditions:** arcane, occult, primal
- **Cast:** `2` actions
- **Range:** 30 feet
- **Targets:** up to 4 willing creatures
- **Defense:** none
- **Duration:** `system.duration.value = ""` (empty string), `sustained: false` — see Open flags
- **Cost:** `system.cost.value = ""` (empty)
- **Heightening:** fixed-rank, at 7th and 9th

## The 5e original

- **Level:** 5 · **School:** chronomancy (source: `tfc`)
- **Casting time:** 1 action
- **Range:** 30 feet
- **Components:** V, S (no material)
- **Duration:** instant
- **Classes:** Bard, Druid, Wizard

**Entries:**

> You donate some of your time for others to spend. Select up to four willing creatures you can see within range. Each of those creatures can immediately make one weapon attack with a ready weapon; each can also move up to 10 feet before or after the attack.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> You donate a fraction of your own time-stream to willing allies, jolting each of them forward by a breath. Each target immediately gains 1 free action it must use before the start of your next turn. This free action can be used to make one Strike with a weapon or unarmed attack the target currently has at the ready, or to Stride up to 10 feet. The Stride and the Strike can be taken in either order if both are triggered by the same target (the target chooses).
>
> The free action is lost if not used before the start of your next turn. This spell does not grant extra actions that persist into the target's own turn.
>
> **Heightened (7th)** The range increases to 60 feet and you can target up to 6 willing creatures.
> **Heightened (9th)** Each target may use the free action for a Strike, a Stride, or both (in any order).

Structured fields agree with the prose on target count (4, rising to 6 at heightened-7th) and range (30 ft, rising to 60 ft at heightened-7th).

## What changed, plain English

- **Strike AND Stride → Strike OR Stride:** this is the core mechanical change. 5e explicitly grants each target BOTH one weapon attack AND up to 10 feet of movement, in either order, from the same casting. The base-rank store version only grants ONE free action usable for either a Strike OR a Stride — not both — at rank 5. Getting both together (matching the full 5e text) is pushed to the rank-9 heightened tier in the store.
- **Weapon-only vs. weapon-or-unarmed:** 5e restricts the free attack to "a weapon attack with a ready weapon." The store widens this to "a Strike with a weapon or unarmed attack" — unarmed strikes now qualify, which 5e's text doesn't allow.
- **Action-persistence clause ADDED:** the store explicitly states "This spell does not grant extra actions that persist into the target's own turn." 5e's text doesn't need this clause (5e has no PF2e-style turn-action economy to clarify), but it also doesn't otherwise limit the timing — this is new clarifying language with no direct 5e counterpart.
- **Heightening ADDED wholesale:** the 5e original has zero upcast/heightening text. The store adds two full heightened tiers (7th: range 60 ft + up to 6 targets; 9th: Strike-and-Stride together) — entirely new content invented for the conversion.
- **Duration representation:** 5e states duration "instant." The store's `system.duration.value` is an empty string (not the word "instantaneous" or any other value) — see Open flags.
- **Traditions:** 5e's class list (Bard/Druid/Wizard) becomes arcane + occult + primal in the store — Bard doesn't map cleanly to all three of those in typical 1:1 class-to-tradition schemes; jmnario's notes justify this as "chronomancy is broadly accessible across traditions" rather than a strict class-derived mapping.

## Converter's notes

- **Anchor:** "Haste (rank 3, 1 target) — Jolt is a multi-target, lower-effect variant at rank 5"
- **Archetype:** buff / utility (action grant)
- **Balance bullets:**
  - "4 targets × 1 free action each (Strike OR Stride) at rank 5: Haste at rank 3 gives 1 target +1 quickened action (Strike/Stride/Step); Jolt grants 4 targets a single Strike OR Stride each — comparable total output at 2 more ranks"
  - "The 'donate time' fiction maps cleanly to PF2e free action (instantaneous, must be used before caster's next turn)"
  - "Heightening to 6 targets at rank 7 and both Strike + Stride at rank 9 provides meaningful progression"
  - "No damage, no save — pure party-buff; power is entirely in the action economy grant"
- **Overridable:**
  - "The 'time' trait is a custom homebrew trait (no canonical PF2e time trait in Remaster); replace with nothing or use a flavor note in the description if the author prefers no custom traits"
  - "The rule that targets get Strike OR Stride (not both) could be loosened to 'Strike AND Stride' to match the 5e original; this would make Jolt strictly stronger than Haste per action, requiring a rank bump to 6"
- **Checklist failures:**
  - "The 'time' trait does not exist in canonical PF2e Remaster. It was added for series-flavor consistency with Wall of Time, Fast-Forward, Repetitious Trauma, and Revisit. If a non-canonical trait is unacceptable, remove it from all five spells."

Note: jmnario's own conversion used a custom `time` trait (flagged in his own checklist failures as non-canonical); the store instead uses `chronomancy` (also non-canonical, but matching the 5e school name) — the `time` trait was dropped and a different custom trait substituted in its place.

## Similar official spells

- **Haste (rank 3)** — jmnario's own cited anchor. Grants ONE target the Quickened condition (extra action usable for Strike/Stride) for a full 1-minute duration (i.e., up to ~10 rounds of the benefit, recastable each round), at rank 3 with 30-ft range and heightened(7th) to up to 6 creatures — the "up to 6 targets at rank 7" heightening number matches Jolt's own heightened(7th) target count exactly.
- **Quicken Time (rank 5)** — same rank as Jolt. An area effect: any creature that starts its turn in the area (ally or enemy) becomes Quickened for that turn, usable only for Stride or Strike, for a 1-minute (not sustained) duration — but creatures in the area are Concealed to those outside it and vice versa, a real drawback Jolt's prose doesn't carry.
- Both official comparables grant a *repeatable, round-by-round* benefit across a multi-round duration; Jolt (at base rank) grants a *single, one-time* free action per target from an instantaneous casting — a materially smaller total action-economy output per casting than either official analog, even before accounting for target count.

## Prior astra touches

None found — `Jolt` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- **Structured/prose disagreement:** `system.duration.value` is an empty string, even though the 5e original states "instant" and the store's own description implies an instantaneous effect ("immediately gains 1 free action... lost if not used before the start of your next turn"). No other spell in this chunk has an empty duration value where the 5e source specified one.
- The `chronomancy` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set. jmnario's own checklist explicitly flagged the (different) `time` trait he used as non-canonical and noted it exists across a *family* of five related homebrew spells (Wall of Time, Fast-Forward, Repetitious Trauma, Revisit, and this one) — the store's substitution of `chronomancy` for `time` was not called out anywhere in the store's own description or flags.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose; no curse-removal language present.
