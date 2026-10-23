---
name: heartwood-dagster-0036
description: heartwood runs automatically per session via Dagster (0036) — host-run agent, request/result files, git-publish lock; gotchas
metadata:
  type: project
---

PROJECT 2026-10-22: heartwood is LIVE in the pipeline (spec `thoughts/archive/specs/0036-heartwood-dagster-spec.md`,
`3ea28180`/`1e79425a`/`9b4fb1e5`). New faerrin transcript → `heartwood_sensor` → `session_wiki` files
`/ruby/data/astra-state/heartwood/requests/<date>.request.json` (config heartwood.requests-path) → host
`heartwood-request.{path,timer}` (linked from and run in the deploy checkout `/ruby/data/astra-deploy`
since 0037 item 2c) → `just heartwood-requests` (`drain-requests`) runs the unchanged `just heartwood-agent <date>` → `<date>.result.json`
→ the asset materializes or fails + pages. Parallel with mouthpiece (no gate); incomplete runs are held + paged.
Gates A–D passed (free proof: re-request of published 2026-10-19 → `already-published`). **Gate E pending: the
next faerrin session should publish with no command** — check the commit, ledger line, `session_wiki` outcome.

**Why:** the wiki was two sessions stale on 2026-10-21 because heartwood only ran by hand.
**How to apply:** to redo a session, `just heartwood-revert <date>` first — re-materializing a published date
is a no-op (`already-published`). Exit 8/9 = committed but not pushed / not redeployed → `just _heartwood-push-deploy`.

Gotchas:
- The agent CAN'T run in dagster-code: `write_page` shells out to node (vellum validator) and the diff step to
  git; the image has neither. Host-run + request files is the design (0036 D3).
- The systemd user manager's PATH has no node (nvm only), uv or just. The runner resolves all six tools
  (preflight, prints `preflight ok: …` to the journal) and the recipes resolve node from nvm themselves. Missing
  node would have exited 7 AFTER publish-sync (dirty corpus → every later run exit 6).
- `/ruby/data/astra-state/locks/git-publish.lock` (justfile `git_publish_lock`, flock fd 9): linguist-commit's whole body, heartwood-agent from publish-sync
  through redeploy (exit 10 if busy 30 min), heartwood-revert from before `git revert`. Never take it inside
  `_heartwood-push-deploy` (child flock on a fresh fd = deadlock).
- A `.path` unit has no next-elapse — the watchdog's `check_timer` would call it "not armed"; `.path` units use
  `check_path_unit`. alert-notify.sh runs from the deploy checkout, so an edit to its watched list goes live
  on the first 15-min tick after the next deploy — install new units before that deploy.
- The runner and recipes run in the deploy checkout, which has no venv or node_modules of its own making:
  deploy.sh `sync_host_tooling` (`uv sync --frozen` + `pnpm install --frozen-lockfile --filter
  @astra/vellum-lang`) keeps them current after each checkout (exit 9 if it fails); `deploy.sh
  --host-tooling` runs only that. The vellum validator needs only vellum-lang's deps.
- `session_wiki` holds a Dagster run slot while it waits → `max_concurrent_runs` 3 + tag limit
  `astra/heartwood`=1. Don't `just up` while one waits (the request survives and still publishes; the run fails).
- Since 0037 item 2b every heartwood/linguist-commit git call runs in the astra-data clone (content,
  snapshot, ledger, entity.kdl live there); the code repo is never touched. `_astra-data-push` fetches,
  rebases onto a moved origin (aborts a conflicting rebase, exit 8), pushes. A failed push still
  redeploys (deploy bakes the clone's HEAD), then exits 8. `heartwood-revert` can't revert a session
  published before the astra-data snapshot commit (no commit there; exit 4).
- Automated runs' `cost_usd` counts against `backfill-budget-usd` (budget-check sums the whole ledger).
