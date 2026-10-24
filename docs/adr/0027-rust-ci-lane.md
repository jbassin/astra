# 0027. Rust gets a path-filtered CI lane and a source-hash check

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table; section 6 item 5)

## Context

The weal engine has no CI lane; its gate is a local command recorded per change.

## Decision

Add a path-filtered Rust lane (fmt, clippy, test) and a cheap check that the committed wasm matches the crate's source hash. Rust stays confined to the one crate.

## Consequences

Reverses the "no Rust CI lane" part of [0010](0010-rust-confined-to-weal-engine.md).

Built as two CI jobs with `just` recipes of the same names, both in `just ci`:
`weal-engine-rust` (path-filtered on `libs/rust/**` and `libs/ts/weal-engine/gen/**`) and
`weal-engine-hash-check` (unfiltered; also in `just check`). The hash check compares
`libs/ts/weal-engine/gen/SOURCE_SHA256`, written by `just weal-engine-build`, with the sources, so
it needs no Rust toolchain. CI does not rebuild the wasm and diff it; the build is
machine-independent now (path remapping), so that layer can be added later if the stamp proves
too weak.
