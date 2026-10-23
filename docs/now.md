# Now

Updated 2026-10-23.

## In flight

- **Tech-debt paydown 0037, Phase 1 is done** with item 5 (this docs skeleton). Phases 0 and 1 are
  live. The plan and its checklist are section 0.1 of
  [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md).

## Next action

Start **Phase 2** (section 5 of the paydown plan): structural refactors as parallel worktree tracks
(repo, libraries, kits, pipeline, codex, assay, services, weal, ops). The repo layout move
([ADR 0015](adr/0015-repo-layout-by-domain.md)) is first in the repo track; land it alone before
the other tracks start, because it moves nearly every path. `main` now takes changes only through
pull requests with auto-merge ([ADR 0016](adr/0016-merge-model-auto-merge.md)).

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
