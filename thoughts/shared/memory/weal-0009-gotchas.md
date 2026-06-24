---
name: weal-0009-gotchas
description: load-bearing gotchas from building 0009 weal (weal-bot + weal-overlay) — roller parity, host lines in ontology, migration reality, RNG quirk, deploy
metadata:
  type: project
---

Built 0009 weal (`apps/weal-bot` first bun **service**, `apps/weal-overlay` eerie lift). The
load-bearing, non-obvious facts (port of faerrin `mouth` + `eerie`):

- **Roller parity gate = deterministic surfaces only** (RNG diverges Rust↔TS). The strongest test
  is a **serde-codec round-trip on the 10 real `mouth.db` `funcs` payloads** (byte-exact vs Rust
  `serde_json` externally-tagged enums: `{"Base":[2,20]}`, unit variants as bare strings). `dieValue`
  takes a `RollRng` **face-injection seam** so eval-given-faces is deterministic.
- **Migration reality:** the live `pkg/mouth/mouth.db` is **~8,931 already-clean dice rows**, NOT 47M
  — the mega-roll was excluded at faerrin's own PG→SQLite cutover. Decision F is the **reverse**
  (SQLite→PG). **DONE 2026-06-23** (the migrator `src/migrate/migrate.ts` is `6f18fd2`): ran from the host
  against the published port (`10362`) → **8,932 dice + 10 funcs, players 1–6, ids preserved verbatim (max
  19134), 0 junk skipped**; the migrator resets the `dice`/`funcs` id sequences past max(id) so the live
  bot's next write can't collide. The bot had written 36 live rows into the fresh PG first (ids 1–36) — those
  were **truncated (user-approved) before the run** so the historical ids land clean (else `on conflict do
  nothing` would silently drop the 36 colliding historical rows). Stop the bot during the run to avoid a
  write race.
  The plan's "exclude junk (player_id<>6/base≤100/pool≤30)" conflated 3 mechanisms: save-guards
  (new writes, in the bot), the read-time analytics filter (`player_id<>6`), and the migration filter.
- **`host_says` is GSR-only** (faithful — faerrin's `Distribution<HostPicker>` was hardcoded to GSR).
  The flavor banks (GSR/Rex/Els/Whiskers × goodness) were **lifted into `ontology-being` `weal-host`
  `lines{}`** (K8, revises K5) — `HostLines` added to BOTH ontology libs (py Pydantic + ts Zod) +
  readers; `being.canonical.json` regenerated, py↔ts parity holds. `host_says(host, roll, rng)` is
  host-parameterized so the switch is later a data change. Knife/Master are bankless; the Knife
  number/reseed UI strings stay as bot constants (not goodness banks).
- **RNG clone-quirk NOT ported:** faerrin clones the RNG per display item (correlated list dice); this
  port draws each die independently (saner). Production-path only, never gated. Flagged in `roller/index.ts`.
- **chart crate DROPPED (K4):** the historical `plot(base,interval)` command + `get_dice` move to
  akasha-frontend (0011, which reads the dice Postgres). The **in-roller `plot()` builtin stays**.
  `handler.rs` already ignored `to_plot`/`to_roll_lazy`, so the port does too.
- **weal-overlay stays a Bun.serve SPA+SSE** (K7, NOT strider's SSR template — it's an OBS source).
  gothic v4 token rename on the lifted `overlay.css` (`--accent`→`--color-accent` etc); `@tailwindcss/
  vite` compiles the theme; **fonts copied into `public/fonts/`** (the absolute-`/fonts/` gotcha).
  v0 schema dropped (v1-only). Client RUM endpoint injected into `index.html` by the Bun server (the
  SPA analog of strider's server-fn config seam — browser bundle never reads config).
- **Deploy:** weal-bot Dockerfile = bun-runs-TS (no build), carries `ontology-being`+`ontology-config`;
  weal-overlay = vite-build like strider. Compose: `weal-postgres` (K9), `weal-bot` (no published
  port; `/health` on the internal speak API for the healthcheck), `weal-overlay` (10361:10360).
  Caddy `weal-overlay.iridi.cc` needs `flush_interval -1` (SSE) + a DNS record. `config.kdl`
  `weal.database-url`/`feed-ws-url` use in-cluster Compose DNS (dev creds; prod override at P6).
- **Won't run live until SOPS secrets** (`weal_discord_key`, `weal_token`) are provisioned — the live
  Discord run is acceptance-I, deferred. See [[astra-migration-research]], [[config-single-source]],
  [[telemetry-built-in]], [[deploy-apply-with-just]], [[no-silent-scope-cuts]].
