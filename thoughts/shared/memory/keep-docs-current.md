---
name: keep-docs-current
description: update docs/now.md and docs/backlog.md as each change lands, not only at wrap-up
metadata:
  type: feedback
---

Update `docs/now.md`, `docs/backlog.md` and, for a new trap, the app's README as soon as a change
merges, goes live, or a decision is made. Put the update in the same pull request as the change
when it fits; otherwise open a small docs pull request right after. Don't hold it all for the
wrap-up step.

**Why:** sessions sometimes end before the wrap-up runs, and then the record of what shipped, what
is live and what comes next is lost (Josh, 2026-10-28).

**How to apply:** after each merge, deploy, live render or settled decision, ask what `now.md`
("In flight", "Next action", "Blocked or waiting") and the backlog should say now, and write it
then. A long task keeps its plan checklist current the same way. The wrap-up in CLAUDE.md step 8
then only tidies; see [[no-broken-commits]] for gating the docs commit.
