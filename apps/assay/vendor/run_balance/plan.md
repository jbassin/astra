# Plan — Convert 5e Homebrew Spells to Balanced PF2e (Remaster) JSON

## Goal

For every spell in `base_spells_5e/all_spells_5e.json`, produce a PF2e (Remaster) converted version in a new sibling directory `pf2e_converted_spells/` as valid JSON. Conversions must keep the **spirit** of the 5e original (theme, fiction, intent, signature flourish) while obeying PF2e (Remaster) balance, terminology, and the 8-step workflow defined by the `pf2e-spell-creator` skill.

---

## Inputs

- **Skill directory:** `pf2e-spell-creator/`
  - Entry point: `pf2e-spell-creator/SKILL.md`
  - References (load on demand per skill instructions, **not** preloaded):
    - `references/benchmark-spells.md` — Step 2 (anchor)
    - `references/damage-tables.md` — Step 3 (damage budget)
    - `references/conditions.md` — Step 4 (save tiers)
    - `references/traits-taxonomy.md` — Step 6 (traits, incapacitation gate)
    - `references/heightening.md` — Step 7 (per-rank deltas)
    - `references/healing-buffs-summons.md` — non-damage scaling
    - `references/design-checklist.md` — Step 8 (12-item review)

- **Base spells dir:** `base_spells_5e/`
  - `tfc.json` — original 5etools-schema file (1 spell + 30 items + 10 monsters). Items/monsters are out of scope.
  - `gen_homebrew.json` — 175 spells (5etools schema, spell-only).
  - **`all_spells_5e.json`** — canonical merged input for conversion. Built by concatenating `spell[]` from both source files. Each spell carries a `_sourceFile` field for provenance. **176 spells total, 0 duplicate names.**

- **5e spell inventory (176 total) — level histogram:**

  | 5e level | count |
  |---|---|
  | 0 (cantrip) | 3 |
  | 1 | 18 |
  | 2 | 20 |
  | 3 | 29 |
  | 4 | 29 |
  | 5 | 25 |
  | 6 | 17 |
  | 7 | 18 |
  | 8 | 9 |
  | 9 | 7 |
  | 10 | 1 |

  Note: 5e has no level-10 spells in canon — `Worldweaver (lvl 10)` is homebrew. PF2e has true ranks 1–10, so this maps cleanly to PF2e rank 10.

## Outputs

- **New directory:** `pf2e_converted_spells/`
- **Files:**
  - `pf2e_converted_spells/all_spells_pf2e.json` — converted spells, valid JSON, schema below. All 176 in one file mirrors the merged input.
  - `pf2e_converted_spells/_conversion_notes.json` — per-spell anchor, balance bullets, and override notes (kept separate so the spell JSON stays clean).
- Each converted entry carries `convertedFromSpiritOf.originalSourceFile` so we can always trace back to `tfc.json` vs. `gen_homebrew.json`.

---

## Loading the skill

Before starting any conversion, do these in order:

1. Read `pf2e-spell-creator/SKILL.md` in full. It is the rules-of-the-game.
2. Reference files are **lazy-loaded** per the skill's "When to load" table — do not preload all of them. Per spell archetype:
   - **Damage spell** (Falling Star, Solar Fury, Cone of Decay, Sapping Lightning, Jolt, etc.) → load `damage-tables.md`.
   - **Spell that imposes a condition** (Glitterdust, Touch of Madness, Cerebral Disruption, Charming, Fumble, etc.) → load `conditions.md`.
   - **Buff / heal / summon / polymorph** (Body Enhancement series, Monstrous Copy series, Mark of Protection, Summon Servant, Fluid Form, etc.) → load `healing-buffs-summons.md`.
   - Always load `traits-taxonomy.md` (Step 6) and `design-checklist.md` (Step 8) on every spell.
   - Always load `benchmark-spells.md` once at the start of the run — it's the anchor lookup table and gets reused for every spell.
3. Confirm Remaster terminology is in use: **rank** (not level), **off-guard** (not flat-footed), **vitality/void** (not necrotic/radiant), **Force Barrage** (not Magic Missile), etc.

---

## Per-spell workflow

Apply the skill's 8-step workflow once per spell in `all_spells_5e.json`. The steps are unchanged from `SKILL.md`; what follows are the conversion-specific decisions to layer on top.

### Step 0 — Triage the 5e spell into a PF2e archetype

Read the 5e spell's `school`, `entries`, `damageInflict`, `conditionInflict`, `savingThrow`, `time`, `range`, `duration`, `components` and bucket it into one of the skill's archetypes:

- **Single-target damage (attack)** — 5e spell-attack-roll, damage-only.
- **Single-target damage (save)** — 5e single-target save, damage-primary.
- **Area damage** — 5e AoE shape (cube/sphere/cone/line), damage-primary.
- **Auto-hit damage** — 5e auto-hit (Magic Missile-style; e.g. Magic Re-Missiles, Force Barrage shape).
- **Control / debuff** — 5e save-imposes-condition (Glitterdust, Fumble, Awkward, Confusion-likes).
- **Buff** — 5e self/ally enhancement (Body Enhancement series, Mark of Protection, Lucky Ward).
- **Healing** — 5e HP restoration (Healing Draught).
- **Summon** — 5e conjure creature (Summon Servant, Spawn Abyssal Sprite, Summon Heart).
- **Polymorph / battle form** — 5e self-transformation (Fluid Form, Grosteque Selfshape, Body Enhancement: Claws/Fangs/Hide).
- **Utility / divination** — 5e non-combat (Connection, Farsight, Forensic Analysis, Laixa's Historical Tracker).
- **Save-or-suck** — 5e save-or-removed-from-fight (Carnage, Eldrich Horror, Touch of Madness at high tiers).

This triage **drives which reference files load** for that spell (per the table above) and **drives the rank → caster-level → damage row** in Step 3.

### Steps 1–8 — the skill's workflow (unchanged)

Run `SKILL.md` Steps 1–8 against the triaged archetype. Notes specific to bulk conversion:

- **Step 1 (Intent):** Skip the user clarifying question. Infer from the 5e spell text. If something is ambiguous, log it in `_conversion_notes.json` under `overridable[]` rather than asking.
- **Step 2 (Anchor):** Pull from `benchmark-spells.md` only. If a 5e spell has no clean PF2e analog (e.g. Worldweaver, Move the Cosmic Wheel, Outside of Time), record `anchor: "no clean analog"` and design from the damage/effect budget for that rank, not by analogy.
- **Step 3 (Damage budget):** Default mapping is **5e spell level = PF2e spell rank** (1:1). The 5e and PF2e curves don't align numerically but they align *structurally* (both peak at rank/level 9–10, both have a similar "rank 3 = mid-game spike" inflection). Always cross-check against the GM Core damage table — if the 1:1 rank puts a spell two rows above or below the table, document the deviation and prefer the table.
- **Step 4 (Save tiers):** Translate 5e save → PF2e save by **target organ**, not by 5e name:
  - 5e Dex save → PF2e Reflex.
  - 5e Con save → PF2e Fortitude.
  - 5e Wis/Int/Cha save → PF2e Will (almost always; Int → Will, Cha → Will).
  - 5e Str save → PF2e Fortitude (rare).
  Note: 5e "half damage on save" becomes PF2e basic save automatically.
- **Step 5 (Range/area/duration):** Convert 5e units 1:1 (5e ft = PF2e ft). For duration, downgrade aggressively per the skill: **combat buffs cap at 1 min or sustained**, exploration buffs at 10 min / 1 hr / 8 hr.
- **Step 6 (Traits):** Mandatory `incapacitation` audit on every save-or-suck. 5e doesn't have this trait — it's the single most common conversion error to omit it. Specifically watch: Carnage, Eldrich Horror, Cerebral Disruption, Touch of Madness, Oblivion, Checkpoint, anything with "stunned"/"paralyzed"/"unconscious"/"banished" on a failed save.
- **Step 7 (Heightening):** 5e "at higher levels: +Nd6" → PF2e canonical per-rank delta (see `heightening.md`). Don't copy 5e's scaling literally — apply the PF2e archetype's standard rate (e.g. area-save spells: +2 dice per +1 rank).
- **Step 8 (Checklist):** Run all 12 items per spell. Any failures go in `_conversion_notes.json` under `checklistFailures[]` with the deviation reason. **Do not silently fix** — flag and explain.

---

## Output JSON schema

The skill's `SKILL.md` defines the **human-readable** published format. The schema below is the machine-readable encoding of that same shape. No canonical community PF2e JSON schema exists across tools, so this is a pragmatic shape that round-trips to the published format. **Confirm with any downstream consumer (FoundryVTT / Pathbuilder / Pathfinder Nexus) before scaling adoption.**

```jsonc
{
  "_meta": {
    "convertedFrom": "5e (5etools schema)",
    "convertedTo": "pf2e-remaster",
    "skill": "pf2e-spell-creator",
    "convertedAt": "<ISO datetime when actually executed>",
    "sourceFiles": ["tfc.json", "gen_homebrew.json"],
    "spellCount": 176,
    "authorsOriginal": ["Josh Bassin"],
    "convertedBy": ["pf2e-spell-creator skill (Claude)"]
  },
  "spell": [
    {
      "name": "<PF2e spell name — usually the 5e name; rename only if 5e term collides with reserved PF2e trait>",
      "rank": 5,                                                      // integer 1–10, or string "cantrip"
      "traits": ["concentrate", "manipulate", "..."],                 // alphabetical, lowercase
      "traditions": ["arcane", "occult"],                             // subset of arcane|divine|occult|primal
      "cast": { "actions": 2, "time": null, "components": ["verbal", "somatic"] },
      "cost": null,                                                   // string or null; PF2e gp scaling, not 5e gp
      "range": "60 feet",                                             // string; "touch", "planetary", or "N feet"
      "targets": null,
      "area": "20-foot burst",                                        // or null
      "defense": "basic Reflex",                                      // or "Will save", "spell attack roll", null
      "duration": "instantaneous",
      "description": "<narrative + mechanical paragraph>",
      "successTiers": {                                               // null when no save
        "criticalSuccess": "...",
        "success": "...",
        "failure": "...",
        "criticalFailure": "..."
      },
      "heightened": [
        { "trigger": "+1", "text": "..." },
        { "trigger": "8th", "text": "..." }
      ],
      "convertedFromSpiritOf": {
        "originalName": "<5e name>",
        "originalSourceFile": "tfc.json",                             // or "gen_homebrew.json"
        "originalLevel": 5,
        "originalSchool": "Divination",
        "preservedElements": ["..."],
        "changedElements": ["..."]
      }
    }
  ]
}
```

JSON validity rules:
- All files must `json.loads` cleanly. No comments, no trailing commas, double-quoted keys/strings.
- Traits array sorted alphabetical, lowercase.
- Rank is integer 1–10 or string `"cantrip"`.
- Use `null` where a field doesn't apply (`area`, `defense`, `successTiers`, `targets`, `cost`) — don't omit, so the schema is uniform across all 176 entries.
- `heightened` always an array, possibly empty.

Companion file `pf2e_converted_spells/_conversion_notes.json`:

```jsonc
{
  "<Spell Name>": {
    "sourceFile": "tfc.json",
    "anchor": "Sending (rank 5)",
    "archetype": "utility/divination",
    "balanceBullets": ["..."],
    "overridable": ["..."],
    "checklistFailures": []
  }
}
```

---

## Special cases flagged from the inventory

Quick scan of the 176-spell list surfaces some categories worth pre-noting:

- **Spell *series* that should share an archetype + heightening pattern** (don't re-derive each from scratch — design the series template once, then apply):
  - `Body Enhancement: Claws / Fangs / Hide / Horns / Mind / Sense` (6 spells)
  - `Monstrous Copy: Claws / Eye Stalks / Shell / Stinger / Tail / Tentacle / Wail` (7 spells)
  - `Shape Modify: Accuracy / Armor / Severity / Speed` (4 spells)
  - `Almonk's Arcane Drain / Siphon / Retribution` (3 spells, shared theme)
  - `Djura's Divine Protection / Razor / Righteous Pressure` (3 spells)
  - `Left Hand of Judgment / Right Hand of Judgment` (paired)
  - `Sphere of Preservation / Sphere of Ruin` (paired)
  - `Thaumaturgic Inhibition / Obstruction` (paired)
  - `Extraplanar Beam / Pulse / Pyre` (3 spells with planar damage)

- **Spells with no clean PF2e analog** — design from the damage/effect budget for that rank, not by anchor analogy. Document in `anchor: "no clean analog — designed from <table>"`:
  - `Worldweaver` (lvl 10) — reality-warping; nearest is *Wish* / *Remake*.
  - `Move the Cosmic Wheel` (lvl 8), `Outside of Time` (lvl 8), `Time Jump` (lvl 8), `Time Loop` (lvl 6), `Fast-Forward` (lvl 6), `Rewind and Playback` (lvl 3) — time manipulation; PF2e has minimal time-magic precedent.
  - `Eldrich Horror` (lvl 9), `Touch of Madness` (lvl 8), `Cerebral Disruption` (lvl 9) — high-rank mental save-or-suck; must carry `incapacitation`.
  - `Lesser Wish` (lvl 2) — name implies low-rank Wish, which is itself absent from PF2e. Likely needs to be redesigned as a **rank-2 utility** rather than a true wish.

- **Spells that may need to become focus spells / feats in PF2e instead** (because 5e gave a class-specific spell that PF2e would gate behind a class feat): the `Almonk`, `Djura`, `Patishvat`, `Laixa`, `Lyrr`, `Kosmoturgist` named-caster spells. The plan keeps them as spells for consistency but **flag in notes** that the PF2e-idiomatic conversion is often a focus spell.

- **Cantrips (lvl 0):** `Distorted Mark`, `Gambler's Trick`, `Macabredanse`. Cap damage at GM Core **Unlimited Use** column, never Limited. Auto-heighten to half caster level.

- **Incapacitation-gated spells** (REQUIRED trait — most common homebrew miss):
  Carnage, Cerebral Disruption, Charming, Charming Memory, Confusion-likes, Do My Bidding, Eldrich Horror, Extra Motivation, Festering Slick (if it imposes paralyzed), Fugue, Fumble (if save-or-skip-turn), Glitterdust (no, this is blinded — case-by-case), Oblivion, Touch of Madness, Take Me Instead. Verify per-spell during Step 6.

---

## Execution checklist (when later asked to run this plan)

1. Read `pf2e-spell-creator/SKILL.md`. Read `references/benchmark-spells.md` once for the run.
2. Load `base_spells_5e/all_spells_5e.json` and iterate `spell[]` (176 entries).
3. `mkdir -p pf2e_converted_spells/`.
4. For each spell:
   a. Triage to archetype (Step 0).
   b. Lazy-load only the references the archetype calls for.
   c. Run skill Steps 1–8.
   d. Emit the converted spell into `all_spells_pf2e.json` and append its notes to `_conversion_notes.json`.
5. **Process spell series as a batch:** design the Body Enhancement / Monstrous Copy / Shape Modify templates once, then apply across all members. This prevents per-spell drift and matches how Paizo publishes related spells.
6. Validate output: `python3 -c "import json; json.load(open('pf2e_converted_spells/all_spells_pf2e.json'))"` and the notes file likewise.
7. Cross-check each spell against the 12-item design checklist; surface failures in the notes file rather than silently fixing.
8. Report a one-line summary per spell: `<name> → rank <N>, archetype <X>, anchor: <Y>, checklist: <pass|N failures>`.
9. Final tally: how many converted cleanly, how many have `checklistFailures`, how many flagged `no clean analog`.

---

## Risks & open questions

- **Schema lock-in.** No canonical community PF2e JSON schema. The shape above is derived from `SKILL.md`'s published format. If you plan to import into FoundryVTT / Pathbuilder / Pathfinder Nexus, confirm their schema before bulk-generating 176 entries.
- **Volume.** 176 spells × 8-step workflow is a large run. Two efficiencies are baked into this plan: (a) spell-series templates designed once and applied to siblings, (b) lazy-loading references per archetype rather than preloading everything per spell. If even those don't fit in one session, the spells partition cleanly by source file (1 from tfc.json + 175 from gen_homebrew.json) or by rank.
- **Author voice.** These are one author's named spells (Almonk, Djura, Patishvat, Laixa, Lyrr, Kosmoturgist). The plan preserves their names verbatim — converting them silently would break the author's intent. If you want them renamed for any reason, say so before the run.
- **Tradition mapping for class-locked 5e spells.** 5e's Bard/Cleric/Druid/Paladin/Ranger/Sorcerer/Warlock/Wizard list doesn't map cleanly onto PF2e's arcane/divine/occult/primal essences (matter / mind / spirit / life). Conversion uses the essence model, not the 5e class list — log the mismatch in `convertedFromSpiritOf.changedElements` when it's load-bearing (e.g. Cleric-only spells that don't fit divine).
- **5e mechanics with no PF2e equivalent.**
  - "Spend extra slot per creature/per target" — convert to canonical `Heightened (+N) adds 1 target`.
  - "Concentration up to N hours" — convert to PF2e duration tier (combat: 1 min/sustained; exploration: 10 min/1 hr).
  - "Reaction triggered by attack roll" — PF2e reactions usually need a more specific trigger; rewrite the trigger explicitly.
  - "Half damage on save" — PF2e basic save (no change needed; just use the keyword).
- **Single-spell sample tested for the schema so far.** Connection was the only worked example in the prior plan. Once execution starts, the first ~5 spells across different archetypes (one damage-save, one buff, one summon, one polymorph, one utility) should be reviewed before committing to the full 176 — schema decisions made early will be hard to retroactively change.

---

## Not in scope

- Converting the `item[]` and `monster[]` entries in `tfc.json` (30 items including Patishvat's Corrupting Pamphlet; 10 monsters). PF2e items use rune systems / item levels / Bulk; PF2e creatures use the GM Core monster-building table. Both need separate tooling — the loaded skill is spell-only.
- Converting `seeker.json` (class/subclass content) — not spells.
- Generating FoundryVTT-compatible bundles, compendium packs, or `_id` fields.
- Modifying the skill itself or its reference files.
