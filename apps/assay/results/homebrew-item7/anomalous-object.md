# Anomalous Object

## Header block

- **Rank:** 7 (store: `system.level.value = 7`)
- **Routing:** comparables — **Pool reason:** wide-range
- **Current assay line:** comparables rank range 2-9 (LOW-INFORMATION — that is why it is in the manual pool)
- **Adapter warnings:**
  - "defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'spell attack roll (if attended)'"
  - "defense text 'spell attack roll (if attended)' implies an attack-roll spell but the source traits list lacked 'attack' — added it (required for assay's targeting_class classification)"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** attack, chronomancy, concentrate, manipulate
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** touch
- **Target:** "1 object of up to 1 Bulk"
- **Defense:** none structured (`system.defense = null`) — see Open flags
- **Duration:** sustained, "1 hour"
- **Heightening:** fixed, level "9" (empty object — appendix-only text)

## The 5e original

- **Level:** 7th
- **School:** Chronomancy
- **Casting time:** 1 action
- **Range:** Touch
- **Components:** V, S, M (an hourglass)
- **Duration:** Concentration, up to 1 hour
- **Classes:** Bard, Druid, Wizard
- **Ritual:** No

> By touching an object, you retrieve another version of the object from elsewhere in time. You must select the exact time that you retrieve the object from. If the object is attended, you must succeed on a melee spell attack roll against the creature holding or controlling the object. Any effect that affects the original object also affects the duplicate (charges spent, damage taken, etc.) and any effect that affects the duplicate also affects the original object. If either object is destroyed, both are destroyed.

No `entriesHigherLevel` block in the 5e original — it carries no upcast/higher-level text at all despite being a 7th-level spell.

## The conversion (canonical store)

> You reach through time to retrieve a duplicate of a touched object from another moment in the timestream, superimposing two temporal instances of the same object. While sustained, you hold both the original and the duplicate simultaneously. Any effect that affects one version (damage, charges spent, magical alterations) also affects the other — the two share one state. If either version is destroyed, both are destroyed. If the object is currently held or `Controlled` by another creature, you must succeed at a spell attack roll against that creature's AC to touch it; on a failure the spell is lost. When the spell ends, the duplicate dissolves.
>
> (`Controlled` is a `@UUID[Compendium.pf2e.conditionitems.Item.Controlled]{Controlled}` link.)
>
> ---
> **Heightened (9th)** The object can be up to 4 Bulk and the duration extends to sustained up to 8 hours.

## What changed, plain English

The core fiction (touch an object, retrieve a temporal duplicate, shared-state so damage/charges/destruction propagate both ways, attended objects require a spell attack roll) is preserved essentially verbatim, including the "if either is destroyed, both are destroyed" clause and the melee/spell attack roll against an attended object's holder.

Structure/mechanics:
- 5e "Concentration, up to 1 hour" → PF2e "sustained up to 1 hour." Functionally similar shape (both require ongoing attention), re-expressed in PF2e's sustain idiom.
- 5e has NO higher-level/upcast text at all (unusual for a 7th-level 5e spell — it's simply flat). PF2e ADDS a 9th-rank heighten tier with no 5e basis: object size cap raised from implicit-unstated to 4 Bulk, and duration extended to 8 hours. The base PF2e version also introduces an explicit "1 Bulk" object-size cap that the 5e original never states (5e places no numeric size/weight limit on the object at all).
- 5e material component "an hourglass" → PF2e material cost dropped entirely; the store's `cost.value` is empty and `requirements` is also empty, so the hourglass component is not represented anywhere in the store (see Open flags — it IS present in jmnario's intermediate conversion, `cost: "an hourglass (material component)"`).
- 5e action cost 1 action → PF2e 2 actions.
- Traits: PF2e drops the 5e "Chronomancy" school in favor of adding it as a literal trait "chronomancy" (school-as-trait pattern), drops jmnario's "transmutation" trait, and adds "attack" (per the adapter warning, added to satisfy assay's own targeting classification — not present in jmnario's conversion at all).
- Traditions arcane + occult replace the 5e Bard/Druid/Wizard class list.

## Converter's notes

- **Anchor:** "no clean analog — temporal object duplication has no PF2e precedent; closest is Replicate (rank 5 alchemist) but that is a copy not a time-fetch"
- **Archetype:** utility (temporal duplication)
- **Balance bullets:**
  - "The shared-state mechanic is the spell's signature: effects on one copy affect the other, preventing 'free unlimited use' of a charged item."
  - "Object size limited to 1 Bulk prevents trivial duplication of Large weapons, full suits of armor, or powerful artifacts."
  - "Sustained up to 1 hour is exploration-tier; the spell is unlikely to be sustained in combat (no combat effect from the duplicate object itself)."
  - "Spell attack roll required against attended objects provides meaningful resistance for the most valuable use case."
  - "The 'if either is destroyed, both are destroyed' clause prevents using the duplicate as a disposable decoy for a precious item."
- **Overridable:**
  - "Object size could be reduced to 'light Bulk' to prevent duplication of shields, bows, etc. for combat advantage."
  - "The attended-object attack roll could be replaced with a Thievery check to make the interaction more skill-based."
  - "A rarity of uncommon would be appropriate given the potential for plot-bypass (duplicating a key, a letter, etc.)."
- **Checklist failures:** none

## Similar official spells

- **Replicate (rank 4)** — the converter's own anchor; creates an illusory, minion-controllable double of a *creature* (not object), limited to basic tasks, no combat capability. Three ranks below Anomalous Object, and a copy rather than a shared-state temporal duplicate.
- **Creation (rank 4)** — conjures a temporary object (earthen/plant-derived matter, ≤5 cubic feet, no intricate parts) from raw magic. Different mechanism (conjuration vs. temporal retrieval) but the nearest official "make an object appear" spell at a comparable rank band.
- **Wall of Stone (rank 5)** — large-scale, permanent object creation (up to 120 ft long stone wall) for comparing power/permanence scale against a rank-7 spell that duplicates a much smaller (1 Bulk) object.
- **Telekinetic Haul (rank 5)** — moves a target (including attended objects) at range without an attack roll; useful contrast for how PF2e usually handles interacting with an object another creature holds.

**Scorer comparables (low-information):** rank range 2-9 — no named comparable spells were supplied by the scorer for this spell; it was routed to the manual comparables pool specifically because that range is too wide to be informative.

## Prior astra touches

None found in `revisions.md` — Anomalous Object matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.defense` is `null` in the store, despite both the description prose ("you must succeed at a spell attack roll... on a failure the spell is lost") AND jmnario's own structured conversion (`defense: "spell attack roll (if attended)"`) specifying a defense. The adapter warning acknowledges the complexity ("qualifiers beyond the base save/attack shape... not structurally represented") but the net result is a fully-null structured defense field rather than even a bare spell-attack-roll representation — a prose/structured-field disagreement.
- `system.heightening.levels["9"]` is an empty object; the entire 9th-rank heighten effect (4 Bulk, 8-hour duration) lives only in the description HTML per the adapter warning.
- Material component drop: jmnario's conversion specifies `cost: "an hourglass (material component)"` (matching the 5e original's `m: "an hourglass"`), but the store's `system.cost.value` is an empty string and `system.requirements` is also empty — the hourglass material component is not represented anywhere in the store (neither structured field nor description prose).
- The "attack" trait was added per the adapter warning specifically to satisfy assay's own internal targeting-class classification logic, not because it was present in the source data (absent from both the 5e original's traits/tags and from jmnario's conversion's trait list).
- The 5e original spell (7th level) has no `entriesHigherLevel` text at all — an unusual gap in the source data for a spell this high-rank, worth noting since the PF2e heighten tier (9th rank) has no corresponding 5e text to anchor against.

## Options & staff lean (enrichment, 2026-07-23)

Near-verbatim faithful port with two GOOD inventions: the 1-Bulk cap (a governor 5e
never had) and the H9 tier. Two dossier flags dissolve on inspection: the null
`system.defense` matches official convention (attack-roll spells don't populate the
defense field), and the adapter-added `attack` trait — though added for tool reasons —
lands on the correct official convention anyway (spells with attack rolls carry it, and
the MAP interaction is right).

The live question is the converter's own overridable: **rarity**. A shared-state
temporal duplicate of any 1-Bulk object is a plot-bypass machine (keys, letters, seals,
charged wands) — exactly the class of tool PF2e gates uncommon, and we already accepted
that logic for Farsight.

- **A. Keep mechanics; set rarity → uncommon** — his own suggestion, Farsight-consistent.
- **B. A plus swap the attended-object interaction to a Thievery check** — his other
  overridable; the spell-attack roll is fine and simpler.
- **C. Keep common** — hands every occult caster a skeleton-key printer at 13th level.

**Lean: A.**
