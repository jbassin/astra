# 0028. Replace vite-plus with pnpm -r and root vitest projects

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-24)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

`vp run -r` stopped at the first failing package and hid the rest.

## Decision

typecheck, test and build fan out with `pnpm -r --no-bail --aggregate-output`. Tests move to root vitest projects, and the `vite-plus` devDependency goes.

## Consequences

typecheck and build fan out with `pnpm -r`. Tests run in one process from the root
`vitest.config.ts`, whose projects are the workspace packages with a `test` script. `vite-plus` is
gone from the root devDependencies.
