// Tactical Archive PC - preload (contextIsolation: the page only gets these functions)
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taDesktop', {
    isDesktop: true,
    getConfig: () => ipcRenderer.invoke('ta:get-config'),
    setConfig: (partial) => ipcRenderer.invoke('ta:set-config', partial),
    pickFolder: () => ipcRenderer.invoke('ta:pick-folder'),
    listUnprocessed: (opts) => ipcRenderer.invoke('ta:list-unprocessed', opts || {}),
    readFile: (filePath) => ipcRenderer.invoke('ta:read-file', filePath),
    markProcessed: (rec) => ipcRenderer.invoke('ta:mark-processed', rec),
    processedCount: () => ipcRenderer.invoke('ta:processed-count'),
    resetProcessed: () => ipcRenderer.invoke('ta:reset-processed'),
    logDetection: (rec) => {
        try { ipcRenderer.send('ta:log-detection', JSON.parse(JSON.stringify(rec))); } catch (e) { /* ignore */ }
    },
    openDetectionLog: () => ipcRenderer.invoke('ta:open-detection-log'),
    openDataFolder: () => ipcRenderer.invoke('ta:open-data-folder'),
    appInfo: () => ipcRenderer.invoke('ta:app-info')
});
