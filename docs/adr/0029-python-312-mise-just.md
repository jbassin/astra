# 0029. Python 3.12, mise-pinned host tools, and one just entry point

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 1 item 3)

## Context

The dev venv ran Python 3.14 while production ran 3.12, host tools were installed by hand, and CI commands drifted from the documented ones.

## Decision

Python is 3.12 everywhere (`.python-version`). `mise.toml` pins the host tools. `just bootstrap`, `check`, `fix`, `test`, `ci` and `dev` are the entry points; each CI job runs the `just` recipe of the same name, and the pre-push hook runs `just ci`.

## Consequences

Upgrade Python deliberately, in one change across dev, CI and images.
