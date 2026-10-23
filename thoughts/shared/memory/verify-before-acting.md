---
name: verify-before-acting
description: before acting, check what already exists (prior art, the skill or command docs, repo conventions); verify surprising results a second way
metadata:
  type: feedback
---

Before writing code, running a skill or choosing a workflow, find out what already exists instead of
acting on a default or an assumption.

- Look for prior art: the nearest already-built astra app or library usually has the helper,
  transform or pattern. Mirror it rather than writing a parallel one.
- Read a skill's or command's own docs before running it.
- When a convention is checkable in the repo (commit cadence, config single source, telemetry
  wiring), check it.
- Verify a surprising result ("identical", "missing", "0 rows") a second way before acting on it,
  for example `git diff` plus one Python process that reads and compares the bytes itself.

**Why:** reinvented helpers drift from the originals, skills run without reading them did the wrong
thing, and shell output once lied (the RTK hook, now removed). Acting before checking costs more
trust than slow work.

**How to apply:** cite what you found. Default to verify, not guess. Related:
[[config-single-source]], [[telemetry-built-in]].
