#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Launches the built app with the Chrome DevTools Protocol enabled, drives
 * the real renderer (set input → Run now → wait for completion), and checks
 * the generated files with chdman itself.
 *
 * Usage: node scripts/smoke-ui.mjs [--keep-open]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_CDP_PORT || 9333);
const keepOpen = process.argv.includes('--keep-open');

const workDir = path.join(root, '.smoke');
const cuePath = path.join(workDir, 'audio.cue');
const chdPath = path.join(workDir, 'audio.chd');
const binPath = path.join(workDir, 'audio.bin');

function log(msg) {
  console.log(`\x1b[36m•\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exitCode = 1;
  shutdown();
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

function prepareFixtures() {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const sectors = 600; // 600 * 2352 = 1,411,200 bytes
  const buf = Buffer.alloc(sectors * 2352);
  for (let i = 0; i < buf.length; i += 1) buf[i] = (i * 31 + 7) & 0xff;
  fs.writeFileSync(binPath, buf);
  fs.writeFileSync(
    cuePath,
    'FILE "audio.bin" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n',
  );
  log(`fixtures in ${workDir}`);
}

/* ---------------------------------------------------------------- */
/* CDP plumbing                                                      */
/* ---------------------------------------------------------------- */

let child = null;
let socket = null;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error('CDP socket is not open'));
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result?.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(expression, label, timeout = 90000, interval = 250) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await evaluate(expression);
      if (last) return last;
    } catch {
      /* page may still be loading */
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label} (last value: ${JSON.stringify(last)})`);
}

async function connect() {
  const deadline = Date.now() + 30000;
  let target = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      target = targets.find((t) => t.type === 'page' && /index\.html|localhost:5173/.test(t.url));
      if (target) break;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  if (!target) throw new Error('Could not find the app window over CDP');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
}

/* ---------------------------------------------------------------- */
/* Page helpers                                                      */
/* ---------------------------------------------------------------- */

const SET_INPUT = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const CLICK_TEXT = (text, scope = 'button') => `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(scope)})]
    .find((node) => node.textContent.trim() === ${JSON.stringify(text)} ||
                    node.textContent.trim().startsWith(${JSON.stringify(text)}));
  if (!el) return false;
  el.click();
  return true;
})()`;

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(root, '.smoke', name);
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  log(`screenshot → ${file}`);
}

/* ---------------------------------------------------------------- */
/* Scenario                                                          */
/* ---------------------------------------------------------------- */

async function scenario() {
  await waitFor('!!document.querySelector(".sidebar")', 'UI shell');
  log('UI shell rendered');
  await screenshot('01-create-cd.png');

  // --- create a CHD from the cue sheet -----------------------------
  if (!(await evaluate(SET_INPUT('#f-input', cuePath)))) throw new Error('Input field missing');
  await sleep(200);
  const suggested = await evaluate('document.querySelector("#f-output")?.value');
  if (suggested !== chdPath) {
    throw new Error(`Unexpected auto output path: ${suggested}`);
  }
  log(`output auto-filled: ${suggested}`);

  if (!(await evaluate(CLICK_TEXT('Add to queue')))) throw new Error('Queue button missing');
  log('queued createcd job');

  const cardText = await waitFor(
    `(() => { const c = [...document.querySelectorAll('.job-card')].pop();
      return c && /Done|Failed/.test(c.innerText) ? c.innerText : null; })()`,
    'createcd completion',
  );
  if (!/Done/.test(cardText)) throw new Error(`createcd failed:\n${cardText}`);
  log('createcd finished successfully');
  await screenshot('02-create-cd-done.png');

  if (!fs.existsSync(chdPath)) throw new Error('CHD file was not created');
  const chdSize = fs.statSync(chdPath).size;
  log(`chd written: ${chdSize.toLocaleString()} bytes`);

  // Open the log dialog and confirm progress output was captured.
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.job-card')].pop();
    [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Log')?.click();
  })()`);
  const logText = await waitFor(
    'document.querySelector(".log-view")?.innerText || null',
    'log dialog',
  );
  if (!/Compress/i.test(logText)) throw new Error(`Unexpected log contents:\n${logText}`);
  log('progress log captured');
  await screenshot('03-log-dialog.png');
  await evaluate(CLICK_TEXT('Close'));

  // --- inspect the new CHD ----------------------------------------
  await evaluate(CLICK_TEXT('Info', '.nav-item'));
  await waitFor('!!document.querySelector("#f-input")', 'info form');
  await evaluate(SET_INPUT('#f-input', chdPath));
  await sleep(100);
  await evaluate(CLICK_TEXT('Run now'));
  await waitFor(
    `(() => { const c = [...document.querySelectorAll('.job-card')].pop();
      return c && /Done|Failed/.test(c.innerText) ? c.innerText : null; })()`,
    'info completion',
  );
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.job-card')].pop();
    [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Summary')?.click();
  })()`);
  const summary = await waitFor(
    'document.querySelector(".summary-body")?.innerText || null',
    'info summary',
  );
  if (!/SHA-1/.test(summary) || !/Logical size/.test(summary)) {
    throw new Error(`Summary looks wrong:\n${summary}`);
  }
  log('info summary parsed correctly');
  await screenshot('04-info-summary.png');
  await evaluate(CLICK_TEXT('Close'));

  // --- extract the cue/bin back -----------------------------------
  await evaluate(CLICK_TEXT('CHD → CD image', '.nav-item'));
  await waitFor('!!document.querySelector("#f-input")', 'extract form');
  const extractedCue = path.join(workDir, 'extracted.cue');
  await evaluate(SET_INPUT('#f-input', chdPath));
  await sleep(150);
  await evaluate(SET_INPUT('#f-output', extractedCue));
  await evaluate(CLICK_TEXT('Run now'));
  const extractCard = await waitFor(
    `(() => { const c = [...document.querySelectorAll('.job-card')].pop();
      return c && /Done|Failed/.test(c.innerText) ? c.innerText : null; })()`,
    'extract completion',
  );
  if (!/Done/.test(extractCard)) throw new Error(`extractcd failed:\n${extractCard}`);
  if (!fs.existsSync(extractedCue)) throw new Error('Extracted cue sheet missing');
  log('extractcd produced the cue sheet');
  await screenshot('05-extract-done.png');

  // --- wrong extractor is detected and offers the right command -----
  await evaluate(CLICK_TEXT('CHD → DVD / ISO', '.nav-item'));
  await waitFor('!!document.querySelector("#f-input")', 'extract dvd form');
  await evaluate(SET_INPUT('#f-input', chdPath));
  const guard = await waitFor(
    `(() => {
      const button = [...document.querySelectorAll('.banner-warn button')]
        .find((b) => b.textContent.includes('Switch to CHD → CD image'));
      return button ? button.textContent.trim() : null;
    })()`,
    'wrong-extractor warning',
  );
  log(`mismatch guard shown: "${guard}"`);
  await screenshot('05b-mismatch-guard.png');
  await evaluate(CLICK_TEXT('Switch to CHD → CD image'));
  await waitFor(
    `document.querySelector('.page-header h1')?.innerText === 'CHD → CD image'`,
    'switch to CD extractor',
  );
  const carriedInput = await evaluate('document.querySelector("#f-input")?.value || null');
  if (carriedInput !== chdPath) {
    throw new Error(`Input path was not preserved when switching commands (${carriedInput})`);
  }
  log('command switched to the CD extractor with the input preserved');

  // --- HDD template browser ---------------------------------------
  await evaluate(CLICK_TEXT('HDD templates', '.nav-item'));
  await waitFor(
    'document.querySelectorAll(".data-table tbody tr").length > 5',
    'template table',
  );
  const templateCount = await evaluate('document.querySelectorAll(".data-table tbody tr").length');
  log(`template browser listed ${templateCount} drives`);
  await sleep(2700); // let the toast fade so screenshots stay clean
  await screenshot('06-templates.png');
  if (!(await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.data-table tbody tr button')]
      .find((b) => b.textContent.trim().startsWith('Use'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`))) {
    throw new Error('Template "Use" action missing');
  }
  const prefill = await waitFor(
    'document.querySelector("#f-template")?.value || null',
    'createhd prefill',
  );
  if (prefill !== '0') throw new Error(`Template was not applied (got ${prefill})`);
  log('template hands off to Create Hard Disk form');
  await screenshot('06b-createhd.png');

  // --- settings page ----------------------------------------------
  await evaluate(CLICK_TEXT('Settings', '.nav-item'));
  await waitFor('!!document.querySelector(".settings-page")', 'settings page');
  const settingsText = await evaluate('document.querySelector(".settings-page").innerText');
  if (!/chdman engine/.test(settingsText)) throw new Error('Settings page incomplete');
  log('settings page rendered');
  await sleep(2700);
  await screenshot('07-settings.png');

  console.log('\n\x1b[32m✔ All smoke checks passed\x1b[0m');
}

/* ---------------------------------------------------------------- */
/* Lifecycle                                                         */
/* ---------------------------------------------------------------- */

function shutdown() {
  try {
    socket?.close();
  } catch {
    /* ignore */
  }
  if (child && !child.killed) child.kill('SIGTERM');
  if (!keepOpen) {
    setTimeout(() => process.exit(process.exitCode ?? 0), 600);
  }
}

async function main() {
  prepareFixtures();
  const extraArgs = process.env.ELECTRON_NO_SANDBOX === '1' ? ['--no-sandbox'] : [];
  child = spawn(electronBinary, [root, ...extraArgs, `--remote-debugging-port=${port}`], {
    cwd: root,
    env: { ...process.env, CHDMAN_GUI_SMOKE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`\x1b[90m${d}\x1b[0m`));
  child.stderr.on('data', (d) => process.stdout.write(`\x1b[90m${d}\x1b[0m`));
  child.on('close', (code) => {
    if (process.exitCode) return;
    if (code && code !== 0) {
      console.error(`\x1b[31mElectron exited with code ${code}\x1b[0m`);
      process.exitCode = 1;
    }
    if (!keepOpen) process.exit(process.exitCode ?? 0);
  });

  await connect();
  try {
    await scenario();
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }
  if (keepOpen) {
    log('App left running (--keep-open)');
  } else {
    shutdown();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
