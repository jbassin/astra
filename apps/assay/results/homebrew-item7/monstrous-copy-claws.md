# Monstrous Copy: Claws

## Header block

- **Rank:** 6 · **Routing:** `quantitative` · **Pool reason:** reclassified-out
- **Current assay line:** verdict = "-3.98 ranks COLD" / rankRange = none / residualRanks = -3.977707096041855 (queue.json: `routing: "quantitative"`, `poolReason: "reclassified-out"`, `verdict: "-3.98 ranks COLD"`, `residualRanks: -3.977707096041855`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, earth, gestalt, manipulate, morph · **Rarity:** common
- **Traditions:** primal
- **Cast:** 2 actions · **Range:** self · **Target:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)
- **Structured damage:** `system.damage["0"]` = `2d12 slashing` (kind: `damage`, `applyMod: false`, no `category`)

## The 5e original

- **Name:** Monstrous Copy: Claws · **Source:** tfc (homebrew) · **Level:** 6 · **School:** gestalt
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V, S, M — "a claw"
- **Duration:** Concentration, 1 hour
- **Classes:** Druid

> You draw upon your knowledge of monsters to fight like them. You transform your hands into the thick, wide claws of a Bulette, enabling you to burrow through earth and stone. You can burrow through earth at a rate equal to your walking speed, and through rock or stone at one-quarter of that rate.
>
> In addition, your unarmed attacks do 2d6 slashing damage. When you successfully attack an object or building you may treat the damage as if it were a critical hit.

No `entriesHigherLevel` block in the 5e source (no native 5e upcast text).

## The conversion (canonical store)

You draw upon your knowledge of the Bulette, reshaping your hands into massive, excavating claws. You gain a burrow Speed equal to your land Speed. You can burrow through non-magical earth, soil, and loose rock at your full burrow Speed. You can burrow through solid stone or worked rock at half your burrow Speed.

You grow a claws unarmed Strike that deals 2d12 slashing damage and has the magical, sweep, and unarmed traits. Against unattended objects and structures, you treat your attack roll result as 10 higher (effectively guaranteeing a critical hit for the purpose of dealing object damage). You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your claws use that proficiency instead.

---

**Heightened (7th)** The claws' damage increases to 3d10 slashing, and you can burrow through solid stone at your full burrow Speed.

**Heightened (8th)** The claws' damage increases to 3d12 slashing.

**Heightened (9th)** The claws' damage increases to 4d12 slashing, and your burrow Speed increases by 10 feet.

No `@UUID` references. No `successTiers` (matches 5e — no save). Structural note: `system.damage` carries **only** the base-rank formula (`2d12 slashing`); the 7th/8th/9th-rank damage increases (3d10 → 3d12 → 4d12) described in the Heightened prose are **not** reflected anywhere in structured data — `heightening.levels = {"7": {}, "8": {}, "9": {}}` are all empty objects, matching the adapter's own warning that fixed-rank heightening text isn't structurally parseable for damage bumps.

## What changed, plain English

- **Base damage, numbers:** 5e's unarmed-attack damage is 2d6 slashing (avg 7). The conversion's base-rank damage is 2d12 slashing (avg 13) — nearly double the average, justified in the converter's notes by stepping the rank up from 5e's level 6 to a comparison against Fiery Body (PF2e rank 7) and by PF2e's damage-per-rank expectations at rank 6 being much higher than a flat 5e level-6 cantrip-tier unarmed bump.
- **Burrow speed, numbers:** 5e grants burrow-through-earth at full walking speed and through rock/stone at **one-quarter** speed. The conversion grants burrow-through-earth/soil/loose-rock at full speed (same) but burrow-through-solid-stone/worked-rock at **half** speed — a mechanical buff relative to 5e's quarter-speed stone burrowing (base rank already doubles the 5e stone-burrow rate before any heightening).
- **Duration:** 5e Concentration 1 hour → PF2e "sustained up to 1 minute." The converter's checklist-failures note explicitly flags this as a forced downgrade: the plan's combat-grade sustained-buff cap is 1 minute, and the combat-capable claw strikes push this spell into that combat-grade bucket even though the burrowing-only utility half would have justified a longer exploration duration.
- **Heightening added with no 5e basis:** 5e had zero upcast text for this spell. The conversion adds three fixed-rank tiers (7th/8th/9th) escalating damage (3d10 → 3d12 → 4d12) and, at 7th, full-speed stone burrowing, and at 9th, +10 ft burrow speed — none of which exist in the 5e source at all.
- **Material component:** 5e's "a claw" is dropped; `cost.value` is empty (though jmnario's intermediate conversion had preserved it as "a claw (any creature; consumed)").
- **Traits added with no 5e basis:** earth, gestalt (school-derived), morph, concentrate, manipulate.
- **Traditions:** 5e class list (Druid only) is preserved as primal only — a 1:1 mapping, unlike most other spells in this chunk.

## Converter's notes

- **Anchor:** "Fiery Body (rank 7) — self-transform polymorph benchmark; Earth Glide / burrowing creature abilities for the burrowing component"
- **Archetype:** buff (morph; burrowing speed + powerful slashing strike + object-critical)
- **Balance bullets:**
  - "Rank 6 with 2d12 slashing (avg 13) for a sustained morph aligns below Fiery Body's rank-7 combat form (which grants unarmed +1d4 fire and buffs spells); Claws is rank 6 and pure physical, appropriate."
  - "Burrowing Speed = land Speed is the primary utility grant; this is a rare and valuable movement mode that justifies a rank-6 slot even without the strike."
  - "Sweep trait gives the large claw strikes a multi-target flavor matching the 'wide sweep' of Bulette claws without introducing a separate AoE mechanic."
  - "Auto-crit on objects is a niche but flavorful effect; it doesn't affect combat against creatures and is preserved as-is."
  - "Duration shortened to 'sustained 1 minute': the 1-hour concentration of 5e was appropriate for an exploration burrowing spell, but the combat-capable claw strikes make this combat-grade."
- **Overridable:**
  - "Duration could be split: a sustained-1-minute version for combat (with claws) and a separate rank-5 non-combat version granting only burrow Speed for 1 hour — matches how PF2e separates combat and exploration modes."
  - "The earth trait could be removed if you want the spell to be pure morph without an elemental tag."
- **Checklist failures:**
  - "Checklist item 7 (duration): 5e had 1-hour concentration. Combat-grade buff cap is 1 min/sustained. Shortened to sustained 1 min. The burrowing Speed alone might justify 10-min exploration duration, but the combat-capable claws force the shorter cap. Flagged as a design decision."
- **Series template note:** "MC template entry at rank 6. Claws-specific: slashing + sweep, burrow Speed, object auto-crit, earth trait."

## Similar official spells

- **Dragon Form (rank 6)** — same rank, self-only, sustained-up-to-1-minute polymorph granting a granted Strike suite plus movement modes (fly 100 ft, optional burrow 20 ft depending on dragon type) and 10 temp HP; the closest same-rank official "morph into a monster archetype for a combat-capable natural-weapon form" comparable, though Dragon Form's granted attacks are typically higher-average-damage multi-attack packages rather than a single 2d12 strike.
- **Fiery Body (rank 7)** — the converter's own anchor: self-transform polymorph one rank up granting fire immunity, precision resistance 10, an innate reactive 3d6 fire retaliation, +1d4 fire on unarmed attacks, and a fly Speed — a broader defensive+offensive package one rank above Claws' single burrow-Speed+strike combo.
- **Petrify (rank 6)** — appears in the same rank-6 earth-trait search only as a rank neighbor; not a functional comparable (petrification, not a morph/strike spell) — noted only to record it was checked and excluded.
- **Elemental Confluence (rank 6)** — a rank-6 polymorph/elemental spell surfaced by the same earth-trait/rank-6 search; not reviewed in depth here as it targets a different mechanical niche (elemental-form damage-type-swap rather than a single granted Strike + movement mode).

*(scorer comparables (low-information): none — this spell is `routing: "quantitative"` with a computed residual, not a `comparables`/wide-range routing, so no scorer-supplied comparable list applies here.)*

## Prior astra touches

`revisions.md` records exactly one deviation for Monstrous Copy: Claws (`monstrous-copy-claws`), meaning the store has been hand-edited once since seeding:

- `duration: {'sustained': True, 'value': '1 minute'} -> {'sustained': False, 'value': '1 minute'}`

Per the tool's documented diff direction (baseline → store), the fresh in-memory re-conversion of the vendored baseline produces `duration.sustained = true` ("sustained, 1 minute"), but the current store has `duration.sustained = false` ("not sustained, fixed 1 minute duration"). This is the only field that differs from a fresh baseline re-conversion for this spell — everything else in the current store (damage, traits, heightening, description, traditions, etc.) matches the baseline adapter output exactly. No other Monstrous Copy variant in the store shares this exact deviation pattern in isolation — `monstrous-copy-shell` has a heightening/description deviation instead, while `monstrous-copy-stinger` and `monstrous-copy-tail`/`-tentacle` show the identical sustained→not-sustained duration deviation alongside separate description-length deltas, suggesting a related but not identical touch was applied across multiple Monstrous Copy entries.

## Open flags

- **Quantitative scorer visibility gap:** the assay `quantitative` routing computed its -3.98-rank COLD verdict from `system.damage`, which holds only the base-rank `2d12 slashing` formula. The 7th/8th/9th-rank heightened damage increases (3d10 → 3d12 → 4d12) exist only in the description prose and are not present anywhere in structured data (`heightening.levels` entries are all empty `{}`). Whether the scorer's residual accounts for the heightened damage trajectory at all, or only ever saw the base-rank 2d12, is not determinable from the store JSON alone — recorded as a factual data-availability gap, not a claim about the scorer's actual behavior.
- The `duration.sustained: false` value in the current store contradicts a fresh baseline re-conversion (which yields `sustained: true`) per `revisions.md` — a prior hand-edit, not an adapter artifact.
- No 5e-isms residue found in the prose (no death saves, no "bonus action," no legacy condition names); material component ("a claw") was dropped from the base-rank `cost` field despite jmnario's intermediate conversion having preserved it.
