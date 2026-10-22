# 0036 — heartwood in the Dagster pipeline (spec)

**Status:** SPEC — adversarial review folded (2 blockers + 5 majors + 11 minors, blockers spot-checked — see §5).
**Scope doc:** `thoughts/shared/research/2026-10-21-heartwood-dagster-0036-thoughts.md` (D1–D3 stakeholder-resolved).
**Builds on:** 0033 (`thoughts/astra/specs/0033-heartwood-agent-spec.md`) — the agent, `just heartwood-agent`,
its exit codes, ledger, revert and backfill are built and unchanged here except where §2 says so.

## 1. Product

Every new faerrin-world session updates the akasha wiki with no one typing a command. When linguist's
canonical transcript lands, the heartwood sensor launches `session_wiki` for that date. The asset files a
request; a host systemd unit picks it up and runs the existing `just heartwood-agent <date>` (agent →
publish-sync → validate → snapshot → registry seed → ledger → commit → push → akasha redeploy); the asset
reads the result and materializes, or fails and pages. Mouthpiece runs in parallel and does not wait (D1).

Non-goals: running the agent inside the dagster-code image (D3); publishing incomplete runs (D2);
mouthpiece ordering (D1); changing the agent, its model, budget, revert or backfill semantics.

## 2. Decisions

Scope decisions D1–D3 carry over verbatim. Build decisions:

- **D36-1 — Config.** `heartwood` gains two fields (py `HeartwoodConfig`, TS `Heartwood` zod mirror, both
  config tests, `config.kdl`): `requests-path "/ruby/data/experiments/astra/artifacts/heartwood/requests"`
  (host-absolute; mounted at the same path in the Dagster services) and `request-timeout-minutes 180`.
  The path also appears in `deploy/docker-compose.yml` and `just artifacts-init` — three copies, the same
  accepted pattern as `mouthpiece.episodes-path` (compose and just cannot read config.kdl).

- **D36-2 — The request protocol** (`astra_heartwood/requests.py`, shared by the asset and the runner;
  Pydantic models, `schema: 1`; every write is `.tmp` → `os.replace`; readers glob only `*.request.json` /
  `*.result.json`, never `.tmp`):
  - `requests/<date>.request.json` — `{schema, request_id (uuid4 hex), date, requested_at (UTC ISO),
    dagster_run_id}`.
  - `requests/<date>.result.json` — `{schema, request_id, date, outcome, exit_code, meaning, run_dir,
    run_id, status, cost_usd, counts, commit, log, started_at, finished_at}`. `outcome` ∈ `published` ·
    `already-published` · `failed`. `run_dir`…`commit` are null when unknown; `run_dir`, `run_id`,
    `status`, `cost_usd`, `counts` come from the run's `summary.json` (path from the recipe's `RUN_DIR=`
    line); `commit` from its `heartwood-agent: committed <sha> …` line.
  - `requests/logs/<date>.<request_id>.log` — the recipe's full stdout+stderr (a subdirectory, so log
    writes don't trigger the directory path unit).
  - A request is **pending** when no result exists for its date or the result's `request_id` differs.
    The asset deletes any old result before writing a new request id.
  - `EXIT_MEANINGS: dict[int, str]` mirrors the `heartwood-agent` recipe header verbatim (0 ok · 1 run
    failed · 2 incomplete · 3 publish conflict · 4 refused · 6 dirty corpus/ledger/registry or not on main
    · 7 validate/snapshot/seed failed · 8 commit/rebase/push failed · 9 redeploy failed or skipped · 10
    publish lock timeout, nothing written (new, D36-5) · 64 bad flag), plus runner-only codes −1
    "preflight: missing tool <name>" and −2 "runner error". Anything else → "unexpected exit".
  - `NEXT_STEP: dict[int, str]` — the human action in the failure message: 1/2/3/6/7/10 → "fix, then
    re-materialize `session_wiki` (or `just heartwood-agent <date>`)"; 7 adds the recipe's printed restore
    command (it is in the log); **8/9 → "already committed + in the ledger — run `just
    _heartwood-push-deploy`; do NOT re-materialize (it would report already-published)"**.

- **D36-3 — Host runner.** New subcommand `astra-heartwood-agent drain-requests [--requests DIR]`:
  1. **Preflight (zero cost):** resolve `node` (`validate.find_node()` — PATH, then newest nvm), `deno`
     (PATH, then `~/.deno/bin`), `git`, `docker`, `uv` (`UV` env, then PATH, then `~/.local/bin/uv`) and
     `just` (`JUST` env, then PATH, then `~/.cargo/bin/just`). Build the child env with `PATH` =
     those tools' directories prepended to the inherited PATH. A missing tool → every pending request gets a
     `failed` result with exit −1, nothing runs. Log one `preflight ok: node=… deno=… …` line.
  2. Pending requests, oldest `date_key` first. **Before each request** re-check
     `artifacts/heartwood/backfill.lock`: present → stop, leave the rest pending (the backfill's re-arm
     starts the service again, D36-6). Then: `ledger.is_published(date)` → result `already-published`, no
     run (a re-materialize is harmless; to redo a session, `just heartwood-revert <date>` first).
     Otherwise run `just heartwood-agent <date>` with the preflight env, output tee'd to the log, and write
     the result: exit 0 → `published`, else `failed`.
  3. Re-scan after the last request and loop until nothing is pending.
  The runner exits 0 unless it crashed itself (a failed session is a `failed` result — the asset pages).
  An exception inside one request writes a −2 result for it and continues.

- **D36-4 — Host units** (`deploy/systemd/`):
  - `heartwood-request.path` — `PathModified=<requests-path>` (directory watch: create/rename/delete
    directly inside it; the runner's own result writes re-trigger one cheap no-op pass, accepted).
  - `heartwood-request.service` — `[Unit] OnFailure=astra-alert@%n.service` (in `[Unit]`; in `[Service]`
    it is silently ignored); `[Service] Type=oneshot`, `WorkingDirectory=/ruby/data/experiments/astra`,
    `ExecStart=/home/jbassin/.cargo/bin/just heartwood-requests`; no start timeout (oneshot default).
  - `heartwood-request.timer` — `OnCalendar=hourly`, `Persistent=true`: the fallback sweep. Worst case
    for a request filed in the tail of a run (after its final re-scan, merged into the running start job):
    picked up within an hour.
  - Recipe `heartwood-requests`: `JUST={{just_executable()}} UV={{uv_bin}} {{uv_bin}} run
    astra-heartwood-agent drain-requests` (never bare `uv`/`just`: the user manager's PATH has neither).
  - Telemetry: the agent already exports via `host-otlp-endpoint`; the runner logs to the journal.

- **D36-5 — One git publisher at a time.** `flock -w 1800 artifacts/git-publish.lock`, taken **only in
  the top-level callers, never inside `_heartwood-push-deploy`** (a child `flock` on a fresh open file
  description of the same file would deadlock against its parent):
  - `linguist-commit` — the whole body (none of its sub-recipes run git; verified).
  - `heartwood-agent` — from **before publish-sync (step 2) through step 6**, so linguist-commit can never
    build akasha from unvalidated, unsnapshotted content (it has no dirty-corpus guard). Step 1 (the agent
    run, minutes to an hour) stays outside. A lock timeout before publish-sync exits **10** with nothing
    written.
  - `heartwood-revert` — from **before `git revert --no-commit`** through its redeploy (the sequencer
    state + staged index must not meet a linguist-commit `add`).
  - The backfill's final `_heartwood-push-deploy` is unlocked: acceptable because the backfill has stopped
    every other publisher (D36-6). Its per-session `heartwood-agent --no-push` calls take the lock as above
    (uncontended).
  - The recipes resolve `node` the same way as `find_node` (PATH, else the newest
    `~/.nvm/versions/node/v*/bin/node`) for their validate step, so a manual run from a minimal shell works
    too (belt and braces with D36-3's env).

- **D36-6 — Backfill interplay.** `heartwood-backfill`, after touching its lock: stops
  `heartwood-request.{path,timer}` alongside the linguist-commit units **and waits for
  `heartwood-request.service` to go inactive** (copy the existing linguist-commit wait loop, same 30-min
  abort). Its `rearm` trap and `heartwood-backfill-reset` start `heartwood-request.{path,timer}` **and**
  `heartwood-request.service` (to drain anything filed meanwhile). The runner's per-request lock check
  (D36-3 §2) is the second guard.

- **D36-7 — Sensor + partitions** (`astra_heartwood/assets.py`; `dagster` re-added to heartwood-backend's
  dependencies — 0033 S1 removed it — with `uv lock` re-run and the lock committed).
  `heartwood_sessions = DynamicPartitionsDefinition(name="heartwood_sessions")`. `heartwood_sensor`
  (default RUNNING, 30 s, target `[session_wiki]`) globs linguist canonical transcripts and keeps dates
  with `sessions.faerrin_session(date)` (verified importable + correct in the dagster-code container: 55
  dates).
  - First eval (`cursor is None`): **adopt** — register every such date, no runs, cursor `"adopted"`.
  - Normal eval: dates not yet partitioned → register + `RunRequest` (tag `astra/heartwood: session_wiki`).
    A transcript rewrite never re-triggers ("new" = not yet a partition, as in mouthpiece).
  The sensor never reads the ledger (the container's copy is image-baked and stale).

- **D36-8 — `session_wiki` asset.** Partitioned by `heartwood_sessions`, `group_name="heartwood"`, **no
  retry policy** (a paid 15–55 min run must not repeat; the agent's litellm already retries per call).
  Logger `astra_observe.get_logger("astra.heartwood")` (only `astra.*` loggers export to SigNoz —
  `context.log` would never reach the Class A rule); counter `astra.heartwood.session_wiki.runs{outcome}`
  created at module scope on the module's meter (the Python idiom in mouthpiece's assets.py). Body, inside
  span `heartwood.session_wiki` (attrs: date, request_id, outcome, exit_code, cost_usd, run_id, commit):
  1. Delete any `<date>.result.json`; write a fresh `<date>.request.json` (`dagster_run_id =
     context.run_id`).
  2. Poll every 30 s for a result with this `request_id`, up to `request-timeout-minutes`. Timeout → log
     ERROR and raise `dg.Failure("no result in N min — is heartwood-request.path active? The request is
     still pending at <path> and WILL run when the host picks it up")`.
  3. `published` → `MaterializeResult(metadata={outcome, cost_usd, run_id, commit, counts…})`.
     `already-published` → materialize with that outcome, log WARN. `failed` → log ERROR
     `"heartwood %s failed: exit %d (%s) — %s — log %s"` (meaning, NEXT_STEP) and raise
     `dg.Failure(…, allow_retries=False)`. Exit 2 (incomplete) is a failure (D2).

- **D36-9 — Wiring, mounts, concurrency.** `dagster/definitions.py` adds `session_wiki` and
  `heartwood_sensor`. `&dagster-pipeline-volumes` adds `<requests-path>:<requests-path>` (identical-path,
  rw). `just artifacts-init` creates `<requests-path>/logs` as uid 1000 (a missing bind source is created
  as root). `dagster/dagster.yaml`: `max_concurrent_runs` 2 → **3** and
  `tag_concurrency_limits: [{key: "astra/heartwood", limit: 1}]`, so a waiting `session_wiki` (it holds a
  run slot for its whole wait) never starves scribe/linguist/mouthpiece/`campaign_timeline`, and two dates
  registered in one eval queue in Dagster instead of both blocking.
  `.dockerignore` already excludes `artifacts` (verified).

- **D36-10 — Install + watchdog.** `just heartwood-request-install` (mirrors
  `linguist-commit-timer-install`: link the three units, `daemon-reload`, `enable --now` path + timer).
  `alert-notify.sh`: new `check_path_unit` (is-active only — a `.path` unit has no
  `NextElapseUSecRealtime`, so `check_timer` would flag it "not armed"); `WATCHED_TIMERS` gains
  `heartwood-request.timer`, a new `WATCHED_PATHS=(linguist-commit.path heartwood-request.path)` loop
  uses `check_path_unit`; the backfill-lock suppression becomes a list
  (`linguist-commit.timer linguist-commit.path heartwood-request.timer heartwood-request.path`) instead of
  the hard-coded `linguist-commit.timer`.

- **D36-11 — Known edges (documented, accepted).**
  - A request outlives its Dagster run (asset timeout during a long backfill, or a run killed by
    `just up`): the host later publishes it while the partition shows failed. Re-materializing then
    reports `already-published` and materializes it. **Don't `just up` while a `session_wiki` run
    waits.**
  - Automated runs append `cost_usd` to the ledger; `budget-check` sums the whole ledger, so automated
    spend counts against `backfill-budget-usd`.
  - A session landing in the ~30 s between deploy and the first sensor eval is adopted (no run).

## 3. Slices

- **S1 — Config + protocol + runner (D36-1..D36-3).** Config fields both lanes + tests; `requests.py`;
  `drain-requests` with injected tool resolution + command runner. Tests: pending detection (no result /
  stale id / matching id), `.tmp` ignored, oldest-first order, preflight miss → −1 results and no run,
  backfill lock checked before each request (lock appears mid-loop → rest stay pending), already-published
  short-circuit, exit 0 → published with summary fields + commit parsed, non-zero → failed with
  meaning + next step (8/9 wording), per-request exception → −2 and continue, mid-run request picked up by
  the re-scan, child env PATH carries the tool dirs. Gate A.
- **S2 — Asset + sensor (D36-7, D36-8, D36-9 code + dagster.yaml).** Tests with a fake result writer:
  published / already-published / failed (ERROR on the `astra.heartwood` logger) / timeout, stale result
  deleted before the request, sensor adoption (no runs) then new-date run with the tag, non-faerrin date
  ignored, definitions include both, no retry policy. `uv lock` committed. Gate B.
- **S3 — Host plumbing (D36-4..D36-6, D36-9 mount, D36-10).** Units, recipes, flock placement, node
  resolution, backfill/reset edits, artifacts-init, compose mount, watchdog. Local proof:
  `systemd-analyze --user verify` on the units; a scripted check that a second `flock` holder waits;
  `just --dry-run`/`--show` of the edited recipes; watchdog run with `ALERT_DRY_RUN=1` reports the new
  units ok. Gate C.
- **S4 — Deploy + live proof.** Stop the linguist-commit timer around the commit window. `just up` (SOPS
  env), `just heartwood-request-install`. Free end-to-end proof: launch `session_wiki` for an
  already-published date (2026-10-19) through GraphQL `launchRun` → the **real unit** runs the runner
  (journal shows the `preflight ok` line with node/deno/git/docker/uv/just resolved) → result
  `already-published` → the run SUCCEEDS. The paid proof is the next new session. Gates D, E.

Each slice: CI lanes reproduced locally, one Conventional Commit; push after S4.

## 4. Acceptance gates

- **A — runner.** S1 tests green; `drain-requests --requests <tmp>` with a request for a published date
  writes `already-published` and spends nothing.
- **B — asset + sensor.** S2 tests green; full Python + TS lanes green; `uv lock --check` clean.
- **C — host plumbing.** `systemd-analyze --user verify` clean; flock serialization shown; watchdog
  dry-run ok for the new units and suppressed under a backfill lock.
- **D — free live loop.** Units active; the GraphQL `session_wiki` run for 2026-10-19 SUCCEEDS with
  `outcome=already-published`; the unit's journal shows `preflight ok` with every tool resolved;
  `heartwood.session_wiki` span in SigNoz under `astra.pipeline`; 0 ERROR logs; no new heartwood commit;
  the sensor adopted the 55 existing dates with no runs and `astra-heartwood-agent sessions` is empty.
- **E — first real session (after deploy).** The next faerrin session publishes with no manual command:
  a `feat(akasha): heartwood agent <date>` commit, a ledger line, `session_wiki` materialized
  `published`, akasha redeployed. Recorded in the memory file when it happens.

## 5. Adversarial review record (2026-10-21)

One reviewer, verified against the repo and the running system (read-only); all folded. The orchestrator
re-verified B1 (user-manager PATH has no node; node only under `~/.nvm`) and B2 (`check_timer` keys on
`NextElapseUSecRealtime`; suppression hard-coded) and the `max_concurrent_runs: 2` claim.

- **Blocker — node off the systemd PATH:** the recipe's validate step would exit 127 *after* publish-sync
  → exit 7, dirty corpus, every later request exit 6. → D36-3 preflight + child env; D36-5 recipe node
  resolution; Gate D checks the preflight under the real unit.
- **Blocker — watchdog:** a `.path` unit fails `check_timer`; backfill suppression covered only
  linguist-commit.timer. → D36-10.
- **Major — lock too late:** linguist-commit could build akasha from unvalidated content mid-publish. →
  lock from step 2. **Major — revert lock** before `git revert`. **Major — backfill vs runner** could run
  the same date twice. → D36-6 wait + per-request lock check. **Major — run-slot starvation** with
  `max_concurrent_runs: 2`. → D36-9. **Major — bare `uv`/`just`** in a systemd unit. → D36-4.
- **Minors folded:** exit 8/9 next-step wording + "or skipped"; lock only in callers; `astra.heartwood`
  logger; module-scope counter (no Python lazy helper); `OnFailure=` in `[Unit]`; path copies noted; glob
  excludes `.tmp`; tail-window worst case; requests outliving runs + no `just up` while waiting; budget
  interplay; `uv lock`; Gate D adoption check.
- **Confirmed:** `.dockerignore` excludes artifacts; artifacts-init mkdirs as the user; container imports
  `faerrin_session` without node/git/Deno (55 dates); Dockerfile installs heartwood-backend; "new" = not
  yet a partition; exit codes match the header; `summary.json` fields + `RUN_DIR=` + `committed <sha>`
  lines exist; `ledger.is_published` exists; the host resolves the OpenRouter key via `sops -d` with the
  in-repo age key (no env needed); SSH push + `docker compose --build` work from a user oneshot; `flock`
  at `/usr/bin/flock`; systemd 249 directory `PathModified` semantics; oneshot has no start timeout; no
  nested-lock risk in linguist-commit; the SigNoz Class A rule is enabled; no run max-runtime/retries.
