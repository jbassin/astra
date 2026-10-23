# heartwood in the Dagster pipeline (0036) — scope

Date: 2026-10-21 · Stage: **Scope** (next: spec via `octo:spec` → `thoughts/astra/specs/0036-heartwood-dagster-spec.md`)

## Summary

Run heartwood automatically for every new faerrin-world session, triggered by Dagster. Today heartwood
only runs when someone types `just heartwood-agent <date>` (0033 D4 "manual CLI first"); on 2026-10-21 the
wiki was two sessions stale (2026-10-12 and 2026-10-19 were never run) until a manual catch-up.

The agent keeps running **on the host** through the existing, proven `just heartwood-agent <date>`. A new
per-session Dagster asset, `session_wiki`, files a request and waits for its result, so Dagster shows
each session's wiki update as a partitioned asset with success, failure and cost, and a failure pages
through the normal Class A route. A host systemd path unit picks up the request.

## Decisions (stakeholder, 2026-10-21)

| # | Decision | Choice |
|---|---|---|
| D1 | Ordering with mouthpiece | **Parallel, no gate.** Both start when the linguist transcript lands. The producer brief already reads the new session's transcript; it only misses the pages heartwood writes that night. (Same call as 0035 D3.) |
| D2 | Incomplete run (iteration cap) | **Hold and alert.** Nothing publishes (as in the manual recipe); the asset fails, Discord is paged, a human re-runs `just heartwood-agent <date>`. |
| D3 | Runtime | **Host run, Dagster tracks it.** Not chosen: running the agent inside the dagster-code image (needs node + the vellum validator's node_modules + git in the image, and the publish tail still has to run on the host). |

## Verified facts (checked against the repo, 2026-10-21)

**The agent cannot run in the dagster-code image as-is.** `write_page` validates every candidate page by
shelling out to `node --import nodeTsResolve.mjs validate-corpus.ts` (`agent/validate.py`), and
`Workspace.diff_patch` runs `git diff --no-index` (`agent/workspace.py:333`). The image is
`python:3.12-slim` + Deno 2.5.6 (0035); it has neither node nor git. Hence D3.

**The publish tail is host-only regardless.** `just heartwood-agent` steps 2–6 (`justfile` ~L660–735):
`publish-sync` into `apps/akasha-backend/content`, whole-corpus node validation, `akasha-snapshot`,
`astra-ontology-entity-seed`, `ledger-append`, a path-scoped `git commit --only`, then
`_heartwood-push-deploy` (fetch, rebase `--autostash`, push, `docker compose up -d --build
akasha-frontend`). The containers have no git, no push key, no docker socket — the same reason
`linguist-commit` is a host unit.

**Exit codes are already a contract.** `heartwood-agent`: 0 ok · 1 run failed · 2 incomplete · 3 publish
conflict · 4 refused · 6 dirty corpus/ledger/registry or not on main · 7 validate/snapshot/seed failed ·
8 commit/rebase/push failed · 9 redeploy failed · 64 bad flag. The result file can carry the code verbatim.

**No backlog.** `ingestible_dates()` = 55 faerrin-world sessions (every show in the faerrin world, not only
the main campaign); `ledger.published_dates()` = the same 55; `pending_sessions()` is empty. A sensor
whose done-set is the ledger fires nothing on enable. Still keep the mouthpiece adoption idiom (first eval
registers everything, emits no runs) as the paid-replay guard.

**A re-run of a published date is not refused early.** `run` never checks the ledger; `ledger-append`
refuses only a duplicate `run_id`. A second run of a published date would publish-sync a second round of
edits and commit them. The host runner must skip dates the ledger shows as published (result
`already-published`, exit 0) so a Dagster re-materialize is harmless.

**Two host publishers would race on git.** `linguist-commit` (timer every 15 min + the `.last-rendered`
path trigger) and `heartwood-agent` both `git add/commit/push` and both rebuild akasha-frontend. They are
separate units, so they can overlap; a concurrent commit fails on `.git/index.lock`. Both already commit
with `--only` (0033 §5), so only the git + redeploy sections need a shared lock (`flock` on one file under
`artifacts/`).

**The backfill already has a lock.** `just heartwood-backfill` stops the linguist-commit units and holds
`artifacts/heartwood/backfill.lock` (the watchdog suppresses its timer check while it exists). The request
runner must not run while that lock exists (leave the request pending; it runs after
`heartwood-backfill-reset`).

**Seams.** Dynamic partitions + a sensor mirror `astra_mouthpiece.assets` (`mouthpiece_sessions`,
`linguist_output_sensor`, `linguist_io.new_sessions`). `dagster/definitions.py` lists assets + sensors
explicitly. heartwood-backend dropped its `dagster` dependency in 0033 S1; an `assets.py` there needs it
back (`dagster/Dockerfile` already COPYs the member and `uv sync --frozen --no-dev` installs it).
Paths: containers mount host dirs at identical paths for files both sides touch (mouthpiece episodes,
0031 menhir) — the request dir should follow that, created by `artifacts-init` as uid 1000 (a missing
bind source is auto-created as root).

**Telemetry.** The host run already exports `heartwood.agent.run` + LM/tool spans to SigNoz via
`telemetry.host-otlp-endpoint`. The asset adds a `heartwood.session_wiki` span (exit code, status, cost,
run id) in the pipeline's `astra.pipeline` service; a non-zero result logs at ERROR → the SigNoz
`astra error/fatal logs` rule pages Discord (Class A). The host service gets `OnFailure=astra-alert@%n`
(Class C) for runner crashes.

## Design sketch (for the spec)

1. **Sensor** `heartwood_sensor` over linguist transcripts → dynamic partitions `heartwood_sessions`, only
   `faerrin_session(date)` dates. First eval adopts (register all, no runs). Normal eval: run a new date
   unless the ledger shows it published.
2. **Asset** `session_wiki` (group `heartwood`, no retry policy — a paid 20-minute RLM must not run 4×,
   0035 precedent): write `artifacts/heartwood/requests/<date>.json` atomically, then poll for
   `<date>.result.json` (timeout ~3 h). Result exit 0 → materialize with metadata (cost, counts,
   commit); `already-published` → materialize, flagged; anything else → `dg.Failure` with the code's
   meaning, logged at ERROR.
3. **Host runner** `heartwood-request.{path,service}`: `PathExistsGlob` on `requests/*.json`; the oneshot
   service runs `just heartwood-requests`, which, oldest date first, for each request without a result:
   skips if the backfill lock exists, writes `already-published` if the ledger says so, else runs
   `just heartwood-agent <date>` and writes `{exit_code, run_dir, cost, commit}`; then archives the
   request. Serialized by being a oneshot unit.
4. **Shared git lock**: `flock artifacts/git-publish.lock` around `linguist-commit`'s commit/push/redeploy
   sections and heartwood's commit + `_heartwood-push-deploy`.
5. **Install**: `just heartwood-request-install` (mirrors `linguist-commit-timer-install`); the watchdog
   checks the path unit is active.

## Not in scope

Running the agent in-container (D3). Mouthpiece waiting for heartwood (D1). Changing the agent, its
model, or its budget. Auto-revert. Publishing incomplete runs (D2).

## Open questions

None — D1–D3 resolved with the stakeholder; the rest are verified above.
