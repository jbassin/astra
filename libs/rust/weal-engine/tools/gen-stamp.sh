#!/usr/bin/env bash
# The committed-wasm staleness stamp (ADR 0027): libs/ts/weal-engine/gen/SOURCE_SHA256 records
# the hash of every input that shapes the wasm, plus the sha256 of each gen/ file the build
# wrote. `check` recomputes both, so a Rust change committed without `just weal-engine-build`
# (or a gen/ edited by hand) fails without needing the Rust toolchain.
#
#   gen-stamp.sh write <stamp>   after a build (the weal-engine-build recipe runs this)
#   gen-stamp.sh check <stamp>   the weal-engine-hash-check recipe (just check, just ci, CI)
#
# <stamp> is the recipe's tool-pin string, hashed in so a pin bump also demands a rebuild.
# Inputs: src/**, fonts/**, Cargo.toml, Cargo.lock, .cargo/config.toml, rust-toolchain.toml.
# A new input file outside those (a build.rs, say) must be added here.
set -euo pipefail

mode="${1:?usage: gen-stamp.sh write|check <stamp>}"
stamp="${2:?usage: gen-stamp.sh write|check <stamp>}"

crate="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
gen="$crate/../../ts/weal-engine/gen"
file="$gen/SOURCE_SHA256"

source_hash() (
  cd "$crate"
  {
    printf 'stamp %s\n' "$stamp"
    find src fonts -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
    sha256sum Cargo.toml Cargo.lock .cargo/config.toml rust-toolchain.toml
  } | sha256sum | cut -d' ' -f1
)

# Every gen/ file except the stamp itself, as `sha256sum` lines relative to gen/.
gen_hashes() (
  cd "$gen"
  find . -maxdepth 1 -type f ! -name SOURCE_SHA256 -printf '%f\0' | LC_ALL=C sort -z |
    xargs -0 sha256sum
)

case "$mode" in
  write)
    {
      echo "# Written by \`just weal-engine-build\`; checked by \`just weal-engine-hash-check\`."
      echo "# Do not edit: rebuild instead."
      echo "source $(source_hash)"
      gen_hashes
    } > "$file"
    ;;
  check)
    [ -f "$file" ] || { echo "FATAL: $file missing; run just weal-engine-build" >&2; exit 1; }
    want="$(awk '$1 == "source" { print $2 }' "$file")"
    have="$(source_hash)"
    if [ "$want" != "$have" ]; then
      echo "FATAL: the committed wasm in libs/ts/weal-engine/gen is stale: the weal-engine" >&2
      echo "sources (or the recipe's tool pins) changed since it was built. Run" >&2
      echo "just weal-engine-build and commit gen/. (stamp $want, sources now $have)" >&2
      exit 1
    fi
    if ! diff <(grep -v -e '^#' -e '^source ' "$file") <(gen_hashes) >&2; then
      echo "FATAL: libs/ts/weal-engine/gen differs from what its last build wrote" >&2
      echo "(hand-edited, or rebuilt without restamping). Run just weal-engine-build." >&2
      exit 1
    fi
    echo "weal-engine gen/ is current (source $have)"
    ;;
  *)
    echo "usage: gen-stamp.sh write|check <stamp>" >&2
    exit 2
    ;;
esac
