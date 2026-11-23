#!/usr/bin/env bash
# Build chdman and its shared libraries inside a container so the bundled
# engine is self-contained and works on any distro with glibc >= 2.34.
#
# Runs inside Ubuntu 22.04 (glibc 2.35) with GCC 12; the produced binary only
# needs glibc 2.34 symbols, which covers Ubuntu 22.04+, Debian 12+, Fedora 36+,
# RHEL 9+ and anything newer. SDL3 and the GCC runtime are bundled as well.
set -euo pipefail

MAME_VERSION="${MAME_VERSION:-0.289}"
SDL_VERSION="${SDL_VERSION:-3.4.18}"
GCC_VERSION="${GCC_VERSION:-12}"
WORK=/work
SRC="$WORK/mame-mame${MAME_VERSION//./}"
PREFIX="$WORK/deps"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  build-essential python3 curl ca-certificates pkg-config cmake ninja-build \
  "gcc-${GCC_VERSION}" "g++-${GCC_VERSION}" \
  libexpat1-dev zlib1g-dev libflac-dev libutf8proc-dev \
  libfontconfig1-dev libfreetype6-dev libasound2-dev libpulse-dev qt6-base-dev \
  libdbus-1-dev libx11-dev libxext-dev libxi-dev libxinerama-dev libxrandr-dev \
  libxcursor-dev libxfixes-dev libwayland-dev libdecor-0-dev \
  libgl1-mesa-dev libegl1-mesa-dev libgles2-mesa-dev

# SDL3 headers/library for MAME's OSD core (kept in the work volume).
if [[ ! -f "$PREFIX/lib/libSDL3.so" ]]; then
  echo "==> building SDL3 $SDL_VERSION"
  mkdir -p "$PREFIX" "$WORK"
  cd "$WORK"
  if [[ ! -d "SDL3-${SDL_VERSION}" ]]; then
    curl -fsSL -o SDL3.tar.gz \
      "https://github.com/libsdl-org/SDL/releases/download/release-${SDL_VERSION}/SDL3-${SDL_VERSION}.tar.gz"
    tar xzf SDL3.tar.gz
  fi
  cmake -S "SDL3-${SDL_VERSION}" -B sdl-deps-build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DSDL_SHARED=ON -DSDL_STATIC=OFF -DSDL_TESTS=OFF -DSDL_EXAMPLES=OFF \
    -DSDL_INSTALL_TESTS=OFF -DSDL_UNIX_CONSOLE_BUILD=ON \
    -DSDL_X11=OFF -DSDL_WAYLAND=OFF -DSDL_KMSDRM=OFF \
    -DSDL_ALSA=OFF -DSDL_PULSEAUDIO=OFF -DSDL_PIPEWIRE=OFF -DSDL_JACK=OFF -DSDL_SNDIO=OFF \
    -DSDL_DISKAUDIO=OFF -DSDL_DUMMYAUDIO=ON -DSDL_DUMMYVIDEO=ON
  cmake --build sdl-deps-build -j"$(nproc)"
  cmake --install sdl-deps-build
fi
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
export LD_LIBRARY_PATH="$PREFIX/lib:${LD_LIBRARY_PATH:-}"
export CFLAGS="${CFLAGS:-} -I$PREFIX/include"
export CXXFLAGS="${CXXFLAGS:-} -I$PREFIX/include"
export LDFLAGS="${LDFLAGS:-} -L$PREFIX/lib"

cd "$WORK"
if [[ ! -d "$SRC" ]]; then
  echo "==> downloading MAME $MAME_VERSION"
  curl -fsSL -o mame.tar.gz \
    "https://github.com/mamedev/mame/archive/refs/tags/mame${MAME_VERSION//./}.tar.gz"
  tar xzf mame.tar.gz
fi

cd "$SRC"
echo "==> generating build files (tools enabled, SDL3 OSD)"
make -j"$(nproc)" OSD=sdl3 TOOLS=1 NOWERROR=1 "GCC_VERSION=$GCC_VERSION" generate \
  build/projects/sdl3/mame/gmake-linux/Makefile

echo "==> precompiling headers"
make -C build/projects/sdl3/mame/gmake-linux -j"$(nproc)" config=release64 precompile

echo "==> building chdman"
make -C build/projects/sdl3/mame/gmake-linux -j"$(nproc)" config=release64 chdman

echo "==> collecting engine"
mkdir -p /out/bin /out/lib
cp chdman /out/bin/chdman
cp -a "$PREFIX"/lib/libSDL3.so.0* /out/lib/
cp -a /usr/lib/x86_64-linux-gnu/libstdc++.so.6* /out/lib/
cp -a /lib/x86_64-linux-gnu/libgcc_s.so.1 /out/lib/

echo "==> verifying"
LD_LIBRARY_PATH=/out/lib /out/bin/chdman > /tmp/chdman-usage.txt 2>&1 || true
sed -n '1p' /tmp/chdman-usage.txt
ls -l /out/bin /out/lib
