#!/bin/sh
# Flatpak launcher for CHDMAN GUI.
set -eu

export TMPDIR="${XDG_RUNTIME_DIR}/app/${FLATPAK_ID}"
mkdir -p "$TMPDIR"

exec zypak-wrapper.sh /app/main/chdman-gui "$@"
