# 0032. One design-token source generates two themes

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-25)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

gothic and the parchment theme (codex, menhir) share token names with opposite meanings.

## Decision

One token source generates both themes and the pixi and GLSL palettes.

## Consequences

Theme changes happen in one place: `libs/ts/gothic/src/tokens/tokens.ts`, rendered by
`just tokens-gen` and checked by `just tokens-check`. The old token names survive as generated
aliases until every consumer uses the shared names (map in `libs/ts/gothic/README.md`).
