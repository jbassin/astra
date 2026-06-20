# NLSpec 0009 — weal (weal-bot + weal-overlay)

**Status:** **Plan (pre-implementation)** — scoping verified against both repos + the live DB; **decisions
locked (K7–K11 resolved below)**; ready for `octo:embrace`. **Phase:** 4 (services). **Source plan:**
[`../plans/0009-weal.md`](../plans/0009-weal.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-20-weal-0009-thoughts.md`](../../shared/research/2026-06-20-weal-0009-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (typescript-pro, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** Phase 1 (`@astra/config`+SOPS, `@astra/ontology` `weal-host`+`player`, `@astra/observe`,
Postgres). **Blocks:** `0011` akasha-frontend (consumes the dice Postgres for roll-probability viz — K4).
**Runs parallel to** `0010` orator.

## Goal

Rewrite faerrin's `mouth` (Rust dice/host Discord bot — 3 crates) into astra **weal-bot** (TS/Bun **Compose
service**) and lift faerrin's `eerie` into **weal-overlay** (Compose service). The crux + #1 risk is the
**roller rewrite**: a pure dice-DSL (Pratt parser → AST → eval) hand-ported to TS and proven equivalent by a
**deterministic-surface parity harness** *before* the Rust is retired. weal-bot is **astra's first
long-running TS/Bun service** (strider is an SSR frontend; this is a Discord-gateway + internal-API daemon),
so it also establishes the bun-service conventions (Dockerfile, healthcheck, `restart: unless-stopped`,
`initTelemetry` in the entrypoint).

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| B (roadmap) | mouth language | **Rust → TS/Bun**; **roller parity harness FIRST** — Rust stays runnable until the harness is green. |
| F (roadmap) | Storage | **SQLite → Postgres**; `dice`+`funcs` schema; `player_id` preserved verbatim. |
| H/I (roadmap) | Runtime | **Docker Compose services** (`restart: unless-stopped` + healthchecks) behind **Caddy**. |
| K1 (plan) | Parity rigor | **Deterministic-surface golden parity** — gate parse / eval-given-faces / plot-math / property; RNG diverges so raw output is never compared. Hard gate before retiring the Rust. |
| K2 (plan) | Host send | **Discord webhooks** (per-host `username`+`avatar`+`color` embed); rotate the leaked webhook at cutover (P6). |
| K4 (plan) | `chart` crate | **DROP** — the historical `plot(base,interval)` *command* + `get_dice` analytics move to akasha-frontend (0011). The **in-roller `plot()` builtin** (single-expression probability) **stays** in the roller. |
| K6 (plan) | Parser tech | **Hand-port** the Pratt parser (faithful to the Rust structure; no parser-lib semantics drift). |

### K5-revised + K8 — **DECIDED (Josh, 2026-06-20): GSR-only now; flavor lines move into the ontology**

faerrin's `host_says` only ever picks **GSR** — `Distribution<HostPicker> for Standard` is hardcoded
(`host.rs:198`), so the Rex/Els/Whiskers banks are **dead code in production**. Port resolution:
- **`host_says` stays GSR-only**, but the host is a **swappable input** (a parameter, not a hardcoded
  branch) so a future host switch is a config/ontology change, not a code change.
- **The goodness→flavor-line banks move into the ontology KDL** alongside the `weal-host` identities
  (**revises plan K5**, which had lines in weal-bot data). weal-bot reads both identity *and* voice via
  `@astra/ontology`. The GSR banks are extracted from `host.rs`; the Rex/Els/Whiskers banks are carried as
  data for the eventual switch.
- **Ontology home — DECIDED (Josh, 2026-06-20): extend `ontology-being`, no rename.** The goodness→line
  banks become children of the existing `weal-host` blocks in `ontology-being` (which already holds `player`,
  `weal-host`, `podcast-persona`); identity + voice stay together. "ontology-people" is Josh's informal name
  for that store — **no member rename** (a rename would be a separate cross-cutting slice across the py
  `astra_ontology_being` + ts `@astra/ontology` libs and every reader; not done here).

### K7 — **DECIDED: weal-overlay keeps eerie's Bun.serve SPA + SSE (not strider's SSR template)**

weal-overlay is an **OBS browser-source + SSE relay**, not a content site — SSR buys nothing and the real
constraint is unbuffered SSE. Lift eerie's `Bun.serve` SPA (ingest + `/feed` + static `dist/`) ~verbatim;
still a Compose service behind Caddy with **`flush_interval -1`**. (Tension with Decision I noted and
explicitly sanctioned by plan §3.)

### K9 / K10 / K11 — **DECIDED**

- **K9:** dedicated **`weal-postgres`** Compose unit (app data ≠ Dagster's `dagster-postgres` control plane).
- **K10:** keep **`reseed` cosmetic** — port the in-joke message + a displayed-but-unused seed; do **not**
  invest in real seeding (rolls stay entropy-seeded, faithful to faerrin).
- **K11:** a **new SQLite→Postgres** migration script (reverse of faerrin's old PG→SQLite one); source =
  the live `mouth.db`; preserve `player_id`; verify counts (≈8,931 dice + 10 funcs). **Executed at Phase-6
  cutover** (config annotates `dice_feed_url` "resolved at cutover"); 0009 ships the schema + a verified
  copy path, not the live cutover.

## Scope (in)

- **`apps/weal-bot`** (bun **service**): discord.js gateway; `Bun.serve` internal speak API;
  `initTelemetry` from `@astra/observe` in the entrypoint (traces+metrics+logs → SigNoz,
  [[telemetry-built-in]]); config via `@astra/config` (`cfg.weal.*`, SOPS secrets); identities + flavor
  lines via `@astra/ontology`. First bun service → its **Dockerfile + healthcheck + `restart` + uv-exclude**
  are a new template. Add the dir to root `pyproject.toml` `[tool.uv.workspace] exclude` (per the frontend
  gotcha; uv rejects manifest-less glob members).
- **The roller** (`libs/ts/...` or `apps/weal-bot/src/roller`): hand-port parser (nom→hand-rolled) + pratt
  precedences + AST + `eval` + `Die` + plot/distribution math (K6). Faithful to faerrin's structure;
  expose a **face-injection seam** for the harness (replace `gen_range` with an injectable face source).
  Language surface: numbers (`1_000_000`), dice `d20`/`8d6`/`D`, seq `d{1,2,3}`, idents (`let`/`in`
  reserved), sigils `:name`, lists `[a,b,]`, func-calls, anon funcs `|a,b| body`, named funcs
  `let f(a,b)=… in …`; operators `;`(1,L) `+ -`(3,L) `* /`(4,L, **truncating** int div) `.`(5,R dot-call
  sugar) unary `-`(6); builtins `d, id, take-highest, take-lowest, roll, plot, lazy-roll, save, max, min`;
  list-broadcast in binops; lexical closure capture. `roll()` returns `{to_roll, to_plot, to_roll_lazy,
  to_save}`; a parse/eval error is `Err` → bot no-op.
- **Parity harness** (K1) — the gate. Four surfaces: (1) **parse** input→AST (seed corpus = faerrin's
  `parser.rs`/`eval.rs` test vectors, extracted); (2) **eval-given-faces** — inject a deterministic face
  sequence, compare `value`/`repr`/`dice`; (3) **plot math** — `possibilities()→prob/avg/std` exact
  (population std over the expanded multiset); (4) **property tests** — value ∈ `[min,max]`, take-h/l count
  guards, error cases. Runs both impls; **green before any Rust retirement.**
- **Discord gateway** (port `handler.rs`): intents incl. **MESSAGE_CONTENT** (privileged); message →
  `trim` (strip ` ``` `/`ocaml` fences) → `parse_func` (`^\s*(name)\((args)\)\s*$`): `reseed()`
  (cosmetic, K10), else roller. **Parse/eval error = silent no-op.** `Roll::Number` → a Knife "i invented
  the number" message (no save); `Roll::Die` → save (with guards) → `host_says` (GSR + goodness line) →
  **webhook send** → best-effort dice-feed (Discord feed webhook + v1 POST to overlay). Webhook
  auto-discovery/creation per text channel (`faceless-host`), keyed guild→channel.
- **Hosts** (port `host.rs` + `goodness.rs`): identities + goodness→lines from `@astra/ontology` (K5/K8);
  `host_says(host, roll)` GSR-only but host-parameterized; `RollGoodness` (value==min→Fumble, ==max→Crit,
  else thirds of `[min,max]`→Bad/Okay/Good); class→thumbnail map (PF2e AoN URL / D&D imgur per class)
  ported with the embed.
- **Internal speak API** (port `http.rs`): `POST /api/v1/speak {host,guild,channel,message,img?}` on
  `cfg.weal.bindAddr` (`127.0.0.1:10203`, internal only) via `Bun.serve`.
- **Postgres** (Decision F, K9): `dice(id, base, value, source='discord', timestamp, player_id, blame_id)` +
  index `(base,timestamp)`; `funcs(id, name, payload)`. `weal-postgres` Compose unit. **Save guards stay in
  the bot** (`save_die`: skip pools >30 dice; skip any die `base>100` — still rolled+shown, not persisted).
  Insert-die / insert-func / get-all-funcs.
- **Roll→overlay** (port the best-effort broadcast): **v1** POST `{v:1, user, expression, total, value,
  is_crit, is_fumble}` to `cfg.weal.feedWsUrl` with `X-…-Token` from `cfg.weal.feedToken`; failures logged,
  never fatal (the roll is already posted+saved).
- **`apps/weal-overlay`** (lift eerie, K7): Vite+React 19+pixi SPA + `Bun.serve` (`POST /api/v1/roll`
  token-guarded ingest, `GET /feed` SSE via `RollHub`, `GET /*` static+SPA-fallback); `connectFeed`
  EventSource with OBS-aware reconnect; `pushRoll` ticker (cap 6, 12s TTL); pixi crit/fumble fx behind
  `await import()`. **Re-consume `@astra/gothic`** (Tailwind v4 `@theme` + `@tailwindcss/vite`) as strider
  did. Client RUM via `@astra/observe` `initRum`. Compose service behind Caddy (`flush_interval -1`).
- **Secrets**: `discord-token`, `feed-token`, `dice-feed-url` (rotated) via `@astra/config`/SOPS — never
  logged.

## Scope (out)

- **The `chart` crate + `chart.iridi.cc` + `plot(base,interval)` command + `get_dice`/`dyn_plot`** (K4) —
  historical dice-distribution viz is **akasha-frontend's** job (0011); weal-bot keeps only the in-roller
  `plot()` builtin (distribution math), not the historical-chart command. The `player_id <> 6` read-time
  analytics filter goes with it (it was never a migration delete).
- **The live SQLite→Postgres migration run** (K11) — schema + a verified copy path ship in 0009; the data
  cutover (and webhook rotation, K2) is **Phase-6** work.
- **Real/reproducible seeding** (K10) — `reseed` stays cosmetic; rolls stay `from_entropy`-seeded.
- **Resurrecting the Rex/Els/Whiskers host rotation** (K8) — GSR-only ships; the other banks are carried as
  ontology data for a later switch, not wired now.
- **`reroll` in the bot flow** — `Roll` carries a `reroll` closure in the public API, but the bot never
  calls it; port the type for fidelity but it's not on the hot path (lower parity priority).

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| W1 | Roller location | Hand-port (K6) faithful to faerrin's module split (parser/ast/eval/die/utils). Pure, no I/O; the **only** randomness is `Die.value(faces)` — injectable for the harness. Keep `roll()`'s 4-bucket result shape (`to_roll/to_plot/to_roll_lazy/to_save`). |
| W2 | Parity is the gate (K1) | The harness must be green before the Rust is retired. Compare **deterministic surfaces only** (parse AST, eval-given-faces, plot prob/avg/std, properties). **Never** compare raw RNG sequences (Rust `StdRng` ≠ TS RNG — Risk 2). Reuse faerrin's `parser.rs`/`eval.rs` test vectors as the seed corpus. |
| W3 | Number semantics | `isize`-faithful: integer math, **truncating** division (`BinOpr::Div`), `Semi`→rhs, `Dot`→lhs, list-broadcast over binops, Die⊕Number lifts Number to `Die::Constant`. Watch JS number pitfalls — use integer-safe arithmetic; values are small but `possibilities()` can blow up (guard the plot path against huge pools). |
| W4 | Hosts source (K5/K8) | identity (`name/color/avatar`) **and** goodness→lines from `@astra/ontology` `weal_hosts`. `host_says(host, roll)` is host-parameterized but **always passed GSR** today. Extend the existing **`ontology-being`** `weal-host` KDL blocks with goodness→line children (no member rename — decided); GSR banks extracted from `host.rs` verbatim; this means the `WealHost` model in both py + ts ontology libs grows a `lines` field (goodness→string[]). |
| W5 | Goodness | `RollGoodness` ported exactly (min/max → Fumble/Crit; thirds for Bad/Okay/Good). `invert()` ported for fidelity even if unused on the GSR path. |
| W6 | Webhooks (K2) | per-host embed (`username`+`avatar_url`+`color`) via Discord `ExecuteWebhook`; auto-discover/create one `faceless-host` webhook per text channel at ready; key guild→channel. The dice-**feed** webhook = `cfg.weal.diceFeedUrl` (rotated secret, P6). |
| W7 | Overlay wire = v1 only | weal-bot ships **v1** from day one; weal-overlay **drops the v0 branch** in `schema.ts` (`parseRollEvent` stops accepting `value`/inferring v0). `is_crit`/`is_fumble` mirrored from `RollGoodness`; overlay does **no** rule logic. |
| W8 | Storage (F/K9) | `dice`+`funcs` on a dedicated **`weal-postgres`** Compose unit (`restart: unless-stopped` + healthcheck + named volume). Save-guards (pool>30 / base>100) **in the bot**, not the DB. `player_id` is a load-bearing FK — never renumber. |
| W9 | Service shape (H/I) | weal-bot = first bun **service**: Dockerfile (bun runtime), healthcheck, `restart: unless-stopped`; discord.js reconnect/backoff; speak API on the internal bind only; **`initTelemetry` first** in the entrypoint ([[telemetry-built-in]]). weal-overlay = the eerie `Bun.serve` shape (K7), behind Caddy `flush_interval -1`. |
| W10 | Config/secrets | all via `@astra/config` (`cfg.weal.*`, `cfg.wealOverlay.*`); secrets are SOPS `ref=` — resolve at load, **never log** the webhook/token. No ad-hoc `process.env` outside `@astra/config` ([[config-single-source]]). |
| W11 | Migration (K11) | new **SQLite→Postgres** script; source = live `mouth.db`; preserve `player_id`; **verify counts** (≈8,931 dice / 10 funcs — *not* 47M; the mega-roll was already excluded at faerrin's own cutover). Defer the live run to **Phase 6**. |
| W12 | Tests hermetic | parity harness + roller unit tests run under `bun --filter weal-bot test` with **no Discord/Postgres/network**; the gateway's roll pipeline is unit-tested with an injected face source + a fake webhook/DB; overlay reuses eerie's transport-agnostic `RollHub`/`schema` tests. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | `apps/weal-bot` + `apps/weal-overlay` scaffolded; bun CI lanes green (`bun --filter … typecheck/test/build`, `biome ci`); dirs uv-excluded | run locally |
| B | **Roller ported**; `roll()` returns the 4-bucket result; language surface (dice/seq/lists/funcs/sigils/ops/builtins) covered | unit tests |
| C | **Parity harness green (the gate, K1)** — TS parse/eval-given-faces/plot/property match the Rust golden vectors | harness run, both impls |
| D | Discord gateway: a dice message → roll → GSR host + goodness line → **webhook** post; number/save/no-op paths; trim+parse_func | unit test (injected faces + fake webhook/DB) |
| E | Hosts/lines from `@astra/ontology`; `host_says` GSR-only but host-parameterized; `RollGoodness` correct; class→thumbnail map | unit test + ontology read |
| F | **Postgres** `dice`+`funcs` schema on `weal-postgres`; insert/get; **save-guards** active (pool>30 / base>100 skipped); `player_id` preserved | unit test + a Compose smoke |
| G | Roll→overlay **v1** best-effort POST; failure is non-fatal (roll still posted+saved) | unit test (failing sink) |
| H | **weal-overlay** renders a live roll over SSE with OBS reconnect; **v0 removed**; `@astra/gothic` styling applied; client RUM wired | overlay tests + a manual SSE check |
| I | weal-bot is a Compose service: Dockerfile/healthcheck/`restart`; survives a container restart + a Discord WS drop; **`initTelemetry`** → SigNoz traces+metrics+logs | `just up` + restart + telemetry check |
| J | Secrets only via `@astra/config`/SOPS; webhook/token never logged | grep + config check |
| K | **(deferred, P6)** SQLite→Postgres migration run: `player_id` preserved, counts match (≈8,931), webhook rotated | documented one-command follow-up |

## Risks

1. **Roller correctness (#1).** A subtle parse/eval divergence corrupts every roll. Mitigation: the K1
   deterministic-surface harness as a **hard gate** (C); keep the Rust runnable until green. Watch:
   truncating int `/`, list-broadcast, dot-call sugar, lexical closure capture, `let`/`in` reservation,
   `possibilities()` blow-up on big pools (guard the plot path), and JS integer arithmetic vs Rust `isize`.
2. **RNG not golden-comparable.** Rust `StdRng` ≠ TS RNG — only deterministic surfaces are comparable; cover
   the random path with property tests (range/guards) + a seeded-distribution sanity check, not exact output.
3. **`player_id` integrity (F/K11).** Load-bearing FK; never renumber; verify counts post-copy (≈8,931, not
   47M — the live source is already clean).
4. **Webhook hygiene (K2).** `dice_feed_url` leaked in faerrin git history; rotate at cutover, SOPS-only,
   never log. weal-overlay's ingest token is the only public-exposed secret — guarded by the header.
5. **discord.js as a long-running service (H/I).** Needs reconnect/backoff + the privileged MESSAGE_CONTENT
   intent; validate it survives restarts + WS drops. **First bun service** — its Dockerfile/healthcheck/
   `restart` wiring is a new template with no prior in-repo example (the SSR strider unit is the closest).
6. **Faithful-bug trap (K8).** GSR-only is intentional now (not an accidental copy); the resolution keeps the
   host swappable and the other banks as ontology data so the fix is later a data/config change. Don't let a
   "faithful port" silently re-bury the decision.
7. **gothic re-consumption on the overlay.** 0003 rebuilt gothic (CSS-Modules → Tailwind v4); eerie's
   `@faerrin/gothic` CSS import won't map 1:1 — adopt `@tailwindcss/vite` + the theme import (strider's fix)
   or overlay styling is dead.

## Hand-off

- **akasha-frontend (0011)** consumes weal-bot's **dice Postgres** for roll-probability / dice-history viz —
  the K4 home for the dropped `chart`/`plot(base,interval)` functionality. weal-bot keeps `player_id` clean
  and the in-roller `plot()` math.
- **weal-overlay** consumes weal-bot's **v1** roll POST (SSE fan-out to OBS).
- **Host identities + flavor lines** live in `ontology-being` (`weal-host`) — shared with anything that
  sends as a host; the GSR-only → host-switch path is a later ontology/config change, not new code.
- **Phase 6** executes the SQLite→Postgres data migration (K11) and the webhook rotation (K2).
