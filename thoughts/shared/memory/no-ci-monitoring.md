---
name: no-ci-monitoring
description: after pushing astra to origin/main, don't watch the GHA CI run to completion — confirm the push + a single status check is enough
metadata:
  type: feedback
---

After pushing to `origin/main`, **do not poll the GitHub Actions CI run to completion** (no
watch-loops). Confirm the push landed (`HEAD == origin/main`) and note which workflow triggered
(`ci.yml`); **one** quick `gh run list` status check is fine, but don't sit on it.

**Why:** watching CI to completion burns turns for no gain — the run either passes or it doesn't, and
the user will say so. **How to apply:** reproduce all CI lanes **locally** before pushing (that's what
actually catches failures — e.g. the host-only-`sops` skip in [[astra-migration-research]] gotcha 7);
trust the green local run, push, confirm sync, optionally glance at the run once, and move on.
