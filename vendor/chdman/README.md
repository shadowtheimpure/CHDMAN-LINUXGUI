# Bundled chdman

`vendor/chdman/bin/chdman` is the MAME CHD manager, **built from MAME source**
so the app ships a complete engine that does not depend on the host's MAME,
SDL, FLAC or C++ runtime.

| Item | Value |
| ---- | ----- |
| chdman | 0.289 (MAME tag `mame0289`) |
| Toolchain | Ubuntu 22.04, GCC 12, glibc 2.35 |
| Minimum host glibc | **2.34** (Ubuntu 22.04+, Debian 12+, Fedora 36+, RHEL 9+) |
| Bundled libraries | `libSDL3.so.0` 3.4.18, `libstdc++.so.6` (GCC 12), `libgcc_s.so.1` |

MAME's bundled third-party codecs (zlib, zstd, FLAC, utf8proc, expat, 7-Zip)
are linked statically into the binary, so only SDL3 and the GCC runtime are
shipped next to it. SDL3 is built without video/audio backends — chdman never
opens a window — which keeps the bundle small and dependency-free.

## Rebuilding

```bash
./scripts/build-engine.sh           # needs podman
MAME_VERSION=0.289 ./scripts/build-engine.sh
```

The script builds inside an Ubuntu 22.04 container (glibc 2.35) and installs
the binary plus libraries into `vendor/chdman/`. The resulting chdman only
requires glibc 2.34 symbols, which is why the release works on every
mainstream distribution released since 2022.

The app resolves the engine in this order:

1. the custom path in **Settings**,
2. `$CHDMAN_PATH`,
3. this bundled binary,
4. `chdman` in `PATH`.

Libraries are injected with `LD_LIBRARY_PATH` **only for the chdman child
process**, never for Electron itself.

## Licensing

chdman is part of [MAME](https://www.mamedev.org/) and licensed under the
**GPL-2.0-or-later**. SDL3 is **Zlib**, `libstdc++`/`libgcc` carry the GCC
runtime exception, and the statically linked codecs keep their own licenses
(zlib, BSD-3-Clause for FLAC, MIT for utf8proc, etc.). Corresponding source is
available from the upstream projects. If you redistribute the Flatpak/AppImage,
keep the licenses and source availability with it.
