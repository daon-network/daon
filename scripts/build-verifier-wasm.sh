#!/usr/bin/env bash
# Build the wasm verifier reproducibly.
#
# Paths are remapped so a rebuild on the same platform is byte-identical.
#
# Byte-identity *across* platforms turned out not to be achievable: an
# aarch64-darwin host and an x86_64-linux host emit different wasm from the same
# pinned compiler and the same remapped paths. So the committed artifact is
# tracked by the hash of its *inputs* rather than of its output -- see
# SOURCE.sha256 beside it. That catches the risk that actually exists, which is
# somebody editing the verifier and forgetting to rebuild, without pretending to
# a reproducibility this toolchain does not deliver.
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

# Everything the artifact is built from. If any of it changes, the committed
# wasm is stale whatever its own bytes look like.
source_hash() {
    ( cd "$here" && \
      find provenance/core/src provenance/verify/src provenance/verify-wasm/src \
           -type f -name '*.rs' -print0 | sort -z | xargs -0 cat
      cat provenance/Cargo.lock provenance/rust-toolchain.toml \
          provenance/verify-wasm/Cargo.toml
    ) | { shasum -a 256 2>/dev/null || sha256sum; } | cut -d' ' -f1
}

if [ "${1:-}" = "--install" ]; then
    cp "$built" "$here/api-server/src/verifier/"
    source_hash > "$here/api-server/src/verifier/SOURCE.sha256"
    echo "  installed into api-server/src/verifier/"
    echo "  source hash $(cat "$here/api-server/src/verifier/SOURCE.sha256")"
elif [ "${1:-}" = "--check" ]; then
    want=$(source_hash)
    have=$(cat "$here/api-server/src/verifier/SOURCE.sha256" 2>/dev/null || echo missing)
    if [ "$want" != "$have" ]; then
        echo "::error::the committed wasm was built from different source"
        echo "  expected $want"
        echo "  recorded $have"
        echo "  rebuild with: ./scripts/build-verifier-wasm.sh --install"
        exit 1
    fi
    echo "  committed wasm matches the current source"
fi
