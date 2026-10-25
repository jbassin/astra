# Now

Updated 2026-10-25.

## In flight

- **Tech-debt paydown 0037, Phase 3.** The comment sweeps, READMEs, tests-by-behaviour, dead-code
  pass and four frontend fixes have landed (status line 2026-10-25 in section 0.1 of
  [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md)).
  Agents are building fe-c (akasha SPA navigation, ADR 0031), fe-d (one design-token source,
  ADR 0032) and p3-ratchet (CI fails when a debt count rises).

## Next action

Merge fe-c, fe-d and p3-ratchet, then deploy the frontends. Then the remaining agent items: the
stale comments listed in the backlog, immutable assets for the four non-site-kit servers, and the
site-kit dark-mode leftovers. Calls parked for Josh are under "Paydown decisions (Josh)" in the
backlog; steps only he can do are under "Smaller calls".

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
