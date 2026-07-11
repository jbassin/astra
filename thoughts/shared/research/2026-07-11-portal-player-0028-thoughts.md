# portal-player (0028) — scoping: a read-only, player-keyed tool subset

**Date:** 2026-07-11 · **Status:** SCOPED (all open questions resolved with the stakeholder) ·
**Next:** spec via `octo:spec` → `thoughts/astra/specs/0028-portal-player-spec.md`

## 1. What + why

Portal (0023/0025/0026/0027) is a GM-grade MCP surface: 18 tools, full read+write against the live
pf2e "Faerrin" world, one static admin key + single-user OAuth. The stakeholder now wants a
**smaller, strictly read-only tool subset for his players**, gated by a **new static API key**:
when that key authenticates, **only** these tools are visible/callable:

- `bridge-status` — (existing) liveness.
- `query-rolls` — chat roll messages, paginated + filterable.
- `query-party` — the party roster.
- `query-player` — one player character's sheet, **sectioned** (sheets are 166–579 KB — far too
  big for one call).
- `query-item` — item lookup by id/uuid or name.

Results render as **markdown** (LLM-friendly), unlike the existing tools' JSON. Players connect
from **Claude Code** (static key only — stakeholder decision; the OAuth path is untouched).

Everything below was verified 2026-07-11 against (a) the repo at HEAD `3a2008b`, (b) the **live**
Faerrin world through the portal bridge (read-only), and (c) the live Foundry container's own
source (`docker exec foundry_faerrin`, read-only) — per the scope-stage rule, nothing here is
assumption.

## 2. Verified: server architecture — where the key + scoping attach

- **Stateless per-request MCP servers.** `createMcpRequestHandler` builds a **fresh `McpServer` +
  `StreamableHTTPServerTransport` on every HTTP request** (`apps/portal/server/src/mcp.ts:514-515`;
  deliberate, documented at `mcp.ts:8-13`; SDK `@modelcontextprotocol/sdk ^1.29.0`). There is no
  session object. ⇒ **"different tool list per key" = parameterize `buildMcpServer` with a tool
  scope and pick the scope in the auth branch.** No second endpoint, no second server process, no
  architectural change.
- **The auth branch** is `mcp.ts:499-512`: exact-compare vs the single `mcpApiKey`, else fall
  through to `oauth.verifyAccessToken`. The player key is a second compare here; the matched
  credential determines the scope passed to `buildMcpServer`. Admin key and OAuth tokens keep the
  full (now 18+4=22) tool set; the player key gets the 5-tool set.
- **OAuth needs zero changes.** Scopes exist structurally but are advertised-not-enforced
  (`oauth.ts:631-635`); the whole provider is single-user by design. Static-key-only for players
  (stakeholder decision) means `oauth.ts` is untouched and claude.ai connections are unaffected.
- **Tool boilerplate** (per existing pattern, one worked trace: `search-world`): shared zod
  contract (`shared/src/tools.ts:127-155`) → `registerBridgeTool` (`server/src/mcp.ts:85-155`,
  span `portal.mcp.tool.<name>` + `mcpToolCalls` counter + typed error mapping) →
  `Bridge.sendQuery` (`server/src/bridge.ts:298-332`) → module `dispatchQuery`
  (`module/src/handlers.ts:1278-1294` — the 0027 isGM + designated-dialer gate wraps ALL queries
  centrally, so new handlers inherit it) → `CONFIG.queries` registry (`handlers.ts:1243-1262`).
- **Read-tool discipline** (reuse as-is): compact rows, `limit` param (default 25 / max 200,
  `handlers.ts:66`), full payloads only on single-document fetch; **no audit/cap/creates config**
  — audit (`portal.audit.*`) is write-only by structure (`mcp.ts:62-68` only fires when
  `config.audit === true`; no read tool sets it). Reads still get span + counter.
- **Version lockstep:** `module/module.json:5` and `mcp.ts:184` both say `0.3.0`, hand-bumped
  together. 0028 adds module handlers ⇒ **bump both to 0.4.0** and redeploy module + server in
  lockstep (the 0027 AuthMeta-skew lesson: an old server vs new module fails handshake bucketed
  as `bad-key`).

### New-key footprint (all files, verified)

1. `deploy/sops/secrets.enc.yaml` — add `portal_player_api_key` (sops set).
2. `ontology/ontology-config/config.kdl` portal block (`:255-276`) — `player-mcp-api-key
   ref="sops:portal_player_api_key"`.
3. `libs/ts/config/src/config.ts:225-240` — `playerMcpApiKey: secret()`.
4. `libs/py/config/src/astra_config/models.py:203-219` — `player_mcp_api_key: SecretRef | None`
   (mirror is load-bearing: root `AppConfig` is `extra="forbid"`).
5. `deploy/docker-compose.yml:532-534` — `PORTAL_PLAYER_MCP_API_KEY: ${PORTAL_PLAYER_MCP_API_KEY:-}`.
6. `apps/portal/server/src/index.ts:48-63` — `requireSecret` + thread through.
7. `apps/portal/server/src/server.ts:33-57,90-96` — options + handler wiring.
8. `apps/portal/server/src/mcp.ts:476-537` — the branch + scoped `buildMcpServer`.

**No new workspace member ⇒ zero Dockerfile manifest ripple.** Only config/secrets/compose edits
outside `apps/portal`.

## 3. Verified: live world data (read-only probe through the bridge)

- **Party:** a `party` actor exists — `Actor.xxxPF2ExPARTYxxx` "The Party" (~1.4 KB).
  `system.details.members` = uuid refs only (no cached names). **5 members: 4 PCs**
  (Anzu/Psychic/Tengu 7 · Argyle/Cleric/Elf 8 · Benny/Fighter/Android 7 · Johnny/Bard/Human 7)
  **+ 1 familiar** (Othello the raven, `type:"familiar"`, `system.master.id` → Anzu).
- **PC sheets are huge:** Johnny = 169,530 B (~40k+ tokens); Argyle = 578,732 B. `items[]` is
  97.6–99.2% of the bytes — spells (30–76%) and feats (15–44%) are the two unbounded buckets.
  Sectioning is mandatory, and spells/feats must each be their own section.
- **⭐ Source data has NO combat stats.** In `toObject()`: `system.attributes` = `{hp}` only;
  `system.skills` = `{<skill>:{rank}}` (untrained omitted, no totals); `system.saves` absent;
  `system.abilities` **null** (only `system.build.attributes.boosts` stored); spellcasting
  `dc`/`spelldc` stored as `0` placeholders. AC, saves, perception, skill totals, ability
  scores/mods, spell DCs are ALL runtime-derived by pf2e `prepareData()`. What IS stored:
  `system.details` (level/xp/languages/biography), `system.resources` (hero/focus points),
  ranks, build choices, all items.
- **PC discriminator:** `actor.type` — values observed live: `character` (the 4 PCs), `familiar`,
  `party`, `npc` (world bestiary). Ownership is unreliable as a predicate (the GM id appears on
  everything; GMs can loan NPC ownership). ⇒ enforce on `type` (see D28-4 for the familiar
  carve-in).
- **Spell linkage:** `spellcastingEntry` items own tradition/ability/prepared-type +
  `system.slots.slot0..11`; `spell` items point back via `system.location.value` =
  the entry's embedded `_id`. The spells section joins on that id and groups by entry + rank.
- **Items:** world items exist (`search-world types:["items"]` works; e.g. `Item.Cc1FPmFJa8AaMGHx`
  "Las Pistol", ~1.3 KB); world/compendium/actor-embedded items share the same document shape.
  `search-world` does NOT index embedded items — name-search over PC inventories must be a new
  module-side iteration (bounded: ~4 party PCs).
- **Chat messages are unreachable today** — `search-world`'s `types` enum is closed
  (actors/items/journal/scenes) and no ChatMessage uuid is discoverable. `query-rolls` is a
  net-new module handler over `game.messages`, confirmed both by repo grep (zero references) and
  live probing.

## 4. Verified: ChatMessage + Roll internals (live container source, Foundry 13.351 + pf2e 7.12.2)

Read from `/home/node/resources/app/{common,client,dist}` and
`/data/Data/systems/pf2e/pf2e.mjs` in the `foundry_faerrin` container (read-only). Key facts:

- **v13 schema** (`common/documents/chat-message.mjs`): `_id, type, system, style, author`
  (⚠ v13 renamed `user`→`author`; a deprecated `user` getter remains — use `author`),
  `timestamp` (ms epoch, `Date.now` at creation), `flavor, title, content` (HTML),
  `speaker {scene, actor, token, alias}` (ids), `whisper` (user-id array; empty = public),
  `blind` (bool), **`rolls` (array of serialized-Roll JSON strings**, write-validated
  `evaluated === true`), `sound, emote, flags, _stats`.
- **Serialized Roll** (`client/dice/roll.mjs#toJSON` ~:1028): `{class, formula, total, evaluated,
  options, terms[]}`; `Die` terms carry `{number, faces, modifiers, results[{result, active,
  discarded, rerolled, exploded…}]}`. Everything needed for markdown — `1d20+7 → 23`, kept vs
  dropped dice — is in the stored JSON; **no re-evaluation needed**.
- **pf2e roll taxonomy** (`pf2e.mjs` CheckPF2e.roll ~:23931, damage builder ~:23028):
  `flags.pf2e.context.type` ∈ {check, attack-roll, skill-check, saving-throw, perception-check,
  flat-check, initiative, spell-cast, damage-roll, self-effect}; `context.outcome` /
  `unadjustedOutcome` ∈ {criticalFailure, failure, success, criticalSuccess} (null when no DC);
  `context.dc {label, value, visible…}`; `context.actor/token` (ids), `origin/target`
  (uuids); siblings `flags.pf2e.{modifiers, modifierName, origin{uuid,type}, strike}`;
  `flags.core.initiativeRoll`. Plain `/roll` messages have no `flags.pf2e` — bucket them as
  generic `roll` when `rolls.length > 0`.
- **⭐ `game.messages` is UNCAPPED client-side.** The world socket handshake ships every
  ChatMessage; the LevelDB read path (`dist/database/backend/sublevel-database.mjs#find`) has no
  limit; `ChatLog.MAX_MESSAGE_HISTORY = 16` (input-recall queue) and
  `CONFIG.ChatMessage.batchSize = 100` (DOM render batching) are both red herrings. ⇒ the
  headless GM session already holds the full history in memory as Document instances;
  **pagination = module-side filter + slice over `game.messages.contents`**, no retention window.
  Cost flag: collection size is real browser memory (see §7 probe).
- **Ordering/cursor:** insertion order tracks ascending `timestamp`; recommended cursor
  **`(timestamp, _id)`** with `_id` tiebreak.

## 5. Decisions (all stakeholder-resolved 2026-07-11 — none open)

- **D28-1 — Static key only.** Players use Claude Code. One shared `portal_player_api_key`
  checked in the existing dual-auth branch; OAuth untouched; admin key + OAuth keep the full
  superset (incl. the new query tools). Same `/mcp` endpoint.
- **D28-2 — Derived stats come from the live prepared Actor.** The module handler serves a
  **curated projection** off the live instance (AC, saves, perception, skill totals, ability
  mods, class DC, spell DCs) alongside stored source data. This is a deliberate, narrow read-side
  exception to 0023-D5 ("never model pf2e"): D5 banned hand-authored **write** schemas; this is a
  hand-picked list of read paths, fail-soft per field (a missing path renders "—", never throws).
  Exact paths verified at implementation against the container's `pf2e.mjs` (greppable) + one
  live probe.
- **D28-3 — query-rolls is public-rolls-only.** Hard server-side filter: `whisper.length === 0 ∧
  blind === false`. GM secrets and player↔GM whispers never cross the player key (it's shared —
  there is no per-player identity). Non-negotiable filter, not a param.
- **D28-4 — Party = PCs + companions, both queryable.** `query-party` returns PCs as full rows
  and familiars/companions as labeled minimal rows (name, type, master). `query-player` accepts
  `type ∈ {character, familiar}` — **never** npc/party/loot/vehicle/hazard (typed
  `not-a-player-character` error). Familiar sheets are tiny; master link preserved.
- **D28-5 — query-item covers world + party-embedded + compendium.** Lookup by uuid/id (any of
  the three) or name search across: world items, items embedded in party members, and compendium
  packs (rules content — "look up the Grab action"). Results are compact markdown rows; single-hit
  fetches render the item body. Visibility rule for world items: `ownership.default ≥ OBSERVER`
  (the bridge runs as GM and would otherwise leak GM-hidden items); embedded = party members
  only; compendium = inherently public.
- **D28-6 — Markdown out.** The four query tools return `content: [{type:"text", text:
  <markdown>}]` (headers/tables/lists), unlike the existing JSON-payload tools. The shared zod
  result contracts still exist (module→server wire stays typed JSON; **the server renders
  markdown** — keeps the module dumb and the renderer testable server-side without Foundry).
- **D28-7 — Version bump 0.3.0 → 0.4.0** on module + server together (new module handlers ⇒ the
  lockstep rule from 0027 applies).

## 6. Proposed tool surface (for the spec to refine)

All four are `registerBridgeTool` reads: span + counter, no audit, no caps; module handlers go
through `dispatchQuery` (inheriting isGM + designated-dialer). New wire methods
`portal.query-{rolls,party,player,item}`.

- **`query-party`** `{}` → markdown roster: PC table (name, ancestry/class/level, HP, hero
  points, owner-player) + labeled companion rows. Wire result stays a typed compact struct.
  Party actor id resolved via `game.actors` filter on `type === "party"` (not hardcoded).
- **`query-player`** `{name_or_uuid, section}` where `section ∈ {summary, stats, skills, spells,
  feats, inventory, notes}`:
  - `summary` — identity, level/xp, HP/resources, languages, class/ancestry/background (~1-2 KB).
  - `stats` — the D28-2 derived projection (AC, saves, perception, ability mods, class/spell DC).
  - `skills` — per-skill rank + derived total (D28-2), lore skills included.
  - `spells` — grouped by spellcasting entry → rank; slots/prepared state; spell names +
    short traits, NOT full descriptions (an `expand` param or query-item fetches one spell's body).
  - `feats` — grouped by category (ancestry/class/skill/general/bonus), name + level taken.
  - `inventory` — weapons/armor/equipment/consumables with quantity, bulk, runes; investiture.
  - `notes` — deity, biography prose, campaign notes.
  Sections are independently sized ≤ ~10 KB markdown even on Argyle (spells section may paginate
  by entry if needed — spec decides the exact cap).
- **`query-rolls`** `{actor?, type?, outcome?, since?, until?, cursor?, limit?}` → newest-first
  page of public roll messages + `nextCursor`. Filters: actor (uuid or name → speaker.actor /
  context.actor), `type` (the pf2e context taxonomy + `roll` fallback bucket), `outcome` (the 4
  degrees), time range (ms epoch or ISO). Row rendering: timestamp · speaker alias · check name
  (`flags.pf2e.modifierName` or flavor) · formula → total (die faces) · outcome vs DC when
  visible. Default limit ~20, max 100. Hard filter per D28-3 baked in module-side.
- **`query-item`** `{id_or_uuid?, name?, scope?}` — exactly one of id/name; name search returns a
  compact hit list (world/embedded/compendium provenance labeled), id fetch renders one item
  (name, type, traits, level, description HTML→markdown, damage/AC where present).

Naming note: existing tools are verb-noun (`search-world`); `query-*` is the stakeholder-chosen
family prefix and doubles as the player-surface namespace — keep it.

## 7. Risks / cost flags / implementation probes

- **Message-count probe (first implementation step):** the live world's `game.messages.size` is
  UNVERIFIED (LevelDB process-locked; no existing tool reads it). Add it to `bridge-status`'s
  handler payload or probe during S-first — if the history is huge (tens of thousands), the
  filter+slice stays cheap (in-memory array) but a `since` default (e.g. last 30 days) may be
  worth defaulting; spec decides after the number is known.
- **Derived-path drift:** the D28-2 projection reads pf2e-internal prepared-actor paths that can
  move across pf2e majors (system currently 7.12.2). Mitigate: fail-soft per field + a handler
  unit test with a faked prepared actor + note in memory to re-verify on pf2e upgrades.
- **HTML→markdown:** item/spell descriptions and message `content`/`flavor` are Foundry HTML with
  `@UUID[...]`/`@Check[...]` enrichers. Server-side rendering (D28-6) needs a small
  HTML+enricher→markdown pass — strip/translate, never ship raw HTML. Grep faerrin-era precedent
  is gone; gothic's rendered-vellum work is unrelated — this is a new ~100-line utility with
  golden tests (spec should size it honestly).
- **Shared-key privacy ceiling:** one player key = no per-player identity; D28-3's public-only
  rule is the safety line. If per-player whisper visibility is ever wanted, that's a
  multi-key/OAuth-scope future project, explicitly out of scope for 0028.
- **Timer hygiene:** the linguist-commit timer sweeps staged files — keep a clean index around
  0028 commits (standing gotcha).
- **Tests:** server = `mcp.test.ts` pattern (real SDK client + `FakeModule`); **must assert the
  player key sees exactly 5 tools and the admin key sees all** (both directions), plus 401 on a
  bad key. Module = `handlers.test.ts` pattern (Foundry-free fakes) for the four handlers incl.
  the D28-3 filter, the type predicate, pagination cursor math, and the derived projection
  fail-soft. Markdown renderer = pure unit tests server-side.

## 8. Out of scope (explicit)

- OAuth for players / per-player keys / scope enforcement in oauth.ts (D28-1).
- Any write tool on the player key (delete/create/update/apply/execute all stay admin-only).
- Journals, scenes, NPC/bestiary reads for players (not asked; add later if wanted).
- The GM tool surface: unchanged except gaining the 4 query tools in its superset.
- Public edge changes: none — same `portal.iridi.cc/mcp` route through Caddy.

## 9. Verified footprint summary

| Change | Files |
|---|---|
| New key plumbing | the 8 files in §2 (SOPS, config.kdl, 2 mirrors, compose, index/server/mcp) |
| Shared contracts | `apps/portal/shared/src/tools.ts` (+4 param/result pairs) |
| Server tools + scope + renderer | `apps/portal/server/src/mcp.ts` (+ a new `markdown.ts` utility + tests) |
| Module handlers | `apps/portal/module/src/handlers.ts` (+`game.messages`/`game.actors` surface in `types/foundry.d.ts`) |
| Version lockstep | `module/module.json` + `mcp.ts` → 0.4.0 |
| Deploy | `just up` (server) + GM module update + F5 (or headless relaunch) — no Dockerfile edits |
