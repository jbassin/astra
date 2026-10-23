# 0025. weal roll history is an archive, written after the reply

- **Date:** 2026-10-22
- **Status:** Accepted, not yet built
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

weal records every roll in Postgres before replying, so a database problem silences the bot, and nothing reads the history.

## Decision

Keep the history as an archive and write it after the reply.

## Consequences

A database outage no longer blocks rolls.
