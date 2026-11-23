#!/usr/bin/env bash
# Download and unpack the chdman binary that ships with this app.
#
# Extracts only what is needed from Fedora's mame-tools package:
#   vendor/chdman/bin/chdman
#   vendor/chdman/lib/libutf8proc.so.3*
#
# Usage:
#   ./scripts/fetch-chdman.sh                 # match the running Fedora release
#   FEDORA_RELEASE=45 ./scripts/fetch-chdman.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="${ARCH:-x86_64}"

if [[ -z "${FEDORA_RELEASE:-}" ]]; then
  if [[ -r /etc/os-release ]]; then
    # Bazzite/Fedora Atomic report VERSION_ID like "45".
    FEDORA_RELEASE="$(. /etc/os-release && echo "${VERSION_ID%%.*}")"
  fi
  FEDORA_RELEASE="${FEDORA_RELEASE:-45}"
fi

BASE="https://dl.fedoraproject.org/pub/fedora/linux/releases/${FEDORA_RELEASE}/Everything/${ARCH}/os/Packages"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\033[36m•\033[0m %s\n' "$*"; }

mame_rpm="$(curl -fsSL "$BASE/m/" | grep -o "mame-tools-[^\"]*\.${ARCH}\.rpm" | head -n1)"
utf8_rpm="$(curl -fsSL "$BASE/u/" | grep -o "utf8proc-[0-9][^\"]*\.${ARCH}\.rpm" | head -n1)"

[[ -n "$mame_rpm" ]] || { echo "Could not locate mame-tools in ${BASE}/m/" >&2; exit 1; }
[[ -n "$utf8_rpm" ]] || { echo "Could not locate utf8proc in ${BASE}/u/" >&2; exit 1; }

say "mame-tools: $mame_rpm"
say "utf8proc:   $utf8_rpm"

curl -fsSL -o "$TMP/mame.rpm" "$BASE/m/$mame_rpm"
curl -fsSL -o "$TMP/utf8.rpm" "$BASE/u/$utf8_rpm"

mkdir -p "$TMP/mame" "$TMP/utf8"
(cd "$TMP/mame" && rpm2cpio ../mame.rpm | cpio -idm --quiet)
(cd "$TMP/utf8" && rpm2cpio ../utf8.rpm | cpio -idm --quiet)

DEST="$REPO_ROOT/vendor/chdman"
rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/lib"
install -m 0755 "$TMP/mame/usr/bin/chdman" "$DEST/bin/chdman"
cp -a "$TMP/utf8"/usr/lib64/libutf8proc.so.3* "$DEST/lib/"

say "verifying binary"
if ! LD_LIBRARY_PATH="$DEST/lib" "$DEST/bin/chdman" 2>&1 | grep -q "CHD) manager"; then
  echo "Extracted chdman does not run on this system." >&2
  exit 1
fi
say "installed $(LD_LIBRARY_PATH="$DEST/lib" "$DEST/bin/chdman" 2>&1 | head -n1)"
