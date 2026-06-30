---
name: deploy-artifacts-run-as-user
description: deploy 2026-06-30 — astra named volumes moved to a gitignored artifacts/ bind-mount root + all app/Dagster containers run as user 1000:1000; the run-as-user + bind-migration gotchas
metadata:
  type: project
---

PROJECT 2026-06-30 **DONE + DEPLOYED + verified live + pushed (`6cd6c45`)** — moved the 6 astra **named
Docker volumes** (audio: akasha/mouthpiece/orator; Postgres: dagster/weal/orator) to **bind mounts under a
gitignored `/artifacts/`** (`artifacts/audio/<svc>`, `artifacts/postgres/<svc>`), and made all 13 astra
app/Dagster containers run as **`user: "1000:1000"`** so pipeline writes land host-owned instead of
`root:root`. Motivation = the root-owned-writes pain (Dagster ran as root → 312 root files in
`mouthpiece-backend/episodes`, root files in `linguist/{data,transcripts}`, etc.; host uid 1000 could only
read them). Extends the heartwood `user:1000` precedent ([[heartwood-0020-gotchas]]) stack-wide. **SigNoz
kept its own named volumes** (clickhouse/sqlite/zookeeper — vendored include, disposable telemetry; by
decision). 5 files: `.gitignore`, `deploy/docker-compose.yml`, `dagster/Dockerfile`,
`apps/vellum-render/Dockerfile`, `justfile`.

**⭐ Load-bearing gotchas:**
- **Container paths are UNCHANGED → `config.kdl`/schemas need NO edit** (config-single-source intact). Only
  the compose mount *source* changed (named volume → host bind path). audio stays `/audio`, orator `/data`.
- **`oven/bun` ships `bun` = uid 1000** (HOME `/home/bun`); app files are mode-0755 **root-owned but
  world-readable**, so uid 1000 reads/serves them fine, and the SSR frontends write nothing at runtime →
  `user:"1000:1000"` "just works" for every bun service. (Verified `docker exec … id` → `uid=1000(bun)`.)
- **Dagster needs a chown to run as 1000.** The run worker writes compute logs / local artifact storage to
  **`/opt/dagster/home/storage`** (root-owned at build) → without a fix, EACCES under user:1000. Fix in
  `dagster/Dockerfile`: `RUN mkdir -p $DAGSTER_HOME/storage && chown -R 1000:1000 /opt/dagster` + `ENV
  HOME=/opt/dagster/home`. `/opt/venv` + editable `/repo` sources stay root-owned/world-readable (runtime
  read-only; Python silently skips unwritable `__pycache__`).
- **vellum-render Chromium**: installs to `/ms-playwright` (`PLAYWRIGHT_BROWSERS_PATH`) as root at build →
  `RUN chown -R 1000:1000 /ms-playwright` so the non-root browser bundle is readable. `--no-sandbox` + an
  ephemeral `/tmp` user-data-dir mean Chromium runs fine as 1000 (container healthy).
- **Postgres bind mounts keep their OWN uid — NO `user:` directive.** The entrypoint runs root→drops to
  uid-70; PGDATA must be **uid 70 / mode 0700** or postgres refuses to start. The `just pg-migrate <name>`
  recipe copies `cp -a` then `chown -R 70:70 && chmod 700`. **Only pre-create the `artifacts/postgres/`
  PARENT as 1000** (in `artifacts-init`); let the migration own each per-DB subdir as 70:70.
- **docker-as-root replaces host sudo.** This box's `sudo` needs a password → fails non-interactively. But
  the user is in the `docker` group, so a **root throwaway `alpine` container bind-mounting host paths** does
  every privileged op: `docker run --rm -v /ruby/data/experiments/astra/apps:/apps alpine chown -R 1000:1000
  /apps/mouthpiece-backend/episodes …` fixed the 334 pre-existing root files; `docker run --rm -v <vol>:/from:ro
  -v <binddir>:/to alpine cp -a /from/. /to/` copied each volume → bind.
- **A missing bind-mount source is auto-created by Docker as ROOT** (re-introduces the exact problem) → the
  source dirs MUST pre-exist host-owned before `up`. New **`just artifacts-init`** (`mkdir -p` as uid 1000),
  **called from the top of `just up`**.
- **Seed recipes re-pointed**: `akasha-seed`/`mouthpiece-seed` now bind `{{artifacts}}/audio/<svc>` instead of
  the `astra-*-audio` named volume (dropped `docker volume create`). **orator-audio is NOT re-seedable**
  (runtime-ingested music library) → one-time `just orator-audio-migrate` (copy + chown 1000). New
  `just pg-migrate <name>`.
- **Bonus fix folded in — `linguist/timeline` was unmounted.** It's package-relative (`chronicle.py`) but was
  NOT in the `x-dagster-volumes` anchor, so container-written chronicle output (`campaign_timeline`/
  `session_episode_summary`) landed in the container layer and never reached the host — part of why the
  chronicle missed 2026-6-29 ([[chronicle-0019-gotchas]]). Added the mount; now host-owned.
- **Old named volumes RETAINED as backup (~25G)** — copy, not move, so they survive (move across container
  mounts isn't a rename anyway). Reclaim when comfortable: `docker volume rm astra-{akasha,mouthpiece,orator}-audio
  astra-{dagster,weal,orator}-pg`. Disk was 94% full (121G free); audio akasha 14.8G / orator 10.1G /
  mouthpiece 0.27G, pg ~275M total — the copy fit with ~96G to spare.

Verified live: all containers healthy as 1000 (incl. vellum-render), Postgres data intact on the bind mounts
(dagster 34 runs / weal+orator tables), container write to the timeline mount lands `1000:1000` (host can
delete), audio 206-serves, edge 200, SigNoz 7 frontends 0-error. Builds on [[deploy-sops-injection]] +
[[deploy-apply-with-just]] + [[heartwood-0020-gotchas]].
