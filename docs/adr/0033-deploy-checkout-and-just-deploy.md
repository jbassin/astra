# 0033. Production builds from a deploy checkout with one deploy command

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 1 item 1)

## Context

Production built from the shared developer tree, so other agents' half-finished edits shipped and nobody could say which commit was live.

## Decision

`/ruby/data/astra-deploy` is a plain clone used only for deploys. `just deploy [--sha REV] [service...]` (`deploy/deploy.sh`; `just up` is an alias) takes a lock, refuses an unpushed target or a dirty checkout, decrypts SOPS, labels every image with the commit, and logs each attempt under the data root. Every host unit runs from this checkout.

## Consequences

Push before deploying. A redeploy by a bot moves the checkout back to `origin/main`, which partly undoes a `--sha` rollback.
