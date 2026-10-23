---
name: deploy-apply-with-just
description: production builds ONLY from the deploy checkout /ruby/data/astra-deploy at a pushed sha via `just deploy` (`just up` = alias); push first, then deploy + `just caddy-reload` — local edits are never live
metadata:
  type: feedback
---

Since 2026-10-22 (0037 Phase 1 item 1) production never builds from a developer tree.

- **`just deploy [--sha REV] [service...]`** (`deploy/deploy.sh`; `just up` is an alias) takes
  a lock, fetches, checks out `origin/main` (or a pushed `--sha`) in the deploy checkout
  `/ruby/data/astra-deploy` (a plain clone; never edit it — a dirty tree is refused, exit 5),
  decrypts SOPS with `~/.config/sops/age/keys.txt`, and runs `docker compose up -d --build`.
  An **unpushed commit cannot be deployed** (exit 4): push first. Every built image carries
  `org.opencontainers.image.revision`; `/ruby/data/astra-state/deploy/history.jsonl` logs every
  attempt and `/ruby/data/astra-state/deploy/live/<service>` holds the last sha. `just deploy --restart <svc>` restarts
  without building (codex-refresh uses it). `--dry-run` does the checks only.
- Any deploy, scoped or not, moves the checkout to the target, so the linguist-commit and
  heartwood redeploys (which deploy `origin/main`) partly undo a `--sha` rollback.
- **`just caddy-reload`** applies `sites.caddyfile` — the edge imports the DEPLOY checkout's copy
  (`/ruby/data/reverse-proxy/Caddyfile` line ~201), so an edge edit needs push → any `just deploy`
  (refreshes the checkout) → `just caddy-reload`.
- Every host unit (craig-sync, linguist-commit, heartwood-request, astra-watchdog, astra-alert@,
  astra-backup) is `systemctl --user link`ed from the deploy checkout and runs there (0037 item 2c):
  a deploy updates their scripts and recipes; a changed `.service`/`.timer`/`.path` needs its install
  recipe re-run. After each checkout deploy.sh syncs that checkout's host tooling for them (`uv sync
  --frozen`, `pnpm install --frozen-lockfile --filter @astra/vellum-lang`; exit 9 on failure). They
  run git only in the astra-data clone, never in this repo.
- All runtime data is under the data root `/ruby/data/astra-state` (config.kdl `data.root`; layout in
  its comment, dirs created by deploy.sh `init_artifacts`); nothing a deploy or unit uses lives in
  a code checkout. The dev tree's `artifacts/` is dev material only.
- akasha-frontend and mouthpiece-frontend bake the published datasets from the `astra-data` build
  context: deploy.sh exports the clone's (`/ruby/data/astra-state/astra-data`) committed HEAD, not
  its working tree and not a pushed sha (exit 8 if the clone is missing). `data_sha` in
  history.jsonl records which data commit a deploy baked.
- The first whole-stack deploy recreates SigNoz too (its included compose file's relative mounts
  resolve under the deploy checkout); its log count can read 0 for a while because astra logs
  are sparse — check traces to prove ingest.

**Why:** deploys from the shared working tree shipped other agents' half-finished edits and
nobody could say which commit was live (OPS-3). **How to apply:** "I changed deploy/edge/app
code" is done only after commit → push → `just deploy` (+ `just caddy-reload` for the edge) +
a verify curl / `docker inspect` revision label. When a compose service is deleted, also
`docker rm -f` its orphan (no `--remove-orphans`). config.kdl is baked — [[config-single-source]].
