import type { CommandId } from './commands';
import type { FileFilter } from './types';

const EXT_LABELS: Record<string, string> = {
  chd: 'CHD images',
  cue: 'Cue sheets',
  gdi: 'Dreamcast GDI',
  iso: 'ISO images',
  toc: 'TOC sheets',
  nrg: 'Nero images',
  mds: 'Media descriptor',
  ccd: 'CloneCD images',
  bin: 'Binary data',
  img: 'Disk images',
  raw: 'Raw images',
  hdd: 'Hard disk images',
  vhd: 'Virtual hard disks',
  cdr: 'CDRWin images',
  avi: 'AVI video',
};

export function basename(p: string): string {
  if (!p) return '';
  const clean = p.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  return idx === -1 ? clean : clean.slice(idx + 1);
}

export function dirname(p: string): string {
  if (!p) return '';
  const clean = p.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return '/';
  return clean.slice(0, idx);
}

export function stem(p: string): string {
  const name = basename(p);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function extname(p: string): string {
  const name = basename(p);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  if (dir.endsWith('/')) return dir + name;
  return `${dir}/${name}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function shortPath(p: string, max = 64): string {
  if (!p || p.length <= max) return p;
  const name = basename(p);
  if (name.length + 8 >= max) return `…/${name}`;
  const keep = max - name.length - 4;
  return `${p.slice(0, Math.max(6, keep))}…/${name}`;
}

export function filtersFor(accept?: string[]): FileFilter[] {
  if (!accept || !accept.length) {
    return [{ name: 'All files', extensions: ['*'] }];
  }
  const grouped = new Map<string, string>();
  for (const ext of accept) {
    const label = EXT_LABELS[ext] || `${ext.toUpperCase()} files`;
    grouped.set(label, ext);
  }
  const filters: FileFilter[] = [
    { name: 'Supported files', extensions: accept },
    ...Array.from(grouped.entries()).map(([name, ext]) => ({ name, extensions: [ext] })),
  ];
  if (!accept.includes('*')) filters.push({ name: 'All files', extensions: ['*'] });
  return filters;
}

/** Suggest a destination path when the user picks an input file. */
export function suggestOutput(command: CommandId, inputPath: string): string {
  if (!inputPath) return '';
  const dir = dirname(inputPath);
  const base = stem(inputPath);
  switch (command) {
    case 'createcd':
    case 'createdvd':
    case 'createraw':
    case 'createld':
      return joinPath(dir, `${base}.chd`);
    case 'createhd':
      return joinPath(dir, `${base}.chd`);
    case 'copy':
      return joinPath(dir, `${base}.copy.chd`);
    case 'extractcd':
      return joinPath(dir, `${base}.cue`);
    case 'extractdvd':
      return joinPath(dir, `${base}.iso`);
    case 'extracthd':
      return joinPath(dir, `${base}.img`);
    case 'extractraw':
      return joinPath(dir, `${base}.raw`);
    case 'extractld':
      return joinPath(dir, `${base}.avi`);
    default:
      return joinPath(dir, `${base}.out`);
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatTime(at: number | null | undefined): string {
  if (!at) return '—';
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
