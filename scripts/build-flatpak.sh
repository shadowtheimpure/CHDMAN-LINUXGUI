#!/usr/bin/env bash
# Build a single-file Flatpak bundle from the current checkout.
#
#   ./scripts/build-flatpak.sh
#
# The application is packaged with electron-builder (directory target) and
# then wrapped into io.github.shadowtheimpure.CHDMANGUI. Requires Flatpak plus
# the org.freedesktop.Sdk//24.08 and org.electronjs.Electron2.BaseApp//24.08
# runtimes (the script uses org.flatpak.Builder when flatpak-builder is not
# installed on the host).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/flatpak/io.github.shadowtheimpure.CHDMANGUI.yaml"
APP_ID="io.github.shadowtheimpure.CHDMANGUI"
VERSION="$(node -p "require('$ROOT/package.json').version")"

cd "$ROOT"

echo "==> building renderer and unpacked app"
npm run build
npx electron-builder --linux dir

echo "==> building Flatpak"
if command -v flatpak-builder >/dev/null 2>&1; then
  flatpak-builder --user --disable-rofiles-fuse --force-clean \
    --repo="$ROOT/flatpak-repo" "$ROOT/flatpak-build" "$MANIFEST"
else
  flatpak run --env="FLATPAK_USER_DIR=$HOME/.local/share/flatpak" \
    --command=flatpak-builder org.flatpak.Builder \
    --user --disable-rofiles-fuse --force-clean \
    --repo="$ROOT/flatpak-repo" "$ROOT/flatpak-build" "$MANIFEST"
fi

echo "==> creating bundle"
mkdir -p "$ROOT/release"
flatpak build-bundle "$ROOT/flatpak-repo" \
  "$ROOT/release/CHDMAN-GUI-$VERSION-x86_64.flatpak" "$APP_ID"

echo "==> done: release/CHDMAN-GUI-$VERSION-x86_64.flatpak"
