#!/usr/bin/env bash
# Build the wasm verifier reproducibly.
#
# rust-toolchain.toml says the verifier's value depends on a skeptic being able
# to rebuild it and get the same bytes. Pinning the compiler is necessary for
# that and not sufficient: rustc embeds absolute paths, so the same source built
# in /Volumes/... and /home/runner/... produces different binaries.
#
# So paths are remapped to fixed names before the build. Everyone -- this
# machine, CI, and anyone checking our work -- runs this script rather than
# cargo directly, because a flag someone forgets is a claim that quietly stops
# being true.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here/provenance"

export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
# Non-interactive shells may not have cargo on PATH.
export PATH="$CARGO_HOME/bin:$PATH"
export RUSTFLAGS="--remap-path-prefix=$here=/daon --remap-path-prefix=$CARGO_HOME=/cargo"

cargo build -p daon-provenance-verify-wasm \
    --target wasm32-unknown-unknown --release

built="target/wasm32-unknown-unknown/release/daon_provenance_verify_wasm.wasm"
sha=$(shasum -a 256 "$built" 2>/dev/null || sha256sum "$built")
echo "  ${sha%% *}  $built"

if [ "${1:-}" = "--install" ]; then
    cp "$built" "$here/api-server/src/verifier/"
    echo "  installed into api-server/src/verifier/"
fi
