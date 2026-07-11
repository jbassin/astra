# NLSpec 0028 — portal-player: a read-only, player-keyed portal tool subset

**Status:** DRAFT (2026-07-11) — no code yet. An adversarial completeness review was launched
  against this draft (targets: the roll-mode⇒whisper/blind claim vs live Foundry source; whether
  the server's `BridgeErrorCode` zod union is closed — wire-compat for the two new error codes;
  `bridge-status` payload player-sensitivity; the Argyle 196-spell section vs the ~10 KB cap).
  **Fold its findings in before implementation; if resuming cold with no findings recorded below,
  re-run that review.** Then → `octo:embrace`, slice by slice.
**Scope doc:** `thoughts/shared/research/2026-07-11-portal-player-0028-thoughts.md` (all claims
  verified 2026-07-11: repo at `3a2008b` walked file:line; live world probed read-only through the
  bridge — party/PC/item shapes + sizes; Foundry 13.351 + pf2e 7.12.2 internals read from the live
  container's own source — ChatMessage schema, roll serialization, `flags.pf2e.context` taxonomy,
  uncapped `game.messages`).
**Date:** 2026-07-11 · **Subsystem slug:** `portal-player` · **Phase:** follow-on to 0023 + 0025 +
  0026 + 0027 (all COMPLETE; 0027 soak-close pending, independent of this work).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[verify-before-acting]], [[no-silent-scope-cuts]],
  [[resolve-open-questions-before-next-stage]], [[no-ci-monitoring]], [[deploy-apply-with-just]],
  [[config-single-source]], [[telemetry-built-in]], [[flag-paid-live-actions]],
  [[portal-0023-gotchas]], [[portal-authoring-0026-gotchas]], [[headless-gm-0027-gotchas]].

## Goal

Portal today is GM-grade: one admin key (+ single-user OAuth) exposing 18 read+write tools. The
stakeholder wants to hand his **players** a connection: a **new static API key** that exposes
**exactly five read-only tools** — `bridge-status`, `query-rolls` (paginated/filterable chat roll
history), `query-party` (roster), `query-player` (one PC's sheet, **sectioned** — live sheets
measure 166–579 KB), `query-item` (lookup by id/name) — with results rendered as **markdown** for
LLM consumption. Players connect from Claude Code; the admin key and OAuth keep the full surface
(which grows to include the four new query tools). Nothing about the GM experience changes.

## Decisions in force

D28-1…D28-7 are stakeholder-resolved (scope doc §5, AskUserQuestion 2026-07-11); D28-8…D28-14 are
spec-level technical decisions.

| # | Decision | Resolution |
|---|---|---|
| D28-1 | Auth shape | **Second static key, same `/mcp` endpoint, OAuth untouched.** `portal_player_api_key` is compared in the existing dual-auth branch (`mcp.ts:499-512`); the matched credential selects the tool scope. Players use Claude Code (stakeholder decision — no player OAuth, no per-player identity). Admin key + OAuth tokens keep the full superset. |
| D28-2 | Derived stats | **query-player reads the live prepared Actor** for a curated projection (AC, saves, perception, skill totals, ability mods, class/spell DC) — raw `toObject()` source has NONE of these (verified: `system.abilities` is null, `system.saves` absent, skill totals absent). A deliberate, narrow read-side exception to 0023-D5 (which banned hand-authored **write** schemas): a hand-picked list of read paths, **fail-soft per field** (missing path renders "—", logs a module warn, never throws). Exact paths verified against the container's `pf2e.mjs` during S2 + one live probe at S4. |
| D28-3 | Roll privacy | **Public rolls only, baked in module-side, not a param:** `whisper.length === 0 ∧ blind !== true`. GM secrets and player↔GM whispers never cross the shared player key. If per-player visibility is ever wanted, that's a future multi-key project (scope-out). |
| D28-4 | PC predicate | `query-player` accepts `type ∈ {"character","familiar"}` only — never npc/party/loot/vehicle/hazard; typed **`not-a-player-character`** error (additive `BridgeErrorCode` union member, 0026 D-11 pattern). `query-party` returns PCs as full rows + companions/familiars as labeled minimal rows (name, type, master) — the live party actor's `system.details.members` includes a familiar (verified). |
| D28-5 | Item scope | `query-item` covers **world items + party-member-embedded items + compendium items**: lookup by uuid/id (any of the three shapes) or name search across all three, provenance-labeled. Visibility: world items require `ownership.default ≥ OBSERVER(2)` (the bridge runs as GM and would otherwise leak GM-hidden items); embedded = party members only; compendium = public. |
| D28-6 | Markdown at the server | The four query tools return markdown text content. **The module returns typed compact JSON over the wire (zod contracts as ever); the server renders markdown** — keeps the module dumb, the renderer unit-testable without Foundry, and the wire contract reusable. Includes a small **HTML→markdown pass** (Foundry rich-text: strip tags, translate `@UUID[…]{label}`-style enrichers to their labels) with golden tests — new code, ~100 lines, sized honestly. |
| D28-7 | Versioning | Module `module.json` + server `McpServer` → **0.4.0 in lockstep** (new module handlers ⇒ the 0027 rule). Bump lands in the final code slice (S3) so exactly one module-update/deploy cycle ships it. |
| D28-8 | Scope machinery | `buildMcpServer(bridge, maxCreatesPerRequest, scope: "admin" \| "player")`. A single declarative **`PLAYER_TOOL_NAMES`** const (the five names) lives next to the tool registrations; registration is filtered by it under `scope: "player"`. One source of truth, asserted by tests from both directions (player sees exactly 5; admin sees all 22). The auth branch resolves scope: admin key → admin; player key → player; OAuth → admin (unchanged single-user semantics). |
| D28-9 | Telemetry | Reads follow the existing read-tool discipline: span `portal.mcp.tool.<name>` + `mcpToolCalls` counter, **no `portal.audit.*`** (audit stays write-only). New: the counter and tool spans gain an **`auth` attribute** (`"admin-key" \| "player-key" \| "oauth"`) so player usage is distinguishable in SigNoz. The player key itself never appears in any log/span/error ([[portal-oauth-0025-gotchas]] hygiene rule verbatim). |
| D28-10 | query-rolls shape | Newest-first, cursor-paginated over `game.messages.contents` (verified uncapped, in-memory, insertion-ordered): cursor **`(timestamp, _id)`**, `limit` default 20 / max 100. Filters: `actor` (uuid or name → `speaker.actor` ∪ `flags.pf2e.context.actor`), `type` (pf2e `context.type` taxonomy + `"roll"` fallback bucket for untagged `rolls.length > 0` messages), `outcome` (the four degree-of-success strings), `since`/`until` (ms epoch or ISO-8601). Only messages with `rolls.length > 0` qualify (chat chatter excluded). Result meta carries `totalMessages` (collection size — doubles as the §Risks probe) + `hasMore` + `nextCursor`. |
| D28-11 | query-player sections | `section ∈ {summary, stats, skills, spells, feats, inventory, notes}` (zod enum, every value `.describe()`d — the 0023 lesson). Grounding: `items[]` is 97–99% of sheet bytes; spells (30–76%) and feats (15–44%) get their own sections. `spells` groups by spellcasting entry → rank, slots/prepared state, names + traits only (full descriptions via `query-item` on the spell's uuid); optional `entry` filter param for casters with multiple entries. Every section's markdown stays comfortably under ~10 KB on the live worst case (Argyle, 258 items) — asserted in tests with a fixture derived from the live probe. |
| D28-12 | Rolls wire shape | The module renders each qualifying message to a compact typed row: `{id, timestamp, speakerAlias, speakerActorId, checkName (flags.pf2e.modifierName ?? flavor-derived), rollType, outcome, dcValue (only when dc.visible), formula, total, dice: [{faces, results…}], originItemName?}` — parsed from the stored Roll JSON (`formula`/`total`/`terms` — verified complete; never re-evaluate). `content` HTML is NOT shipped (bulky, unsafe); `flavor` only via the derived check name. |
| D28-13 | Name resolution | `query-player` and `query-item` accept `name` (case-insensitive exact, then unambiguous-prefix; ambiguous → typed `ambiguous-name` error listing candidates — additive union member) or `uuid`/`id`. `query-rolls`'s `actor` filter resolves the same way against world actors. |
| D28-14 | Module-skew behavior | Server 0.4.0 + module 0.3.0 (the deploy window / a stale F5): query-* dispatch reaches `CONFIG.queries` with no registered handler — S3 verifies this surfaces as a **typed error** (existing `unknown-method`-shaped failure or equivalent), never a hang or crash; the tool result tells the caller the module needs updating. Module 0.4.0 + older server: handlers registered but never called — inert, safe. No envelope/AuthMeta change in 0028 ⇒ no 0027-style `bad-key` skew signature. |

## Verified footprint (trust these over prose — file:line in the scope doc §2–4)

- **Per-request `McpServer`:** `createMcpRequestHandler` builds a fresh server + transport every
  HTTP request (`server/src/mcp.ts:514-515`, stateless by design `mcp.ts:8-13`; SDK `^1.29.0`).
  Scope selection is a per-request conditional — no second endpoint/server/session machinery.
- **Auth branch:** `mcp.ts:499-512` (exact-compare admin key, else OAuth verify). Player key =
  second compare + scope threading. OAuth scopes exist but are advertised-not-enforced
  (`oauth.ts:631-635`) — untouched.
- **New-key plumbing (8 files):** `deploy/sops/secrets.enc.yaml` · `config.kdl:255-276` portal
  block (`player-mcp-api-key ref="sops:portal_player_api_key"`) · `libs/ts/config/src/config.ts:
  225-240` · `libs/py/config/src/astra_config/models.py:203-219` (mirror is load-bearing —
  `extra="forbid"`) · `deploy/docker-compose.yml:532-534` env · `server/src/index.ts:48-63`
  (`requireSecret`) · `server/src/server.ts:33-57,90-96` · `mcp.ts:476-537`. **No new workspace
  member ⇒ zero Dockerfile ripple.**
- **Tool pattern:** shared contract (`shared/src/tools.ts`) → `registerBridgeTool`
  (`mcp.ts:85-155`) → `Bridge.sendQuery` (`bridge.ts:298-332`) → module `dispatchQuery`
  (`handlers.ts:1278-1294` — the isGM + designated-dialer gate wraps ALL queries centrally; new
  handlers inherit 0027 for free) → `CONFIG.queries` registry (`handlers.ts:1243-1262`).
- **Read discipline:** limit default 25/max 200 (`handlers.ts:66`), compact rows, no
  audit/cap/creates config on reads (audit is structurally write-only, `mcp.ts:62-68,124`).
- **Live party:** `Actor.xxxPF2ExPARTYxxx`, `system.details.members` = 5 uuid refs — 4 PCs
  (Anzu/Argyle/Benny/Johnny) + familiar Othello (`system.master.id` → Anzu). Resolve the party
  actor by `type === "party"` at query time, never hardcode the id.
- **PC sheets:** Johnny 169,530 B / Argyle 578,732 B; `items[]` = 97.6–99.2% of bytes. Source
  data verified missing ALL combat stats (D28-2). Spell↔entry join: `spell.system.location.value`
  = entry's embedded `_id`; slots at `entry.system.slots.slot0..11`.
- **ChatMessage v13** (container source `common/documents/chat-message.mjs`): `author` (v13
  rename from `user` — never use `user`), `timestamp` (ms, creation-set), `speaker {scene,actor,
  token,alias}`, `whisper` (user-id array, empty = public), `blind`, **`rolls` = array of
  serialized-Roll JSON strings** (write-validated `evaluated`), `flags`, `_stats`.
- **Roll JSON** (`client/dice/roll.mjs#toJSON`): `{class, formula, total, evaluated, terms[]}`;
  `Die` terms `{number, faces, modifiers, results[{result, active, discarded, …}]}` — markdown
  rendering needs no re-evaluation.
- **pf2e taxonomy** (`pf2e.mjs` ~:23931/:23028/:383): `flags.pf2e.context.type` ∈ {check,
  attack-roll, skill-check, saving-throw, perception-check, flat-check, initiative, spell-cast,
  damage-roll, self-effect}; `outcome`/`unadjustedOutcome` ∈ the four degree strings or null;
  `context.dc {value, visible, …}`; siblings `flags.pf2e.{modifierName, modifiers, origin, strike}`.
- **`game.messages` is uncapped client-side** (world handshake ships all messages; LevelDB `find()`
  has no limit; `MAX_MESSAGE_HISTORY=16` and `batchSize=100` are input-recall/DOM-render caps, not
  collection caps). Pagination = module-side filter+slice. Live count UNVERIFIED (D28-10's
  `totalMessages` surfaces it at S4).
- **Ambient-stub ripple:** `module/src/types/foundry.d.ts` needs `game.messages` (new collection),
  ChatMessage fields per D28-12, `game.actors` type-filter usage, and the prepared-actor derived
  surface for D28-2 — same "only what we touch" policy as 0026/0027.
- **Tests:** server = `mcp.test.ts` pattern (real SDK client + `FakeModule` over the real bridge
  WS); module = `handlers.test.ts` pattern (Foundry-free ambient fakes, `dispatchQuery` direct).

## Scope (in)

1. **Key + scope machinery (server + config):** the 8-file plumbing; `buildMcpServer` scope param +
   `PLAYER_TOOL_NAMES` (D28-8); `auth` telemetry attribute (D28-9); tests for key→scope selection,
   401s, and tool-list visibility from both directions.
2. **Shared contracts:** param/result pairs for the four query tools (every param `.describe()`d),
   additive `BridgeErrorCode` members `not-a-player-character` + `ambiguous-name`.
3. **Module handlers:** `portal.query-party` / `query-player` (sections + D28-2 derived projection,
   fail-soft) / `query-item` (tri-scope search + ownership rule) / `query-rolls` (public-only
   filter + cursor pagination + Roll-JSON parsing) + `foundry.d.ts` ambient additions + unit tests
   (incl. D28-3 filter, D28-4 predicate, cursor math, fail-soft projection).
4. **Server:** tool registrations (read-tool config — no audit/cap), the markdown renderer +
   HTML/enricher→markdown utility with golden tests (D28-6), rolls/party/player/item renderers.
5. **Versioning:** module + server → 0.4.0 (S3).
6. **Deploy + live acceptance (S4):** SOPS `portal_player_api_key` mint, `just up`, GM module
   update + F5 / headless relaunch, the A–H gate below, memory + RESUME + spec status.

## Scope (out) / deferred (recorded, not silently cut — [[no-silent-scope-cuts]])

- **Player OAuth / per-player keys / scope enforcement in oauth.ts** (D28-1; revisit only if
  players need claude.ai or per-player whisper visibility).
- **Any write tool on the player key** — create/update/apply/delete/execute stay admin-only.
- **Journals, scenes, NPC/bestiary reads for players** — not asked; additive later if wanted.
- **Rate limiting / quota on the player key** — one shared key among ~4 trusted players on a
  personal campaign; revisit if abuse ever materializes.
- **Message-content search** (full-text over chat) — query-rolls filters structured roll data
  only.
- **Edge changes** — same `portal.iridi.cc/mcp` Caddy route; no `sites.caddyfile` touch.

## Slices

### Slice S1 — player key + tool scoping (server + config; Foundry-free)
- The 8-file key plumbing (SOPS value minted at S4; CI uses a test value); `buildMcpServer` scope
  param + `PLAYER_TOOL_NAMES` const (initially `["bridge-status"]` + the four query names —
  declared up front, names simply not yet registered); auth-branch scope resolution; `auth`
  attribute on counter + spans (D28-9).
- **Acceptance:** CI-green both lanes locally. Tests prove — player key authenticates and sees a
  tool list ⊆ `PLAYER_TOOL_NAMES` (exact-5 asserted at S3 when all exist); admin key sees the full
  list; OAuth token sees the full list (unchanged); a wrong key still 401s with the
  `resource_metadata` header; the player key never appears in any captured log/span; config
  round-trips through both schema mirrors (`uv run pytest` config tests included).

### Slice S2 — query-party + query-player (contracts + module + server + renderer)
- Shared contracts; module handlers: party roster (resolve party actor by type, member resolution,
  PC vs companion split per D28-4) and player sheet sections (D28-11) incl. the D28-2 derived
  projection (paths confirmed against the container's `pf2e.mjs` first — record them in the scope
  doc's margin or the memory); `foundry.d.ts` additions; server registration + the markdown
  renderer + HTML/enricher→markdown utility (golden tests); section-size assertions against a
  live-derived Argyle-scale fixture.
- **Acceptance:** CI-green. Tests prove — every section renders for a fixture PC (worst-case
  scale) under the size cap; `not-a-player-character` on an npc/party/loot uuid; `ambiguous-name`
  behavior; familiar accepted with master link; derived projection fail-soft (a missing path
  renders "—" + warn, never throws); spells group by entry→rank with slot state; markdown goldens
  stable.

### Slice S3 — query-item + query-rolls + version lockstep
- Shared contracts; module handlers: item tri-scope lookup/search (D28-5 ownership rule) and rolls
  (D28-3 public-only filter, D28-10 cursor pagination, D28-12 row parsing incl. degree-of-success
  + DC-visibility rule); server registration + renderers; **module + McpServer → 0.4.0**;
  `PLAYER_TOOL_NAMES` now fully registered — the exact-5/exact-22 tool-list tests land here,
  plus the D28-14 skew test (query against a FakeModule lacking the handler → typed error).
- **Acceptance:** CI-green. Tests prove — whispered/blind messages NEVER appear regardless of
  filters; cursor walks a synthetic 1k-message history stably (same-timestamp tiebreak included);
  filters compose (actor ∧ type ∧ outcome ∧ time); untagged `/roll` messages land in the `roll`
  bucket; item search labels provenance and respects `ownership.default < 2` exclusion; player
  tool list is exactly the five; admin list is exactly 22.

### Slice S4 — deploy + live acceptance + memory (stakeholder present)
- Mint the key: `sops set … portal_player_api_key` ([[flag-paid-live-actions]] — flag at
  execution); `just up` (classifier gate — stakeholder says "deploy it"); GM updates the module
  to 0.4.0 + F5s any human tab; **restart `astra-portal-headless`** so the headless session picks
  up the new module ([[headless-gm-0027-gotchas]]); existing GM MCP sessions need `/mcp` reconnect
  to see the new tools (0026 snapshot gotcha).
- Then the exit gate below; memory (`portal-player-0028-gotchas` + `MEMORY.md`), RESUME, spec
  status → COMPLETE.

## Acceptance criteria (exit gate)

- **A.** All slices CI-green + pushed; both lanes reproduce locally.
- **B.** **Scope proven live from a real Claude Code client:** the player key lists **exactly**
  `bridge-status`, `query-rolls`, `query-party`, `query-player`, `query-item`; the admin key lists
  all 22; a garbage key 401s. A player-key attempt to call an admin tool (e.g. `search-world`)
  fails as unknown/unavailable — no write tool reachable.
- **C.** **query-party live:** roster matches the real party (4 PCs full rows, Othello labeled
  companion row with master), markdown renders clean in Claude Code.
- **D.** **query-player live:** all seven sections for ≥2 PCs including Argyle (the 579 KB
  outlier), each response comfortably sized; the `stats` section's AC/saves/perception/skill
  totals match the in-Foundry sheet (GM eyeball) — the D28-2 projection proven against reality;
  a non-PC uuid refused typed.
- **E.** **query-rolls live:** a real page of recent rolls with correct formula→total, degree
  outcomes, and DC-visibility handling; `actor`/`type`/`outcome`/time filters return correct
  subsets; cursor pagination walks back through history; **a known whispered/blind GM roll is
  verified ABSENT** while a public roll from the same window is present; `totalMessages` recorded
  (the §Risks probe — note the number in the memory).
- **F.** **query-item live:** one world item, one party-embedded item (by name), one compendium
  entry (e.g. a spell's full description) all resolve; a GM-hidden world item
  (`ownership.default < 2`) is NOT returned.
- **G.** **Telemetry:** `portal.mcp.tool.query-*` spans + `mcpToolCalls{auth="player-key"}`
  visible in SigNoz; no `portal.audit.*` from reads; no key material anywhere (D28-9 spot-check).
- **H.** Memory + RESUME + spec status updated; player onboarding one-liner recorded (the
  `claude mcp add` command with the new key).

## Risks

- **Derived-path drift (D28-2):** the projection reads pf2e-internal prepared-actor paths
  (system 7.12.2 today) that can move across pf2e majors. Mitigations: fail-soft per field
  (degrades to "—", never breaks the section), a handler test with a faked prepared actor, and a
  memory note to re-verify on pf2e upgrades (same class of pin-drift as 0027's Foundry-client
  coupling — arrives only when the stakeholder upgrades).
- **Unknown message-history size:** `game.messages` is provably uncapped and the live count is
  unverifiable pre-deploy (LevelDB locked). The filter is an in-memory array scan — cheap even at
  tens of thousands — but D28-10's `totalMessages` makes the number visible at S4; if it's
  extreme, add a default `since` window as a fast-follow (recorded, not built speculatively).
- **HTML→markdown edge cases:** Foundry rich-text is messy (enrichers, inline rolls, style spans).
  The utility is deliberately lossy-but-safe (strip unknown constructs to text, never emit raw
  HTML); golden tests over real captured samples from the live probe keep it honest.
- **Shared-key blast radius:** any player (or key leak) sees the whole party's sheets + public
  roll history — read-only, campaign-internal data, accepted by D28-1/D28-3's shape. Rotation is
  cheap (`sops set` + `just up`); record the rotation recipe in the memory. The public-only roll
  filter is the hard line protecting GM secrets, and it is module-side (a compromised/buggy
  server prompt can't widen it without a module release).
- **Module/server deploy-window skew (D28-14):** server 0.4.0 registers query tools while the
  world still runs module 0.3.0 → typed unknown-method error until the GM updates + the headless
  session relaunches. Brief, self-describing, verified by test; sequence S4 to keep the window
  minutes-long.
- **`.describe()` discipline:** every new param gets one (the 0023 `search-compendium type` lesson
  — an undescribed enum makes LLM clients guess and silently fail); the S1–S3 tests re-assert the
  tools/list carries descriptions.
- **The linguist-commit timer** sweeps staged files — keep a clean index during commits
  ([[pipeline-reorder-0021]]).

## Adversarial completeness pass

*(run 2026-07-11 against the draft; findings incorporated above)*

- *"Can the player key reach a write through a query tool?"* — No handler in the player set
  mutates; module-side, the four new handlers are pure reads over collections; server-side, the
  scope filter means write tools are never registered on a player-key request, so the SDK rejects
  them as unknown. B's live gate attempts one. ✓
- *"Does markdown-at-the-server break the existing tools' JSON contract?"* — The four new tools
  are new; no existing tool's result shape changes. Admin clients see the new tools too, whose
  output is markdown by design (D28-6) — acceptable, they're player-purpose tools. ✓
- *"Is `whisper.length === 0` sufficient? What about `rollMode` / GM-only flags?"* — Foundry
  implements every non-public roll mode (gmroll/blindroll/selfroll) THROUGH `whisper` +
  `blind` (verified in the container source: roll modes populate `whisper` with GM ids and/or set
  `blind`) — the two fields are the storage-level truth, not a proxy. `dc.visible` additionally
  gates DC display (D28-12). ✓
- *"The projection is GM-authority data — does `stats` leak anything a player shouldn't see?"* —
  It serves only the player's OWN party's `character`/`familiar` actors (D28-4); PCs are
  player-visible by definition in this campaign. NPC stats are unreachable (predicate). ✓
- *"Ambiguous names across scopes in query-item (a world 'Dagger' AND embedded 'Dagger')?"* —
  Name search returns a provenance-labeled hit LIST (D28-5/D28-13); only an id/uuid fetch renders
  a single item. `ambiguous-name` applies to query-player/rolls actor resolution where exactly
  one target is required. ✓
- *"What does query-party return if the party actor is missing/renamed?"* — Resolve by
  `type === "party"` at query time; zero party actors → typed `not-found` with a self-describing
  message; multiple → union the members (pf2e allows multiple parties; live world has one). ✓
- *"Does the headless GM session (0027) affect any of this?"* — It's the bridge's GM session —
  queries run through it identically; `dispatchQuery`'s designated-dialer gate covers the new
  methods automatically. S4 must restart the headless unit after the module update (in slices). ✓
- *"Config mirror drift?"* — One new field in an existing block; both mirrors in S1 with config
  tests both lanes ([[config-single-source]]). ✓

## Hand-off

Implement via `octo:embrace`, slice by slice, one CI-green Conventional Commit per slice
(`feat(portal): 0028 S<N> — …`), push per slice. S1–S3 need no live Foundry (FakeModule + ambient
fakes throughout; the D28-2 path confirmation at S2 reads the container's `pf2e.mjs`, read-only).
S4 is a coordinated session with the stakeholder (key mint, "deploy it" for `just up`, GM module
update + F5, headless restart, then A–H). The builder must read the scope doc before writing code,
honor the classifier gates in [[portal-authoring-0026-gotchas]], and flag every live/host-mutating
step at the point of execution ([[flag-paid-live-actions]]).
