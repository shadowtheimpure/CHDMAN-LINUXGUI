import { COMMANDS_BY_ID, type CommandId } from './commands';
import { formatBytes } from './format';
import type { ChdMediaInfo } from './info';
import type { FileProbe, ParsedInfo } from './types';

export type AnalysisIcon = 'disc' | 'dvd' | 'hdd' | 'archive' | 'film' | 'file';

export interface Recommendation {
  command: CommandId;
  title: string;
  description: string;
  primary?: boolean;
  prefill: Record<string, string>;
}

export interface FileAnalysis {
  typeLabel: string;
  typeDetail: string;
  icon: AnalysisIcon;
  details: string[];
  recommendations: Recommendation[];
  /** Shown as a warning banner; recommendations may still be offered. */
  warning?: string;
  /** No useful operation could be derived from the file. */
  unsupported?: boolean;
}

const ISO_CUE_EXTENSIONS = ['cue', 'gdi', 'toc', 'nrg', 'mds', 'ccd', 'cdr'];
const RAW_EXTENSIONS = ['bin', 'img', 'raw', 'hdd', 'vhd'];

function pick(id: CommandId, description: string, prefill: Record<string, string>, primary = false): Recommendation {
  return {
    command: id,
    title: COMMANDS_BY_ID[id].title,
    description,
    primary,
    prefill,
  };
}

function chdRecommendations(
  path: string,
  media: ChdMediaInfo,
  info: ParsedInfo,
): { icon: AnalysisIcon; label: string; detail: string; description: string; recs: Recommendation[] } {
  const prefill = { input: path };
  const base = { info: pick('info', 'Inspect header fields, hashes and metadata.', prefill) };
  const verify = pick('verify', 'Check the stored SHA-1 checksums for corruption.', prefill);

  switch (media.kind) {
    case 'cd': {
      const isIso = media.payloadSectorSize === 2048;
      const extract = pick(
        'extractcd',
        isIso
          ? 'Extract the track. This CHD uses 2048-byte sectors, so the binary file is already a valid ISO — name it “.iso” in the form and use it directly.'
          : 'Extract the CD tracks to a cue sheet and raw binary tracks.',
        prefill,
        true,
      );
      return {
        icon: 'disc',
        label: media.label,
        detail: `CHD v${info.version ?? '5'}`,
        description: isIso
          ? 'CD image with ISO-style 2048-byte sectors'
          : 'CD image with raw 2352-byte sectors',
        recs: [extract, base.info, verify],
      };
    }
    case 'dvd':
      return {
        icon: 'dvd',
        label: 'DVD image',
        detail: `CHD v${info.version ?? '5'}`,
        description: 'DVD/ISO image',
        recs: [
          pick('extractdvd', 'Write the DVD image back to an ISO file.', prefill, true),
          base.info,
          verify,
        ],
      };
    case 'hd':
      return {
        icon: 'hdd',
        label: 'Hard disk image',
        detail: `CHD v${info.version ?? '5'}`,
        description: 'Hard-disk CHD',
        recs: [
          pick('extracthd', 'Write the raw hard-disk image to a file.', prefill, true),
          base.info,
          verify,
        ],
      };
    case 'ld':
      return {
        icon: 'film',
        label: 'LaserDisc CHD',
        detail: `CHD v${info.version ?? '5'}`,
        description: 'LaserDisc capture',
        recs: [
          pick('extractld', 'Write the LaserDisc capture back to an AVI file.', prefill, true),
          base.info,
          verify,
        ],
      };
    case 'raw':
      return {
        icon: 'archive',
        label: 'Raw CHD',
        detail: `CHD v${info.version ?? '5'}`,
        description: 'Raw payload without media metadata',
        recs: [
          pick('extractraw', 'Copy the CHD payload to a file.', prefill, true),
          base.info,
          verify,
        ],
      };
    default:
      return {
        icon: 'file',
        label: 'Unknown CHD type',
        detail: `CHD v${info.version ?? '5'}`,
        description: 'No media metadata found',
        recs: [
          pick('extractraw', 'Copy the payload; the media type could not be determined.', prefill, true),
          base.info,
          verify,
        ],
      };
  }
}

/**
 * Turn a cheap file probe (and, for CHDs, the parsed `chdman info` result)
 * into a human description plus ranked, pre-filled operations.
 */
export function analyzeFile(
  probe: FileProbe,
  chd?: { media: ChdMediaInfo; info: ParsedInfo } | null,
): FileAnalysis {
  const size = probe.size ?? 0;
  const ext = (probe.ext ?? '').toLowerCase();

  if (ext === 'chd') {
    if (!chd) {
      return {
        typeLabel: 'CHD image',
        typeDetail: formatBytes(size),
        icon: 'file',
        details: [formatBytes(size)],
        recommendations: [],
        warning: 'Select a working chdman engine to analyse this CHD.',
      };
    }
    const info = chdRecommendations(probe.path, chd.media, chd.info);
    return {
      typeLabel: info.label,
      typeDetail: info.detail,
      icon: info.icon,
      details: [
        formatBytes(size),
        chd.info.logicalSize ? `Logical size ${formatBytes(chd.info.logicalSize)}` : '',
        chd.info.ratio ? `Ratio ${chd.info.ratio}` : '',
      ].filter(Boolean),
      recommendations: info.recs,
    };
  }

  if (ISO_CUE_EXTENSIONS.includes(ext)) {
    const tracks = probe.cue?.tracks ?? [];
    const trackDetail =
      tracks.length > 0
        ? tracks.map((track) => `${track.type}`).join(', ')
        : probe.gdi?.files?.length
          ? `${probe.gdi.files.length} track files`
          : '';
    return {
      typeLabel: ext === 'gdi' ? 'Dreamcast GDI image' : 'Cue sheet / CD image',
      typeDetail: trackDetail,
      icon: 'disc',
      details: [
        formatBytes(size),
        tracks.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'}` : '',
        probe.cue?.files?.length ? `${probe.cue.files.length} referenced file(s)` : '',
      ].filter(Boolean),
      recommendations: [
        pick('createcd', 'Compress the CD image and its tracks into a CHD.', { input: probe.path }, true),
      ],
    };
  }

  if (ext === 'iso') {
    const iso = probe.iso;
    const looksLikeDvd = size > 900 * 1024 * 1024 || Boolean(iso?.udf);
    const format = [iso?.iso9660 ? 'ISO 9660' : '', iso?.udf ? 'UDF' : ''].filter(Boolean).join(' + ');
    const dvd = pick(
      'createdvd',
      'Compress the ISO into a DVD CHD. This preserves the 2048-byte sectors exactly.',
      { input: probe.path },
      looksLikeDvd,
    );
    const cd = pick(
      'createcd',
      'Compress the ISO as a CD image (adds CD sector framing, extracts to cue/bin).',
      { input: probe.path },
      !looksLikeDvd,
    );
    return {
      typeLabel: looksLikeDvd ? 'DVD / ISO image' : 'CD / ISO image',
      typeDetail: [format, iso?.label].filter(Boolean).join(' · '),
      icon: 'dvd',
      details: [],
      recommendations: [dvd, cd],
      warning:
        iso && !iso.iso9660 && !iso.udf
          ? 'No ISO 9660 or UDF filesystem was found at the start of this file. It may not be a disc image.'
          : undefined,
    };
  }

  if (RAW_EXTENSIONS.includes(ext)) {
    const companion = probe.siblingGdi || probe.siblingCue;
    if (companion) {
      return {
        typeLabel: 'Track data with companion sheet',
        typeDetail: '',
        icon: 'disc',
        details: [formatBytes(size), `Companion: ${companion.split('/').pop()}`],
        recommendations: [
          pick(
            'createcd',
            'Use the companion cue/gdi sheet so all tracks are included in the CHD.',
            { input: companion },
            true,
          ),
        ],
      };
    }
    const hd = pick(
      'createhd',
      'Compress the image as a hard-disk CHD (use “Empty disk” options to create a blank one instead).',
      { input: probe.path },
      ext === 'img' || ext === 'hdd' || ext === 'vhd',
    );
    const raw = pick(
      'createraw',
      'Compress the file as raw data. A unit size of 512 bytes is pre-filled; adjust it if the media uses another layout.',
      { input: probe.path, unitsize: '512' },
      ext === 'raw' || ext === 'bin',
    );
    return {
      typeLabel: ext === 'bin' ? 'Raw binary image' : 'Raw disk image',
      typeDetail: '',
      icon: 'hdd',
      details: [formatBytes(size), 'No cue/gdi sheet found next to this file'],
      recommendations: [hd, raw],
      warning:
        'Without a cue/gdi sheet this is treated as a raw image. Hard-disk CHDs are usually the right choice for full drive dumps.',
    };
  }

  if (ext === 'avi') {
    return {
      typeLabel: 'AVI video',
      typeDetail: probe.avi ? 'RIFF/AVI header' : '',
      icon: 'film',
      details: [formatBytes(size)],
      recommendations: [
        pick('createld', 'Compress the LaserDisc capture into a CHD.', { input: probe.path }, true),
      ],
      warning: probe.avi ? undefined : 'No AVI header was found; chdman may reject this file.',
    };
  }

  if (['zip', '7z', 'rar', 'gz', 'xz'].includes(ext)) {
    return {
      typeLabel: 'Archive',
      typeDetail: '',
      icon: 'archive',
      details: [formatBytes(size)],
      recommendations: [],
      warning: 'Extract the archive first, then pick the cue/gdi/iso or CHD inside it.',
      unsupported: true,
    };
  }

  return {
    typeLabel: probe.ext ? `${probe.ext.toUpperCase()} file` : 'Unknown file',
    typeDetail: '',
    icon: 'file',
    details: [formatBytes(size)],
    recommendations: [],
    warning:
      'This file type is not recognised. Supported inputs are CHD, cue/gdi CD images, ISO, raw disk images and AVI captures.',
    unsupported: true,
  };
}
