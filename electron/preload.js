'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Narrow, typed bridge between the renderer and the main process.
 * Only the operations listed here are exposed to the UI.
 */
contextBridge.exposeInMainWorld('api', {
  detect: () => ipcRenderer.invoke('chdman:detect'),
  setChdmanPath: (value) => ipcRenderer.invoke('chdman:set-path', value),
  chooseChdmanBinary: () => ipcRenderer.invoke('chdman:choose-binary'),
  runSync: (payload) => ipcRenderer.invoke('chdman:run-sync', payload),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  runJob: (job) => ipcRenderer.invoke('job:run', job),
  cancelJob: (id) => ipcRenderer.invoke('job:cancel', id),

  openDialog: (options) => ipcRenderer.invoke('dialog:open', options),

  statPaths: (paths) => ipcRenderer.invoke('fs:stat', paths),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:read-text', filePath),
  probeFile: (filePath) => ipcRenderer.invoke('file:probe', filePath),

  reveal: (target) => ipcRenderer.invoke('shell:reveal', target),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  saveLog: (payload) => ipcRenderer.invoke('log:save', payload),

  appInfo: () => ipcRenderer.invoke('app:info'),
  takeOpenFile: () => ipcRenderer.invoke('app:take-open-file'),

  onJobEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('job:event', listener);
    return () => ipcRenderer.removeListener('job:event', listener);
  },

  onOpenFile: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },

  /** Resolve the on-disk path of a dropped File (Electron >= 32). */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
});
