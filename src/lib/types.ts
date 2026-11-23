import type { CommandId } from './commands';

export type ChdmanSource = 'custom' | 'environment' | 'bundled' | 'system';

export interface DetectAttempt {
  path: string;
  source: string;
  error?: string;
}

export interface ChdmanDetection {
  found: boolean;
  path?: string;
  source?: ChdmanSource;
  version?: string;
  bundled?: boolean;
  attempted: DetectAttempt[];
}

export interface AppSettings {
  chdmanPath: string;
  concurrency: number;
  theme: 'system' | 'dark' | 'light';
  revealOnFinish: boolean;
  lastInputDir: string;
  lastOutputDir: string;
  windowBounds: { x?: number; y?: number; width: number; height: number } | null;
}

export interface StatResult {
  path: string;
  exists: boolean;
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  mtime?: number;
}

export interface IsoProbe {
  iso9660: boolean;
  udf: boolean;
  label: string;
}

export interface CueTrack {
  number: number;
  type: string;
}

/** Result of `file:probe` — cheap identification for the start screen. */
export interface FileProbe {
  path: string;
  exists: boolean;
  isFile?: boolean;
  size?: number;
  ext?: string;
  iso?: IsoProbe | null;
  cue?: { files: string[]; tracks: CueTrack[] } | null;
  gdi?: { files: string[] } | null;
  avi?: boolean;
  siblingCue?: string | null;
  siblingGdi?: string | null;
}

export interface AppInfo {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  packaged: boolean;
  userData: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  save?: boolean;
  multi?: boolean;
  filters?: FileFilter[];
  defaultPath?: string;
  /** Appended to the chosen name when it has no extension. */
  extension?: string;
}

export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled';

export interface LogLine {
  stream: 'out' | 'err' | 'sys';
  text: string;
  at: number;
}

export interface ParsedInfo {
  fields: { key: string; value: string }[];
  metadata: string[];
  sha1?: string;
  dataSha1?: string;
  logicalSize?: number;
  chdSize?: number;
  ratio?: string;
  /** CHD format version (the "File Version" header field). */
  version?: string;
  /** Version of the chdman binary that produced the output. */
  toolVersion?: string;
}

export interface Job {
  id: string;
  command: CommandId;
  commandTitle: string;
  label: string;
  detail: string;
  args: string[];
  cwd?: string;
  /** files this job is expected to produce (used for "reveal") */
  outputs: string[];
  status: JobStatus;
  progress: number | null;
  phase: string;
  ratio: string | null;
  logs: LogLine[];
  stdoutRaw: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  exitCode: number | null;
  error: string | null;
  cancelRequested: boolean;
  info?: ParsedInfo;
}

export interface JobEvent {
  id: string;
  type: 'started' | 'stdout' | 'stderr' | 'exit';
  text?: string;
  pid?: number;
  at?: number;
  code?: number | null;
  signal?: string | null;
  error?: string | null;
  durationMs?: number;
}

export interface ChdmanApi {
  detect(): Promise<ChdmanDetection>;
  setChdmanPath(value: string): Promise<ChdmanDetection>;
  chooseChdmanBinary(): Promise<ChdmanDetection | null>;
  runSync(payload: { command: CommandId; args: string[] }): Promise<{
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
  }>;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  runJob(job: {
    id: string;
    command: CommandId;
    args: string[];
    cwd?: string;
  }): Promise<{ ok: boolean; id: string }>;
  cancelJob(id: string): Promise<{ ok: boolean; error?: string }>;
  openDialog(options: OpenDialogOptions): Promise<string[]>;
  statPaths(paths: string[]): Promise<StatResult[]>;
  readTextFile(filePath: string): Promise<string | null>;
  probeFile(filePath: string): Promise<FileProbe>;
  reveal(target: string): Promise<{ ok: boolean }>;
  openExternal(url: string): Promise<{ ok: boolean }>;
  saveLog(payload: { defaultName?: string; content: string }): Promise<string | null>;
  appInfo(): Promise<AppInfo>;
  takeOpenFile(): Promise<string | null>;
  onJobEvent(callback: (event: JobEvent) => void): () => void;
  onOpenFile(callback: (filePath: string) => void): () => void;
  pathForFile(file: File): string;
}

declare global {
  interface Window {
    api: ChdmanApi;
  }
}
