/**
 * The module's one read layer over pf2e system data. Handlers read `system.*` only through
 * these accessors, so the choice between a document's stored **source** (`toObject()`) and
 * its **live** prepared `system` is made here, once per field, and shows in the types.
 *
 * Which side owns each field portal reads (pf2e 8.4.x):
 *
 * | Field                                              | Side            | Why                                                   |
 * | -------------------------------------------------- | --------------- | ----------------------------------------------------- |
 * | `attributes.hp.max` (PC)                           | live only       | derived at data prep; a PC's source stores value/temp |
 * | `attributes.hp.max` (NPC)                          | both            | an NPC stores its max                                 |
 * | `resources.heroPoints`                             | source only     | data prep zeroes the live value                       |
 * | AC, saves, perception, ability mods, class DC      | live only       | derived; the source has `abilities: null`             |
 * | `attributes.spellDC.value`                         | live only       | the one reliable spell DC                             |
 * | spellcasting entry `spelldc.dc`                    | neither, really | 0 in source and usually 0 live; see entry DC accessor |
 * | `skills.*.value`/`dc`, lore skills                 | live only       | totals are derived; lores merge in from lore items    |
 * | level, xp, languages, alliance, familiar master    | both            | stored, untouched by data prep                        |
 * | party members, biography and its visibility        | source          | stored                                                |
 * | item level, traits, rarity, price, bulk, damage... | source          | the live price/bulk are normalized class instances    |
 * | spell location and base rank, entry slots          | source          | stored                                                |
 *
 * Writes: `isDerivedPcPath` lists the PC paths `update-document` refuses because data prep
 * recomputes them (saves, perception, traits, AC, class DC).
 *
 * Fixtures holding both sides for each document kind live in `tests/fixtures/pf2e/`; see
 * `testFixtures.ts`. Their live sides are synthesized from pf2e data shapes and should be
 * re-captured from the live world when pf2e changes major version. The generic readers in
 * `data.ts` (`record`, `at`, ...) stay inside the layer: a handler that needs a new field adds
 * an accessor here rather than walking `system` itself.
 */
export * from "./actor";
export {
  liveSystem,
  type Pf2eSource,
  type Pf2eSystem,
  type Side,
  sourceItems,
  sourceOf,
  sourceSystem,
} from "./data";
export * from "./item";
