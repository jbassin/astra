# Now

Updated 2026-10-26.

## In flight

- **Tech-debt paydown 0037, Phase 3.** Every agent item has landed: the comment sweeps, READMEs,
  tests by behaviour, dead code, the frontend fixes, akasha SPA navigation (ADR 0031), one design-token
  source (ADR 0032), the debt ratchet, immutable assets for the four non-site-kit servers and the
  dark-mode script removal and the weal v1 `funcs` drop (status line 2026-10-26 in section 0.1 of
  [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md)).

## Next action

Phase 3 waits only on the calls under "Paydown decisions (Josh)" in the backlog; steps
only he can do are under "Smaller calls".

## Blocked or waiting

- **heartwood gate E:** the next real session must auto-publish its wiki edits through Dagster.
  Waits for a session.
- **Pipeline failure alert:** `pipeline_failure_alert` is running but has never fired on a real
  failure; check SigNoz after the next one.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review): waiting on
  Josh and the players; see the [backlog](backlog.md#stakeholder-gates).
