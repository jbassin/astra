---
name: no-ci-monitoring
description: after pushing astra, don't watch the GitHub Actions run to completion; confirm the push and check the run once
metadata:
  type: feedback
---

After a push, do not poll the GitHub Actions run until it finishes. Confirm the push landed
(`HEAD == origin/main`) and check the run once with `gh run list`; then move on.

**Why:** watching CI burns turns for no gain; the run passes or it doesn't, and Josh will say so.

**How to apply:** catch failures before the push with `just ci` ([[no-broken-commits]]), push,
confirm, glance once.
