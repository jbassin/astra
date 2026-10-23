# 0002. weal-bot is written in TypeScript

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision B)

## Context

The dice bot was a Rust program in the predecessor repo. astra standardizes on Python and TypeScript.

## Decision

weal-bot is a TypeScript service. A roller parity harness proved the port before the Rust bot was deleted.

## Consequences

The bot shares the TypeScript service toolchain. The weal v2 engine later added Rust back, confined to one crate ([0010](0010-rust-confined-to-weal-engine.md)).
