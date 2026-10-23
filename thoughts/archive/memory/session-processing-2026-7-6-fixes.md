---
name: session-processing-2026-7-6-fixes
description: Two pipeline-publish bugs found processing the 2026-7-6 session — the run-as-1000 shibboleth chown gap and faerrin-decommission fallout in the linguist-commit timer's mouthpiece publish/seed
metadata:
  type: project
---

PROJECT 2026-07-07 **DONE + DEPLOYED + LIVE-VERIFIED** — the `2026-7-6` session transcribed
fine but stalled at linguist post-processing; two bugs, both a **prior infra change biting
recurring pipeline automation**. Fixed, re-ran the partition FROM_FAILURE, cascade completed
(chronicle + mouthpiece render), episode live on `mouthpiece.iridi.cc` (SSR HTML + 206 Range
through the edge).

**Bug 1 — `session_transcripts` `PermissionError` on `shibboleth.json` (`5cff55f`).** The
linguist `session_transcripts` op writes `APP_ROOT/shibboleth.json` — the **one linguist write
target NOT under a bind-mounted subdir** (`data/`, `transcripts/`, `script/`, `timeline/` are
mounted host-owned/uid-1000; the package root is a baked image layer owned by **root**). After
the [[deploy-artifacts-run-as-user]] cutover (2026-06-30, `dagster-code` root→`user:"1000:1000"`)
uid 1000 could no longer create the file → `EACCES` → whole `scribe_output_sensor` run FAILED →
chronicle/mouthpiece blocked. **THE fix: `chown 1000:1000 /repo/apps/linguist` in
`dagster/Dockerfile`** (the Dockerfile comment had wrongly asserted "editable /repo sources stay
root-owned... runtime is read-only there" — false for linguist). **Generalizable gotcha: any
pipeline op that writes into a package root (vs a mounted data subdir) fails silently-until-run
under run-as-1000 — chown that dir in the image.** shibboleth.json is untracked + written to the
container layer (NOT a bind mount, NOT git) BY DESIGN — mouthpiece-backend reads it in the same
container; NOT finding it on the host is correct.

**Bug 2 — `mouthpiece-publish` `FileNotFoundError` on the deleted faerrin path (`f4d999a`).**
`just linguist-commit` → `mouthpiece-publish` still ran the **one-time faerrin back-catalog
import** (`python -m astra_mouthpiece.migrate`) before `publish`, and `mouthpiece-seed` mounted
the same path — both hard-referenced `/ruby/data/experiments/faerrin/pkg/caster/out`, **deleted
with faerrin 2026-07-04** (see [[astra-migration-research]]). First new-episode publish since the
deletion → migrate crashed → `mouthpiece-publish` failed → **episode-catalog snapshot never
refreshed → new episode never reached the frontend** (akasha half of linguist-commit had already
succeeded; the failure is silently non-fatal to the linguist push). **THE fix:** `migrate.py`
**`main()`** skips with a message when the source dir is absent (historical eps already in the
live corpus; `episodes/` is a runtime bind-mount, only `.gitkeep` tracked) — but **`migrate_history`
still RAISES on a missing source** so a genuinely-misconfigured explicit path stays loud and its
`test_migrate.py::...FileNotFoundError` guard is unaffected; `mouthpiece-seed` only mounts `/hist`
when the source exists (else Docker recreates the deleted path as an empty root-owned dir).
**Watch for other deleted-faerrin-path references in recurring jobs** — the migration is COMPLETE,
faerrin is gone, but vestigial one-time-import calls linger in the timer path.

**Ops mechanics that worked:** Dagster GraphQL at `localhost:10350/graphql` — `runsOrError`
filtered by `dagster/partition` tag; `launchRunReexecution(reexecutionParams: {parentRunId,
strategy: FROM_FAILURE})` re-ran only the failed step + downstream. **Stop
`linguist-commit.timer` during the whole manual deploy/re-run window** (it auto-commits AND
`docker compose up --build`s akasha/mouthpiece frontends — a redeploy mid-render would recreate
containers; it does NOT touch `dagster-code` so an in-flight mouthpiece run survives ITS redeploy,
but keep it down anyway to avoid staged-file races — the [[pipeline-reorder-0021]] timer gotcha).
Re-ran `just linguist-commit` directly to publish immediately rather than wait for the tick, then
re-armed the timer. Builds on [[deploy-artifacts-run-as-user]] + [[pipeline-live-run-gotchas]] +
[[astra-migration-research]] + [[deploy-sops-injection]].
