# 0020. Delete the hidden codex assay block

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

codex carries about 1,000 lines for an assay block that has been hidden since July, plus a refresh step and a bind mount.

## Decision

Delete it.

## Consequences

codex loses the code path, the refresh step and the mount.
