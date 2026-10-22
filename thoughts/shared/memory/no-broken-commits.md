---
name: no-broken-commits
description: Never commit or push code that fails CI; prefer gates that block a bad change over alerts that report it afterwards.
metadata:
  type: feedback
---

Run the checks CI runs for every lane you touched, and get them green, before you commit or push.
Never land red code on `main` and rely on a notification to catch it.

**Why:** On the 0037 tech-debt review (2026-10-22), Josh rejected a "post CI failures to Discord"
fix: "I don't want a discord post, I want you to not commit broken stuff." CI had been red for ten
weeks while agents kept committing on top of it.

**How to apply:** Reproduce the CI lanes locally (`just ci` once it exists; until then the commands
in `CLAUDE.md`) before each commit. If `main` is already red, fix it before starting new work. When
designing safeguards, choose ones that block a bad change (required checks, hooks) over ones that
report it later. This complements [[no-ci-monitoring]], which still means: don't poll the GitHub run.
