# Now

Updated 2026-10-23.

## In flight

- **Tech-debt paydown 0037: Phase 2 is done** apart from slices that wait on Josh or heartwood
  gate E; **Phase 3 has started** (p3-0 is live). The status lines and checklist are section 0.1
  of [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md).

## Next action

Phase 3: per-area comment sweeps (remove the existing decision IDs that `just no-decision-ids
--all` counts), behaviour-named tests, per-domain READMEs and `CLAUDE.md` files, dead code, the
frontend items (fe-c and fe-d keep today's look) and the CI ratchets. Calls parked for Josh are
under "Paydown decisions (Josh)" in the backlog; steps only he can do are under "Smaller calls".

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
