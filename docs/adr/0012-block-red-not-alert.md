# 0012. Bad changes are blocked, not reported

- **Date:** 2026-10-22
- **Status:** Accepted
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0)

## Context

CI was red for ten weeks while work continued on top of it. A Discord notification for red CI was proposed.

## Decision

Josh: "I don't want a discord post, I want you to not commit broken stuff." The pre-commit hook gates format and lint on staged files, the pre-push hook runs `just ci`, and `main` will require the `ci-ok` check through pull requests ([0016](0016-merge-model-auto-merge.md)).

## Consequences

Every commit and push runs the touched lanes locally first. There is no red-CI notifier.
