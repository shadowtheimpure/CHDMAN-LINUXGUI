# Bundled chdman

`vendor/chdman/bin/chdman` is the MAME CHD manager, extracted from the Fedora
`mame-tools` package so the GUI works without installing MAME system-wide.

| Item | Value |
| ---- | ----- |
| chdman version | 0.289 |
| Package | `mame-tools-0.289-1.fc45.x86_64.rpm` |
| Source | <https://dl.fedoraproject.org/pub/fedora/linux/releases/45/Everything/x86_64/os/Packages/m/> |
| Runtime dependency | `libutf8proc.so.3` (from `utf8proc-2.11.3-3.fc45.x86_64.rpm`, also bundled) |

## Refreshing

```bash
./scripts/fetch-chdman.sh              # uses the running Fedora release
FEDORA_RELEASE=45 ./scripts/fetch-chdman.sh
```

The app resolves the engine in this order:

1. the custom path in **Settings**,
2. `$CHDMAN_PATH`,
3. this bundled binary,
4. `chdman` in `PATH`.

## Licensing

chdman is part of [MAME](https://www.mamedev.org/) and is distributed under the
**GPL-2.0-or-later**. `utf8proc` is distributed under the **MIT** license.
The corresponding source is published by the MAME and utf8proc projects and by
Fedora (see the package links above). If you redistribute an AppImage that
bundles these binaries, keep the licenses and source offer with it.
