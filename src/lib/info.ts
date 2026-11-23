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
