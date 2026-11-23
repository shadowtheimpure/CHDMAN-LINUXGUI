#!/usr/bin/env bash
# Rebuild the bundled, distro-agnostic chdman engine (binary + libraries).
#
# The build runs inside an Ubuntu 22.04 container so the result is linked
# against glibc 2.35 and only needs glibc 2.34 symbols. Everything else
# (SDL3, libstdc++, libgcc) is bundled next to it. Requires podman.
#
#   ./scripts/build-engine.sh
#   MAME_VERSION=0.289 SDL_VERSION=3.4.18 ./scripts/build-engine.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

podman run --rm \
  -v "$ROOT/scripts/engine-build.sh:/build.sh:ro,z" \
  -v "$OUT:/out:z" \
  -e MAME_VERSION="${MAME_VERSION:-0.289}" \
  -e SDL_VERSION="${SDL_VERSION:-3.4.18}" \
  -e GCC_VERSION="${GCC_VERSION:-12}" \
  ubuntu:22.04 bash /build.sh

echo "==> installing into vendor/chdman"
rm -rf "$ROOT/vendor/chdman/bin" "$ROOT/vendor/chdman/lib"
mkdir -p "$ROOT/vendor/chdman/bin" "$ROOT/vendor/chdman/lib"
cp -a "$OUT/bin/." "$ROOT/vendor/chdman/bin/"
cp -a "$OUT/lib/." "$ROOT/vendor/chdman/lib/"

echo "==> done"
ls -l "$ROOT/vendor/chdman/bin" "$ROOT/vendor/chdman/lib"
