# CHDMAN GUI for Linux

A desktop front-end for **chdman**, MAME's Compressed Hunks of Data (CHD) manager.
Built with Electron, React and TypeScript, and shipped with a working chdman
binary so it runs out of the box — no MAME installation required.

![CHDMAN GUI](docs/screenshot-main.png)

More screenshots: [HDD templates](docs/screenshot-templates.png) ·
[Settings](docs/screenshot-settings.png)

## Features

- **Every chdman command**: `info`, `verify`, `createraw`, `createhd`, `createcd`,
  `createdvd`, `createld`, `extractraw`, `extracthd`, `extractcd`, `extractdvd`,
  `extractld`, `copy`, `addmeta`, `delmeta`, `dumpmeta`, `listtemplates`.
- **Guided forms** generated from a single command schema: file pickers, drag &
  drop, byte/size parsing (`20M` → `20971520`), required-field validation, and
  sensible output names derived from the input file.
- **Job queue** with real progress percentages, current phase and compression
  ratio, 1–4 parallel jobs, cancel/retry/remove, and "reveal output" on success.
- **Live logs** per job — filterable, timestamped, copyable and saveable.
- **Structured `info` results**: media type, CHD format version, logical/CHD
  size, ratio, SHA-1s, every header field and the raw metadata block.
- **HDD template browser** for `createhd --template`, with one-click hand-off to
  the Create Hard Disk form.
- System/dark/light themes, persisted settings and window geometry.
- **Bundled chdman 0.289** with automatic fallback to `$CHDMAN_PATH` or `PATH`.

## Requirements

- Linux x86_64. The bundled binary comes from Fedora 45 and runs on glibc-based
  distributions; older systems can point Settings at their own chdman.
- Node.js 20+ and npm only if you want to build from source.

## Run from source

```bash
npm install
npm run dev          # Vite + Electron with hot reload
```

Production-style run (builds the renderer, then launches Electron):

```bash
npm start
```

## Build an AppImage

```bash
npm run dist
```

The AppImage is written to `release/`. It bundles `vendor/chdman` automatically
through electron-builder `extraResources`.

Releases are automated: pushing a tag such as `v0.1.0` makes GitHub Actions run
the smoke test, build the AppImage and attach it to the GitHub release
(`.github/workflows/build.yml`).

## How chdman is located

The app resolves the engine in this order and verifies it by running it:

1. the custom path set in **Settings**,
2. the `CHDMAN_PATH` environment variable,
3. the bundled binary in `vendor/chdman/bin/chdman`,
4. `chdman` found in `PATH`.

The bundled binary needs `libutf8proc.so.3`, which is shipped next to it in
`vendor/chdman/lib` and injected via `LD_LIBRARY_PATH` for the child process
only. See [`vendor/chdman/README.md`](vendor/chdman/README.md) for provenance.
To refresh it:

```bash
./scripts/fetch-chdman.sh
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Enter` | Run the current form immediately |
| `Enter` | Submit the form (add to queue) |
| `Esc` | Close the log/summary dialog |

## Project layout

```
electron/main.js        Main process: engine discovery, job spawning, IPC
electron/preload.js     contextBridge API (sandboxed renderer)
src/lib/commands.ts     Schema for every chdman command → forms + argv
src/lib/info.ts         Parsers for `info` and `listtemplates` output
src/hooks/useQueue.ts   Queue state machine, progress/log streaming
src/components/         UI: sidebar, forms, queue, dialogs, settings, templates
scripts/dev.mjs         Dev launcher (Vite + Electron)
scripts/smoke-ui.mjs    End-to-end UI test driven over the DevTools protocol
scripts/fetch-chdman.sh Re-download the bundled engine
vendor/chdman/          Bundled chdman + libutf8proc
```

## Testing

```bash
npm run smoke
```

This creates `.smoke/` fixtures, launches the built app with the DevTools
protocol enabled, drives the real UI to create a CHD, inspect it, extract it
back, and screenshots each step. It exits non-zero on any failure.

## Troubleshooting

- **`--ozone-platform=wayland is not compatible with Vulkan`** — harmless
  Chromium notice on Wayland; Electron falls back to software/GL rendering.
- **Electron will not start on an immutable distro (sandbox error)** — run
  `ELECTRON_NO_SANDBOX=1 npm run dev`. Prefer fixing the `chrome-sandbox`
  permissions for packaged builds.
- **"chdman not found"** — open Settings and either let it use the bundled
  binary or point to an installed `chdman` (`mame-tools` on Fedora).
- **Output already exists** — chdman refuses to overwrite by default. Enable
  *Overwrite existing output* (`--force`) in the form.

## Licensing

This front-end is MIT-licensed. chdman is part of MAME and is licensed under the
GPL-2.0-or-later; utf8proc is MIT. If you redistribute an AppImage containing the
bundled binaries, keep their licenses and source availability with it.
