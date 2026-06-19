# Astra Sub-plan 0002 — Phase 1: Substrate (config, truth, shared libs)

**Status:** Plan (pre-implementation). **Phase:** 1 (substrate). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** E = SOPS + KDL `ref=`; F = Postgres; ontology-being = META (players→PCs, campaigns, colors, host identities [2 distinct types], **not** setting); litellm+dspy replaces `@faerrin/llm`.
**Depends-on:** `0001` Phase 0 (workspaces, CI, Dagster+SigNoz+Caddy, SOPS). **Blocks:** essentially everything (every app imports these).

> Goal: the things every other subsystem imports — **ontology-config** (centralized config + secret
> refs), **ontology-being** (the META truth store), and the shared libs **observe** (OTel), **config**
> (KDL+SOPS loader), and **llm** (litellm+dspy). Get these right and the rest drops into a working frame.

---

## A. ontology-config + `libs/{py,ts}/config`

Replaces faerrin's 8 scattered `.env.example` files with one KDL config tree + SOPS-encrypted secrets.

**Config inventory (from research §2 shared-libs table)** — migrate every var into KDL, split
config vs secret:
- **Config** (KDL, plaintext): `INGEST_SOURCE`, `INGEST_SAVED_DIR`, `REVIEW_PORT`, `PODCAST_EPISODES_PATH`,
  `SURFACE_MODEL_JUDGE`/`ESCALATE`, all `LISTENER_*` (paths, model, device), `PORT`s, `*_BIND_ADDR`,
  `LARK_*` (guild, origin, lufs, concurrency), `CHART_BASE_URL`, model defaults, etc.
- **Secrets** (SOPS-encrypted, KDL holds only `ref=`): `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`,
  `GROQ_API_KEY` (new), `EERIE_TOKEN`/feed token (weal↔overlay shared secret), `DISCORD_TOKEN` (×2 —
  weal + orator, separate apps), `DISCORD_CLIENT_ID`/`SECRET`, `SESSION_SECRET`, the Cloudflare DNS
  token (Caddy), and **rotate the historically-leaked `DICE_FEED_URL` webhook**.

**`libs/{py,ts}/config`** — a KDL loader that (1) parses the config tree, (2) validates into typed
structs (Pydantic / Zod — **the same field set** both languages), (3) resolves `ref="sops:…"` pointers
from the SOPS-decrypted secret file (or injected env). Parse-at-edge, validate immediately (KDL never
threads raw). Per-subsystem config namespaces (`scribe { … }`, `weal { … }`, …).

**Work items:** KDL config schema + namespaces; `secrets.enc.kdl` (SOPS, age) + `.sops.yaml`; the
py+ts loader+resolver; a shared fixture both languages parse identically; migrate the full env inventory;
document SOPS key handling (age key out of git; CI/deploy decrypt — Phase 0 §6).

## B. ontology-being (the META truth store)

Consolidate **3 split faerrin sources** into one KDL data tree with py **and** ts accessors:

| Source | Holds | → ontology-being |
|---|---|---|
| `mouth/players.toml` | `name`, `snowflakes[]`, **`player_id`** (47M-dice FK), `character`, `class`, `is_dm/is_admin`; `[campaign]` | players → PCs; the `player_id` FK |
| `content/scripts/campaigns.yaml` | player↔PC per campaign (7 campaigns) + character descriptions | campaigns + PC roster per campaign |
| `content/scripts/lib/roster.ts` | Discord-ID→name, **name→CSS-var** (`--textJosh`) | speaker identity + color assignment |

**Entities (KDL):**
- **player** → the real person + their `snowflakes[]` + **`player_id`** (preserve) + the PCs they play.
- **character (PC)** → name, class, per-campaign; the PCs a player plays. *(NOT setting NPCs — those are akasha.)*
- **campaign** → name, edition, arc, the player→PC roster, color.
- **color** → per-player/host identity colors (hex), **owned here** (I5). ⚠ Today the hex values are
  **duplicated AND divergent** — `aether/src/styles/theme.scss` and `content/scripts/review.ts` define
  *different* `--text<Name>` values for the same players (e.g. Josh `rgb(232,184,232)` vs
  `rgb(255,198,255)`). Consolidate to **one** authoritative value per player. Consumers: transcript
  speaker rendering (`custom.scss`) + the dice dashboard (`DiceDashboard.tsx`) — both akasha-frontend —
  plus the review UI.
- **host identities — TWO distinct types** (per your call): `weal-host` (weal-bot Discord message-send
  identities: GSR/KnifeThatTeaches/… from `mouth/host.rs`) and `podcast-persona` (mouthpiece
  Bram/Maeve/Pip). **Distinct KDL node types; never conflated.**

**Accessors:** `libs/py/ontology` (Pydantic) + `libs/ts/ontology` (Zod) — typed reads over the KDL,
identical schema. Consumers: scribe/linguist/mouthpiece (py), akasha-frontend/orator/weal (ts).

**Work items:** KDL schema for the entities above; migrate + merge the 3 sources (reconcile the
name-as-join-key across players.toml↔campaigns.yaml); locate+extract color hexes; preserve `player_id`;
py+ts accessors + a shared fixture; decide stable IDs (I4).

## C. `libs/{py,ts}/observe` (OTel → SigNoz)

OTel init shims so every app wires identically (research §3.2): py `opentelemetry-distro`+exporter pinned
in `pyproject.toml`, run via `opentelemetry-instrument`; ts `NodeSDK`+OTLP in a `telemetry.ts` loaded via
`bun --preload`. Exports to the SigNoz collector (Phase 0). One import line per app; no app ships without it.

## D. `libs/py/llm` (litellm + dspy) — replaces `@faerrin/llm`

The shared LLM client for linguist + mouthpiece (Python only — TS frontends make no LLM calls).
- **litellm** transport (`dspy.LM("anthropic/claude-opus-4-8")`); dspy program layer on top.
- **Re-establish the `@faerrin/llm` contract** (research §3.3): the `stop_reason==max_tokens → raise`
  guard (fail loud, no silent truncation), prompt caching of stable system prefixes, forced-tool →
  Pydantic typed outputs, and **cost logging → OTel** (retires `pricing.ts`).
- **SDK-first**, in-process; **no litellm proxy** in Phase 1 (the TS side doesn't need inference — I6).
- The injectable client seam (tests pass a stub) carries over.

**Work items:** the litellm+dspy client; the truncation/cache/cost parity; the stub seam; unit tests
mirroring `@faerrin/llm`'s.

## E. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| I1 | ontology accessors | dual py+ts (Pydantic+Zod over one KDL) vs single-language | **Dual py+ts** — both pipeline (py) and web/bots (ts) read ontology-being. |
| I4 | Stable entity IDs | stable slug/UUID vs display-name key | **DECIDED: stable slug IDs** — rename-safe across the 3 sources; keep `player_id` as the dice FK, slugs elsewhere. |
| I5 | Color ownership | split (identity→ontology-being, palette→gothic) vs all-in-gothic | **DECIDED: split** — ontology-being owns per-player/host identity color VALUES (one authoritative hex each — ending the aether↔review.ts divergence, §B); gothic owns the framework palette; akasha-frontend reads identity colors from ontology-being. |
| I6 | litellm proxy | SDK-first now, proxy later if TS needs LLM vs stand up the proxy now | **SDK-first** (defer the proxy; no TS LLM caller in v1). |

## F. Exit criteria

- [ ] One smoke app reads config from KDL + a SOPS-decrypted secret, emits a trace to SigNoz, and makes
      one litellm→Claude call with cost recorded (the Phase 1 exit gate from `0000`).
- [ ] ontology-being round-trips its KDL fixture identically in py **and** ts; `player_id` preserved;
      identity colors carry real hex values; the two host types are distinct.
- [ ] The full faerrin env inventory is migrated to KDL config + SOPS secrets; **no plaintext secrets in
      git**; the leaked webhook is queued for rotation at cutover.
- [ ] `libs/py/llm` reproduces the `@faerrin/llm` contract (truncation guard, caching, cost→OTel) on tests.

## G. Risks

1. **Name-as-join-key fragility** (I4) — players.toml and campaigns.yaml join on display name; a rename
   breaks both. Resolve to stable IDs during the merge, or accept the fragility explicitly.
2. **Divergent color hexes** (I5) — per-player hexes live in TWO places with *different* values (aether
   `theme.scss` vs content `review.ts`); pick the authoritative set when consolidating into
   ontology-being, or a speaker silently renders the wrong color.
3. **KDL parser maturity** (research §3.4) — keep KDL at the edges; the shared py+ts fixture is the parity
   gate; JSON fallback ready.
4. **dspy/litellm parity** — the truncation guard + caching are load-bearing; port them deterministically,
   test against `@faerrin/llm` behavior.
5. **Secret bootstrap** — the SOPS age key is the one root secret; manage it out of git (Phase 0) with a
   documented recovery path.

## H. Hand-off

Every subsequent sub-plan imports these: ontology-config/being + `libs/{py,ts}/{observe,config,ontology}`
+ `libs/py/llm`. gothic (0003) reads identity colors from ontology-being (I5); scribe/linguist/mouthpiece
read speakers/campaigns/personas; weal/orator read Discord host identities + tokens.
