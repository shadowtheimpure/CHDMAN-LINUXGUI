/**
 * Declarative description of every chdman sub-command and its options.
 * The UI renders forms from this file and builds the argv from it, so all
 * command knowledge lives in one place (verified against chdman 0.289).
 */

export type CommandId =
  | 'info'
  | 'verify'
  | 'createraw'
  | 'createhd'
  | 'createcd'
  | 'createdvd'
  | 'createld'
  | 'extractraw'
  | 'extracthd'
  | 'extractcd'
  | 'extractdvd'
  | 'extractld'
  | 'copy'
  | 'addmeta'
  | 'delmeta'
  | 'dumpmeta'
  | 'listtemplates';

export type Category = 'inspect' | 'create' | 'extract' | 'manage';

export type FieldKind =
  | 'file-in'     // existing file
  | 'file-out'    // destination file (save dialog)
  | 'dir'         // directory
  | 'text'
  | 'number'
  | 'bytes'       // number with optional K/M/G suffix
  | 'bool'
  | 'select'
  | 'codecs';

export interface FieldDef {
  /** stable id used by form state */
  key: string;
  /** long command-line flag, e.g. --input */
  flag: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: string[];
  /** file extensions used for the file picker */
  accept?: string[];
  /** number/bytes field bounds */
  min?: number;
  max?: number;
  /** collapsed under a "Show advanced options" section */
  advanced?: boolean;
  /** visual group heading in the form */
  group?: string;
  /** renders the field across the full form width */
  wide?: boolean;
}

export interface CommandDef {
  id: CommandId;
  title: string;
  category: Category;
  summary: string;
  fields: FieldDef[];
  /** shown as a hint block above the form */
  note?: string;
  /** whether the command produces/consumes a chd */
  producesChd?: boolean;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  inspect: 'Inspect',
  create: 'Create CHD',
  extract: 'Extract',
  manage: 'Manage',
};

/* ------------------------------------------------------------------ */
/* Shared option groups                                                */
/* ------------------------------------------------------------------ */

const CHD = ['chd'];
const CD_IMAGE = ['cue', 'gdi', 'iso', 'toc', 'nrg', 'mds', 'ccd', 'bin', 'img', 'cdr'];
const DVD_IMAGE = ['iso', 'img', 'bin'];
const ANY = undefined;

const compressionField = (
  presets: string[],
  help = 'Codecs to use, in order of preference (up to 4), comma separated.',
): FieldDef => ({
  key: 'compression',
  flag: '--compression',
  label: 'Compression',
  kind: 'codecs',
  options: presets,
  group: 'Compression',
  help,
  wide: true,
});

const processorsField: FieldDef = {
  key: 'numprocessors',
  flag: '--numprocessors',
  label: 'CPU threads',
  kind: 'number',
  min: 0,
  max: 128,
  placeholder: 'All available',
  group: 'Compression',
  help: 'Limit the number of worker threads chdman may use.',
};

const hunksizeField: FieldDef = {
  key: 'hunksize',
  flag: '--hunksize',
  label: 'Hunk size',
  kind: 'bytes',
  placeholder: 'Default for media type',
  group: 'Compression',
  help: 'Size of each chunk of compressed data, in bytes.',
};

const forceField: FieldDef = {
  key: 'force',
  flag: '--force',
  label: 'Overwrite existing output',
  kind: 'bool',
  group: 'Basics',
  help: 'Delete/replace the destination file if it already exists.',
};

const inputParentField: FieldDef = {
  key: 'inputparent',
  flag: '--inputparent',
  label: 'Parent CHD',
  kind: 'file-in',
  accept: CHD,
  advanced: true,
  group: 'Parent / delta',
  help: 'Parent CHD used for delta/differencing CHDs.',
};

const outputParentField: FieldDef = {
  key: 'outputparent',
  flag: '--outputparent',
  label: 'Parent CHD',
  kind: 'file-in',
  accept: CHD,
  advanced: true,
  group: 'Parent / delta',
  help: 'Write a delta CHD against this parent instead of a full image.',
};

const rangeFields = (suffix: string): FieldDef[] => [
  {
    key: 'inputstartbyte',
    flag: '--inputstartbyte',
    label: 'Start byte',
    kind: 'bytes',
    group: 'Range',
    advanced: true,
    help: `Byte offset where the ${suffix} data starts.`,
  },
  {
    key: 'inputstarthunk',
    flag: '--inputstarthunk',
    label: 'Start hunk',
    kind: 'number',
    min: 0,
    group: 'Range',
    advanced: true,
    help: 'Hunk offset where reading starts.',
  },
  {
    key: 'inputbytes',
    flag: '--inputbytes',
    label: 'Length (bytes)',
    kind: 'bytes',
    group: 'Range',
    advanced: true,
    help: 'How many bytes of input to process.',
  },
  {
    key: 'inputhunks',
    flag: '--inputhunks',
    label: 'Length (hunks)',
    kind: 'number',
    min: 0,
    group: 'Range',
    advanced: true,
    help: 'How many hunks of input to process.',
  },
];

/* ------------------------------------------------------------------ */
/* Command definitions                                                 */
/* ------------------------------------------------------------------ */

export const COMMANDS: CommandDef[] = [
  {
    id: 'info',
    title: 'Info',
    category: 'inspect',
    summary: 'Read the header, hashes and metadata of a CHD.',
    note: 'Results are shown in a structured summary, plus the raw chdman output.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'verbose',
        flag: '--verbose',
        label: 'Verbose output',
        kind: 'bool',
        group: 'Advanced',
      },
    ],
  },
  {
    id: 'verify',
    title: 'Verify',
    category: 'inspect',
    summary: 'Check a CHD against its stored SHA-1 checksums.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      inputParentField,
      {
        key: 'fix',
        flag: '--fix',
        label: 'Repair incorrect SHA-1',
        kind: 'bool',
        group: 'Advanced',
        help: 'Rewrite the stored SHA-1 when the data verifies but the header checksum is wrong.',
      },
    ],
  },
  {
    id: 'createcd',
    title: 'CD image → CHD',
    category: 'create',
    summary: 'Compress a CD image (cue/gdi/iso) into a CHD.',
    note: 'Pick the .cue, .gdi or .iso descriptor — chdman reads the referenced tracks automatically.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CD image',
        kind: 'file-in',
        required: true,
        accept: CD_IMAGE,
        wide: true,
        help: 'Cue sheet, GDI or ISO file.',
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      forceField,
      outputParentField,
      hunksizeField,
      compressionField(['cdlz,cdzl,cdfl', 'cdzl', 'cdlz', 'none']),
      processorsField,
    ],
  },
  {
    id: 'createdvd',
    title: 'DVD / ISO → CHD',
    category: 'create',
    summary: 'Compress a DVD image or ISO into a CHD.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'DVD image',
        kind: 'file-in',
        required: true,
        accept: DVD_IMAGE,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      forceField,
      outputParentField,
      ...rangeFields('DVD'),
      hunksizeField,
      compressionField(['lzma', 'zlib', 'none']),
      processorsField,
    ],
  },
  {
    id: 'createhd',
    title: 'Hard disk → CHD',
    category: 'create',
    summary: 'Compress a raw hard-disk image, or create an empty one.',
    note: 'Leave the disk image empty and fill in a template, CHS geometry or disk size to create a blank HDD CHD instead.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'Disk image',
        kind: 'file-in',
        accept: ['img', 'raw', 'bin', 'hdd', 'vhd', 'iso'],
        wide: true,
        help: 'Raw hard-disk image. Leave empty to create an empty disk.',
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'template',
        flag: '--template',
        label: 'Template ID',
        kind: 'text',
        placeholder: 'e.g. 0 (see Manage → Templates)',
        group: 'Empty disk',
        help: 'Use a built-in geometry from "listtemplates".',
      },
      {
        key: 'chs',
        flag: '--chs',
        label: 'CHS geometry',
        kind: 'text',
        placeholder: 'cylinders,heads,sectors',
        group: 'Empty disk',
      },
      {
        key: 'size',
        flag: '--size',
        label: 'Disk size',
        kind: 'bytes',
        placeholder: 'e.g. 20M or 104857600',
        group: 'Empty disk',
        help: 'Size of the empty disk in bytes (K/M/G suffixes accepted).',
      },
      {
        key: 'ident',
        flag: '--ident',
        label: 'Ident file',
        kind: 'file-in',
        accept: ANY,
        group: 'Empty disk',
        help: 'File containing CHS information for the disk.',
      },
      {
        key: 'sectorsize',
        flag: '--sectorsize',
        label: 'Sector size',
        kind: 'bytes',
        placeholder: '512',
        group: 'Empty disk',
      },
      forceField,
      outputParentField,
      ...rangeFields('disk'),
      hunksizeField,
      compressionField(['lzma', 'zlib', 'huff', 'none']),
      processorsField,
    ],
  },
  {
    id: 'createraw',
    title: 'Raw data → CHD',
    category: 'create',
    summary: 'Compress any raw binary blob into a CHD.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'Raw input',
        kind: 'file-in',
        accept: ANY,
        required: true,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      forceField,
      outputParentField,
      {
        key: 'unitsize',
        flag: '--unitsize',
        label: 'Unit size',
        kind: 'bytes',
        group: 'Compression',
        placeholder: '1',
        help: 'Size of a logical unit inside a hunk (e.g. 2048 for CD sectors).',
      },
      ...rangeFields('raw'),
      hunksizeField,
      compressionField(['lzma', 'zlib', 'huff', 'flac', 'none']),
      processorsField,
    ],
  },
  {
    id: 'createld',
    title: 'LaserDisc AVI → CHD',
    category: 'create',
    summary: 'Compress a laserdisc AVI capture into a CHD.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'AVI file',
        kind: 'file-in',
        accept: ['avi'],
        required: true,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      forceField,
      outputParentField,
      {
        key: 'inputstartframe',
        flag: '--inputstartframe',
        label: 'Start frame',
        kind: 'number',
        min: 0,
        group: 'Range',
        advanced: true,
      },
      {
        key: 'inputframes',
        flag: '--inputframes',
        label: 'Frame count',
        kind: 'number',
        min: 0,
        group: 'Range',
        advanced: true,
      },
      hunksizeField,
      compressionField(['avhu', 'none']),
      processorsField,
    ],
  },
  {
    id: 'extractcd',
    title: 'CHD → CD image',
    category: 'extract',
    summary: 'Extract a CD CHD back to cue/bin tracks.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Cue sheet',
        kind: 'file-out',
        required: true,
        accept: ['cue'],
        wide: true,
        help: 'Track data is written next to this cue sheet.',
      },
      {
        key: 'outputbin',
        flag: '--outputbin',
        label: 'Binary file',
        kind: 'file-out',
        accept: ['bin', 'img'],
        group: 'Advanced',
        wide: true,
        help: 'Optional explicit path for the binary track data.',
      },
      {
        key: 'splitbin',
        flag: '--splitbin',
        label: 'One .bin per track',
        kind: 'bool',
        group: 'Advanced',
      },
      forceField,
      inputParentField,
    ],
  },
  {
    id: 'extractdvd',
    title: 'CHD → DVD / ISO',
    category: 'extract',
    summary: 'Extract a DVD CHD back to an ISO image.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output ISO',
        kind: 'file-out',
        required: true,
        accept: ['iso', 'img'],
        wide: true,
      },
      ...rangeFields('DVD'),
      forceField,
      inputParentField,
    ],
  },
  {
    id: 'extracthd',
    title: 'CHD → hard disk image',
    category: 'extract',
    summary: 'Extract a hard-disk CHD back to a raw image.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output image',
        kind: 'file-out',
        required: true,
        accept: ['img', 'raw', 'bin', 'hdd'],
        wide: true,
      },
      ...rangeFields('disk'),
      forceField,
      inputParentField,
    ],
  },
  {
    id: 'extractraw',
    title: 'CHD → raw data',
    category: 'extract',
    summary: 'Extract the raw payload of any CHD.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output file',
        kind: 'file-out',
        required: true,
        accept: ANY,
        wide: true,
      },
      ...rangeFields('raw'),
      forceField,
      inputParentField,
    ],
  },
  {
    id: 'extractld',
    title: 'CHD → LaserDisc AVI',
    category: 'extract',
    summary: 'Extract a laserdisc CHD back to an AVI file.',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Output AVI',
        kind: 'file-out',
        required: true,
        accept: ['avi'],
        wide: true,
      },
      {
        key: 'inputstartframe',
        flag: '--inputstartframe',
        label: 'Start frame',
        kind: 'number',
        min: 0,
        group: 'Range',
        advanced: true,
      },
      {
        key: 'inputframes',
        flag: '--inputframes',
        label: 'Frame count',
        kind: 'number',
        min: 0,
        group: 'Range',
        advanced: true,
      },
      forceField,
      inputParentField,
    ],
  },
  {
    id: 'copy',
    title: 'Recompress / copy CHD',
    category: 'manage',
    summary: 'Copy a CHD while changing compression or hunk size.',
    producesChd: true,
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'Source CHD',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Destination CHD',
        kind: 'file-out',
        required: true,
        accept: CHD,
        wide: true,
      },
      forceField,
      inputParentField,
      outputParentField,
      ...rangeFields('CHD'),
      hunksizeField,
      compressionField(['lzma,zlib,huff,flac', 'lzma', 'zlib', 'none']),
      processorsField,
    ],
  },
  {
    id: 'addmeta',
    title: 'Add metadata',
    category: 'manage',
    summary: 'Attach a metadata tag to a CHD (in place).',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'tag',
        flag: '--tag',
        label: 'Tag',
        kind: 'text',
        required: true,
        placeholder: '4 characters, e.g. SYMB',
        help: 'Exactly four characters. Common tags: SYMB, CHTR, CHT2.',
      },
      {
        key: 'index',
        flag: '--index',
        label: 'Index',
        kind: 'number',
        min: 0,
        placeholder: '0',
        group: 'Options',
      },
      {
        key: 'valuetext',
        flag: '--valuetext',
        label: 'Text value',
        kind: 'text',
        group: 'Options',
        wide: true,
        help: 'Inline text to store. Use the file value to store binary data instead.',
      },
      {
        key: 'valuefile',
        flag: '--valuefile',
        label: 'Value file',
        kind: 'file-in',
        accept: ANY,
        group: 'Options',
        wide: true,
        help: 'File whose contents become the metadata value.',
      },
      {
        key: 'nochecksum',
        flag: '--nochecksum',
        label: 'Exclude from SHA-1',
        kind: 'bool',
        group: 'Options',
        help: 'Do not include this metadata in the overall SHA-1.',
      },
    ],
  },
  {
    id: 'delmeta',
    title: 'Delete metadata',
    category: 'manage',
    summary: 'Remove a metadata tag from a CHD (in place).',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'tag',
        flag: '--tag',
        label: 'Tag',
        kind: 'text',
        required: true,
        placeholder: '4 characters, e.g. SYMB',
      },
      {
        key: 'index',
        flag: '--index',
        label: 'Index',
        kind: 'number',
        min: 0,
        placeholder: '0',
        group: 'Options',
      },
    ],
  },
  {
    id: 'dumpmeta',
    title: 'Dump metadata',
    category: 'manage',
    summary: 'Write the value of one metadata tag to a file (or stdout).',
    fields: [
      {
        key: 'input',
        flag: '--input',
        label: 'CHD file',
        kind: 'file-in',
        required: true,
        accept: CHD,
        wide: true,
      },
      {
        key: 'tag',
        flag: '--tag',
        label: 'Tag',
        kind: 'text',
        required: true,
        placeholder: '4 characters, e.g. SYMB',
      },
      {
        key: 'index',
        flag: '--index',
        label: 'Index',
        kind: 'number',
        min: 0,
        placeholder: '0',
        group: 'Options',
      },
      {
        key: 'output',
        flag: '--output',
        label: 'Write to file',
        kind: 'file-out',
        accept: ANY,
        group: 'Options',
        wide: true,
        help: 'Leave empty to print the metadata to the log instead.',
      },
      {
        key: 'force',
        flag: '--force',
        label: 'Overwrite existing output',
        kind: 'bool',
        group: 'Options',
      },
    ],
  },
  {
    id: 'listtemplates',
    title: 'HDD templates',
    category: 'manage',
    summary: 'List the built-in hard-disk geometries.',
    fields: [],
  },
];

export const COMMANDS_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c])) as Record<
  CommandId,
  CommandDef
>;

export const COMMAND_CATEGORIES: Category[] = ['inspect', 'create', 'extract', 'manage'];

/* ------------------------------------------------------------------ */
/* argv building & validation                                          */
/* ------------------------------------------------------------------ */

export type FormValues = Record<string, string | boolean>;

/** Convert a human size like "20M" to bytes. Plain numbers pass through. */
export function parseBytes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:i?b)?$/i);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const unit = match[2].toLowerCase();
  const factor = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }[unit];
  if (!factor) return null;
  return Math.round(num * factor);
}

export function buildArgs(command: CommandDef, values: FormValues): string[] {
  const args: string[] = [];
  for (const field of command.fields) {
    const raw = values[field.key];
    if (field.kind === 'bool') {
      if (raw === true) args.push(field.flag);
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    if (field.kind === 'bytes') {
      const bytes = parseBytes(value);
      args.push(field.flag, String(bytes === null ? value : bytes));
      continue;
    }
    args.push(field.flag, value);
  }
  return args;
}

export function defaultValues(command: CommandDef): FormValues {
  const values: FormValues = {};
  for (const field of command.fields) {
    if (field.kind === 'bool') values[field.key] = field.defaultValue === true;
    else values[field.key] = field.defaultValue === undefined ? '' : String(field.defaultValue);
  }
  return values;
}

/** Returns a map of field key -> message for values that are missing/invalid. */
export function validate(command: CommandDef, values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of command.fields) {
    const raw = values[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (field.required && !value) {
      errors[field.key] = 'Required';
      continue;
    }
    if (!value) continue;
    if (field.kind === 'bytes') {
      if (parseBytes(value) === null) errors[field.key] = 'Enter bytes or a value like 20M';
      continue;
    }
    if (field.kind === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) errors[field.key] = 'Enter a positive number';
    }
    if (field.key === 'tag' && value.length !== 4) {
      errors[field.key] = 'Tag must be exactly 4 characters';
    }
  }
  // createhd needs a source: image, template, chs, size or ident
  if (command.id === 'createhd') {
    const hasSource = ['input', 'template', 'chs', 'size', 'ident'].some(
      (k) => typeof values[k] === 'string' && (values[k] as string).trim(),
    );
    if (!hasSource) {
      errors.input = 'Choose an image, or fill in a template/CHS/size below';
    }
  }
  return errors;
}

/** Textual command preview, e.g. for the copy-to-clipboard hint. */
export function formatCommand(commandLabel: string, command: CommandDef, values: FormValues): string {
  const args = buildArgs(command, values).map((arg) =>
    arg.startsWith('--') || /^-?[a-z]$/.test(arg) ? arg : quote(arg),
  );
  return [commandLabel, ...args].join(' ');
}

function quote(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
