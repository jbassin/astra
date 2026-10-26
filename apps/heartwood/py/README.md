# heartwood-backend — the agent that keeps the akasha wiki current

heartwood runs one dspy.RLM agent per faerrin-world session. The agent reads the session
transcript, browses the wiki and earlier transcripts through host-side tools, edits the akasha
wiki in a staging copy, and publishes with no human review. Models come from
`heartwood.model` and `heartwood.sub-model` (DeepSeek V4.1 Flash via OpenRouter; about $0.30
to $0.65 per session).

The agent runs on the host, not in Dagster: `write_page` calls node (the vellum validator) and
the publish step calls git, and the Dagster image has neither. The flow:

1. `heartwood_automation` sees a faerrin session whose `session_transcripts` got a new
   materialization and whose wiki was never tried; `session_wiki` writes
   `/ruby/data/astra-state/heartwood/requests/<date>.request.json` (`heartwood.requests-path`)
   and waits up to `heartwood.request-timeout-minutes` (180).
2. `heartwood-request.path` (plus an hourly timer) runs `just heartwood-requests` in the deploy
   checkout, which runs `just heartwood-agent <date>` for each pending request.
3. The agent commits content, snapshot, ledger (`heartwood/agent-runs.jsonl`) and
   `entity/entity.kdl` in the astra-data clone, pushes, and redeploys akasha-frontend.
4. The runner writes `<date>.result.json`; `session_wiki` succeeds, or fails and pages.

Per-run artifacts (`diff.patch`, `summary.json`) land in
`/ruby/data/astra-state/heartwood/<date>/<run-id>/`. heartwood runs in parallel with
mouthpiece; neither waits for the other.

## Operations

Run manual commands from the deploy checkout. The dev tree would run dev code against live
data, so `heartwood-agent` and `heartwood-revert` refuse (exit 64) anywhere else and print the
line below to run instead.

```sh
just -f /ruby/data/astra-deploy/justfile heartwood-agent <date>            # PAID + LIVE
just -f /ruby/data/astra-deploy/justfile heartwood-agent <date> --dry-run  # artifacts only
just -f /ruby/data/astra-deploy/justfile heartwood-revert <date>           # LIVE
```

Each asks before it starts (type y); `--yes` skips the question, and with no terminal and no
`--yes` they exit 64. The request runner passes `--yes`. The recipes are thin wrappers over the
astra-ops CLI; the steps, lock order and exit codes are in `libs/py/ops/src/astra_ops/heartwood.py`.

- **Redo a published session:** `heartwood-revert <date>` first. Re-requesting a published
  date is a no-op that reports `already-published`. `heartwood-revert` cannot undo a session
  published before the astra-data clone's first (snapshot) commit; it exits 4, so undo those
  by hand.
- **Failed or incomplete run** (exit 1, or 2 when the iteration cap is hit): nothing was
  published, and the asset failed and paged. Fix the cause, then re-execute the
  `session_wiki` run in Dagster or run `heartwood-agent <date>`.
- **Exit 7** (validate, snapshot or registry seed failed): the log prints the corpus restore
  command.
- **Exit 8 or 9** (committed and in the ledger, but not pushed or not redeployed): run
  `just _heartwood-push-deploy`. Do not re-request the date; it would report
  `already-published`.
- **Exit 6:** the clone has uncommitted wiki, ledger or registry changes, or is not on `main`.
  **Exit 10:** the git-publish lock was busy for 30 minutes; nothing was written.
- **Backfill** of pending sessions, detached and budget-capped: `just heartwood-backfill
  [from]`. It asks first (PAID + LIVE; `--yes` skips the question). It stops linguist-commit
  while it runs and the request runner leaves requests pending. Stop it with
  `systemctl --user stop heartwood-backfill`; after a hard kill run
  `just heartwood-backfill-reset`. The budget check sums the whole ledger, including
  automated runs, against `heartwood.backfill-budget-usd`. Steps and exit codes:
  `libs/py/ops/src/astra_ops/backfill.py`.
- **Install the request units:** `just units-install heartwood-request`. The runner recipe
  `just heartwood-requests` asks first; `heartwood-request.service` passes `--yes`. Warm the
  sandbox after a Deno or Pyodide change: `just heartwood-sandbox-warm`.

## Traps

- **The systemd user PATH has no node (nvm only), uv or just.** The runner resolves each tool
  (`preflight ok: …` in the journal) and the recipes find node under `~/.nvm`. Never call bare
  `uv` from a unit.
- **One git publisher at a time.** `/ruby/data/astra-state/locks/git-publish.lock` is held by
  linguist-commit, by `heartwood-agent` from publish-sync through redeploy, and by
  `heartwood-revert`. Never take it inside `_heartwood-push-deploy` or `_astra-data-push` (in
  astra-ops, `push_deploy` and `astra_data_push`): a nested `flock` on a fresh fd deadlocks.
- **Deploying Dagster while `session_wiki` waits** fails that run, but the request survives
  and still publishes.
- **The deploy checkout needs host tooling.** deploy.sh `sync_host_tooling` runs
  `uv sync --frozen` and installs vellum-lang's node deps after each checkout (exit 9 if it
  fails); `deploy.sh --host-tooling` runs only that step.
- **Deno sandbox:** dspy launches bare `deno`, so the recipes put `~/.deno/bin` on PATH.
  `prepare_sandbox_env` sets `DENO_NO_PACKAGE_JSON=1` (the repo's `package.json` hides
  `npm:pyodide`) and a resolved `DENO_DIR` (`$HOME` is a symlink).
- **dspy re-injects input variables before every code block.** Never pass mutable state, such
  as a page list, as an input.
- **dspy callbacks never see cost.** `MeteredLM` reads cost from the litellm response
  (OpenRouter `usage`). `llm_query_batched` runs on a bare thread pool that drops contextvars,
  so LM spans are parented to the run span explicitly.
- **Host telemetry** goes to `telemetry.host-otlp-endpoint` (`http://localhost:10353`); the
  in-cluster collector name does not resolve on the host.
- **The watchdog checks `.path` units with `check_path_unit`.** A `.path` unit has no next
  elapse time, so `check_timer` would report it as not armed.
- **Common-word aliases.** Pages named with ordinary words (the Ashen Pact deities `War`,
  `Giant`, `Herald`, `Pyre`, `Regent`, `Esoterica`) give the entity registry aliases such as
  `war` and `giant`, so `resolve()` can link ordinary words to them.
