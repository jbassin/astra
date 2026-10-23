# 0041. Accepted risk: secrets are not rotated after appearing in chat

- **Date:** 2026-10-22
- **Status:** Accepted risk
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, act-now #6 dropped)

## Context

Several keys have passed through chat transcripts, and no secret has been rotated.

## Decision

Josh: "Don't care." No rotation programme.

## Consequences

Do not re-flag leaked-in-chat keys. Rotate a key only after a real incident.
