# 0016. Changes merge through branches with auto-merge behind ci-ok

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

Trunk-based direct pushes let red commits reach `main`. Branch protection was impossible while bots pushed to `main`; since astra-data ([0035](0035-astra-data-repo.md)) no bot does.

## Decision

Work lands on short-lived branches merged with `gh pr merge --auto`, and `main` requires the `ci-ok` check.

## Consequences

Until it is switched on, only green commits may sit unpushed on `main`.
