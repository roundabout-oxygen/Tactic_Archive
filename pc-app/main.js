// Tactical Archive PC (Windows desktop) - Electron main process
'use strict';

const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');

const RENDERER_DIR = path.join(__dirname, 'renderer');
const APP_ORIGIN = 'app://bundle';
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
// Outcomes that mean "done with this file" (an 'error' is retried on the next patrol)
const PROCESSED_STATUSES = new Set(['imported', 'nonResult', 'aspect', 'duplicate', 'userSkipped']);
const DETECTION_LOG_MAX_BYTES = 5 * 1024 * 1024;

// Serve the renderer from app://bundle/ (stable origin for IndexedDB / localStorage, workers and fetch work)
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

// For testing: TA_USER_DATA=<folder> keeps the data (IndexedDB, settings, processed list) in another folder
if (process.env.TA_USER_DATA) {
    app.setPath('userData', path.resolve(process.env.TA_USER_DATA));
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

let mainWindow = null;

// ---------- small JSON stores in userData ----------
function userFile(name) {
    return path.join(app.getPath('userData'), name);
}
function readJson(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(userFile(name), 'utf8'));
    } catch (e) {
        return fallback;
    }
}
function writeJsonAtomic(name, data) {
    const file = userFile(name);
    const tmp = file + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, file);
}

const CONFIG_FILE = 'config.json';
const PROCESSED_FILE = 'processed-files.json';
const DETECTION_LOG = 'result-detection-log.jsonl';

let config = null;
function getConfig() {
    if (!config) config = Object.assign({ folder: '', includeSubfolders: false }, readJson(CONFIG_FILE, {}));
    return config;
}
function setConfig(partial) {
    const c = getConfig();
    if (partial && typeof partial === 'object') {
        if (typeof partial.folder === 'string') c.folder = partial.folder;
        if (typeof partial.includeSubfolders === 'boolean') c.includeSubfolders = partial.includeSubfolders;
    }
    writeJsonAtomic(CONFIG_FILE, c);
    return c;
}

let processed = null; // { version, entries: { "<path>|<mtimeMs>": { status, at, name, aspect? } } }
let processedSaveTimer = null;
function getProcessed() {
    if (!processed) {
        processed = readJson(PROCESSED_FILE, null);
        if (!processed || typeof processed.entries !== 'object') processed = { version: 1, entries: {} };
    }
    return processed;
}
function saveProcessedSoon() {
    clearTimeout(processedSaveTimer);
    processedSaveTimer = setTimeout(() => {
        try { writeJsonAtomic(PROCESSED_FILE, getProcessed()); } catch (e) { console.error('save processed failed', e); }
    }, 300);
}
function flushProcessed() {
    if (processedSaveTimer) {
        clearTimeout(processedSaveTimer);
        processedSaveTimer = null;
        try { writeJsonAtomic(PROCESSED_FILE, getProcessed()); } catch (e) {}
    }
}
function processedKey(filePath, mtimeMs) {
    return path.resolve(filePath).toLowerCase() + '|' + Math.round(mtimeMs);
}

function isInsideFolder(filePath, folder) {
    if (!folder) return false;
    const rel = path.relative(path.resolve(folder), path.resolve(filePath));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function listImages(folder, recursive) {
    const out = [];
    async function walk(dir, depth) {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                if (recursive && depth < 8) await walk(full, depth + 1);
            } else if (ent.isFile() && IMAGE_EXTS.has(path.extname(ent.name).toLowerCase())) {
                try {
                    const st = await fsp.stat(full);
                    out.push({ path: full, name: ent.name, mtimeMs: Math.round(st.mtimeMs), size: st.size });
                } catch (e) { /* vanished */ }
            }
        }
    }
    await walk(folder, 0);
    return out;
}

// ---------- IPC ----------
function registerIpc() {
    ipcMain.handle('ta:get-config', () => getConfig());
    ipcMain.handle('ta:set-config', (_e, partial) => setConfig(partial));

    ipcMain.handle('ta:pick-folder', async () => {
        const c = getConfig();
        const res = await dialog.showOpenDialog(mainWindow, {
            title: 'スクリーンショットフォルダを選択',
            defaultPath: c.folder || app.getPath('pictures'),
            properties: ['openDirectory']
        });
        if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
        setConfig({ folder: res.filePaths[0] });
        return res.filePaths[0];
    });

    // Images in the registered folder that were not processed yet (oldest first)
    ipcMain.handle('ta:list-unprocessed', async (_e, opts) => {
        const c = getConfig();
        if (!c.folder) return { ok: false, error: 'no-folder' };
        try {
            const st = await fsp.stat(c.folder);
            if (!st.isDirectory()) return { ok: false, error: 'not-found' };
        } catch (e) {
            return { ok: false, error: 'not-found' };
        }
        const aspect = opts && opts.aspect;
        const all = await listImages(c.folder, !!c.includeSubfolders);
        const entries = getProcessed().entries;
        const files = all.filter(f => {
            const rec = entries[processedKey(f.path, f.mtimeMs)];
            if (!rec) return true;
            // Skipped for the aspect ratio: look again after the aspect ratio setting is changed
            if (rec.status === 'aspect') return !!aspect && rec.aspect !== aspect;
            return false;
        });
        files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
        return { ok: true, total: all.length, files };
    });

    ipcMain.handle('ta:read-file', async (_e, filePath) => {
        const c = getConfig();
        if (typeof filePath !== 'string' || !isInsideFolder(filePath, c.folder) || !IMAGE_EXTS.has(path.extname(filePath).toLowerCase())) {
            throw new Error('このファイルは読み込めません');
        }
        return await fsp.readFile(filePath); // Buffer -> Uint8Array in the renderer
    });

    ipcMain.handle('ta:mark-processed', (_e, rec) => {
        if (!rec || typeof rec.path !== 'string' || !PROCESSED_STATUSES.has(rec.status)) return false;
        const entry = { status: rec.status, at: Date.now(), name: path.basename(rec.path) };
        if (rec.status === 'aspect' && typeof rec.aspect === 'string') entry.aspect = rec.aspect;
        getProcessed().entries[processedKey(rec.path, Number(rec.mtimeMs) || 0)] = entry;
        saveProcessedSoon();
        return true;
    });
    ipcMain.handle('ta:processed-count', () => Object.keys(getProcessed().entries).length);
    ipcMain.handle('ta:reset-processed', () => {
        const n = Object.keys(getProcessed().entries).length;
        processed = { version: 1, entries: {} };
        saveProcessedSoon();
        return n;
    });

    ipcMain.on('ta:log-detection', (_e, rec) => {
        try {
            const file = userFile(DETECTION_LOG);
            try {
                if (fs.statSync(file).size > DETECTION_LOG_MAX_BYTES) fs.renameSync(file, file + '.old');
            } catch (e) { /* no log yet */ }
            fs.appendFileSync(file, JSON.stringify(Object.assign({ at: new Date().toISOString() }, rec)) + '\n', 'utf8');
        } catch (e) {
            console.error('detection log failed', e);
        }
    });
    ipcMain.handle('ta:open-detection-log', async () => {
        const file = userFile(DETECTION_LOG);
        if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
        const err = await shell.openPath(file);
        return err || '';
    });
    ipcMain.handle('ta:open-data-folder', async () => shell.openPath(app.getPath('userData')));
    ipcMain.handle('ta:app-info', () => ({ version: app.getVersion(), userData: app.getPath('userData') }));
}

// ---------- window ----------
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 960,
        minHeight: 640,
        title: 'Tactical Archive PC',
        icon: path.join(RENDERER_DIR, 'icon.png'),
        backgroundColor: '#f4f7fb',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false
        }
    });
    Menu.setApplicationMenu(null);

    // Only the bundled pages; links to the web open in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(APP_ORIGIN + '/')) {
            e.preventDefault();
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        }
    });
    // F12 / Ctrl+Shift+I: developer tools (for checking logs), Ctrl+R / F5: reload
    mainWindow.webContents.on('before-input-event', (e, input) => {
        if (input.type !== 'keyDown') return;
        const key = (input.key || '').toLowerCase();
        if (key === 'f12' || (input.control && input.shift && key === 'i')) {
            mainWindow.webContents.toggleDevTools();
            e.preventDefault();
        } else if (key === 'f5' || (input.control && key === 'r')) {
            mainWindow.webContents.reload();
            e.preventDefault();
        }
    });

    mainWindow.loadURL(APP_ORIGIN + '/index.html');
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(() => {
    protocol.handle('app', (request) => {
        const url = new URL(request.url);
        if (url.host !== 'bundle') return new Response('Not found', { status: 404 });
        let rel = decodeURIComponent(url.pathname);
        if (rel === '/' || rel === '') rel = '/index.html';
        const file = path.normalize(path.join(RENDERER_DIR, rel));
        if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
    });
    registerIpc();
    createWindow();
});

app.on('before-quit', flushProcessed);
app.on('window-all-closed', () => {
    flushProcessed();
    app.quit();
});
