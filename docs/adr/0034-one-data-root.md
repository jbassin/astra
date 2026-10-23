# 0034. All runtime data lives under /ruby/data/astra-state

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 1 item 2c)

## Context

Runtime data was spread across the developer tree, named volumes and package directories inside images.

## Decision

One data root, `/ruby/data/astra-state` (`config.kdl` `data.root`), with one flat directory per service. Config resolves every data path against it, and bind mounts use identical host and container paths. No container mounts a code checkout.

## Consequences

Moving data means changing config and the compose mounts together. The nightly backup covers every top-level directory of the root.
