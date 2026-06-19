---
name: astra-migration-research
description: discovery + phased plan for migrating faerrin → the new astra re-architecture repo; ledger A–H decided; Phases 0 + 1 COMPLETE + Phase 2 vellum-lang (0004) COMPLETE; next = Phase 2 gothic (0003)
metadata:
  type: project
---

`astra` (`/ruby/data/experiments/astra`, fresh git repo; spec `ASTRA.md`) is a **re-architecture** of
faerrin, not a lift-and-shift. Approach chosen: research-first → phased program.
- **Research:** `thoughts/shared/research/2026-06-18-astra-migration-discovery.md` (full faerrin→astra
  map, per-subsystem evidence, net-new tech, repo skeleton, contracts, decisions ledger).
- **Plan:** `thoughts/astra/plans/` — **ALL 16 docs written + decision-complete** (`0000` roadmap
  [7-phase spine: Foundation→Substrate→Shared→Pipeline→Services→Frontends→Cutover] + `0001`–`0015`
  sub-plans). Each sub-plan carries a settled decisions table. Critical path = `0004` vellum-lang →
  `0007` akasha-backend (full-vellum). Cutover (`0015`) = **big-bang, same-host coexist, ~1-min rollback
  window** (all safety is pre-flip staging validation; faerrin cold-archived as backstop).
- **Phase 0 COMPLETE + verified** (2026-06-19; 8 commits, pushed to github.com/jbassin/astra `main`,
  CI green): dual uv/bun workspaces + ruff/ty(pinned `==0.0.51`)/pytest + biome(strict `tsc`) + 2 smoke
  libs + path-filtered GitHub Actions CI + commitlint; PLUS the **deploy substrate** — one `docker
  compose up` (run in `deploy/`) brings up Dagster (PG + gRPC code location + webserver + daemon; image
  pinned dagster 1.13.10), vendored **SigNoz v0.129.0** (`include`d from `deploy/signoz/`), and Caddy;
  **SOPS+age** secrets in `deploy/sops/` (private key gitignored, recipient `age1q4l83…`); **OTLP py+ts
  spans verified landing in SigNoz** (`astra-smoke-{py,ts}` in `signoz_traces.distributed_signoz_index_v3`).
  Host ports confined to **10350–10399** (10350 dagster, 10351 signoz, 10352/10353 otlp, 10354/10355
  caddy). Spec `thoughts/astra/specs/0001-phase0-foundation-spec.md`; runbook `deploy/README.md`.
  **Gotchas (load-bearing):** (1) uv hard-errors on an empty glob-matched member dir → track glob roots
  with a `.gitkeep` *file*, create a member dir only with a manifest; (2) `bun --filter '*' build` exits
  1 when no workspace owns the script → smoke lib carries a no-op `build`; (3) `biome migrate` rewrites
  `recommended:true`→`preset:"none"` (disables ALL lint) → use `preset:"recommended"`; (4) **a fresh
  SigNoz won't ingest until the first org/admin is registered** (`POST :10351/api/v1/register`, 12+char
  pw, then `restart otel-collector`) — else signoz logs "cannot create agent without orgId" and the OTLP
  receiver resets; (5) init-clickhouse downloads a `histogramQuantile` binary into the bind-mounted
  `user_scripts/` → gitignored as a runtime artifact; (6) `sops` decrypts via the age key file directly
  (no `age` binary needed; `rage`/`rage-keygen` are the installed age impl); (7) ruff+ty are scoped to
  workspace members (exclude `dagster/`, `deploy/`). SigNoz admin seeded: admin@astra.local.

- **Phase 1 (substrate) COMPLETE + verified** (2026-06-19; 8 conventional commits on astra `main`;
  `ci.yml` triggered). Spec `thoughts/astra/specs/0002-substrate-spec.md`. Members added:
  `libs/py/{observe,config,ontology,llm}`, `libs/ts/{observe,config,ontology}`,
  `ontology/ontology-{config,being}`, `apps/_smoke-substrate`. **KDL parsers:** py `ckdl` (C, v2),
  ts `@bgotink/kdl` (v2) — kept at the edge → Pydantic/Zod immediately. **SOPS:** reused the Phase-0
  `deploy/sops/secrets.enc.yaml` (YAML, **not** a new `.kdl`); KDL holds `ref="sops:KEY"`, resolved
  **lazily** (env var of the upper-cased name wins, else the decrypted file) — `SecretRef` never leaks
  the value. Real secrets now in SOPS: `anthropic/groq/elevenlabs_api_key`, `weal_discord_key`,
  `weal_token`(=EERIE_TOKEN), `orator_discord_key`/`_client_id`/`_client_secret`,
  `orator_session_secret`, `orator_controller_api_key`, `cloudflare_key` (dice-feed url withheld →
  rotated Phase 6). **Color authority DECIDED = aether `theme.scss` set** (Josh rgb(232,184,232) /
  Jorge rgb(143,216,240) / Noah rgb(184,212,168)). **being.kdl:** 5 players (`player_id` 1–5 preserved),
  7 campaigns (GM is per-campaign), 6 weal-hosts (host.rs), 3 podcast-personas (Bram/Maeve/Pip); both
  accessors emit a byte-identical `being.canonical.json` (the parity gate). **llm:** Opus-4.8 pricing
  $5/$25 in/out + $0.50 cache-read + $6.25 cache-write(5m); litellm model string
  `anthropic/claude-opus-4-8`. Exit gate verified **live**: smoke read config+SOPS → trace to SigNoz
  (`astra.smoke-substrate`) → litellm→Claude forced-tool→Pydantic call with cost → `astra.llm.cost_usd`
  metric (confirmed via `signoz_*` MCP). **Phase-1 gotchas (load-bearing):** (1) ckdl/@bgotink ship no
  type stubs → alias their types to `Any` (and route module access through an `Any` handle) so `ty`
  passes; (2) **Zod v4 `.default()` types against the OUTPUT shape** → a namespace default must be
  `.default(() => NS.parse({}))`, not `{}`; secret fields use `.nullish()` to stay input-optional;
  (3) **being models use snake_case keys in BOTH py + ts** so `canonical_json` (py `json.dumps`,
  `sort_keys`, `indent=2`, +`\n`) matches ts `JSON.stringify` with a recursive key-sort — biome would
  reflow that file (collapses 1-elem arrays), so it's **excluded in `biome.json` `files.includes`**;
  (4) pytest collides on same-basename test files across packages → use unique basenames; (5) bun
  workspace deps resolve only for a package that **declares** them (no `node_modules/@astra` symlink) —
  run a script from inside the declaring package; (6) **litellm reports anthropic `prompt_tokens`
  INCLUSIVE of cache** (verified in `litellm/llms/anthropic/chat/transformation.py`) → the client
  subtracts cache to recover disjoint buckets for pricing; (7) **GHA CI has no `sops` binary and no
  age key** (gitignored) → any test that actually decrypts (`SecretRef.resolve()` via the file) must
  **skip in CI**, gated on `which sops` + `deploy/sops/age.key` presence (py `pytest.mark.skipif`, ts
  `test.skipIf`); the env-override resolution path (`$KEY` set) still runs everywhere. Caught only
  after the first push went red — reproduce locally by hiding `age.key` to trip the same skip.

- **Phase 2 — sequencing: do 0004 (vellum-lang) BEFORE 0003 (gothic).** gothic's renderer renders
  vellum-lang's AST and *depends-on 0004*; vellum-lang has no gothic dep + is the documented critical
  path → build it first (user-confirmed). **vellum-lang (0004) COMPLETE + verified** (2026-06-19; 5
  commits on astra `main`; CI green). Spec `thoughts/astra/specs/0004-vellum-lang-spec.md`. It's the
  **parser/AST only — the React renderer is 0003 (gothic)**. `libs/ts/vellum-lang` (`@astra/vellum-lang`)
  = the **TS reference** (full `VellumDocument` AST): lifted faerrin parse/surface/vss/model + **4 new
  full-vellum constructs** — YAML frontmatter, inline `[[crossref]]` (a pure unist text-node transform;
  parses, never resolves — resolution is 0007's job), `:::fields` (queryable `{term, value}`),
  `:::timeline`. `libs/py/vellum-lang` (`astra-vellum-lang`) = **metadata-only (D2)**: frontmatter +
  crossref scan only (feeds akasha-backend's page index/backlinks). **Parity gate:** `fixtures/vellum/`
  holds `.vellum` inputs → committed `.ast.json` (TS) + `.meta.json` (**both** langs assert; byte-identical
  → they agree); regen via `bun libs/ts/vellum-lang/scripts/gen-fixtures.ts`. **Phase-2 gotchas:**
  (1) faerrin TS uses `.ts` import extensions; astra is **no-extension** → sed-strip on lift, OR a
  lifted file's `arr[i]!` (needed under noUncheckedIndexedAccess) trips biome `noNonNullAssertion` →
  scope a `biome.json` `overrides` off for the lifted file (kept on for new code); (2) **py↔ts YAML
  parity:** TS `yaml` pkg = YAML **1.2 core** (a bare date → string); PyYAML `safe_load` = **1.1**
  (date → `datetime` → **crashes `json.dumps` + diverges**) → subclass SafeLoader dropping the
  `timestamp` implicit resolver + `json.dumps(default=str)`; (3) the py metadata scan is a raw regex →
  must **strip code** (``` ``` ``` + `~~~` + inline) before the `[[…]]` scan to match TS's mdast
  code-exclusion (else spurious backlinks); residual edges (indented/multi-backtick code, escaped/markup
  targets) documented as known, not fixed (near-nonexistent in corpus); (4) biome reflows generated JSON
  → exclude `fixtures/vellum/**` (like `being.canonical.json`); `biome ci` prints "errors emitted" but
  **exits 0 on warnings/infos** — trust the exit code. **Reviewer caught a real C1** (py date crash) the
  corpus didn't cover → added a date/bool/nested-map fixture; lesson: **seed the corpus with the
  divergence-prone inputs (dates, exotic scalars, code edges), not just happy paths.**

**Shape:** faerrin's 13 pkgs re-cut into ~10 named subsystems + 2 net-new (`ontology-being` = table
**META** — players → the PCs they play, campaigns, colors, host identities (weal-bot Discord hosts AND
mouthpiece podcast personas — **distinct** types); **NOT** in-world setting characters/NPCs/lore, which
live in **akasha**; `ontology-config` = KDL config/secret refs). Net-new standards: Dagster (pipeline) + Docker Compose
(services) + Caddy (edge), OTel→SigNoz (the single pane), litellm+dspy (retires
[[package-rename-faerrin-scope]]'s `@faerrin/llm`), KDL 2.0 + SOPS (secrets),
uv+bun polyglot (Python lane = ruff + ty [Astral, ty is preview]; TS lane = biome), plain
git+conventional-commits (drops jj). Web standardizes on TanStack+React (strider
is the on-stack template; aether/face are Astro+Solid REWRITES). caster→mouthpiece-backend and
content/scripts→linguist become Python.

**Why:** better org + code/data sharing now that the repo's functionality is well understood.
**How to apply — DECIDED ledger (roadmap §2 / research §7):** A big-bang cutover; B weal-bot Rust→TS
(+roller parity harness first); C **full-vellum** = one format for ALL akasha content (the critical
path); D build-time akasha snapshot; E secrets via SOPS-encrypted file + KDL `ref=` (no plaintext in git);
F Postgres; G scribe = Groq hosted `whisper-large-v3` API (no GPU worker / no local model; ≈$9–25/yr);
H **split runtime** — Dagster runs the pipeline (asset graph, one partition per session), Docker Compose
supervises the long-running services (bots/overlay/render), Caddy = edge, SigNoz = single pane. **Windmill
was evaluated and dropped** (one tool forced to be both workflow engine + service supervisor).
Preserve `player_id` FKs + exclude the 47M-row junk roll; **do not re-transcribe** the 76 historical
sessions (import verbatim). Related: [[eerie-obs-overlay-plan]] (→weal-overlay), [[lark-discord-music-bot-spec]]
+ [[birdfeed-streamdeck-plugin]] (→orator), [[mouth-ts-rewrite-deferred]] (→weal-bot rewrite),
[[caster-tavern-tone]] (tone-regression risk on the Python re-port — golden A/B), [[wiki-nonprose-pages]]
+ [[wiki-is-setting-not-session-log]] (akasha content modeling), [[transcript-arcs-and-naming]] (scribe/linguist data).
