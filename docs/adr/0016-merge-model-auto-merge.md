# 0016. Changes merge through branches with auto-merge behind ci-ok

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-23)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

Trunk-based direct pushes let red commits reach `main`. Branch protection was impossible while bots pushed to `main`; since astra-data ([0035](0035-astra-data-repo.md)) no bot does.

## Decision

Work lands on short-lived branches merged with `gh pr merge --auto`, and `main` requires the `ci-ok` check.

Built 2026-10-23 as the repository ruleset `main` (id 25760339): a pull request is required (no
approvals), `ci-ok` must pass, branches need not be current with `main`, rebase is the only merge
method, and force pushes and deletion are blocked. The admin role may bypass only by merging a pull
request, never by a direct push. Auto-merge and delete-branch-on-merge are on.

## Consequences

Nobody, including an agent using Josh's token, can push red code straight to `main`. Each merge
waits for CI. Because branches need not be current, two pull requests that pass alone can break
together; the `main` run after each merge catches that. Rebase merges give each commit a new SHA,
so local branches are deleted with `git branch -D` after a merge.
