#!/usr/bin/env node
/**
 * Development launcher: starts Vite, then opens Electron pointed at the
 * dev server. Closing the app shuts the server down again.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const viteModule = await import('vite');
const server = await viteModule.createServer({
  root,
  server: { port: 5173, strictPort: true },
});
await server.listen();
const url = `http://localhost:5173`;
console.log(`\n  CHDMAN GUI dev server: ${url}\n`);

const args = [root];
// Chromium's sandbox often needs the SUID helper on immutable distros;
// only opt out when explicitly requested.
if (process.env.ELECTRON_NO_SANDBOX === '1') args.push('--no-sandbox');

const child = spawn(electronBinary, args, {
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: url, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: 'inherit',
});

let closing = false;
const shutdown = async (code = 0) => {
  if (closing) return;
  closing = true;
  await server.close().catch(() => {});
  process.exit(code);
};

child.on('close', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => {
  child.kill('SIGTERM');
  shutdown(0);
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  shutdown(0);
});
