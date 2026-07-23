# Artist's Rendition

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** quantitative — **Pool reason:** reclassified-out
- **Current assay line:** verdict −2.24 ranks COLD; residual −2.24 ranks
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Cost:** "" (empty — see Open flags)
- **Range:** touch
- **Target:** none specified (`system.target.value = ""`)
- **Defense:** none structured (`system.defense = null`)
- **Duration:** "permanent", not sustained
- **Damage:** `0`: 1d8 untyped (see Open flags re: type mismatch)
- **Heightening:** fixed, levels "5" and "7" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 3rd
- **School:** Memetics
- **Casting time:** 1 action
- **Range:** Touch
- **Components:** V, S, M (a silvered paintbrush worth 250 gp)
- **Duration:** Permanent
- **Classes:** Bard, Seeker, Wizard
- **Ritual:** No

> You draw a 2D object and magically reconstitute it into its real, 3D representation. The spell may convert a drawing covering no more than 25 sq feet into a real, mundane object or terrain feature—such as a door, a pit, flowers, trees, cells, rooms, or weapons. When the spell is cast on a drawing it becomes a real, nonmagical object. Thus, painting a door on a wall creates an actual door that can be opened to whatever is beyond and painting a pit on a floor creates a real pit. Doorways may extend through at most 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood or dirt. Pits will always extend down 10 feet before stopping, regardless of the actual depth of the floor they're drawn on.
>
> Nothing created by the pigments can have a value greater than 25 gp. If you paint an object of greater value (such as a diamond or a pile of gold), the object looks authentic, but close inspection reveals it is made from paste, bone, or some other worthless material.
>
> If you paint a form of energy such as fire or lightning, the energy deals 1d8 damage of the appropriate type to creatures within 5ft of the energy. The energy then dissipates.

No `entriesHigherLevel` block in the 5e original — no upcast/higher-level text at all.

## The conversion (canonical store)

> You touch a two-dimensional drawing or painting on a physical surface and speak a word of creation, causing the image to reconstitute itself as a real, three-dimensional object. The drawing must depict a mundane object or terrain feature (a door, a pit, a section of flooring, flowers, a weapon, a chest, etc.) and must cover no more than 25 square feet of surface. The resulting object is nonmagical and mundane in every respect.
>
> Apply the following restrictions:
>
> - The created object cannot have a value greater than 25 gp. If the drawing depicts something of greater worth (gemstones, gold, expensive materials), the result appears authentic at a glance but is obviously false paste or bone on close inspection (or an Identify or Recall Knowledge check).
> - Doorways created through solid stone extend through at most 1 foot of stone, 3 feet of wood or dirt, or 1 inch of common metal. A door created on a wall creates a functioning door into whatever space lies beyond.
> - Pits extend 10 feet downward regardless of the physical depth of the surface they are drawn on.
> - If the drawing depicts a source of energy (fire, lightning), the creation deals 1d8 damage of the appropriate type to each creature within 5 feet when it forms, then immediately dissipates — it is not a sustained energy source.
>
> The created object is permanent but behaves as any mundane object of its type (it can be broken, opened, moved, etc.).
>
> ---
> **Heightened (5th)** The maximum drawing size increases to 100 square feet. The maximum object value increases to 100 gp. Doorways can extend through 5 feet of stone or 10 feet of wood. Pits extend 30 feet downward.
> **Heightened (7th)** You can create objects with moving parts (mechanisms, locks, simple traps). The maximum value increases to 500 gp, though the GM may rule that certain objects (firearms, complex devices) require a Crafting check.

## What changed, plain English

The core fiction and nearly all numeric limits are preserved essentially verbatim: 25 sq ft drawing cap, 25 gp value cap with the "looks real but is paste on close inspection" clause, 1 ft stone / 1 in metal / 3 ft wood-or-dirt doorway penetration limits, 10 ft pit depth regardless of floor depth, and the 1d8 energy-damage-then-dissipate clause.

Structure/mechanics:
- 5e has NO higher-level/upcast text at all. PF2e ADDS two heighten tiers with no 5e basis: 5th rank (100 sq ft drawings, 100 gp cap, deeper stone/wood penetration, 30 ft pits) and 7th rank (moving-parts objects like mechanisms/locks/traps, 500 gp cap, possible Crafting check). None of this scaling exists in the 5e source.
- 5e "a thin sheet of lead" is listed among doorway-penetration materials; the PF2e conversion drops the lead clause entirely (doorways can extend through "1 foot of stone, 3 feet of wood or dirt, or 1 inch of common metal" — no lead option).
- 5e explicit example list "flowers, trees, cells, rooms, or weapons" for valid drawing subjects is trimmed to "a door, a pit, a section of flooring, flowers, a weapon, a chest" — trees, cells, and rooms are dropped from the example list; "a chest" and "a section of flooring" are added.
- 5e material component "a silvered paintbrush worth 250 gp" (not consumed, per jmnario's intermediate conversion) is dropped entirely from the store — see Open flags.
- 5e action cost 1 action → PF2e 2 actions.
- Traits: PF2e drops BOTH of jmnario's "creation" and "transmutation" traits, replacing them with "memetics" (school-as-trait pattern — see Open flags).
- Traditions arcane + occult replace the 5e Bard/Seeker/Wizard class list.
- Damage: the 1d8 energy damage is structurally present in `system.damage` but typed "untyped," while both the 5e text and the store's own prose say the damage is "of the appropriate type" (fire, lightning, etc., matching whatever energy was drawn) — see Open flags.

## Converter's notes

- **Anchor:** "no clean analog — closest is Wall of Stone (rank 5, permanent stone wall) but Artist's Rendition creates any mundane object, not just walls, at rank 3"
- **Archetype:** utility/creation (2D-to-3D object transmutation)
- **Balance bullets:**
  - "The 25 gp value cap and 'paste if higher-value' clause are the primary balance governors: this spell cannot create wealth, gems, or real weapons of significant value."
  - "The 25 sq ft size limit restricts object scale to furniture-sized or smaller doors/pits; the spell cannot create fortifications or structures without extensive multi-casting."
  - "Pit creation (10 ft deep) and doorway creation are the most tactically significant uses; both have explicit restrictions (1 ft stone / 3 ft wood) that limit their structural impact."
  - "Energy creation (1d8 damage then gone) is a weak cantrip-level damage option; at rank 3, 1d8 is minimal and the dissipation means it's not a sustained damage source."
  - "Permanent non-magical result is the spell's unique value: the created object outlasts the spell, unlike illusion duplicates."
- **Overridable:**
  - "The 25 gp value cap could increase with GM approval for specific in-fiction uses (e.g., creating a real weapon for an ally who is disarmed — this is a dramatic moment, not a wealth exploit)."
  - "The energy-type creation damage (1d8) could scale with heightening — currently it doesn't, which makes it largely irrelevant at rank 3+."
- **Checklist failures:** none

## Similar official spells

- **Creation (rank 4)** — the nearest official "conjure a real object from magic" spell; earthen/plant-derived matter only, ≤5 cubic feet, temporary. One rank above Artist's Rendition and temporary rather than permanent, but the closest functional analog in the compendium.
- **Wall of Stone (rank 5)** — the converter's own anchor; permanent stone-wall creation at much larger scale (up to 120 ft long). Useful for gauging how much rank PF2e spends on "permanent creation" at scale.
- **Illusory Object (rank 1)** — creates an illusory (not real) 2D-or-3D object; a low-rank contrast point for the illusion-vs-real-object distinction Artist's Rendition straddles.
- **Replicate (rank 4)** — creates an illusory double of a *creature*, not an object; useful for comparing rank cost of "duplicate/create something that looks real" mechanics generally.

## Prior astra touches

None found in `revisions.md` — Artist's Rendition matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening.levels["5"]` and `["7"]` are both empty objects; both heighten tiers live only in the description HTML per the adapter warning.
- Material component drop: jmnario's conversion specifies `cost: "a silvered paintbrush worth 15 gp (not consumed)"` (derived from the 5e original's 250 gp paintbrush at 10× economy scaling), but the store's `system.cost.value` is an empty string and `system.requirements` is also empty — the paintbrush requirement is not represented anywhere in the store (neither structured field nor description prose mentions needing a paintbrush at all).
- Damage-type mismatch: `system.damage["0"].type` is `"untyped"`, but both the 5e original ("deals 1d8 damage of the appropriate type") and the store's own description prose ("deals 1d8 damage of the appropriate type to each creature within 5 feet") describe the damage type as matching whatever energy the drawing depicts (fire, lightning, etc.) — the structured field does not represent this variability and instead hardcodes "untyped."
- Trait note: "memetics" (the 5e homebrew school name) replaces BOTH of jmnario's "creation" and "transmutation" traits (school-as-trait pattern) — this spell loses two real PF2e traits that jmnario's own conversion notes call standard for the mechanic ("Creation trait added (PF2e standard for spells that produce real objects from nothing)").
- `system.target.value` is an empty string despite the spell clearly requiring a touched drawing/surface as its subject; the touch interaction is only represented via `range: "touch"`, with no explicit target line.
