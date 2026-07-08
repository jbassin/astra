# NLSpec 0026 — portal-authoring: full content-authoring write surface for the portal MCP

**Status:** SPEC'D — ready for implementation (octo:embrace), no code yet.
**Scope doc:** `thoughts/shared/research/2026-07-07-portal-authoring-0026-thoughts.md` (all claims
  verified 2026-07-07: pf2e source read at tag `pf2e-7.12.2` — the exact deployed version; Foundry
  v13 API docs fetched; prior-art repos cloned and read; live documents pulled through the running
  bridge, world "Faerrin" connected during scoping).
**Date:** 2026-07-07 · **Subsystem slug:** `portal-authoring` · **Phase:** follow-on to 0023 + 0025
  (both COMPLETE).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[verify-before-acting]], [[no-silent-scope-cuts]],
  [[resolve-open-questions-before-next-stage]], [[no-ci-monitoring]], [[deploy-apply-with-just]],
  [[config-single-source]], [[telemetry-built-in]], [[portal-0023-gotchas]],
  [[portal-oauth-0025-gotchas]], [[flag-paid-live-actions]].

## Goal

Portal (0023) can search and clone-import, but cannot *author*. The stakeholder wants the LLM to be
a real co-GM content pipeline against the live pf2e "Faerrin" world: **create actors** (NPCs,
hazards) with hand-authored statblocks, **create items/effects/auras/spells** carrying pf2e rule
elements, **place and modify scene lights**, **edit PC sheets**, **apply conditions**, and **write
and execute macros**. This supersedes 0023's D5 (clone-only) for the new tools; the existing 10
tools are untouched.

## Decisions in force

D-1…D-4 are stakeholder-resolved (scope doc §2, AskUserQuestion 2026-07-07); D-5…D-14 are
spec-level technical decisions (scope doc §8 + this spec).

| # | Decision | Resolution |
|---|---|---|
| D-1 | Authoring model | **Hybrid** (supersedes 0023 D5 for new tools only): clone-from-compendium + patch preferred where a base exists (`baseUuid` param on `create-actor`/`create-item`); full hand-authored `system` JSON where no base fits (custom effects, auras, REs). `import-from-compendium` keeps its clone-only contract verbatim. |
| D-2 | Macros | Portal authors **both script and chat macros AND gets `execute-macro`** (stakeholder-chosen with the risk stated: script macros executed from the GM browser run with full GM privileges). Gating in D-9. |
| D-3 | PC edits | **Full update access** to PC source data + add/remove items/effects/conditions. Derived fields are unwritable by pf2e's design (D-10 guards the known paths). |
| D-4 | Deletes | **Portal-stamped only**: `delete-document` refuses any document not stamped per D-6 with a typed `not-portal-created` error. Portal cleans up after itself; can never destroy hand-made content. |
| D-5 | Tool surface shape | **Type-specific creates + generic update/delete by uuid** (the ThreeHats shape): `create-actor`, `create-item`, `apply-condition`, `create-light`, `create-macro`, `update-document`, `delete-document`, `execute-macro` — 8 new tools, 18 total. No per-type update tools; embedded uuids (`Scene.<id>.AmbientLight.<id>`, `Actor.<id>.Item.<id>`, `Macro.<id>`) resolve via `fromUuid` in the generic pair. |
| D-6 | Portal stamp | Every document any portal tool creates (world + embedded, including 0023's three write tools — retrofit) gets `flags["astra-portal"] = {created: true, tool: "<tool-name>", ts: <iso>}`. D-4 enforcement reads the stamp module-side. |
| D-7 | Validation posture | Zod `.strict()` params at the edges as today; the pf2e `system` payload passes through structurally opaque. Module-side **read-back**: a `DataModelValidationError` from Foundry maps to typed `validation-failed` (message preserved — the caller is an LLM, the error text is the repair loop); after create-on-actor, instantiated rule elements are inspected and `ignored: true` REs are returned as `warnings[]` in an otherwise-ok result. **No server-side auto-repair loop in v1** (the MCP client retries with the typed error; a bounded server loop would duplicate that and mask garbage). |
| D-8 | Cap semantics | The existing two-layer cap (server `maxCreatesPerRequest`=10, module ceiling 50) counts **documents explicitly requested** (`quantity`, `items[]` length, 1 for singletons). Documents GrantItem REs cascade-create are NOT pre-counted (unknowable pre-flight; bounded by content, fully audited). `update-document`/`execute-macro` count as writes for gating/audit but not against the create cap. |
| D-9 | execute-macro gate | New module setting **`allow-macro-execution`** (world-scoped, default **ON** — matches 0023 D8's creates-ON philosophy), checked in addition to `writeGate`; killable in Foundry settings without disabling other writes → typed `writes-disabled`-style refusal (`execution-disabled` folded into `validation-failed`? NO — own code, see D-11). Execution captures the macro's return value (best-effort JSON stringify) or maps a thrown error to typed `execution-failed`. The macro's full `command` text is audited at create; execution audits id+name+outcome. |
| D-10 | update-document semantics | Dot-path diff-merge updates (Foundry native). Module-side **deny-list for known-derived PC paths** (`system.saves.*`, `system.perception.*`, `system.traits.*`, `system.attributes.ac.*`, `system.attributes.classDC.*` on `type: "character"` only — typed `validation-failed` naming the path; these are `never`-typed in `CharacterSystemSource`, writes would be silently discarded or corrupt prep). `.describe()` documents: arrays replace wholesale; `-=key: null` deletes a key; mechanics can hide in description-HTML enrichers (string updates handle them). |
| D-11 | New error codes | `BridgeErrorCode` gains `not-portal-created`, `validation-failed`, `execution-failed` (additive union; envelope/wire shape untouched). |
| D-12 | Versioning discipline | `module.json` version → **0.2.0** in S1 and bumps every portal release thereafter (Foundry's update-check compares version strings; the in-memory zip cache + the GM F5 rule make an unbumped version an invisible deploy). The server `McpServer` version string moves in lockstep. |
| D-13 | Lights | `create-light` takes `sceneId` (default: active scene — the world has 56 scenes, live-verified) + `x`/`y` + a `config` subset (bright, dim, color, alpha, angle, animation `{type,speed,intensity}`, `darkness {min,max}`, `negative`). Update/delete via the D-5 generic pair on the embedded uuid, which `create-light` returns. Animation `type` passes through unvalidated (unknown types render un-animated, harmless); the `.describe()` lists the common core types and says to prefer them. **No "get full scene" tool** (scene JSON includes walls/tiles — huge); `create-light` results return `{sceneId, lightUuid}` only. "Glowing creature" is NOT this tool — that's an effect item with a `TokenLight` RE via `create-item` (the `.describe()`s of both point at each other). |
| D-14 | Conditions | `apply-condition` wraps `game.pf2e.ConditionManager` paths: `increase`/`decrease`/`toggle` by slug (never hand-built condition items). `persistent-damage` is special-cased: requires explicit `{formula, damageType, dc?}` params (the bare `increaseCondition` path opens a GM-browser editor dialog — never trigger UI from the bridge); implementer verifies the non-dialog creation path (condition source + `system.persistent` patch) against pf2e 7.12.2 in S3. |

## Verified footprint (trust these over prose — file:line in the scope doc §3–§4)

- **The 6-file ripple per tool** (mechanical, no envelope/transport change): `shared/src/tools.ts`
  (zod Params/Result, `.strict()`, `.describe()` every field — load-bearing, the 0023 acceptance
  lesson) → `shared/src/index.ts` barrel → `module/src/handlers.ts` (handler + one
  `registerHandlers()` line) → `module/src/handlers.test.ts` → `server/src/mcp.ts` (one
  `registerBridgeTool` call) → `server/src/mcp.test.ts`.
- **No update/delete exists in the module today** (grep-verified) — `doc.update`,
  `updateEmbeddedDocuments`, `deleteDocuments`, `deleteEmbeddedDocuments` are new ambient-stub
  surface in `module/src/types/foundry.d.ts`.
- **Validation split (pf2e 7.12.2, `src/scripts/hooks/load.ts:112-134`):** `npc`/`character`/
  `spell`/`spellcastingEntry`/`equipment`/`weapon`/`armor` are template.json types — **no schema
  validation, garbage stored silently**; `hazard`/`effect`/`condition`/`melee`/`feat`/`action` are
  DataModels — **invalid data throws `DataModelValidationError`**. REs (`system.rules`) are never
  DB-validated: bad REs `console.warn` + `ignored: true` at actor prep. Hence D-7.
- **NPC recipe** (pf2e-monster-maker pattern + `packs/**/*.json` corpus): NPCs take **modifiers
  directly** (`abilities.*.mod`); strikes are embedded `melee` items (`damageRolls` keyed by
  `randomID()`); special abilities are `action` items with `@Damage`/`@Check` enrichers in
  description HTML. `Actor.create({name, type:"npc"})` bare is valid (all defaults).
- **Auras are a two-item pattern** (live-verified against `Aura: Bless`): carrier item with
  `{key:"Aura", radius (formula-capable), effects:[{uuid, affects, events, save, removeOnExit}]}`
  + a companion **effect item** (world or compendium uuid) carrying the actual modifier REs.
- **⚠ GrantItem/ChoiceSet preCreate:** granting feats/class features via
  `createEmbeddedDocuments("Item", …)` runs RE preCreate hooks — **ChoiceSet opens a GM-browser
  modal unless pre-seeded** via `flags.pf2e.rulesSelections`. `create-item` exposes a
  `rulesSelections` pass-through param; the bridge query timeout converts a wedge into a typed
  failure, not a hang.
- **Spells are castable only when linked**: `spell.system.location.value === spellcastingEntry.id`
  (verified source + live). Entry needs `tradition`, `prepared.value` ∈
  prepared|spontaneous|innate|focus|items|ritual, `spelldc {value, dc}`, `slots`; prepared entries
  additionally slot-assign (`system.slots.slotN.prepared: [{id}]`); innate takes per-spell
  `location.uses`.
- **PC source vs derived** (`CharacterSystemSource` types `perception/saves/traits` as `never`):
  writable = `attributes.hp.value/.temp`, `details.level.value`, `skills.<slug>.rank` (0–4),
  `build.attributes.boosts` (mods derive from boosts unless `build.attributes.manual`),
  `details.*`, `resources`, `crafting.formulas`. Everything a build grants = embedded items.
- **Lights**: `scene.createEmbeddedDocuments("AmbientLight", [{x, y, config: LightData-subset}])` +
  update/delete embedded; `negative: true` = darkness source (v12+, works in v13).
- **Macros**: `Macro.create({name, type:"script"|"chat", command})` **never executes on create**
  (verified — execution only via hotbar/`/macro`/`macro.execute()`). Script macros run with the
  *executing* user's privileges — always the GM through our bridge.
- **Packaging**: module zip is cached in-memory keyed by moduleDir → module changes need container
  rebuild+redeploy; module dials only on `ready` → **GM must F5 after module update** (0023).
- **Prior-art hardening to port** (clones read): soft-validation `warnings[]` without blocking
  (foundry-vtt-mcp); the NPC dot-path recipe + GM-Core tables location (pf2e-monster-maker,
  deferred per scope §8); sanitizer patterns for known LLM failure modes (Pf2eNpcMaker — informs
  `.describe()` text, not code, in v1).

## Scope (in)

1. **`shared/`**: 8 new Params/Result schema pairs + 3 new `BridgeErrorCode`s (D-11) + barrel
   exports. Every param `.describe()`d; write-tool descriptions state loudly that they WRITE to
   the live campaign (0023 convention).
2. **`module/`**: 8 new handlers + `registerHandlers` entries; the D-6 stamp helper applied to all
   creates (incl. retrofitting the three 0023 write handlers); `writeGate` reused; the D-9
   setting; RE read-back (D-7); PC derived-path deny-list (D-10); `foundry.d.ts` stubs for
   update/delete/ConditionManager/Macro/randomID; version → 0.2.0 (D-12); handler tests via the
   existing `stubFoundry` fakes.
3. **`server/`**: 8 `registerBridgeTool` registrations (`audit: true` on all; `creates`+`cap` per
   D-8); `mcp.test.ts` coverage (description/round-trip/cap patterns exist to extend).
4. **Config**: none expected — `maxCreatesPerRequest` and both keys already exist; the D-9 setting
   is module-side (Foundry world settings, not config.kdl). If implementation surfaces a genuine
   config need, it lands in kdl + both schema mirrors ([[config-single-source]]).
5. **Telemetry**: existing `portal.mcp.tool.*` spans + `astra.portal.mcp.tool_calls` counter cover
   the new tools for free via `registerBridgeTool`; audit lines via the existing dual sinks.
   `execute-macro` additionally logs macro id+name+outcome (D-9); macro `command` text appears in
   the create audit (it's the payload of record), never in span attributes.
6. **Deploy + live acceptance** on the real world (S4), then memory + RESUME.

## Scope (out) / deferred (recorded, not silently cut — [[no-silent-scope-cuts]])

- **GM-Core number tables server-side** (scope §8) — LLM knowledge + clone bases suffice for v1;
  revisit if authored NPCs come out mis-leveled at acceptance.
- **Server-side auto-repair loop** on validation errors (D-7 rationale).
- **Unstamped deletes** (D-4), **per-type update tools** (D-5), **a scene-read/light-list tool**
  (D-13 — `search-world` already finds scenes; light uuids come from `create-light` results).
- **Macro update convenience** — `update-document` on `Macro.<id>` covers it.
- **Compendium-pack writes, world/scene creation, wall/tile/region editing, dice rolling, chat
  posting** — none requested; separate scope if wanted.

## Slices

### Slice S1 — contracts + server surface (Foundry-free)
- Shared: 8 schema pairs, 3 error codes, barrel; server: 8 registrations + tests; versions → 0.2.0
  both sides (D-12).
- **Acceptance:** CI-green both lanes locally; a real MCP client (`StreamableHTTPClientTransport`)
  lists 18 tools, every new param carries a description; over-cap `create-actor`
  (`items[]` > cap) rejects typed `cap-exceeded` **before** any bridge round-trip; unknown-method
  responses from a stub bridge map to typed errors (module not yet updated — proves mid-rollout
  safety).

### Slice S2 — module creates (create-actor, create-item, create-light, create-macro)
- Handlers + stamp helper (D-6, retrofit incl.), hybrid `baseUuid` clone+patch path (D-1),
  RE read-back → `warnings[]` (D-7), `rulesSelections` pass-through, spellcasting-entry linking
  (spell `location.value`), `foundry.d.ts` additions, tests (incl. a DataModelValidationError fake
  → `validation-failed`, an ignored-RE fake → warnings, stamp presence on every create).
- **Acceptance:** CI-green; handler tests prove — NPC create with embedded melee strikes; effect
  create carrying an Aura RE referencing a companion effect; spell+entry pair linked castable;
  light create returns embedded uuid + stamped; macro create never calls execute; every created
  doc stamped; `baseUuid` path clones-then-patches without touching the source.

### Slice S3 — module mutations (apply-condition, update-document, delete-document, execute-macro)
- ConditionManager wrapper (D-14, persistent-damage non-dialog path verified here);
  dot-path update + PC deny-list (D-10); stamp-enforced delete (D-4, embedded + world uuids);
  execute-macro + `allow-macro-execution` setting (D-9); tests.
- **Acceptance:** CI-green; tests prove — condition increase/decrease/toggle; persistent-damage
  without params → typed error, with params → no dialog; PC derived-path write → typed
  `validation-failed` naming the path; unstamped delete → `not-portal-created`; stamped delete
  (world + embedded) succeeds; execute-macro returns captured value, maps a throw to
  `execution-failed`, and is refused when the setting is off while other writes still work.

### Slice S4 — deploy + live acceptance + memory
- Rebuild + `just up` (module zip re-cut, version 0.2.0); **GM updates the module in Foundry +
  F5** (human step, coordinate); no Caddy change expected.
- **Live loop through the public edge, on the real world ([[flag-paid-live-actions]] — flag each
  write at execution; debris cleaned via portal's own `delete-document` where stamped):**
  author a small NPC (level, abilities, strikes) → verify sheet math renders; author a custom
  effect with an Aura RE + companion effect → drop tokens, verify the aura ring + effect
  application; author a spell + entry on that NPC → verify castable; place a light on a
  non-active scene + update its color via `update-document` + delete it; `apply-condition`
  frightened 2 on the test NPC; **one PC edit chosen by the stakeholder** (e.g. HP or a skill
  rank — eyeballed by them); create a script macro + `execute-macro` it (something visible and
  harmless, e.g. a chat whisper) + verify the setting-off refusal; delete the test NPC via
  `delete-document` (stamped) and confirm a hand-made document is refused.
- SigNoz: tool spans + audit lines for every write above, 0 unexpected errors.
- Memory: new `portal-authoring-0026-gotchas` + `MEMORY.md` pointer; RESUME updated; spec status
  header updated per slice as they land.

## Acceptance criteria (exit gate)

- **A.** All 4 slices CI-green + pushed; both lanes reproduce locally.
- **B.** Contract: 18 tools listed via a real client; every new field described; new error codes
  observable; module + server versions 0.2.0.
- **C.** Authoring correct live: NPC (sheet math sane), aura (two-item, ring renders, applies on
  enter), castable spell (entry-linked), light CRUD, condition, macro — all through the edge.
- **D.** Safety: caps enforced both layers; D-4 stamp-enforced delete refuses hand-made docs;
  writes-disabled setting kills all writes; `allow-macro-execution` OFF blocks execution alone;
  PC derived-path writes refused typed.
- **E.** Read-back honesty: DataModel garbage → typed `validation-failed` with Foundry's message;
  ignored REs surface as `warnings[]`, never silent.
- **F.** PC edit: one stakeholder-chosen live edit applied + eyeballed correct.
- **G.** Telemetry/audit: every S4 write in SigNoz (`portal.audit.*` + spans), macro command text
  in the create audit, no unexpected errors.
- **H.** Memory + RESUME + spec status updated.

## Risks

- **Silent garbage on template.json types** (npc/spell/equipment accept anything): D-7 read-back +
  warnings + hybrid clone preference; acceptance C checks rendered sheet math, not just create-ok.
- **`execute-macro` is arbitrary GM-privileged JS via MCP** — stakeholder-accepted (D-2).
  Mitigations: D-9 dedicated setting, two-hop auth already in force, command text audited at
  create, execution audited, and macros never run on create (verified).
- **ChoiceSet modal wedging the GM tab** on granted items: `rulesSelections` pass-through + the
  bridge timeout → typed failure. `.describe()` warns against granting choice-bearing items
  without selections.
- **Update foot-guns** (wholesale array replace; derived writes): D-10 deny-list + description
  warnings — descriptions are load-bearing (0023 lesson).
- **Mid-rollout skew** (server has tools the deployed module lacks, or vice versa): S1 acceptance
  proves typed unknown-method failure; D-12 versioning + the GM-F5 step close the loop at S4.
- **pf2e minor-version drift**: the DataModel-vs-template.json split is mid-migration upstream —
  recheck `load.ts` on any pf2e system update (recorded in the memory at S4).
- **The linguist-commit timer** sweeps staged files — keep a clean index during commits
  ([[pipeline-reorder-0021]]).

## Adversarial completeness pass

- *"Can `create-item` bypass D-4 by editing hand-made content?"* — creates never mutate existing
  docs; mutation is `update-document`, which is deliberately NOT stamp-gated (D-3 requires editing
  hand-made PCs) — the asymmetry is intentional: destroy = stamped-only, modify = allowed + audited. ✓
- *"Can the LLM grant itself broader powers via a macro?"* — a script macro executes only via
  `execute-macro` (setting-gated, audited) or a human click; creation is inert (verified). The
  macro runs as GM — which the bridge already is; no *new* privilege is minted. ✓
- *"Aura effect references a world effect that gets deleted?"* — dangling RE uuid → pf2e warns +
  ignores at prep (fail-soft, §Verified); read-back surfaces it as a warning at create time only.
  Acceptable; documented in `.describe()`. ✓
- *"Cap bypass via GrantItem cascades?"* — D-8 accepts this deliberately: cascades are bounded by
  the granted item's own content, fully audited, and the module ceiling still caps the request. ✓
- *"Persistent-damage dialog wedge?"* — D-14 requires explicit params; the bare path is refused. ✓
- *"update-document on `Scene.<id>` wholesale?"* — dot-path only; a giant `updates` object is
  size-bounded by the WS message limit already in force; scenes are documents like any other and
  edits are audited. No wall/tile convenience = no casual foot-gun surface (Scope-out). ✓
- *"Does anything break the 0023/0025 contracts?"* — existing 10 tools byte-untouched except the
  D-6 stamp retrofit (additive flags on *new* creations only); `/mcp` auth unchanged; module
  settings additive. ✓
- *"Two GM tabs / replace-adopt during S4?"* — unchanged 0023 machinery; the stamp travels with
  documents, not connections. ✓

## Hand-off

Implement via `octo:embrace`, slice by slice, one CI-green Conventional Commit per slice
(`feat(portal): …`), push per slice, `just up` + module update + GM F5 at S4, then the live loop
with the stakeholder present (PC-edit choice + eyeballs). The builder must read the scope doc
§3–§4 before writing code — the pf2e clone for greps lives at the session scratchpad
(`…/scratchpad/pf2e`, re-clone `foundryvtt/pf2e` @ `pf2e-7.12.2` if gone) — and must flag every
live write during S4 at the point of execution ([[flag-paid-live-actions]]).
