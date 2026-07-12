---
name: portal-player-0028-gotchas
description: portal-player (0028) — read-only player-keyed 5-tool subset, COMPLETE 2026-07-11 (live gate A–H); THE source-vs-live field-ownership catalog + the env-name crash + operational recipes
metadata:
  type: project
---

# portal-player 0028 — COMPLETE 2026-07-11 (built S1–S3 + live gate A–H same day)

A second static key (`portal_player_api_key`) on the same `/mcp` exposes exactly five read-only
tools — `bridge-status`, `query-party`, `query-player` (7 sections), `query-item` (tri-scope),
`query-rolls` (public-only, cursor-paginated) — rendered as markdown at the server (module wire
stays typed JSON). S1 `8655edb` · S2 `a889034` · S3 `a59d53c` · live-gate fixes `0.4.1`/`0.4.2`;
spec `thoughts/astra/specs/0028-portal-player-spec.md`; scope doc + its S2/S3 appendices =
THE pf2e data-shape reference (ChatMessage v13, Roll JSON, prepared-actor paths, biography
visibility, pack ownership).

## ⭐ THE live-gate finding: source-vs-live field OWNERSHIP (pf2e/Foundry)

Every S4 bug was "read the field from the wrong side". The catalog (all verified live):
- **`rolls[]`**: STORED source = serialized-Roll JSON **strings**; LIVE `game.messages` docs
  hydrate them into Roll **instances** (`JSON.parse` on one throws → every query-rolls row
  silently dropped, rows=0 over 2,454 messages). `parseRollJson` accepts both via
  `JSON.parse(JSON.stringify(x))` (invokes nested `toJSON()`s → exactly the stored shape).
- **`hp.max`**: LIVE-only (derived; source stores only value/temp).
- **`heroPoints`**: SOURCE-only — pf2e preparation ZEROES the live
  `system.resources.heroPoints` (rendered 0/0 while source said 1/3). GM-awarded meta-currency
  is stored, not derived.
- **spellcasting entry DC**: NEITHER source (`spelldc.dc` stored 0 for prepared casters) NOR
  the live embedded entry's system tree (pf2e derives onto the entry's `statistic` CLASS
  instance, not system data) — the reliable live home is the ACTOR-level
  `system.attributes.spellDC.value` (D28-2 verified path). Preference chain: live entry →
  actor spellDC → source.
- Unit tests with live-derived fixtures (toObject() captures) can NEVER catch the
  hydrated-instance class of bug — only a live gate does. Fixtures are source-shaped.

## Deploy gotchas

- **⚠ The env-override name is the SOPS key UPPER-CASED (`portal_player_api_key` →
  `PORTAL_PLAYER_API_KEY`), NOT the kdl field name.** S1 wired compose as
  `PORTAL_PLAYER_MCP_API_KEY` → in-container resolution failed (no SOPS fallback there) →
  `requireSecret` threw → crash loop at first deploy. `resolveSopsRef` checks
  `process.env[key.toUpperCase()]` (`libs/ts/config/src/secrets.ts:60`).
- The key is load-bearing at startup — **mint the SOPS value BEFORE any portal redeploy**.
- GM updated the module via Foundry's own UI both times (files land `root:999`, Foundry's
  installer signature); after ANY module update **restart `astra-portal-headless`** (page code
  is fixed at load; the WS redial alone does NOT reload module code) and existing MCP sessions
  need `/mcp` reconnect. A bridge-server redeploy alone needs NO headless restart (module
  redials, ~1 min backoff).

## Live-gate facts (recorded per spec)

- `totalMessages` = **2,454** (the §Risks probe; in-memory scan is instant at this size).
- Acceptance F passed NON-vacuously with zero staging: the world already had 7 items at
  `ownership.default=0` (incl. the deity GM secrets) — all absent for the player key; the 3
  items at `default ≥ 2` all present (boundary exact at OBSERVER). Pack gate: "goblin warrior"
  in `pf2e.pathfinder-monster-core` (bestiaries ship `PLAYER:"LIMITED"`, 67/94 packs) invisible
  to the player key while admin search finds it.
- D28-11 amended post-S3 (stakeholder): unfiltered `spells` ALWAYS returns the group summary
  (Argyle's real full render = 12,215 chars > the 12k cap; lists only grow); `entry`/`rank`
  filters opt into full detail, cap stays as backstop.
- Argyle live derived values at gate: AC 25 · Perception +16 (DC 26) · Fort 15 / Ref 11 /
  Will 17 · spell DC 24.

## Operational recipes

- **Player onboarding:** `claude mcp add --transport http portal-player
  https://portal.iridi.cc/mcp --header "Authorization: Bearer <portal_player_api_key>"` —
  any future `PLAYER_TOOL_NAMES` change requires players to `/mcp` reconnect (session
  tool-list snapshot).
- **Key rotation** (cheap; the key transited chat 2026-07-11, stakeholder-sanctioned):
  `sops set` a new value → `just up` → players re-add. No module/Foundry step.
- The D28-14 skew mapping (unknown module error code → `foundry-error`, message preserved)
  forward-proofs all future additive `BridgeErrorCode` members; roll back server+module
  TOGETHER regardless.

Builds on [[headless-gm-0027-gotchas]] + [[portal-authoring-0026-gotchas]] +
[[portal-0023-gotchas]] + [[config-single-source]] + [[flag-paid-live-actions]] +
[[verify-before-acting]].
