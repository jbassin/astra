---
name: live-infra-changes-authorized
description: FEEDBACK — Josh gave standing approval for routine live infra/deploy changes (teardowns, just up, timer installs, image rebuild + prune, pushes); flag in one line, don't ask
metadata:
  type: feedback
---

On 2026-10-22 (0037 Phase 0), after I listed five live steps for approval (scriptorium teardown,
`just up` redeploys, a backup timer install, a Dagster rebuild + prune, a push to `main`), Josh
wrote: "Go on all. You generally have my permission to make these changes and changes like these,
you don't need to ask for each one." He then asked for this approval to be recorded permanently.

**Why:** asking per step stalls the work on decisions he has already made in review; he wants the
work to move.

**How to apply:** for routine live infrastructure work that implements an agreed plan — deploys
with `just up`, edge edits plus `just caddy-reload`, installing or removing systemd units, image
rebuilds and dangling/build-cache prunes, pushing green commits — state the step in one line as you
run it and proceed without asking. This does not cover spending real money or replacing published
content (TTS re-renders, episode or snapshot replacement): those still follow
[[flag-paid-live-actions]]. Irreversible data loss (dropping volumes or databases, `prune -a` on
the shared daemon) still needs an explicit ask. The auto-mode classifier blocks a subagent from
doing live edge or deploy work; run those steps from the orchestrator loop.
