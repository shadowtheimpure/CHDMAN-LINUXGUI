import type { ParsedInfo } from './types';

function toNumber(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Turn the stdout of `chdman info` into a structured object.
 * Unrecognised lines are ignored; `raw` output is always available in the log.
 */
export function parseInfo(stdout: string): ParsedInfo {
  const fields: { key: string; value: string }[] = [];
  const metadata: string[] = [];
  const result: ParsedInfo = { fields, metadata };

  let inMetadata = false;
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^chdman - MAME/.test(line)) {
      const version = line.match(/manager\s+([0-9][0-9.]*)/);
      if (version) result.toolVersion = version[1];
      continue;
    }

    const metaStart = line.match(/^\s*Metadata:\s+(.*)$/);
    if (metaStart) {
      inMetadata = true;
      metadata.push(metaStart[1].trim());
      continue;
    }
    // Metadata payload lines are indented well past any header field.
    if (inMetadata && /^\s{6,}\S/.test(line)) {
      metadata.push(line.trim());
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z0-9 _-]*?):\s+(.*)$/);
    if (!match) continue;
    inMetadata = false;
    const key = match[1].trim();
    const value = match[2].trim();
    fields.push({ key, value });

    switch (key) {
      case 'SHA1':
        result.sha1 = value;
        break;
      case 'Data SHA1':
        result.dataSha1 = value;
        break;
      case 'Logical size':
        result.logicalSize = toNumber(value);
        break;
      case 'CHD size':
        result.chdSize = toNumber(value);
        break;
      case 'Ratio':
        result.ratio = value;
        break;
      case 'File Version':
        if (!result.version) result.version = value;
        break;
      default:
        break;
    }
  }

  return result;
}

/** Human label for the metadata tags chdman stores for each media type. */
export function describeMetadata(lines: string[]): string | null {
  const joined = lines.join('\n');
  if (/TRACK:\d+ TYPE:/.test(joined)) return 'CD image (track metadata)';
  if (/DVD:/.test(joined)) return 'DVD image';
  if (/GDDD|GDD /.test(joined)) return 'Hard disk';
  if (/AVAV|AVLD/.test(joined)) return 'LaserDisc';
  return null;
}

export type ChdKind = 'cd' | 'dvd' | 'hd' | 'ld' | 'raw' | 'unknown';

export interface ChdMediaInfo {
  kind: ChdKind;
  /** Long description for banners. */
  label: string;
  /** Compact label for chips. */
  short: string;
  /** Track types reported by chdman (CD CHDs only). */
  trackTypes: string[];
  /** Size of the CHD's logical unit, when known. */
  unitSize: number | null;
  /** Payload sector size of a CD track (2048 for ISO-style, 2352 for raw). */
  payloadSectorSize: 2048 | 2352 | null;
}

/**
 * Classify a CHD from the output of `chdman info`.
 *
 * chdman does not print the media type as a single field, so this reads the
 * metadata tags it stores (CHT2/TRACK for CDs, DVD for DVDs, GDDD for hard
 * disks) and falls back to the unit size for metadata-less images.
 */
export function detectChdMedia(info: ParsedInfo): ChdMediaInfo {
  const metadata = info.metadata.join('\n');
  const unitField = info.fields.find((field) => field.key === 'Unit Size');
  const unitSize = unitField ? toNumber(unitField.value) ?? null : null;
  const trackTypes = Array.from(metadata.matchAll(/TRACK:\d+\s+TYPE:([A-Z0-9_]+)/g)).map(
    (match) => match[1],
  );

  if (trackTypes.length) {
    const raw = trackTypes.some((type) => /_RAW$/.test(type) || type === 'AUDIO');
    const payloadSectorSize = raw ? 2352 : 2048;
    const sectorLabel = raw ? 'raw 2352-byte sectors' : '2048-byte sectors';
    return {
      kind: 'cd',
      label: `CD image · ${trackTypes.join(', ')} (${sectorLabel})`,
      short: `CD · ${trackTypes.join(', ')}`,
      trackTypes,
      unitSize,
      payloadSectorSize,
    };
  }
  if (/Tag='DVD '/.test(metadata) || /DVD:/.test(metadata)) {
    return {
      kind: 'dvd',
      label: 'DVD image',
      short: 'DVD',
      trackTypes: [],
      unitSize,
      payloadSectorSize: 2048,
    };
  }
  if (/GDDD/.test(metadata)) {
    return {
      kind: 'hd',
      label: 'Hard disk image',
      short: 'Hard disk',
      trackTypes: [],
      unitSize,
      payloadSectorSize: null,
    };
  }
  if (/AVAV|AVLD/.test(metadata)) {
    return {
      kind: 'ld',
      label: 'LaserDisc CHD',
      short: 'LaserDisc',
      trackTypes: [],
      unitSize,
      payloadSectorSize: null,
    };
  }
  if (unitSize === 2048) {
    return {
      kind: 'dvd',
      label: '2048-byte image (DVD-style CHD)',
      short: 'DVD-style',
      trackTypes: [],
      unitSize,
      payloadSectorSize: 2048,
    };
  }
  if (unitSize) {
    return {
      kind: 'raw',
      label: `Raw CHD · ${unitSize}-byte units`,
      short: 'Raw',
      trackTypes: [],
      unitSize,
      payloadSectorSize: null,
    };
  }
  return {
    kind: 'unknown',
    label: 'Unknown CHD type',
    short: 'Unknown',
    trackTypes: [],
    unitSize,
    payloadSectorSize: null,
  };
}

export interface TemplateRow {
  id: string;
  manufacturer: string;
  model: string;
  cylinders: string;
  heads: string;
  sectors: string;
  sectorSize: string;
  totalSize: string;
}

export function parseTemplates(stdout: string): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!/^\s*\d+\s{2,}/.test(line)) continue;
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 8) continue;
    rows.push({
      id: parts[0],
      manufacturer: parts[1],
      model: parts[2],
      cylinders: parts[3],
      heads: parts[4],
      sectors: parts[5],
      sectorSize: parts[6],
      totalSize: parts[7],
    });
  }
  return rows;
}
