# 0010. Rust is confined to the weal engine, shipped as committed wasm

- **Date:** 2026-08-08
- **Status:** Accepted; the no-CI-lane clause is superseded by 0027
- **Source:** [0032-weal-v2-spec.md](../../thoughts/archive/specs/0032-weal-v2-spec.md)

## Context

weal v2 needed an exact-distribution dice engine; the reference implementation pattern and the performance needs pointed to Rust.

## Decision

`libs/rust/weal-engine` is the only Rust in the repo. `just weal-engine-build` compiles it to wasm with pinned tools, and the output is committed under `libs/ts/weal-engine/gen/`, which the pnpm workspace consumes. No app runs cargo.

## Consequences

cargo is needed only when the engine changes. A CI lane for the crate is planned ([0027](0027-rust-ci-lane.md)); until then the local gate is `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`.
