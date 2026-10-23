# portal-authoring (0026) — scoping: full content-authoring write surface for the portal MCP

**Date:** 2026-07-07 · **Status:** SCOPED (pre-spec) · **Builds on:** 0023 (portal) + 0025 (portal-oauth)
**Stakeholder ask (verbatim scope):** create new actors (NPCs, hazards, etc.); place and modify lights;
create new items, effects, auras, etc.; write effects/rules for items/actors; create and edit spells;
edit player character sheets; write macros.

Everything below marked **VERIFIED** was checked against reality this session: the astra portal source,
a clone of `foundryvtt/pf2e` at tag `pf2e-7.12.2` (the exact deployed version; compatible with the
deployed Foundry 13.351), the FoundryVTT v13 API docs, prior-art repo clones, and **live documents pulled
through the running bridge** (world "Faerrin", bridge connected during scoping).

---

## 1. What this is

0023 gave portal a deliberately narrow write surface: clone-from-compendium, tokenize, journals — with
**D5 (zero hand-authored pf2e schemas)** as the crux decision. The stakeholder now wants portal to be a
full **content-authoring** surface: hand-authored actors/items/effects/spells with pf2e rule elements,
scene lighting, PC sheet edits, macros (including remote execution). This supersedes D5.

## 2. Stakeholder decisions — RESOLVED this session (AskUserQuestion, 2026-07-07)

- **R-1 — Authoring model: HYBRID.** Prefer clone-from-compendium + patch where a base exists (NPCs,
  equipment, spells — keeps pf2e math sane); full hand-authored JSON where no base fits (custom
  effects, auras, rule elements). Foundry-side validation either way. **D5 of 0023 is formally
  superseded** for the new tools; `import-from-compendium` keeps its clone-only contract unchanged.
- **R-2 — Macros: script + chat authoring AND a remote `execute-macro` tool.** Stakeholder explicitly
  chose the execute tool knowing it is LLM-triggerable JS in the GM session. Mitigation is ours to
  design (own module setting + audit; see §6/§8).
- **R-3 — PC edits: FULL update access** to source-data fields plus add/remove items, effects,
  conditions. Derived fields can't be written regardless (pf2e recomputes; see §4.3).
- **R-4 — Deletes: portal-stamped only.** The module stamps everything it creates
  (`flags.astra-portal.created = true`); delete tools refuse anything unstamped. Portal can clean up
  after itself, can never destroy hand-made content.

## 3. Extension seams — VERIFIED against the portal source

The 0023 architecture extends cleanly; no envelope or transport change is needed for any new tool.

- **A new tool is a 6-file ripple** (per-tool, mechanical): `shared/src/tools.ts` (zod Params/Result,
  `.strict()`, `.describe()` on every field — load-bearing for LLM clients, the 0023 acceptance lesson)
  → `shared/src/index.ts` barrel → `module/src/handlers.ts` (handler + one line in `registerHandlers()`'s
  `CONFIG.queries` table) → `module/src/handlers.test.ts` → `server/src/mcp.ts` (one `registerBridgeTool`
  call) → `server/src/mcp.test.ts`. `bridge.ts`/`bridgeClient.ts`/`envelope.ts` are method-agnostic.
- **There is NO update or delete usage anywhere in the module today** (grep-verified) — those are
  genuinely new Foundry API surfaces (`doc.update`, `updateEmbeddedDocuments`, `deleteDocuments`,
  `deleteEmbeddedDocuments`), each needing `types/foundry.d.ts` ambient-stub additions.
- **Reusable as-is:** `writeGate()` (isGM ∧ writes-enabled ∧ module ceiling 50), the server-side
  pre-bridge cap (`cfg.portal.maxCreatesPerRequest` = 10), dual audit (server OTel `portal.audit.*` +
  module console), `BridgeHandlerError` typed codes, the `getDocumentClass()` forward-safe idiom.
- **New error codes needed** in `shared/src/envelope.ts` `BridgeErrorCode`: `not-portal-created` (R-4
  delete refusal), `validation-failed` (DataModel rejection / RE read-back, §4.1), `execution-failed`
  (macro runtime error). Additive union change; wire shape untouched.
- **Module packaging gotchas:** the zip is **cached in-memory keyed by moduleDir** — a module change
  requires container rebuild+redeploy, not a file swap. `module.json` version is static `0.0.0` and
  nothing forces a bump → **0026 must start real versioning** (bump to 0.2.0 and per-release after) or
  Foundry's update-check never notices; the GM reinstall/refresh path depends on it. The GM must F5
  after module update (0023 lesson: the module dials only on `ready`).

## 4. pf2e / Foundry facts that shape the design — VERIFIED (repo @ pf2e-7.12.2, v13 docs, live bridge)

### 4.1 Validation is split, asymmetric, and partly fail-soft — the central design constraint

- **`template.json` types — `npc`, `character`, `spell`, `spellcastingEntry`, `equipment`, `weapon`,
  `armor`:** partial `system` deep-merges over template defaults; **no schema validation — garbage
  values are stored silently** and only blow up later at data-prep/sheet-render.
- **DataModel types — `hazard`, `effect`, `condition`, `melee`, `feat`, `action`, …** (registry:
  `src/scripts/hooks/load.ts:112-134`): fields are coerced and **strictly validated on create/update —
  invalid data throws `DataModelValidationError`** and the create is rejected; partials fill from
  field initials.
- **Rule elements (`system.rules`)**: stored as `ArrayField(ObjectField)` — **the DB accepts any JSON**.
  Validation happens at actor data-prep: each RE is its own DataModel (`strict:true`); failures →
  `console.warn` + `ignored: true`, silently inert. Unknown `key` → warn.
- **Consequence:** portal must own correctness. Server/module do zod-shaped param validation as today;
  for REs and template.json types the module should **read back after create** (e.g. inspect
  instantiated `item.rules` for `ignored` entries on owned items) and return `warnings[]` in the tool
  result rather than pretending success. Prior art (Pf2eNpcMaker) adds an error-driven repair loop —
  spec should consider a bounded retry on `DataModelValidationError` text.

### 4.2 Authoring recipes (the module-side implementations)

- **NPC (`type:"npc"`)** — the `pf2e-monster-maker` pattern: `Actor.create({name, type:"npc"})` is
  valid bare; a useful statblock = `system.details.level.value`, `abilities.*.mod` (NPCs take
  **modifiers directly**, not scores), `attributes.{ac.value, hp.value/max, speed}`,
  `saves.*.value`, `perception.mod`, `skills.<slug>.base`, `traits.{value, rarity, size.value}` +
  **embedded `melee` items for strikes** (`bonus.value`, `damageRolls` keyed by `randomID()`) and
  `action` items for special abilities (mechanics often live in description HTML as `@Damage`/`@Check`
  enrichers — see §4.3). The repo's `packs/**/*.json` compendium sources are the payload reference
  corpus. GM-Core per-level number tables exist in prior art (`pf2e-monster-maker` `src/Values.ts`) —
  worth embedding as guidance, spec decides how much.
- **Hazard (`type:"hazard"`)** — DataModel, strictly validated (e.g. `attributes.hp.value` is
  `NumberField({integer, min:0, nullable:false})`, traits choices-constrained) — hand-authoring is
  actually *safer* here; validation errors are real and typed.
- **Effects + auras** — effect items are DataModel-validated; REs ride `system.rules`. **An aura is a
  two-item pattern** (verified live against `Aura: Bless`): a carrier item holding
  `{key:"Aura", radius, effects:[{uuid, affects, events, save, removeOnExit}], appearance}` + a
  **companion effect item** (world or compendium uuid) carrying the actual FlatModifier/etc. REs.
  Radius supports formulas (`"5 + @item.badge.value * 10"` — live-verified). The full RE registry is
  41 keys (FlatModifier, GrantItem, Aura, TokenLight, RollOption, DamageDice, Note, ChoiceSet, …);
  docs = the pf2e wiki RE quickstart page.
- **⚠ GrantItem/ChoiceSet preCreate gotcha:** during `actor.createEmbeddedDocuments("Item", …)`,
  GrantItem REs fetch+create their grants and **ChoiceSet may open an interactive dialog in the GM
  browser** unless a selection is pre-seeded via `flags.pf2e.rulesSelections`. Tools that grant
  feats/class features must expose/pre-seed that or the bridge call wedges on a modal.
- **Spells** — items of `type:"spell"`; **castable only when linked to a `spellcastingEntry` item via
  `system.location.value = entry.id`** (verified in source + live: unlinked spells show nowhere).
  Recipe: create entry (`tradition`, `prepared.value` ∈ prepared|spontaneous|innate|focus|items|ritual,
  `spelldc {value, dc}`, `slots`) → create/clone spell with `location.value` set. Prepared entries
  additionally need slot assignment (`system.slots.slotN.prepared: [{id}]`); innate takes per-spell
  `location.uses`. Strongly prefer clone-from-compendium for the spell itself (hybrid R-1).
- **Conditions** — never hand-build: `actor.increaseCondition(slug, {value})` /
  `decreaseCondition` / `toggleCondition` via `game.pf2e.ConditionManager`. `persistent-damage`
  special-cases (opens an editor dialog — must be parameterized, not defaulted).
- **Lights** — plain embedded-document CRUD on scenes:
  `scene.createEmbeddedDocuments("AmbientLight", [{x, y, config:{bright, dim, color, alpha, angle,
  animation:{type, speed, intensity}, darkness:{min,max}, negative}}])` + `updateEmbeddedDocuments` /
  `deleteEmbeddedDocuments`. `negative:true` = darkness source. Animation types should be enumerated
  at runtime from `CONFIG.Canvas.lightAnimations`, not hardcoded. pf2e's **TokenLight RE** is the
  complement: "glowing creature" = effect item with TokenLight (moves with token); "brazier/room" =
  ambient light. The world has **56 scenes** (live-verified) → light tools take a `sceneId`
  (default: active scene).
- **Macros** — `Macro.create({name, type:"script"|"chat", command, img})`. **Creation never executes**
  (verified). Execution = `macro.execute({...scope})`; script macros run with the *executing* user's
  privileges — in our bridge that is **always the GM**, so `execute-macro` is arbitrary GM-privileged
  JS by construction (R-2 accepts this; gating in §6).

### 4.3 Editing existing documents (incl. PC sheets)

- `doc.update()` takes **dot-path keys** (`{"system.attributes.hp.value": 20}`), diff+merges; arrays
  are **replaced wholesale**; `-=key: null` deletes a key. Never write back prepared data — read
  source via `toObject()` first.
- **PCs (`type:"character"`):** `CharacterSystemSource` types `perception/saves/traits` as `never` —
  **saves, perception, AC, class DC, skill totals are derived and unwritable.** Writable source:
  `attributes.hp.value/.temp`, `details.level.value`, `skills.<slug>.rank` (proficiency rank 0–4),
  `build.attributes.boosts` (attribute mods derive from boosts unless `build.attributes.manual`),
  `details.*`, `resources`, `crafting.formulas`. Granting feats/spells/equipment/effects = embedded
  item creation. The update tool should carry a small deny/warn list for known-derived PC paths.
- **NPC mechanics hide in HTML**: inline `@Check[…|dc:N]`/`@Damage[…]` enrichers in description text
  carry real DCs (xdy-workbench's scaler regex-rewrites them) — string updates via dot-path handle
  this; tool descriptions should say so.

## 5. Prior art — what to steal (VERIFIED from clones)

- **adambdooley/foundry-vtt-mcp**: risk-tiered permission manager + quantity caps (corroborates 0023
  D8); soft-validation returning `warnings[]` without blocking; snapshot/rollback via
  `actor.update(originalData)`. Its pf2e support is read-only — actor-from-scratch exists for dnd5e
  only; no lighting/macros/generic update. We are not behind an existing implementation here.
- **miki4920/pf2e-monster-maker**: THE NPC-creation recipe (§4.2) + complete GM-Core Low/Mod/High/
  Extreme per-level tables.
- **JamesCfer/Pf2eNpcMaker** (closest to our use case): three-layer hardening — LLM names spells but
  the client swaps in compendium `system` wholesale; a sanitizer for known LLM failure modes; a
  bounded `Actor.create` retry loop repairing off validation-error text.
- **ThreeHats/foundryvtt-rest-api**: the only prior art with generic update + scene light CRUD +
  macro create/execute (behind an explicit GM setting + separate write scope) — the tool-surface shape
  reference.

## 6. Proposed tool surface (draft — the spec locks names/params)

Existing 10 tools unchanged (`import-from-compendium` keeps clone-only semantics). New (8):

| Tool | Kind | Notes |
|---|---|---|
| `create-actor` | write | `type: npc\|hazard`; hand-authored `system` + embedded items (strikes/actions/spellcasting), or `baseUuid` clone+patch (hybrid R-1); folder optional; stamped `flags.astra-portal` |
| `create-item` | write | world item OR embedded on an actor (`actorId`); item `type` per §4.2 incl. `effect`/`spell`/`spellcastingEntry`; hand-authored or `baseUuid` clone+patch; carries `rules[]`; `rulesSelections` pass-through for ChoiceSet; RE read-back → `warnings[]` |
| `apply-condition` | write | `increase\|decrease\|toggle` via ConditionManager; `persistent-damage` params explicit |
| `create-light` | write | `sceneId` (default active) + position + `config`; stamped |
| `create-macro` | write | `script\|chat`; never executes; stamped |
| `update-document` | write | generic: `uuid` (world or embedded, incl. `Scene.<id>.AmbientLight.<id>`, `Macro.<id>`) + dot-path `updates`; PC derived-path warn/deny list; audit logs the paths touched |
| `delete-document` | write | generic by uuid; **refuses unstamped docs** (`not-portal-created`, R-4) |
| `execute-macro` | write | by macro id; **own module setting** (`allow-macro-execution`, default ON per R-2 but independently killable); result/error capture; loudest audit |

Cap semantics: `creates` counts documents created incl. embedded items granted; updates count 1.

## 7. Risks

1. **Silent garbage on template.json types** (npc/spell/equipment): no DB validation → mitigations
   §4.1 (read-back warnings, bounded repair retry, hybrid preference for clone bases).
2. **`execute-macro` = arbitrary GM JS via MCP.** Accepted by R-2. Mitigations: separate module
   setting, full command text in the audit trail at create, execution audit with macro id+name, and
   the existing two-hop auth (only an authenticated MCP client + a GM-connected bridge can reach it).
3. **ChoiceSet modal wedging the GM browser** on granted items — pre-seed `rulesSelections`; timeout
   already exists server-side (bridge query timeout) so a wedge fails typed, not hung forever.
4. **Update-tool foot-guns**: wholesale array replacement + derived-field writes — deny/warn list +
   `.describe()` warnings (the 0023 lesson: descriptions are load-bearing).
5. **Module version discipline** starts mattering (update-check + GM F5) — bump `module.json` +
   MCP server version in S1, document the GM refresh step in the deploy slice.
6. **Scene-document size**: never add a "get full scene" convenience to fetch lights — a scene's JSON
   includes walls/tiles (huge). Light tools return only the lights array/ids.

## 8. Settled for spec (my staff-eng calls, flagged here so the spec doesn't re-litigate)

- Generic update/delete by uuid + type-specific creates (ThreeHats shape) — not per-type update tools.
- All portal creates stamped `flags.astra-portal.created=true` (+ `tool`, `ts`); R-4 enforcement reads
  the stamp module-side.
- `execute-macro` behind its own module setting, default ON (matches D8 creates-ON philosophy),
  separately switchable off in Foundry without disabling writes.
- New `BridgeErrorCode`s: `not-portal-created`, `validation-failed`, `execution-failed`.
- Module version → `0.2.0` in S1; bump every subsequent portal release.
- GM-Core number tables: NOT embedded server-side in v1 (LLM-side knowledge + clone bases suffice);
  revisit if authored NPCs come out mis-leveled in acceptance.

## 9. Open questions

None — R-1..R-4 resolved by the stakeholder this session (§2); the rest settled in §8.

## 10. Pointers

- Portal seams: `apps/portal/{server/src/{mcp,bridge,server,modulePackage}.ts, module/src/{handlers,
  bridgeClient,main}.ts, shared/src/{tools,envelope,index}.ts}`; config `ontology/ontology-config/
  config.kdl` portal block; `justfile` portal recipes.
- pf2e clone for follow-up greps (scratchpad, session-lived): `…/scratchpad/pf2e` @ `pf2e-7.12.2`.
- 0023 spec (D1–D14, esp. D5/D8) `thoughts/astra/specs/0023-portal-spec.md`; gotchas
  `[[portal-0023-gotchas]]`, `[[portal-oauth-0025-gotchas]]`.
