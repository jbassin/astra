---
name: live-infra-changes-authorized
description: FEEDBACK — Josh gave standing approval for routine live infra/deploy changes; flag each in one line, don't ask
metadata:
  type: feedback
---

On 2026-10-22, after I listed five live steps for approval, Josh wrote: "Go on all. You generally
have my permission to make these changes and changes like these, you don't need to ask for each
one."

**Why:** asking per step stalls work on decisions he has already made.

**How to apply:** for routine live infrastructure work that carries out an agreed plan (`just
deploy`, edge edits plus `just caddy-reload`, installing or removing systemd units, image rebuilds,
pruning dangling images and build cache, pushing green commits), state the step in one line as you
run it and proceed. Money and published content still follow [[flag-paid-live-actions]].
Irreversible data loss (dropping a volume or database, `prune -a` on the shared daemon) needs an
explicit yes. The auto-mode classifier blocks subagents from deploying; run live steps from the
main session.
