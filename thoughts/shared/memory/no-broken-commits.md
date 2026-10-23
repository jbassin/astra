---
name: no-broken-commits
description: Never commit or push code that fails CI; prefer gates that block a bad change over alerts that report it afterwards.
metadata:
  type: feedback
---

Get every lane you touched green locally before you commit or push. Never land red code on `main`
and rely on a notification to catch it.

**Why:** In the 0037 review (2026-10-22) Josh rejected a "post CI failures to Discord" fix: "I don't
want a discord post, I want you to not commit broken stuff." CI had been red for ten weeks while
agents kept committing on top of it ([ADR 0012](../../../docs/adr/0012-block-red-not-alert.md)).

**How to apply:** run `just ci` (the pre-push hook runs it too) or at least the touched lanes'
recipes before each commit; GitHub then refuses to merge a pull request without `ci-ok`. If `main`
is already red, fix it before new work. When designing a safeguard, choose one that blocks
(required checks, hooks) over one that reports. See also [[no-ci-monitoring]].
