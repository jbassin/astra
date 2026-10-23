# 0028. Replace vite-plus with pnpm -r and root vitest projects

- **Date:** 2026-10-22
- **Status:** Accepted, partly built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

`vp run -r` stopped at the first failing package and hid the rest.

## Decision

typecheck, test and build fan out with `pnpm -r --no-bail --aggregate-output`. Tests move to root vitest projects, and the `vite-plus` devDependency goes.

## Consequences

The fan-out is done; the vitest projects and the dependency removal are open.
