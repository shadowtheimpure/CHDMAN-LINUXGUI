'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { spawn } = require('node:child_process');

const IS_DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || '';

/** @type {BrowserWindow | null} */
let mainWindow = null;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTINGS_DEFAULTS = {
  chdmanPath: '',          // explicit override, empty = auto-detect
  concurrency: 1,          // parallel chdman processes
  theme: 'system',         // system | dark | light
  revealOnFinish: false,   // open the output folder when a job succeeds
  lastInputDir: '',
  lastOutputDir: '',
  windowBounds: null,
};

let settings = { ...SETTINGS_DEFAULTS };
let settingsFile = '';

function loadSettings() {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    settings = { ...SETTINGS_DEFAULTS, ...raw };
  } catch {
    settings = { ...SETTINGS_DEFAULTS };
  }
}

let saveTimer = null;
function persistSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fsp.mkdir(path.dirname(settingsFile), { recursive: true });
      await fsp.writeFile(settingsFile, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, 150);
}

/* ------------------------------------------------------------------ */
/* chdman discovery                                                    */
/* ------------------------------------------------------------------ */

const ALLOWED_COMMANDS = new Set([
  'info', 'verify', 'createraw', 'createhd', 'createcd', 'createdvd', 'createld',
  'extractraw', 'extracthd', 'extractcd', 'extractdvd', 'extractld',
  'copy', 'addmeta', 'delmeta', 'dumpmeta', 'listtemplates',
]);

function bundledChdman() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'vendor', 'chdman')
    : path.join(__dirname, '..', 'vendor', 'chdman');
  return {
    bin: path.join(root, 'bin', 'chdman'),
    lib: path.join(root, 'lib'),
  };
}

function whichSync(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function libPathFor(binPath) {
  const bundled = bundledChdman();
  try {
    if (fs.existsSync(bundled.bin) && fs.existsSync(bundled.lib) &&
        fs.realpathSync(binPath) === fs.realpathSync(bundled.bin)) {
      return bundled.lib;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function envFor(binPath) {
  const env = { ...process.env, LC_ALL: 'C' };
  const lib = libPathFor(binPath);
  if (lib) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${lib}:${env.LD_LIBRARY_PATH}` : lib;
  }
  return env;
}

/** Run a short-lived chdman invocation and resolve with its combined output. */
function probeBinary(binPath) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let timer = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      child = spawn(binPath, [], { env: envFor(binPath), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return finish({ ok: false, error: String(err && err.message ? err.message : err) });
    }
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', () => {
      const match = out.match(/CHD\) manager\s+([0-9][0-9.]*)/i);
      if (!match) {
        return finish({ ok: false, error: out.trim() || 'Unrecognised chdman output' });
      }
      finish({ ok: true, version: match[1] });
    });
    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish({ ok: false, error: 'Timed out while probing chdman' });
    }, 15000);
  });
}

let detectionCache = null;

async function detectChdman(force = false) {
  if (!force && detectionCache && Date.now() - detectionCache.at < 15000) {
    return detectionCache.value;
  }
  const candidates = [];
  if (settings.chdmanPath) {
    candidates.push({ path: settings.chdmanPath, source: 'custom' });
  }
  if (process.env.CHDMAN_PATH) {
    candidates.push({ path: process.env.CHDMAN_PATH, source: 'environment' });
  }
  candidates.push({ path: bundledChdman().bin, source: 'bundled' });
  const onPath = whichSync('chdman');
  if (onPath) candidates.push({ path: onPath, source: 'system' });

  const attempted = [];
  for (const candidate of candidates) {
    if (!candidate.path) continue;
    const exists = fs.existsSync(candidate.path);
    if (!exists) {
      attempted.push({ ...candidate, error: 'File not found' });
      continue;
    }
    const probe = await probeBinary(candidate.path);
    if (probe.ok) {
      const value = {
        found: true,
        path: candidate.path,
        source: candidate.source,
        version: probe.version,
        bundled: candidate.source === 'bundled',
        attempted,
      };
      detectionCache = { at: Date.now(), value };
      return value;
    }
    attempted.push({ ...candidate, error: probe.error });
  }
  const value = { found: false, attempted };
  detectionCache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */
/* Job execution                                                       */
/* ------------------------------------------------------------------ */

/** @type {Map<string, {child: import('node:child_process').ChildProcess, timer: NodeJS.Timeout | null, outBuf: string, errBuf: string}>} */
const runningJobs = new Map();

function sendJobEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('job:event', payload);
  }
}

function scheduleFlush(id, entry) {
  if (entry.timer) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    flushJobOutput(id, entry);
  }, 80);
}

function flushJobOutput(id, entry) {
  if (entry.outBuf) {
    sendJobEvent({ id, type: 'stdout', text: entry.outBuf });
    entry.outBuf = '';
  }
  if (entry.errBuf) {
    sendJobEvent({ id, type: 'stderr', text: entry.errBuf });
    entry.errBuf = '';
  }
}

ipcMain.handle('job:run', async (event, job) => {
  if (!job || typeof job.id !== 'string') throw new Error('Invalid job payload');
  if (!ALLOWED_COMMANDS.has(job.command)) throw new Error(`Unsupported command: ${job.command}`);
  if (!Array.isArray(job.args) || job.args.some((a) => typeof a !== 'string')) {
    throw new Error('Invalid argument list');
  }
  if (runningJobs.has(job.id)) throw new Error('Job is already running');

  const detection = await detectChdman();
  if (!detection.found) {
    throw new Error('chdman executable not found. Set its location in Settings.');
  }

  const cwd = job.cwd && fs.existsSync(job.cwd) ? job.cwd : app.getPath('home');
  const startedAt = Date.now();
  let child;
  try {
    child = spawn(detection.path, [job.command, ...job.args], {
      cwd,
      env: envFor(detection.path),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }

  const entry = { child, timer: null, outBuf: '', errBuf: '' };
  runningJobs.set(job.id, entry);
  sendJobEvent({ id: job.id, type: 'started', pid: child.pid, at: startedAt });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    entry.outBuf += chunk;
    scheduleFlush(job.id, entry);
  });
  child.stderr.on('data', (chunk) => {
    entry.errBuf += chunk;
    scheduleFlush(job.id, entry);
  });

  const finish = (code, signal, error) => {
    const current = runningJobs.get(job.id);
    if (!current) return;
    runningJobs.delete(job.id);
    clearTimeout(current.timer);
    current.timer = null;
    flushJobOutput(job.id, current);
    sendJobEvent({
      id: job.id,
      type: 'exit',
      code,
      signal: signal || null,
      error: error || null,
      durationMs: Date.now() - startedAt,
    });
  };

  child.on('error', (err) => finish(null, null, err.message));
  child.on('close', (code, signal) => finish(code, signal, null));

  return { ok: true, id: job.id };
});

ipcMain.handle('job:cancel', async (event, id) => {
  const entry = runningJobs.get(id);
  if (!entry) return { ok: false, error: 'Job is not running' };
  try {
    entry.child.kill('SIGTERM');
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  setTimeout(() => {
    const still = runningJobs.get(id);
    if (still) {
      try { still.child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }, 4000);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* IPC: environment, dialogs, filesystem                               */
/* ------------------------------------------------------------------ */

ipcMain.handle('chdman:detect', async () => detectChdman(true));

ipcMain.handle('chdman:run-sync', async (event, payload = {}) => {
  const command = payload.command;
  if (!ALLOWED_COMMANDS.has(command)) {
    return { ok: false, code: -1, stdout: '', stderr: `Unsupported command: ${command}` };
  }
  const args = Array.isArray(payload.args) ? payload.args.filter((a) => typeof a === 'string') : [];
  const detection = await detectChdman();
  if (!detection.found) {
    return { ok: false, code: -1, stdout: '', stderr: 'chdman executable not found' };
  }
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      child = spawn(detection.path, [command, ...args], {
        cwd: app.getPath('home'),
        env: envFor(detection.path),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return finish({ ok: false, code: -1, stdout, stderr: String(err) });
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}\nTimed out` });
    }, 60000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => finish({ ok: false, code: -1, stdout, stderr: err.message }));
    child.on('close', (code) => finish({ ok: code === 0, code, stdout, stderr }));
  });
});

ipcMain.handle('chdman:set-path', async (event, value) => {
  settings.chdmanPath = typeof value === 'string' ? value : '';
  persistSettings();
  return detectChdman(true);
});

ipcMain.handle('chdman:choose-binary', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Select chdman executable',
    properties: ['openFile'],
    defaultPath: settings.lastInputDir || app.getPath('home'),
  });
  if (result.canceled || !result.filePaths.length) return null;
  settings.chdmanPath = result.filePaths[0];
  persistSettings();
  return detectChdman(true);
});

ipcMain.handle('settings:get', async () => settings);

ipcMain.handle('settings:set', async (event, patch) => {
  if (!patch || typeof patch !== 'object') return settings;
  const next = { ...settings };
  if (typeof patch.chdmanPath === 'string') next.chdmanPath = patch.chdmanPath;
  if (Number.isFinite(patch.concurrency)) next.concurrency = Math.min(4, Math.max(1, Math.round(patch.concurrency)));
  if (typeof patch.theme === 'string' && ['system', 'dark', 'light'].includes(patch.theme)) {
    next.theme = patch.theme;
    nativeTheme.themeSource = patch.theme;
  }
  if (typeof patch.revealOnFinish === 'boolean') next.revealOnFinish = patch.revealOnFinish;
  if (typeof patch.lastInputDir === 'string') next.lastInputDir = patch.lastInputDir;
  if (typeof patch.lastOutputDir === 'string') next.lastOutputDir = patch.lastOutputDir;
  if (next.chdmanPath !== settings.chdmanPath) detectionCache = null;
  settings = next;
  persistSettings();
  return settings;
});

ipcMain.handle('dialog:open', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const title = typeof options.title === 'string' ? options.title : 'Select file';
  const filters = Array.isArray(options.filters) ? options.filters : [{ name: 'All files', extensions: ['*'] }];

  if (options.directory) {
    const result = await dialog.showOpenDialog(win, {
      title,
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: options.defaultPath || settings.lastInputDir || app.getPath('home'),
    });
    return result.canceled ? [] : result.filePaths;
  }

  if (options.save) {
    const result = await dialog.showSaveDialog(win, {
      title,
      defaultPath: options.defaultPath || undefined,
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return [];
    let filePath = result.filePath;
    if (options.extension && !path.extname(filePath)) {
      filePath += `.${String(options.extension).replace(/^\./, '')}`;
    }
    return [filePath];
  }

  const properties = ['openFile'];
  if (options.multi) properties.push('multiSelections');
  const result = await dialog.showOpenDialog(win, {
    title,
    properties,
    filters,
    defaultPath: options.defaultPath || settings.lastInputDir || app.getPath('home'),
  });
  if (!result.canceled && result.filePaths[0]) {
    settings.lastInputDir = path.dirname(result.filePaths[0]);
    persistSettings();
  }
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('fs:stat', async (event, paths) => {
  if (!Array.isArray(paths)) return [];
  return Promise.all(paths.map(async (p) => {
    if (typeof p !== 'string' || !p) return { path: p, exists: false };
    try {
      const st = await fsp.stat(p);
      return {
        path: p,
        exists: true,
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
        size: st.size,
        mtime: st.mtimeMs,
      };
    } catch {
      return { path: p, exists: false };
    }
  }));
});

ipcMain.handle('fs:read-text', async (event, filePath) => {
  if (typeof filePath !== 'string') return null;
  try {
    const st = await fsp.stat(filePath);
    if (st.size > 4 * 1024 * 1024) return null;
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('shell:reveal', async (event, target) => {
  if (typeof target !== 'string' || !target) return { ok: false };
  try {
    const st = await fsp.stat(target);
    if (st.isDirectory()) {
      await shell.openPath(target);
    } else {
      shell.showItemInFolder(target);
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('shell:open-external', async (event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('log:save', async (event, payload = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save log',
    defaultPath: payload.defaultName || 'chdman-log.txt',
    filters: [{ name: 'Text file', extensions: ['txt', 'log'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fsp.writeFile(result.filePath, String(payload.content || ''), 'utf8');
  return result.filePath;
});

ipcMain.handle('app:info', async () => ({
  appVersion: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
  userData: app.getPath('userData'),
}));

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  const bounds = settings.windowBounds;
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(bounds && bounds.width ? bounds.width : 1360, workArea.width - 40);
  const height = Math.min(bounds && bounds.height ? bounds.height : 900, workArea.height - 60);

  mainWindow = new BrowserWindow({
    width,
    height,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    minWidth: Math.min(1040, width),
    minHeight: Math.min(700, height),
    show: false,
    backgroundColor: '#0f1116',
    title: 'CHDMAN GUI',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      settings.windowBounds = b;
      persistSettings();
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadSettings();
    nativeTheme.themeSource = settings.theme;
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const [, entry] of runningJobs) {
    try { entry.child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  runningJobs.clear();
});
