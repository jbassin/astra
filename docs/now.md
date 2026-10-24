# Now

Updated 2026-10-23.

## In flight

- **Tech-debt paydown 0037, Phase 2:** Waves 1 and 2 are done; Wave 3 is mostly done. The status
  line and checklist are section 0.1 of
  [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md).

## Next action

The rest of Wave 3 (pipe-5, cdx-4, asy-4, ops-8), then Wave 4. `main` merges only through pull
requests behind `ci-ok`; `just deploy` waits for health and prints the rollback command. A
`--sha` rollback pins the whole stack until `just deploy --sha origin/main`. Calls parked for
Josh are in the backlog under "Paydown decisions (Josh)"; steps only he can do are under
"Smaller calls" (the vellum.iridi.cc certificate renewal is urgent: it expires 2026-11-06).

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
