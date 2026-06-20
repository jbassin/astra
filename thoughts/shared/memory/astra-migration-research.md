---
name: astra-migration-research
description: discovery + phased plan for migrating faerrin → the new astra re-architecture repo; ledger A–H decided; Phases 0 + 1 + 2 (0004 vellum-lang, 0003 gothic) COMPLETE + **Phase 3 (pipeline) COMPLETE — 0005 scribe, 0006 linguist, 0007 akasha-backend, 0008 mouthpiece-backend all done**; next = Phase 4 (services: 0009 weal, 0010 orator) + Phase 5 (frontends: 0014 strider template → 0011 akasha-frontend long pole, 0012 mouthpiece-fe, 0013 vellum-fe), which parallelize; recommend 0014 strider next
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

- **gothic (0003) COMPLETE + verified** (2026-06-19; astra `main`; CI reproduced locally).
  Spec `thoughts/astra/specs/0003-gothic-spec.md`; pre-impl thoughts
  `thoughts/shared/research/2026-06-19-gothic-0003-thoughts.md`. `libs/ts/gothic` (`@astra/gothic`,
  bun/React 19) = astra's UI framework: (1) **tokens as a Tailwind v4 `@theme`** CSS (the ~20 gothic
  vars under `--color-*`/`--font-*` namespaces → both runtime vars AND utilities) + bundled fonts
  (Caslon/ITC Serif Gothic + `@fontsource/ibm-plex-mono`); (2) **identity-color seam (I5)** =
  `identityStyle()` sets a runtime `--identity-color` var w/ a **visible fallback** — gothic does NOT
  import `@astra/ontology` (grow-as-consumed J3; the frontend passes `Player.color` in); (3) grow-as-
  consumed **primitives** (Panel/Title/Button/Input/Columns); (4) the **vellum AST→React renderer**
  lifted from faerrin `pkg/vellum/src/render/` (`mdastToReact` + StatCard/ProseCard/Trait/Redaction/
  ErrorChip/DocumentView + inline-SVG action glyphs + FNV-1a grime) **restyled CSS-Modules→Tailwind v4**,
  PLUS the 4 new constructs' components (Frontmatter header, `CrossRef` placeholder, `Fields`, `TimelineBlock`).
  **J-forks decided w/ Josh:** J1=Tailwind **v4** (CSS `@theme`, not v3 JS-preset); renderer **rewritten
  to utilities** (not CSS-Modules lift); J5=**Storybook**; **visual regression = a browser-free
  `react-dom/server` "render every AST node" smoke in `bun test`** (the CI-enforced 0004 exit-gate H) +
  a Storybook per-node gallery for the human eye — **PNG goldens DEFERRED to vellum-frontend** (which
  owns the Playwright render service per 0003 §8); no pinned-container CI job added this phase.
  **gothic gotchas (load-bearing):** (1) the renderer emits markdown it doesn't author (h1/table/li) with
  no className → style generated content + the card *skin* (pseudo `::after` ring, seeded parchment
  gradient, drop-cap) via `@layer components` + `@apply` (`gothic-content`/`gothic-prose`/`gothic-card*`);
  authored structure uses direct utilities incl. ancestor variants `[[data-mode=diegetic]_&]:…` for the
  theme axis; (2) **biome rejects Tailwind `@apply`/`@theme`** until `css.parser.tailwindDirectives:true`
  in `biome.json`; (3) the renderer maps immutable render-once AST → array-index keys are correct →
  scoped `noArrayIndexKey:off` for `gothic/src/render/**` (rule kept on elsewhere); (4) crossref renders
  as an UNRESOLVED placeholder (`data-crossref-target`, **no `role`/`href`** — dropping the role killed
  the a11y lint; 0007 wraps it in a real link); SVG glyphs need a `<title>` for `noSvgWithoutTitle`;
  (5) `bun build` = no-op echo, **Storybook build is separate** (`build-storybook`, gitignore
  `storybook-static/`, `core.disableTelemetry`) so no browser runs in the CI `build` lane; mdast's
  `Nodes` union lacks `crossref` → renderer input widened to `Nodes | CrossRef`.

- **akasha-backend (0007) COMPLETE + verified** (2026-06-19; astra `main`; CI reproduced locally incl. a
  new `corpus-validate` job). Spec `thoughts/astra/specs/0007-akasha-backend-spec.md`; thoughts
  `thoughts/shared/research/2026-06-19-akasha-backend-0007-thoughts.md`. The critical-path long pole.
  **Decided forks (with Josh):** F1 full end-to-end now; **F2 TS converter**; **F3 validator in
  `libs/ts/vellum-lang/scripts/`** (the one-shot TS tools co-locate with the parser since the uv app
  can't be a dual manifest); resulting split = build-time TS (convert+validate, reference parser) vs
  runtime Python/Dagster (metadata/crossref/snapshot, D2). E1 graph@frontend-build · E2 corpus under
  akasha-backend · E3 one-shot+archived · E4 page→page crossrefs only (ontology-being is META, deferred).
  **Shipped:** `convert-wiki.ts` (frontmatter+git-date bake, callouts→handout/edict, `**Term**::value`→
  `:::fields`, Timeline `<ul>`→`:::timeline`, index/flavor HTML→markdown/fenced) + `validate-corpus.ts`
  (the structural gate) → **all 141 pages converted to `apps/akasha-backend/content/*.vellum`, 0 flagged,
  zero error chips + zero collisions**; the uv app `astra-akasha-backend` = `corpus.py` (load_corpus = the
  mouthpiece read path) + `crossref.py` (page→page resolve, Quartz-shortest by PATH not slug; 354 edges,
  71 dangling red-links reported) + `snapshot.py`/`assets.py` (Dagster `akasha_corpus_snapshot` asset →
  committed `snapshot/akasha-snapshot.json`, the being.canonical.json parity pattern), wired into
  `dagster/definitions.py`. **0007 gotchas (load-bearing):** (1) the plan assumed sigil collisions surface
  as error chips, but `#word`→`:trait[word]` is a VALID pill (not a chip) → the validator must ALSO flag
  trait/action/redact EXPANSIONS (a wiki has zero statblocks, so any is a collision); in practice the
  corpus had ~0 (parser scoping: `#`/`@` need specific neighbors), a real de-risking; (2) wrapping the
  exotic `<pre>` CIC-log in a fenced block NEUTRALIZES its `@ts000`/`#L`/`#C` sigils for free (code is
  never sigil-expanded) — fenced code is the cleanest converter target for collision-dense verse;
  (3) the akasha snapshot is Python-only (no ts parity) → `ensure_ascii=False` + sort_keys (Færrin/Rhædon
  survive); exclude it + `.vellum` from biome (`akasha-snapshot.json`, `ignoreUnknown` skips `.vellum`);
  (4) the `corpus-validate` CI job is bun-only + path-filtered on `apps/akasha-backend/content/**` +
  `libs/ts/vellum-lang/**` (pytest must NOT shell to bun — bun absent in the py CI lane; the asset shells
  to bun only at materialization); (5) Quartz red-links are normal — `[[Heart]]`≠`Hearts`,
  `[[Undertable]]`≠`The Undertable` correctly stay unresolved (match by path, slug is 0011's job).

- **scribe (0005) COMPLETE + verified** (2026-06-19; astra `main`; gates A–G; **H=live run deferred** by
  design). Spec `thoughts/astra/specs/0005-scribe-spec.md`; thoughts
  `thoughts/shared/research/2026-06-19-scribe-0005-thoughts.md`. The pipeline **head**: Craig `.zip` →
  per-session `audio.mp3` + raw `script.json` (`[{start,end,text,user}]`, line-level, raw-id speakers,
  **words dropped** F1) as a Dagster **per-session partitioned** asset, transcribing on **Groq
  `whisper-large-v3`** (Decision G — no GPU/local model). **Decided forks (with Josh):** G1 build
  machinery + hermetic tests now, **defer the live run** (needs a real zip + Groq spend); **G2 ffmpeg
  `silencedetect`** (no torch); **G3 transcribe via `libs/py/llm`** (added `astra_llm.transcribe`,
  litellm `verbose_json`). **Shipped** `apps/scribe`: `naming.py` (Craig stem parse, ported verbatim),
  `roster.py` (track filter from **ontology-being** `Player.aliases`, N2), `audio.py` (pure ffmpeg
  arg-builders: amix/silencedetect/chunk + probe), `vad.py` (voiced_spans/chunk_spans — pure), `transcribe.py`
  (`TrackTranscriber`: VAD→chunk→16k-mono-flac→Groq→**re-offset**), `sound_stack.py` (port + round-trip
  parity vs a real sample), `session.py` orchestration, `sensor.py`+`assets.py` (DynamicPartitionsDefinition
  + Craig-drop sensor), wired into `dagster/definitions.py`. **0005 gotchas (load-bearing):** (1) **Groq
  limits** — 25 MB direct-upload cap (100 MB URL-only), accepts flac/mp3/m4a but **NOT raw `.aac`** →
  transcode each chunk to 16 kHz mono flac (~1 MB/min, ≤~20-min chunks); `verbose_json` for segments;
  (2) re-offset stays trivial+safe by making **each contiguous voiced run its own chunk** (offset =
  `+chunk_start`, no concatenation seam — Risk 2 dissolved); (3) **Dagster + `from __future__ import
  annotations` conflict** — an asset's `context: dg.AssetExecutionContext` becomes a string Dagster can't
  introspect → DROP the future-import in the asset module (3.12 has native `X|Y`); `dg.Definitions` has no
  `partitions=` kwarg (assets carry `partitions_def`, discovered); `DynamicPartitionsDefinition.name` is
  `str|None` → use a string constant for `get_dynamic_partitions`; (4) test fixtures (real captured
  `script.json`) → exclude `**/tests/fixtures/**` from biome (verbatim data); (5) `astra_config` already
  carried a `ScribeConfig` (incoming_path/data_path/`groq_api_key` SecretRef) from faerrin — reuse it.
  ScribeConfig + the live run still need a real Craig zip + the SOPS `groq_api_key` (present since Phase 1).

- **linguist (0006) COMPLETE + verified** (2026-06-19; astra `main`; gates A–K — **J (live dspy judge +
  MIPROv2 compile) NOW DONE**, committed `judge.compiled.json`; see [[linguist-gate-j-dspy-judge]]). Spec
  `thoughts/astra/specs/0006-linguist-spec.md`; thoughts
  `thoughts/shared/research/2026-06-19-linguist-0006-thoughts.md`. The largest subsystem (faerrin
  `content/scripts`), built in 3 slices. **Decided forks (with Josh):** H1 pipeline + surfacer machinery
  now, **defer the live dspy judge + optimizer**; **H2 commit ALL ~75 MB** historical; **H3 rapidfuzz +
  metaphone(double) + hand-Dice**. **`apps/linguist`:** the deterministic pipeline (`models` byte-order,
  `corrections` = defs.yaml named-group alternation regex, `roster.SpeakerResolver` alias→name→`--text{Name}`
  from ontology-being, `ingest`/`to_json` matching `JSON.stringify(x,null,2)`, `campaigns` match/billing/
  context adapting ontology campaigns by slug→display-name, `canonical` line-numbered `NNNNNN\t…`,
  `pipeline.process_session`) wired into a Dagster `session_transcripts` asset; the surfacer
  (`surface/{phonetics,normalize,english,lexicon,known,judge}` — the 4-signal ensemble, Mode-1 `find_known`
  pre-filter, and the judge's deterministic guardrails + haiku→sonnet escalation behind a `CompleteFn`
  stub); `historical` (76 sessions committed under `data/` + `transcripts/`, pre-satisfy mechanism).
  **PARITY PROVEN BYTE-FOR-BYTE on real data:** a committed `data/2025-10-20.json` → match → context →
  canonical reproduces the 234 KB committed `transcripts/000.through-a-song-darkly.2025-10-20.txt` exactly
  (so ontology-being's campaign/role descriptions match the old campaigns.yaml). **0006 gotchas
  (load-bearing):** (1) the formatted `user.color` is a CSS-var NAME `--textJosh` (not rgb — gothic owns
  the value); (2) ontology Role.player is a **slug** → map to Player.name for billing/context (the text
  bills by display name); (3) `to_json`/`shibboleth` need `ensure_ascii=False` + indent=2 to match
  `JSON.stringify`; (4) english OOV gate uses **wordfreq** (not faerrin's curated 275k list) — tolerable
  since the filter only pre-flags (the judge decides); (5) the surfacer needs `rapidfuzz`+`metaphone`+
  `wordfreq`+`dspy`; the live dspy judge (`make_dspy_complete_fn`) is the deferred J seam; (6) exclude
  `apps/linguist/data/**` (65 MB JSON) from biome (`.txt` skipped via ignoreUnknown). Still needs a real
  Craig→scribe→linguist live run when new sessions arrive (scribe gate H, the only deferred live run left).

- **POST-0006 substrate hardening (2026-06-20; astra `main`):** three follow-ups landed after the
  pipeline subsystems: (1) **gate J live** — optimizable dspy judge + MIPROv2 compile, surfacer wired as
  the `correction_candidates` Dagster asset, triage TUI + defs.yaml write-back for accepted corrections
  ([[linguist-gate-j-dspy-judge]]); (2) **config single-source** — surfacer + telemetry config now read
  via `astra_config` (no ad-hoc env reads — [[config-single-source]]); (3) **full SigNoz instrumentation**
  — OTel **logs** wired into the observe libs (py+ts) and traces+metrics+logs wired into scribe + linguist
  in their actual Dagster runtime ([[telemetry-built-in]] — importing observe ≠ wiring it).

- **mouthpiece-backend (0008) COMPLETE + verified** (2026-06-20; astra `main` `2bbbcaa`; gates A–J; **K =
  live ElevenLabs v3 run deferred** by design, paid/tier-gated). Spec
  `thoughts/astra/specs/0008-mouthpiece-backend-spec.md`; thoughts
  `thoughts/shared/research/2026-06-20-mouthpiece-backend-0008-thoughts.md`. Rewrote faerrin `caster`
  (Bun TTS) → `apps/mouthpiece-backend` (uv) as a **Dagster per-session asset graph**: session_digest →
  session_script → session_audio_clips → session_episode (+ mega_digest date-range fuse) + a
  linguist→mouthpiece sensor; wired into `dagster/definitions.py`. **Decided H1 (with Josh): script +
  distill use RAW `libs/py/llm`** (`call_text` Pass A → `call_tool` Pass B), typed I/O via Pydantic, **no
  dspy** (dspy reserved for the linguist judge — `make_dspy_lm` is a bare `dspy.LM` that bypasses the
  `max_tokens→raise` guard/caching/cost, and its adapter breaks prompt byte-fidelity). **All 5 prompts
  ported BYTE-FOR-BYTE** (distill, improv/PassA, dressing/PassB, one-shot, mega — asserted vs faerrin in
  `test_prompt_fidelity`, skips when faerrin absent). Tone gate = `lint.ts` ported verbatim; thresholds
  calibrated against the 7 committed faerrin `out/*.script.json` (8–10/10, zero podcast-tells — `CALIBRATION.md`).
  Hosts/voices from ontology-being `PodcastPersona`; ElevenLabs key resolves via SOPS. **0008 gotchas
  (load-bearing):** (1) **akasha grounding folder-notes** — 45/141 pages are `…/index.vellum` whose
  path-key ends `/index`; a naive basename collapses all to "index" → port faerrin's **`folderIndexName`**
  (`pkg/content/scripts/lib/folder-index.ts`: folder-index page inherits title+alias from the PARENT dir)
  and key BOTH title + basename lookups on the effective name; (2) Dagster asset modules must NOT
  `from __future__ import annotations` (context/config introspection needs real types — scribe N.B.); (3)
  ruff E501 on verbatim long prompt lines → express as implicit string concatenation (byte-identical), not
  triple-quoted; (4) hermetic tests = stub `LlmClient` + mock TTS + fake ffmpeg runner (no live
  ElevenLabs/Anthropic/ffmpeg); the live v3 run is the one deferred item (gate K).

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
**I (2026-06-20, decided on 0014): frontends are SSR-hosted, not prerendered static.** ALL frontends
(strider, akasha-fe, mouthpiece-fe, vellum-fe) run as **SSR servers = Compose services behind Caddy**
(reverse-proxied, not static `dist/`) with **client RUM** + server `observe`; strider's editor +
editor-server lift with it. Revises D's "Caddy serves static `dist/`" (the akasha build-time snapshot stays
the data source) and principle #4 (strider = the **SSR** template; the build-content→generated→loader
structural pattern is unchanged, only render/host mode flips). Grows Phase 5 — 0011–0013 replan as services.
Preserve `player_id` FKs + exclude the 47M-row junk roll; **do not re-transcribe** the 76 historical
sessions (import verbatim). Related: [[eerie-obs-overlay-plan]] (→weal-overlay), [[lark-discord-music-bot-spec]]
+ [[birdfeed-streamdeck-plugin]] (→orator), [[mouth-ts-rewrite-deferred]] (→weal-bot rewrite),
[[caster-tavern-tone]] (tone-regression risk on the Python re-port — golden A/B), [[wiki-nonprose-pages]]
+ [[wiki-is-setting-not-session-log]] (akasha content modeling), [[transcript-arcs-and-naming]] (scribe/linguist data).
