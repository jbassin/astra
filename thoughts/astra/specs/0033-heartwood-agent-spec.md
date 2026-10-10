# 0033 — heartwood agent: an RLM that maintains the akasha wiki (spec)

**Status:** FINAL (2026-10-10) — ready to build — adversarial pair folded (mechanics lens: 1 blocker + 7 majors;
publish/deploy lens: 2 blockers + 7 majors; all evidence spot-checked, all folded — see §9).
**Scope doc:** `thoughts/shared/research/2026-10-10-heartwood-agent-0033-thoughts.md` (D1–D9 stakeholder-resolved).
**Replaces:** the 0020 heartwood pipeline (extract → resolve → refine → facts-only cards → human bodies → apply).
**Template:** the old `just heartwood-apply` publish tail (validate → `akasha-snapshot` → path-scoped
commit + rebase + push → akasha redeploy) and linguist's dspy-on-OpenRouter LM construction.

## 1. Product

One command processes one session: `just heartwood-agent 2025-8-28`. A `dspy.RLM` agent reads that
session's transcript, browses the akasha wiki and earlier same-world transcripts through host-side
tools, and creates, edits, moves and deletes wiki pages as it sees fit. When it finishes, its changes
publish to akasha.iridi.cc with no human review. Each session is one git commit (body = the agent's
changelog). `just heartwood-revert <date>` undoes any one session. `just heartwood-backfill` replays
every faerrin-world session oldest-first.

Non-goals: a review UI (retired, D1); Dagster scheduling (later, D4); editing the entity registry,
ontology, or anything outside `apps/akasha-backend/content/`.

## 2. Decisions

Scope decisions D1–D9 carry over verbatim. Build decisions:

- **D33-1 — Package layout.** Keep the `apps/heartwood-backend` uv member and the `astra_heartwood`
  package; replace its internals with an `agent/` sub-package: `workspace.py` (staging copy, op
  journal, change-set, publish sync), `tools.py` (§3), `sessions.py` (moved from the package root),
  `dates.py` (`_iso_date` moved from `apply.py` in S1 — S2/S3 reuse it), `instructions.py` (§4),
  `rlm.py` (the `HeartwoodRLM` + `MeteredLM` subclasses, D33-9/D33-10), `run.py` (LM construction,
  invocation, artifacts), `ledger.py` (D33-12), `cli.py`. Script:
  `astra-heartwood-agent = "astra_heartwood.agent.cli:main"` with subcommands `run`, `sessions`,
  `publish-sync`, `ledger-append`. New test files are named `test_heartwood_*.py` (pytest runs in
  default rootdir mode without `__init__.py`; `test_sessions.py`/`test_ledger.py` basenames already
  exist elsewhere — the 0020 `test_apply.py` collision class).

- **D33-2 — Staging workspace + op journal.** Each run creates `artifacts/heartwood/<date>/<run-id>/`
  (repo-root `artifacts/` is gitignored and dockerignored; the host CLI runs as uid 1000) and copies
  `apps/akasha-backend/content/` to `<run>/content/`. Wiki tools read and write **only** staging.
  `workspace.py` records a baseline `{path-key: sha256}` at copy time, and **every mutating tool appends
  to an op journal** (`write`/`move`/`delete` with paths). The change-set is computed from the journal
  plus final staging state: `created`, `updated`, `deleted`, `moved` (from journalled `move_page`
  calls whose destination still exists — never inferred from hashes, which breaks on "move, then fix").
  A page created and later deleted in the same run nets to nothing.

- **D33-3 — Tools are host-side.** The sandbox is dspy's default `PythonInterpreter` (Deno + Pyodide,
  no file or network grants). The wiki and transcripts reach the agent only through the tools in §3.
  Tool calls are synchronous on the interpreter thread; lists/dicts cross the bridge as JSON.
  **Sandbox warm-up:** `runner.js` imports an *unpinned* `npm:pyodide` and `deno.land/std@0.186.0`,
  fetched into `DENO_DIR` on first run; the host's Deno cache is currently empty (Deno 2.5.6). S3's
  first action is `just heartwood-sandbox-warm` (runs `PythonInterpreter().execute("print(1)")` with
  network) and records the resolved Pyodide version in the build record. A Deno-cache wipe or a new
  Pyodide release changes the sandbox — re-warm and re-run gate C.

- **D33-4 — Validate every write (D8).** `write_page` writes the candidate to a private temp dir and
  runs `validate-corpus.ts --dir <tmp>` (accepts a single-file dir, no frontmatter required, errors on
  stderr, exit 1; ≈0.35 s). On failure it writes nothing to staging and returns
  `"rejected: <stderr>"`. The validator is an **injected callable** (`Validator = Callable[[str], str |
  None]`): unit tests use a fake; one real-node test skips when `node_modules` is absent (CI's
  `py-test` lane has no pnpm install) and its local pass is recorded. This is the only content rail.

- **D33-5 — Frontmatter `date`.** `write_page` sets `date` to `max(existing date, target session ISO)`
  so a backfill never moves a page's date backwards. It inserts a frontmatter block with `tags: []`
  when the agent wrote none. All other frontmatter is the agent's.

- **D33-6 — Transcript source.** Tools serve the committed `apps/linguist/transcripts/*.txt`
  (`NNNNNN\tSpeaker: text`, ≈230 KB each). Permitted sessions = `ingestible_dates()` (faerrin world,
  `EXCLUDED_DATES` honored) **filtered to date ≤ target** (D6), sorted with the existing
  `astra_linguist.chronicle.date_key` (chronicle.py:111) — the current string sort puts 2025-10-20
  before 2025-8-28. Requests for any other date raise.

- **D33-7 — Config.** A `heartwood` block **already exists** (config.kdl L256-269; py `HeartwoodConfig`
  models.py L205-213, `extra=forbid`; ts `Heartwood` config.ts L215-226, `.strict()`) holding the review
  site's `service-name`/`port`/`public-origin`. S1 deletes those fields; S3 refills the block, in the kdl
  and **both** mirrors + their tests (`test_config.py:58-60`, `config.test.ts:62-64`):
  ```kdl
  heartwood {
      model "openrouter/deepseek/deepseek-v4.1-flash"      // main RLM loop
      sub-model "openrouter/deepseek/deepseek-v4.1-flash"  // llm_query / llm_query_batched
      max-iterations 60      // bounds MAIN-LM calls (≤ max-iterations + 1 forced extract)
      max-llm-calls 100      // bounds SUB-LM calls only
      max-tokens 64000       // per LM call; reasoning tokens share it (GLM lesson)
      max-output-chars 10000 // REPL output shown back per iteration (dspy default)
      backfill-budget-usd 100 // cumulative ceiling — stakeholder 2026-10-10 (≈2× the ~$50 estimate)
  }
  ```
  And in `telemetry`: `host-otlp-endpoint "http://localhost:10353"` (D33-10). LMs come from the
  existing `astra_llm.make_dspy_lm`, extended with backward-compatible `**lm_kwargs` so heartwood can
  pass `cache=False` (reruns must be real; the model comparison depends on it). Build **two distinct LM
  instances** even when main and sub use the same model id (role is told apart by instance, D33-10).

- **D33-8 — Cost accounting.** litellm 1.89.2 already adds `usage: {include: true}` to every OpenRouter
  request (`openrouter/chat/transformation.py:171-174`) and stores OpenRouter's reported cost as the
  response cost, ahead of its own price map (which has no entry for either candidate). dspy records it
  as `lm.history[i]["cost"]` and the token counts as `["usage"]` (`clients/base_lm.py:102-116`). So:
  read cost from there, via `MeteredLM` (D33-10). A call with `cost is None` makes the run's cost
  `unknown` — never `0`. S3's first real call checks `history[-1]["cost"]` is a positive number.
  Fallback for GLM only: `astra_llm.pricing` already prices `openrouter/z-ai/glm-5.3`.

- **D33-9 — Run robustness + outcome.** `HeartwoodRLM(dspy.RLM)` overrides:
  - `_execute_iteration`: catch `AdapterParseError` from `generate_action` (dspy lets it escape
    `forward`, killing the run on one malformed reply — a real risk over 40 Flash-model turns) and append
    an `[Error] could not parse your reply — answer with reasoning + a python code block` history entry,
    costing one iteration instead of the run. Mirror the running history onto `self` every step so a
    failed run still writes `trajectory.json`.
  - `_extract_fallback`: set `self.hit_cap = True`, then defer to super.

  Outcomes: **`ok`** — the agent called `SUBMIT(changelog=…)` (not `hit_cap`). Publishable.
  **`incomplete`** — `hit_cap`; not published (stakeholder-confirmed 2026-10-10); staging kept; exit 2. A cap-hit run may be mid-move with
  backlinks unfixed. Re-running starts fresh from the live corpus. **`failed`** — an exception out of
  the main loop (LM error after litellm retries, Deno crash); not published; exit 1. Sub-LM errors and
  the `max-llm-calls` limit surface inside the sandbox as catchable errors (or `"[ERROR] …"` strings from
  `llm_query_batched`) and do not end the run; per-write validation rejections don't either.

- **D33-10 — Telemetry.** `cli.main` calls `init_telemetry("astra.heartwood",
  endpoint=config.telemetry.host_otlp_endpoint)` first, `shutdown()` in `finally`. The default endpoint
  (`signoz-otel-collector:4318`) does not resolve on the host; every prior host recipe ran with
  `OTEL_SDK_DISABLED=true`, so this is the first host CLI that exports — gate E proves it.
  - Spans: `heartwood.agent.run` (attrs: date, campaign, model, sub_model, status, iterations,
    main_calls, sub_calls, tokens, cost_usd or `unknown`, pages_created/updated/moved/deleted); one child
    per tool call (`heartwood.tool.<name>`, outcome ok/raised/rejected); one per LM call.
  - **LM spans + metering live in `MeteredLM(dspy.LM)`**, which overrides `forward` to read the response's
    usage/cost, add it to a thread-safe per-role accumulator, and emit the span. **Parent the span
    explicitly to the run span's context** (captured at run start): `llm_query_batched` runs sub-calls on a
    raw `ThreadPoolExecutor` that drops contextvars (`rlm.py:266-267`), so `dspy.context(callbacks=…)` and
    the current OTel span are both invisible there. No dspy callback is used.
  - Metrics: `astra.heartwood.agent.runs{status}`, `astra.heartwood.agent.pages{op}`,
    `astra.heartwood.tool.calls{tool,outcome}`, `astra.heartwood.llm.tokens{model,role,kind}`,
    `astra.heartwood.llm.cost_usd{model,role}`. Logs: one INFO line per tool call and per run end.
  - ontology-entity's existing `astra.heartwood` tracer/meter (resolve/seed) is unchanged.

- **D33-11 — Artifacts per run** (in `<run>/`): `content/`, `ops.jsonl` (the journal), `trajectory.json`,
  `changeset.json`, `diff.patch` (`git diff --no-index` baseline→staging), `summary.json` (status,
  counts, iterations, calls, tokens, cost, model ids, duration, Pyodide version). Gitignored; the
  commit body carries the durable record.

- **D33-12 — Run ledger.** `apps/heartwood-backend/agent-runs.jsonl` (committed): one line per
  *published* run (date, run_id, cost_usd|null, model, sub_model, counts) and one per revert
  (`{"date":…, "reverted": true}`). Appended **only in the commit step, after validate + snapshot succeed**
  (§5). The backfill skips dates whose latest line is a non-reverted publish. No oxfmt/ruff ignore is
  needed (oxfmt globs only js/ts/json/css; ruff ignores `.jsonl`).

## 3. Tools

Every tool's docstring states its return shape and error behaviour — that docstring, flattened to
one line, is all the agent sees (`rlm.py:204-223`). **Errors raise `ValueError`** with a clear message:
the bridge turns it into a catchable `RuntimeError` inside the sandbox with no host traceback. (Returning
an `"error: …"` string from a list-returning tool would let `for p in backlinks(x)` iterate characters.)
The two string tools keep in-band results. Plain JSON types only (no pydantic models; `None` crosses as
`""`, so no tool returns `None`). `path` is a page path-key (relative, POSIX, no extension, e.g.
`Bestiary/Auger`); every path is containment-checked (no absolute, no `..`, must resolve inside staging
`content/`).

| Tool | Returns | Notes |
|---|---|---|
| `list_pages()` | `list[str]`, sorted | current staging state |
| `read_page(path)` | raw vellum `str` | |
| `search_wiki(pattern, regex=False)` | `list[{path, line, text}]`, ≤200 | case-insensitive |
| `write_page(path, text)` | `"created <path>"` / `"updated <path>"` / `"rejected: <validator stderr>"` | D33-4, D33-5; creates parent folders; journalled |
| `move_page(src, dst)` | `{"moved": [src, dst], "backlinks": [...]}` | raises if `dst` exists; backlinks = pages whose links resolved to `src` before the move; journalled; prunes emptied dirs |
| `delete_page(path)` | `{"deleted": path, "backlinks": [...]}` | same; journalled; prunes emptied dirs |
| `backlinks(path)` | `list[str]` | akasha's own `load_corpus` + `resolve_target` on staging |
| `list_sessions()` | `list[{date, campaign, is_target}]` | D33-6 |
| `read_transcript(date)` | full `.txt` `str` | D33-6 guard |
| `search_transcripts(pattern, regex=False)` | `list[{date, line, speaker, text}]`, ≤200 | permitted sessions only |
| `resolve_name(name)` | `{status, canonical, kind, page, page_exists, confidence, candidates}` | wraps `astra_ontology_entity.resolve()` (`Resolution`); `candidates` = top ambiguous matches (the useful part for misheard names); `page_exists` re-checks the registry's seed-time `page` against staging |

Broken-link semantics reuse akasha's resolver (Quartz "shortest" rule by basename), so "broken" means
exactly what akasha shows; a move that keeps the basename does not break `[[Name]]` links.

## 4. The agent

```python
class MaintainWiki(dspy.Signature):
    """<INSTRUCTIONS>"""
    target_date: str = dspy.InputField()
    campaign: str = dspy.InputField()
    transcript: str = dspy.InputField(desc="the target session, one line per utterance")
    changelog: str = dspy.OutputField(desc="markdown bullets, one per page touched: what changed and why, citing transcript line numbers")
```

No `wiki_index` input: dspy re-injects input variables into the REPL before **every** code block
(`rlm.py:537`, `python_interpreter.py:419-442`), so a page list passed as input would silently revert
to the run-start snapshot after any create/move/delete. The agent calls `list_pages()` instead. The
≈230 KB transcript literal re-injected per step is fine (well under dspy's 100 MB large-variable path).

Instruction requirements (exact wording tuned in S5):

1. Role: maintain the setting wiki of a Pathfinder 2e campaign from session recordings. The wiki
   covers in-world nouns — people (including player characters), places, organizations, deities,
   creatures, phenomena — and their relationships and history.
2. Freedom: create, rewrite, restructure, move, merge or delete pages when that makes the wiki better.
3. What doesn't belong: out-of-character talk, rules discussion, dice and combat play-by-play, game
   mechanics. Mechanics is spelled out as statblock language: resistances/weaknesses/immunities,
   damage types, HP, AC, saves, DCs, levels, spell ranks, condition names used as rules terms,
   action counts, dice, bonuses, and prices as a shop list (money stays only as an in-world fact,
   e.g. a fee an NPC offers). Describe what a creature or person does and is like in the fiction,
   with one Bad→Good example (the S5 Ugathal "resistant to bludgeoning" leak rewritten as what
   blows did and didn't do). Transcripts are speech-to-text: names are often misheard — call
   `resolve_name()` and search the wiki and older transcripts before creating a page for an
   unfamiliar name.
4. **The wiki may already be ahead of this session** (backfill replays old sessions against a current
   wiki). Add what is missing; never overwrite a later state with an earlier one. When the session
   contradicts the wiki, prefer the wiki unless the session clearly supersedes it.
5. Voice: match the tone and structure of neighbouring pages in the same folder.
6. Vellum essentials: YAML frontmatter; links `[[Path/Or/Name]]` / `[[Target|label]]`; avoid the
   sigils `#word`, `@word`, `||text||` in prose. If `write_page` returns `rejected:`, fix and retry.
7. After a move or delete, fix or deliberately remove the returned backlinks.
8. REPL hygiene: `transcript`, `target_date`, `campaign` are reset every step — store derived data
   under new names. Tools raise on error; use try/except where useful.
9. Finish with `SUBMIT(changelog=…)`.
10. No AI slop (added after the S5 dry run, whose pages leaned on ` -- ` asides and summing-up
    last lines): plain, concrete sentences in the register of the existing human pages. A concrete
    don't-list: no ` -- `/em-dash asides or chains; no "not X, but Y" framings; no rhythmic
    triads; no stock words (testament, tapestry, delve, whispers of, steeped in, looms, enigmatic,
    ever-shifting, …) or filler size words; no coinages the transcript and wiki don't use; no
    hedges the source doesn't make; no summarizing/moralizing last lines; no speculation beyond
    the table; no size-word opener + "It is …" follow-on (the 0020 Bad/Good calibration pair,
    reused from `f3a834b4^:…/proposer/voice.py`). When extending a page, add rather than restyle
    the human's sentences. A short page of solid facts beats a padded one.

## 5. Publish, revert, backfill

All recipes put `~/.deno/bin` on PATH and use the pinned `uv_bin` (justfile:35), because dspy calls bare
`deno` and long runs launch detached with a minimal environment. `akasha-snapshot` keeps
`OTEL_SDK_DISABLED=true`.

**Prerequisite (S4) — make linguist-commit safe for the whole class.** Change its commit to
`git commit --only -- apps/linguist/transcripts apps/linguist/data apps/linguist/timeline`, so it can
never sweep another commit's staged files (five incidents so far). This makes single runs safe without
stopping the timer. It still pushes whenever local main is ahead, so the backfill still suppresses it.

**`just heartwood-agent <date> [--dry-run]`**

0. Precondition: `git status --porcelain apps/akasha-backend/content apps/heartwood-backend/agent-runs.jsonl`
   is empty, else refuse (a dirty corpus would be staged into the run).
1. `astra-heartwood-agent run <date>` → stage, run, artifacts. Exit 2/1 for incomplete/failed → stop.
   `--dry-run` stops here and prints the `diff.patch` path + summary.
2. `astra-heartwood-agent publish-sync <run>` → apply the change-set to the live corpus. For each
   touched path, require the live file's hash to equal the run's baseline, else abort with a conflict
   listing (no file written). Write created/updated, remove deleted and moved-from, prune emptied dirs.
3. Whole-corpus `validate-corpus.ts`. 4. `akasha-snapshot`; print the unresolved-link delta vs. the
   pre-run snapshot (baseline 35 on 2026-10-10) — reported, not enforced.
   On failure at 3 or 4: print the exact restore command
   (`git checkout -- apps/akasha-backend/content apps/akasha-backend/snapshot && git clean -fd apps/akasha-backend/content`).
5. `astra-heartwood-agent ledger-append <run>`; `git add` the three paths; `git commit --only --no-verify
   -- apps/akasha-backend/content apps/akasha-backend/snapshot apps/heartwood-backend/agent-runs.jsonl`.
   Subject `feat(akasha): heartwood agent <date>`; body = counts + model + cost + changelog, wrapped at
   100 columns (commitlint).
6. Unless `--no-push`: `git fetch` + `git rebase --autostash origin/main` (skip when origin/main is
   already an ancestor), push, `docker compose up -d --build akasha-frontend`.

**`just heartwood-revert <date>`** — `git revert --no-commit <that session's commit>`, restore
`agent-runs.jsonl` and the snapshot from HEAD (both conflict on any non-latest revert), append a
`reverted` ledger line, regenerate the snapshot, validate, commit `revert(akasha): heartwood agent
<date>`, push, redeploy.

**`just heartwood-backfill [from]`** — always launched detached:
`systemd-run --user --unit=heartwood-backfill` with output to `artifacts/heartwood/backfill.log`.
1. Suppress linguist-commit: stop `linguist-commit.timer` **and** `linguist-commit.path` (episode
   renders trigger the service too), then wait until `linguist-commit.service` is inactive. Touch
   `artifacts/heartwood/backfill.lock`; the watchdog (`alert-notify.sh`) skips its timer-armed check
   while the lock exists, so it doesn't page Discord. An EXIT trap re-arms both units and removes the
   lock; if the process is killed hard, the trap won't run — `just heartwood-backfill-reset` re-arms
   manually (documented in the recipe comment).
2. Loop `astra-heartwood-agent sessions --from <from>` (chronological, ledger-skipped). Before each
   date: sum `cost_usd` from the ledger; stop if the sum would exceed `backfill-budget-usd`, or if any
   prior line has `cost_usd: null`. Run steps 0–5 with `--no-push`.
3. On `incomplete`/`failed`/conflict: stop, push what's committed, redeploy, print the date to re-run.
4. At the end: push once, redeploy akasha once.

## 6. Slices

- **S1 — Retire 0020** (§8). Order matters: `docker compose rm -sf heartwood` first (it bind-mounts
  `proposals/` rw, and a restarting container would recreate it root-owned), then `just caddy-reload`
  (⚠ live-site removal of heartwood.iridi.cc — flag at the moment), then delete code. `rm -rf
  apps/heartwood-frontend` including its ignored `dist/` + `node_modules/` **before** dropping its uv
  exclude (a manifest-less dir under `apps/*` hard-errors uv — the menhir lesson). Move `_iso_date` to
  `agent/dates.py` and `sessions.py` into `agent/`. Regenerate locks. All CI lanes green locally.
- **S2 — Workspace + tools + sessions.** Op journal, change-set, publish-sync (incl. the live-hash
  conflict check and a concurrent-edit-elsewhere-survives test), all §3 tools with the injected
  validator. Hermetic: fixture corpus (5–10 pages, a crossref web) + 3 fixture transcripts across two
  worlds and dates around the target. No LM, no Deno, no node (except the one skip-if-absent test).
- **S3 — The run.** Sandbox warm-up first. Config block + mirrors + `host-otlp-endpoint`,
  `make_dspy_lm(**lm_kwargs)`, `MeteredLM`, `HeartwoodRLM`, `instructions.py`, `run.py`, `cli.py run
  --dry-run`, artifacts. Test: a scripted run through the **real** Deno interpreter — main DummyLM
  steps are `{"reasoning": …, "code": "```python\n…\n```"}`, and `sub_lm` gets its **own** DummyLM
  (else `llm_query` consumes the main script) — exercising write → reject → fix → move → raise-caught →
  SUBMIT, plus a malformed-reply step proving D33-9 survives it. DummyLM has no cost, so the test also
  covers the `unknown` path. Skips without Deno (CI); local pass recorded.
- **S4 — Publish, revert, backfill.** `publish-sync`, `ledger-append`, `sessions` subcommands; the
  linguist-commit `--only` change; the watchdog lock check; the four just recipes. Test publish-sync and
  ledger resume on fixtures.
- **S5 — Model comparison (paid, ~$2 — flag).** Dry-run 2025-8-28 with DeepSeek V4.1 Flash and GLM 5.3
  (`openrouter/z-ai/glm-5.3`). Deliver both diffs + summaries; stakeholder picks; set config. Tune the
  instruction wording here if both disappoint.
- **S6 — Go live (paid + live content — flag).** Publish 2025-8-28 for real, stakeholder spot-check on
  akasha, then the detached backfill.

## 7. Acceptance gates

- **A** — S1: `test ! -e apps/heartwood-frontend`; `git grep` for the retired module names
  (`astra_heartwood.(pipeline|proposer|apply|review|assets)`, `heartwood-frontend`, `heartwood.iridi.cc`,
  `HeartwoodConfig.*public_origin`) has no hits outside `thoughts/` and the §8 keep-list comments;
  heartwood.iridi.cc no longer served; all CI lanes green locally.
- **B** — Tool tests: `..`/absolute paths, future-dated and other-world transcripts raise; a rejected
  write leaves staging byte-identical; publish-sync refuses a baseline-hash mismatch.
- **C** — The scripted real-Deno run passes locally (incl. the malformed-reply step).
- **D** — A real dry run of 2025-8-28 ends `ok` with a positive cost from `lm.history`, and populated
  trajectory/diff/summary.
- **E** — SigNoz shows `heartwood.agent.run` with tool and LM child spans — including sub-LM spans from
  a batched call parented under the run, not orphaned — and the run metrics.
- **F** — Stakeholder picks the model from S5; config updated.
- **G** — 2025-8-28 published live (commit + ledger line + akasha redeployed); the backfill runs to
  completion or to a reported stop (budget, incomplete, failed, conflict).

## 8. Retirement inventory (S1)

From a read-only `git grep -i heartwood` sweep, 2026-10-10. Line numbers are as of that date.

**Delete**
- `apps/heartwood-backend/src/astra_heartwood/`: `assets.py`, `pipeline.py`, `filter.py`, `extract.py`,
  `refine.py`, `resolve_facts.py`, `models.py`, `prompts.py`, `llm.py`, `review.py`, `apply.py` (after
  moving `_iso_date`), all of `proposer/`.
- All 13 tests under `apps/heartwood-backend/tests/` + `fixtures/review-sample.kdl`.
- `apps/heartwood-backend/facts/` and `proposals/` (63 tracked files).
- `apps/heartwood-frontend/` — whole member, including ignored files.
- Scripts `astra-heartwood-{extract,propose,apply}`; trim deps (`dagster` goes; add
  `astra-akasha-backend` for the resolver; dspy already arrives via `astra-llm`).

**Edit**
- `dagster/definitions.py` L11 import + the two asset entries (≈L71-72). Keep `dagster/Dockerfile:41`
  `COPY apps/heartwood-backend` (still a uv member; `uv sync --frozen` needs every member).
- `deploy/docker-compose.yml` L552-594 (service); reword comments at L85, L294.
- `sites.caddyfile` L147-156 (stanza); reword comments at L252, L276.
- `justfile` L166-209 (`heartwood-apply`) — replaced by §5.
- Config `heartwood` fields + mirrors + tests (D33-7).
- Root `pyproject.toml` L11 uv `exclude` `"apps/heartwood-frontend"` (after the `rm -rf`).
- **Manifest ripple — 14 Dockerfiles** `COPY apps/heartwood-frontend/package.json`: akasha-frontend:27,
  codex:31, harrow:27, ledger:28, menhir:17, mouthpiece-frontend:31, orator-backend:31, portal:25,
  portal/headless:25, strider:30, vellum-frontend:30, vellum-render:25, weal-bot:20, weal-overlay:17.
- `.oxfmtrc.json:22`; `.oxlintrc.json` L110, L179-180, L256, L275.
- `.github/workflows/ci.yml` ≈L101 comment "all 22 TS workspace members" → 21.
- `pnpm-lock.yaml` / `uv.lock`: regenerate.

**Keep**
- `ontology/ontology-entity` (backs `resolve_name`), incl. its `astra.heartwood` telemetry names.
- Historical comments in libs/py/ontology, libs/py/lexicon, mouthpiece `clean.py`, portal/headless,
  codex (`Dockerfile:6,83` etc.).
- `thoughts/` history; S1 adds a "superseded by 0033" line to `heartwood-0020-gotchas.md` and its
  MEMORY.md entry.

## 9. Adversarial review record (2026-10-10)

Two read-only reviewers, evidence spot-checked by the orchestrator against installed dspy 3.2.1 /
litellm 1.89.2 and the repo.

- **Mechanics lens.** BLOCKER: dspy's `on_lm_end` callback never sees usage/cost → `MeteredLM` reads
  `lm.history` (and litellm already requests OpenRouter cost; the planned `extra_body` was redundant).
  MAJORs folded: batched sub-calls escape callbacks + OTel context (explicit parenting); input
  re-injection makes `wiki_index` stale (input dropped); raise-don't-return errors + `None`→`""`;
  one parse error killed the run + lost trajectory (`HeartwoodRLM`); validator needs node in a
  node-less CI lane (injected seam); unpinned Pyodide fetched on first run (warm-up step); hash-based
  move inference + same-page concurrent-edit loss (op journal + baseline-hash check). MINORs folded:
  cap signal via `_extract_fallback` override, sub-LM/limit errors don't end runs, richer
  `resolve_name`, docstring contracts, `max()` date stamping, DummyLM scripting shape, test names.
- **Publish/deploy lens.** BLOCKERs: host OTLP endpoint unresolvable (`host-otlp-endpoint`); validator
  tests vs CI (same as above). MAJORs folded: linguist-commit `.path` unit + watchdog page + push-ahead
  (suppress both units, lock file, `--only` class fix); single-run add→commit race + dirty-tree rebase
  (`--only`, `--autostash`); ledger written before publish succeeded (moved after snapshot +
  clean-tree precondition); frontend dir survives `git rm` (rm -rf before exclude drop, compose rm
  first); no budget enforcement (`backfill-budget-usd`); revert of non-latest sessions conflicts
  (`heartwood-revert`); detached launch + PATH (`systemd-run`, pinned paths, reset recipe). MINORs
  folded: reuse `date_key`, move `_iso_date`, no ignore entries needed, 100-col bodies, gate A grep
  scope, ci.yml line.

## 10. Build record (2026-10-10)

S1 `b12a7b8a` · S2 `30db0066` · S3 `a6a94134` · S4 `22036ffc` · model-override flags `8c3b9b3f`.
Gates A, B, C met (local CI lanes green; real-Deno scripted run passes; pyodide 314.0.7). D met:
the DeepSeek dry run of 2025-8-28 ended `ok`. E partly met: tool + LM spans reach SigNoz from the host
via `host-otlp-endpoint`.

**S5 model comparison → gate F: DeepSeek V4.1 Flash (stakeholder, 2026-10-10).**
- DeepSeek V4.1 Flash: `ok`, 39/40 iterations, 63 main + 5 sub calls, 3.3M tokens, **$0.31**, 21 min;
  created 16 pages, updated 3. Prose readable and in the wiki's voice; it extended `Bestiary/Ugathal`
  instead of rewriting it. One instruction miss: combat mechanics ("resistant to bludgeoning") leaked
  into Ugathal.
- GLM 5.3: stopped by the stakeholder after 42 min, 38 LM calls averaging ~46 s (latest calls ~4 min),
  0 writes — still researching. Nothing published.
- Config already names DeepSeek; no change. Stakeholder: frontmatter key reordering in diffs is fine.
- Open before S6: the 39/40 iteration margin is thin — a session with more to write may end
  `incomplete`, which stops the backfill. **Resolved pre-S6:** `max-iterations` 40 → 60 (D33-7), and the §4
  instructions tightened (requirement 3 mechanics list, new requirement 10 anti-slop).
