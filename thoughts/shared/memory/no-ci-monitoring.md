---
name: no-ci-monitoring
description: after opening an astra pull request with auto-merge, don't watch CI; check the pull request once
metadata:
  type: feedback
---

After `gh pr merge --auto --rebase`, do not poll the CI run or the pull request until it merges.
Check it once with `gh pr checks` or `gh pr view`; then move on. GitHub merges it when `ci-ok`
passes.

**Why:** watching CI burns turns for no gain; the run passes or it doesn't, and Josh will say so.

**How to apply:** catch failures before the push with `just ci` ([[no-broken-commits]]), push,
open the pull request with auto-merge, check once. Before a deploy, confirm the merge landed
(`gh pr view --json state`), since `just deploy` builds only commits on `origin/main`.
