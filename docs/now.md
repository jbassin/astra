# Now

Updated 2026-10-23.

## In flight

- **Tech-debt paydown 0037, Phase 2 is under way** (repo-1 live). Phases 0 and 1 are
  live. The plan and its checklist are section 0.1 of
  [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md).

## Next action

**Phase 2, Wave 1** of the slice checklist in section 0.1 of the paydown plan. The layout move
(repo-1, [ADR 0015](adr/0015-repo-layout-by-domain.md)) is live; apps sit at
`apps/<domain>/<role>/`. `main` takes changes only through pull requests with auto-merge
([ADR 0016](adr/0016-merge-model-auto-merge.md)). Calls parked for Josh are in the backlog under
"Paydown decisions (Josh)".

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
