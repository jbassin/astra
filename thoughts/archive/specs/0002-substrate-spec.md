# NLSpec 0002 — Phase 1: Substrate (config, truth, shared libs)

**Status:** **implemented + verified.** All exit gates A–H green; live gate F (litellm→Claude +
trace/cost to SigNoz) verified against the running stack via the `signoz_*` MCP. Color authority =
aether set (L6). **Phase:** 1 (substrate).
**Source plan:** [`../plans/0002-substrate.md`](../plans/0002-substrate.md) (parent [`0000`](../plans/0000-astra-migration-roadmap.md)).
**Process:** octo:embrace, Claude **team mode** (persona subagents), per faerrin/astra `CLAUDE.md` (Claude-only; no `/octo:setup`).
**Decisions in force:** E = SOPS + KDL `ref=`; F = Postgres; I1 = dual py+ts accessors; I4 = stable slug IDs (keep `player_id`); I5 = split color ownership (ontology-being owns identity hexes); I6 = SDK-first litellm (no proxy).

## Goal

Build the five things every later subsystem imports, on top of the green Phase-0 frame:
**ontology-config** (centralized config + secret `ref=`), **ontology-being** (the META truth store),
and the shared libs **observe** (OTel→SigNoz), **config** (KDL+SOPS loader), **ontology** (typed
being accessor), and **llm** (litellm+dspy). Get these right and the rest of astra drops into a working
frame. No pipeline/site/bot product code (those are Phases 2–6).

## Scope (in)

**Python (uv) members** — created with a `pyproject.toml` each (uv hard-errors on an empty glob member):
- `libs/py/observe` (`astra-observe`) — OTel init shim → SigNoz; programmatic `init_telemetry(service)` +
  documented `opentelemetry-instrument` entrypoint. Pins `opentelemetry-sdk` + `-exporter-otlp-proto-http`
  in its own `pyproject.toml` (the `bootstrap -a install` flow breaks under `uv sync` — research §3.2).
- `libs/py/config` (`astra-config`) — generic KDL loader + `ref="sops:KEY"` resolver (reads the
  Phase-0 SOPS file via `SOPS_AGE_KEY_FILE`) + the Pydantic **Config** model set + `load_config()`.
- `libs/py/ontology` (`astra-ontology`) — the Pydantic **Being** model set + `load_being()` accessor over
  the being KDL (uses `libs/py/config`'s KDL primitive).
- `libs/py/llm` (`astra-llm`) — litellm+dspy client replacing `@faerrin/llm`.
- `ontology/ontology-config` (`astra-ontology-config`) — owns `config.kdl` (the migrated env inventory) +
  a thin `load()` re-exporting `libs/py/config` bound to that file's path.
- `ontology/ontology-being` (`astra-ontology-being`) — owns `being.kdl` (the consolidated truth) +
  the canonical conformance fixtures + a thin `load()` re-exporting `libs/py/ontology`.

**TypeScript (bun) members** — `package.json` each:
- `libs/ts/observe` (`@astra/observe`) — `NodeSDK`+OTLP `telemetry.ts` loaded via `bun --preload` +
  a programmatic `initTelemetry(service)`.
- `libs/ts/config` (`@astra/config`) — KDL loader + SOPS `ref=` resolver + the Zod **Config** schema
  (same field set as py) + `loadConfig()`, reading `ontology/ontology-config/config.kdl` by path.
- `libs/ts/ontology` (`@astra/ontology`) — the Zod **Being** schema (same field set as py) +
  `loadBeing()`, reading `ontology/ontology-being/being.kdl` by path.

**Data + verification:**
- The full faerrin env inventory migrated into `config.kdl` (config vs secret split; §"Config inventory").
- The consolidated `being.kdl` (players→PCs, campaigns, colors, host identities ×2 types; §"Being model").
- A **smoke app** (`apps/_smoke-substrate`, py) exercising the Phase-1 exit gate end-to-end.
- A committed canonical JSON snapshot of `being.kdl` that **both** py and ts assert against (the parity gate).

## Scope (out — later phases)

- No Dagster assets, no Compose services, no sites. No re-transcription, no corpus conversion.
- No litellm **proxy** (I6 — SDK-first; stand it up only when a TS caller needs inference).
- ts has **no** llm lib (TS frontends/bots make no LLM calls in v1 — §3.3 / D in 0002).
- Secrets `.enc` format stays **YAML** (Phase 0's `deploy/sops/secrets.enc.yaml`), not `secrets.enc.kdl`
  — KDL holds only `ref=` pointers; this reconciles 0002 §A's `secrets.enc.kdl` mention to what Phase 0 built.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| L1 | KDL parser (py) | **`ckdl`** (C, KDL v2) if it builds cleanly under `uv sync`; else pure-Python `kdl` (`kdl-py`). Kept at the edge (load→Pydantic immediately) so it's swappable. |
| L2 | KDL parser (ts) | **`@bgotink/kdl`** (format-preserving round-trip, KDL v2 — best for human-edited files). |
| L3 | Secrets file | Reuse Phase-0 **`deploy/sops/secrets.enc.yaml`**; `ref="sops:anthropic_api_key"` resolves against the decrypted map. No new KDL secrets file. |
| L4 | `ref=` resolution | **Lazy/per-access**: a config field holding `ref="sops:KEY"` resolves on `.get()`, so a tree with unresolved-but-unused refs still loads (Discord/Cloudflare secrets land in Phases 4/6). Resolution uses `sops -d` (`SOPS_AGE_KEY_FILE`); an env var of the upper-cased name **overrides** (deploy injection). Missing ref at access → loud error, never silent empty. |
| L5 | Stable IDs (I4) | slug IDs everywhere (`josh`, `argyle`, `through-a-song-darkly`); `player_id` int preserved verbatim as the dice FK only. |
| L6 | Color authority (I5) | **DECIDED: aether `theme.scss` set** (live-site canonical): Josh `rgb(232,184,232)`, Jorge `rgb(143,216,240)`, Noah `rgb(184,212,168)`; Mike/Tanner/Guest already agree. Host hexes from `mouth/host.rs`. |
| L10 | SOPS key names | astra-native (present in `secrets.enc.yaml`): `anthropic_api_key`, `groq_api_key`, `elevenlabs_api_key`, `weal_token` (=faerrin `EERIE_TOKEN`), `orator_session_secret` (=`SESSION_SECRET`), `orator_controller_api_key` (=birdfeed/lark key). Discord tokens ×2, Discord client id/secret, Cloudflare DNS token, rotated dice-feed url: **not yet present** — KDL carries lazy `ref=` pointers that resolve when added (Phases 4/6). |
| L7 | llm transport | **litellm** (`anthropic/claude-opus-4-8`) as transport + cost tracking; **dspy.LM** factory configured to route through litellm (program layer used in Phase 3). The four `@faerrin/llm` contract behaviors are re-established in the `astra-llm` wrapper, not deferred to dspy. |
| L8 | llm default model | `claude-opus-4-8`, default max_tokens `16000` (carried from `@faerrin/llm`). Pricing table ported; cost emitted to OTel (retires `pricing.ts`). |
| L9 | observe service naming | `astra.<subsystem>` (e.g. `astra.scribe`); resource attrs carry `astra.phase`/lane like the Phase-0 smoke. |

## Config inventory (faerrin env → `config.kdl`)

Per-subsystem KDL namespaces. **Config** (plaintext) vs **Secret** (`ref="sops:…"`):

- **linguist/content:** `INGEST_SOURCE`, `INGEST_SAVED_DIR`, `REVIEW_PORT`, `PODCAST_EPISODES_PATH`,
  `SURFACE_MODEL_JUDGE`, `SURFACE_MODEL_ESCALATE`.
- **scribe (wretch):** `LISTENER_DATA_PATH`, `LISTENER_INCOMING_PATH`, `LISTENER_TMP_PATH`,
  `LISTENER_STATE_FILE`, `LISTENER_DOWNSTREAM_CMD`, `LISTENER_KEEP_ZIP`, `LISTENER_SKIP_DOWNSTREAM`,
  `LISTENER_MODEL`, `LISTENER_DEVICE`, `LISTENER_COMPUTE_TYPE`. *(Decision G drops the local model;
  Groq-era keys land in Phase 3 — the inventory still captures these verbatim.)*
- **weal (mouth):** `DATABASE_URL`, `FEED_WS_URL`, `CHART_BASE_URL`, `MOUTH_BIND_ADDR`,
  `MOUTH_PLAYERS_PATH`, `RUST_LOG`, `EMBED_URL`.
- **weal-overlay (eerie):** `PORT`.
- **orator (lark):** `LARK_GUILD_ID`, `LARK_SPIKE_CHANNEL_ID`, `PORT`, `LARK_ALLOWED_USER_IDS`,
  `LARK_PUBLIC_ORIGIN`, `LARK_TARGET_LUFS`, `LARK_INGEST_CONCURRENCY`, `LARK_MEASURE_LOUDNESS`.
- **Secrets (SOPS; KDL holds only `ref=`):** present now → `anthropic_api_key`, `groq_api_key`,
  `elevenlabs_api_key`, `weal_token` (weal↔overlay shared, =faerrin `EERIE_TOKEN`),
  `orator_session_secret` (=`SESSION_SECRET`), `orator_controller_api_key` (birdfeed/lark key). Deferred
  (lazy `ref=`, resolve in Phases 4/6) → `discord_token` ×2 (weal + orator, distinct apps),
  `discord_client_id`, `discord_client_secret`, Cloudflare DNS token (Caddy), and the
  **historically-leaked dice-feed url** (rotated at cutover — Phase 6).
- The wretch Python grep also surfaced ~700 `torch`/`whisperx`/HF env names — those are **vendored-dep
  noise, not astra config** (research §1); excluded.

## Being model (consolidated truth → `being.kdl`)

Merge **3 faerrin sources** (join key = display name) into one KDL tree, slug-keyed (L5):

| Source | Contributes |
|---|---|
| `mouth/players.toml` | players: `name`, `snowflakes[]`, **`player_id`**, active-campaign character/class, `is_dm`/`is_admin` |
| `content/scripts/campaigns.yaml` | 7 campaigns; per-campaign player→PC roster (+ PC descriptions); `isMain` |
| `content/scripts/lib/roster.ts` | recording-userId→name aliases (`jbassin`/`iiri__`→Josh, …); name→color-var |

**Entities (KDL node types):**
- `player` — slug, real-person `name`, `snowflakes[]`, **`player_id`** (int, preserved), recording-id
  aliases, `is_dm`/`is_admin`, identity `color` (hex).
- `character` — slug, `name`, `class`, the `player` who plays it, the `campaign`(s) it appears in.
  *(PCs only — NOT in-world setting NPCs, which belong to akasha.)*
- `campaign` — slug, `name`, `edition`, `isMain`, the player→PC roster.
- `color` — identity hex VALUES owned here (I5): per-player + per-host. Authoritative single value each.
- `weal-host` — weal-bot Discord send identities from `mouth/host.rs`: GSR "Gin Soaked Rag" `#276C4C`,
  KnifeThatTeaches "Knife-That-Teaches" `#00674F`, RexPanopticum "Rex Panopticum" `#CFBDDE`, Els
  "Stray-Thread Els" `#CFBDDE`, Whiskers `#00674F`, MasterOfCeremonies "Master of Ceremonies" `#478085`
  (+ their imgur avatar URLs).
- `podcast-persona` — mouthpiece roundtable hosts from `caster/src/script/hosts.ts` +
  `tts/elevenlabs.ts`: Bram (voice "Mark" `3jR9BuQAOPMWUjWpi0ll`), Maeve (Juniper `BZgkqPqms7Kj9ulSkVzn`),
  Pip (Charlotte `exsUS4vynmxd379XN4yO`), each with its persona blurb.

**`weal-host` and `podcast-persona` are DISTINCT node types, never conflated** (0002 §B).

### Color reconciliation (L6 — needs confirmation)

Mike `rgb(255,173,173)`, Tanner `rgb(255,214,165)`, Guest `rgb(235,235,236)` **agree** across sources.
These three **diverge**:

| Player | aether `theme.scss` (live site) | content `review.ts` (internal UI) |
|---|---|---|
| Josh | `rgb(232,184,232)` | `rgb(255,198,255)` |
| Jorge | `rgb(143,216,240)` | `rgb(155,246,255)` |
| Noah | `rgb(184,212,168)` | `rgb(202,255,191)` |

**Recommendation:** adopt the **aether/`theme.scss`** set as authoritative (it is what the live
user-facing wiki renders today). Confirmation-gated because these are personal player-identity colors.

## Verification — Exit gate (Phase-1 gate from 0000/0002 §F)

| # | Criterion | How verified (this env) |
|---|---|---|
| A | uv lane green: `uv run ruff check && ruff format --check && ty check && pytest` over all new py members | run locally |
| B | bun lane green: `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build` | run locally |
| C | `config.kdl` loads in **py and ts**; a `ref="sops:anthropic_api_key"` resolves to the SOPS-decrypted value (and an env override wins) | unit + smoke |
| D | `being.kdl` round-trips **identically** in py and ts vs one committed JSON snapshot; `player_id` ints preserved; identity colors carry real hex; the two host types are distinct | cross-language parity test |
| E | smoke app emits a trace to SigNoz (service `astra.smoke-substrate`) | **verify via `signoz_*` MCP** (not curl/clickhouse) |
| F | smoke app makes **one litellm→Claude** call; the `max_tokens→raise` guard, cache-prefix behavior, and forced-tool→Pydantic path work; cost is recorded to OTel | smoke (real `anthropic_api_key` now in SOPS — **unblocked**) |
| G | `astra-llm` unit tests mirror `@faerrin/llm`'s (truncation guard, no-tool-call error, usage extraction, free-text truncation) using a stub seam — no network | run locally |
| H | no plaintext secrets in git (KDL is `ref=` only); leaked webhook queued for cutover rotation | grep/review |

## Risks

1. **Name-as-join-key fragility** (I4/risk 1) — players.toml↔campaigns.yaml join on display name; resolve to
   slugs during the merge so a later rename can't silently break the join.
2. **Divergent color hexes** (L6) — pick one authoritative set or a speaker renders the wrong color; gated.
3. **KDL parser maturity** (L1/L2) — young, ~single-maintainer libs; the cross-language JSON-snapshot parity
   test is the gate; keep KDL at edges so a swap is local.
4. **dspy/litellm parity** — the truncation guard + cache-prefix are load-bearing; port deterministically and
   test against `@faerrin/llm`'s behavior table. litellm's Anthropic `cache_control` plumbing must be verified.
5. **Secret bootstrap** — the SOPS age key is the one root secret (Phase 0, on-host, gitignored); `ref=`
   resolution must fail loud if `SOPS_AGE_KEY_FILE` is unset rather than emit empty values.
6. **uv empty-member trap** — every `ontology/*` and `libs/py/*` dir must ship a `pyproject.toml` in the same
   commit it's created, or `uv sync` hard-errors.

## Hand-off

Every later sub-plan imports these: ontology-config/being + `libs/{py,ts}/{observe,config,ontology}` +
`libs/py/llm`. gothic (0003) reads identity colors from ontology-being (I5); scribe/linguist/mouthpiece (py)
read speakers/campaigns/personas + call `astra-llm`; weal/orator (ts) read Discord host identities + tokens
via `@astra/config`/`@astra/ontology`.
