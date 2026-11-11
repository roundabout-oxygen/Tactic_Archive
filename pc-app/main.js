// Tactical Archive PC (Windows desktop) - Electron main process
'use strict';

const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');
const crypto = require('crypto');

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

// Portable data directory: store data in a 'data' folder next to the executable
let dataDir;
if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // electron-builder portable executable sets PORTABLE_EXECUTABLE_DIR to the folder where the .exe sits
    dataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
} else if (app.isPackaged) {
    dataDir = path.join(path.dirname(process.execPath), 'data');
} else if (process.env.TA_USER_DATA) {
    dataDir = path.resolve(process.env.TA_USER_DATA);
} else {
    dataDir = path.join(__dirname, 'data');
}

// Moving from the single-exe build (v1.1.4 and earlier): its data sat in a 'data' folder next to that exe.
// When this folder build is extracted beside it (…\TacticalArchivePC\TacticalArchivePC.exe) and has no data
// yet, copy the old folder in. It is copied, not moved, so the old exe keeps working.
function migrateFromPortableLayout() {
    if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR || fs.existsSync(dataDir)) return;
    const exeDir = path.dirname(process.execPath);
    const oldData = path.join(exeDir, '..', 'data');
    try {
        if (!fs.existsSync(path.join(oldData, 'IndexedDB'))) return;
        const siblings = fs.readdirSync(path.join(exeDir, '..'));
        if (!siblings.some(f => /^TacticalArchivePC.*\.exe$/i.test(f))) return;
        fs.cpSync(oldData, dataDir, { recursive: true, errorOnExist: false });
        console.log('Copied data from the single-exe layout:', oldData);
    } catch (e) {
        console.error('Data migration failed:', e);
    }
}
migrateFromPortableLayout();

try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    app.setPath('userData', dataDir);
} catch (e) {
    console.error('Failed to set custom data directory:', e);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
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

const DEFAULT_ORGANIZE_SUBFOLDER = '取り込み済み';
const CONFIG_DEFAULTS = {
    folder: '',
    includeSubfolders: false,
    // Organize imported screenshots
    organizeEnabled: false,
    organizeSubfolder: DEFAULT_ORGANIZE_SUBFOLDER,
    organizeRename: false,
    // Automatic backup
    backupFolder: '',
    backupOnStartup: true,
    backupAfterPatrol: false,
    backupKeep: 10,
    backupLastSuccess: null,
    backupLastFile: null,
    backupLastError: null,
    // Files the automatic backup wrote into backupFolder: only these are pruned, so full backups
    // saved by hand (same TacticalArchive_Full_ naming) in the same folder are never deleted
    backupWritten: [],
    backupWrittenFolder: '',
    // Content of the last automatic backup (hash ignores created_at) and its number of records
    backupLastHash: '',
    backupLastCount: 0
};
// Values the page may change, with their types (backupLast* are written by the main process only)
const CONFIG_TYPES = {
    includeSubfolders: 'boolean',
    organizeEnabled: 'boolean', organizeSubfolder: 'string', organizeRename: 'boolean',
    backupOnStartup: 'boolean', backupAfterPatrol: 'boolean', backupKeep: 'number'
};

let config = null;
function getConfig() {
    if (!config) config = Object.assign({}, CONFIG_DEFAULTS, readJson(CONFIG_FILE, {}));
    return config;
}
function saveConfig() {
    writeJsonAtomic(CONFIG_FILE, getConfig());
    return getConfig();
}
function setConfig(partial) {
    const c = getConfig();
    if (partial && typeof partial === 'object') {
        for (const [k, t] of Object.entries(CONFIG_TYPES)) {
            if (typeof partial[k] === t) c[k] = partial[k];
        }
        c.organizeSubfolder = sanitizeFolderName(c.organizeSubfolder) || DEFAULT_ORGANIZE_SUBFOLDER;
        c.backupKeep = Math.min(999, Math.max(1, Math.round(Number(c.backupKeep) || 10)));
    }
    return saveConfig();
}

// ---------- file names ----------
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function sanitizeFileNamePart(s, maxLen = 60) {
    let v = String(s == null ? '' : s)
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');
    if (v.length > maxLen) v = v.slice(0, maxLen);
    if (RESERVED_NAMES.test(v)) v = '_' + v;
    return v;
}
function sanitizeFolderName(s) {
    const v = sanitizeFileNamePart(s, 60).replace(/^\.+/, '');
    return v === '.' || v === '..' ? '' : v;
}
// Free path: name.png, name_2.png, name_3.png ...
function uniquePath(dir, base, ext) {
    let p = path.join(dir, base + ext);
    for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base}_${i}${ext}`);
    return p;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function stamp(d = new Date()) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
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

async function listImages(folder, recursive, skipTopDir) {
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
                // The "imported" folder holds screenshots that were already processed
                if (depth === 0 && skipTopDir && ent.name.toLowerCase() === skipTopDir.toLowerCase()) continue;
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
        const all = await listImages(c.folder, !!c.includeSubfolders, c.organizeSubfolder);
        const entries = getProcessed().entries;
        const files = all.filter(f => {
            const rec = entries[processedKey(f.path, f.mtimeMs)];
            if (!rec) return true;
            // Skipped for the aspect ratio: retry if it was previously skipped under single-ratio mode (16:9 or 4:3)
            if (rec.status === 'aspect') {
                if (rec.aspect === '16:9' || rec.aspect === '4:3') return true;
                return false;
            }
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
    // Organize an imported screenshot: move it into <folder>/<subfolder>/ and optionally rename it to
    // "date_opponent_WIN|LOSE_攻撃|防衛.ext". The processed list follows the file (old and new path).
    ipcMain.handle('ta:organize-file', async (_e, req) => {
        const c = getConfig();
        if (!req || typeof req.path !== 'string') return { ok: false, error: 'bad-request' };
        const src = req.path;
        const mtimeMs = Number(req.mtimeMs) || 0;
        const entries = getProcessed().entries;
        entries[processedKey(src, mtimeMs)] = { status: 'imported', at: Date.now(), name: path.basename(src) };
        saveProcessedSoon();
        if (!isInsideFolder(src, c.folder) || !IMAGE_EXTS.has(path.extname(src).toLowerCase())) return { ok: false, error: 'outside-folder' };
        const subName = sanitizeFolderName(c.organizeSubfolder) || DEFAULT_ORGANIZE_SUBFOLDER;
        const destDir = path.join(c.folder, subName);
        const ext = path.extname(src).toLowerCase();
        let base = path.basename(src, path.extname(src));
        if (c.organizeRename && req.record) {
            const r = req.record;
            const d = new Date(Number(r.created_at) || Date.now());
            const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            const opp = sanitizeFileNamePart(r.commander_name || '不明', 40) || '不明';
            const res = r.result === 'LOSE' ? 'LOSE' : 'WIN';
            const type = r.battle_type === 'defense' ? '防衛' : '攻撃';
            base = `${date}_${opp}_${res}_${type}`;
        }
        try {
            if (path.dirname(path.resolve(src)).toLowerCase() === path.resolve(destDir).toLowerCase() && !c.organizeRename) {
                return { ok: true, path: src, unchanged: true };
            }
            await fsp.mkdir(destDir, { recursive: true });
            const dest = uniquePath(destDir, base, ext);
            try {
                await fsp.rename(src, dest);
            } catch (e) {
                if (e.code !== 'EXDEV') throw e;
                await fsp.copyFile(src, dest);
                await fsp.unlink(src);
            }
            const st = await fsp.stat(dest);
            entries[processedKey(dest, Math.round(st.mtimeMs))] = { status: 'imported', at: Date.now(), name: path.basename(dest), movedFrom: path.basename(src) };
            saveProcessedSoon();
            return { ok: true, path: dest };
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    });

    // ----- automatic backup -----
    ipcMain.handle('ta:pick-backup-folder', async () => {
        const c = getConfig();
        const res = await dialog.showOpenDialog(mainWindow, {
            title: '自動バックアップの保存先を選択',
            defaultPath: c.backupFolder || app.getPath('documents'),
            properties: ['openDirectory', 'createDirectory']
        });
        if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
        c.backupFolder = res.filePaths[0];
        saveConfig();
        return c.backupFolder;
    });
    ipcMain.handle('ta:clear-backup-folder', () => {
        const c = getConfig();
        c.backupFolder = '';
        return saveConfig();
    });
    // kind 'full': TacticalArchive_Full_YYYYMMDD_HHMMSS.json in the backup folder, keeping backupKeep files.
    //   Only files written by this automatic backup (config.backupWritten) are pruned.
    //   Unchanged content is not written again (unless req.force), and when the number of records drops
    //   sharply (empty / broken database) the new file is written but nothing is pruned.
    // kind 'pre-edit': TacticalArchive_BeforeEdit_YYYYMMDD_HHMMSS.json in userData/pre-edit-backups (last 20).
    ipcMain.handle('ta:write-backup', async (_e, req) => {
        const c = getConfig();
        const kind = req && req.kind === 'pre-edit' ? 'pre-edit' : 'full';
        const json = req && typeof req.json === 'string' ? req.json : '';
        if (!json) return { ok: false, error: 'empty' };
        const dir = kind === 'full' ? c.backupFolder : userFile('pre-edit-backups');
        const prefix = kind === 'full' ? 'TacticalArchive_Full_' : 'TacticalArchive_BeforeEdit_';
        const keep = kind === 'full' ? c.backupKeep : 20;
        const pattern = new RegExp('^' + prefix + '\\d{8}_\\d{6}(_\\d+)?\\.json$');
        let hash = '', count = 0, pruneBlocked = '';
        try {
            if (!dir) throw new Error('バックアップ先フォルダが未設定です');
            if (kind === 'full') {
                if (c.backupWrittenFolder !== dir) { c.backupWritten = []; c.backupWrittenFolder = dir; c.backupLastHash = ''; c.backupLastCount = 0; }
                try {
                    const data = JSON.parse(json);
                    count = Array.isArray(data.battle_history) ? data.battle_history.length : 0;
                    hash = crypto.createHash('sha256').update(JSON.stringify(Object.assign({}, data, { created_at: '' }))).digest('hex');
                } catch (e) { /* not JSON: write it as is */ }
                const lastExists = c.backupLastFile && fs.existsSync(path.join(dir, c.backupLastFile));
                if (!req.force && hash && hash === c.backupLastHash && lastExists) {
                    return { ok: true, skipped: 'unchanged', file: path.join(dir, c.backupLastFile), deleted: [] };
                }
                if (c.backupLastCount > 0 && count < c.backupLastCount * 0.5) {
                    pruneBlocked = `戦績が前回の ${c.backupLastCount} 件から ${count} 件に減ったため、古いバックアップは削除しませんでした`;
                }
            }
            await fsp.mkdir(dir, { recursive: true });
            const file = uniquePath(dir, prefix + stamp(), '.json');
            const tmp = file + '.tmp';
            await fsp.writeFile(tmp, json, 'utf8');
            await fsp.rename(tmp, file);
            // Generations, newest first by name. Full: only the files this automatic backup wrote.
            const deleted = [];
            const names = await fsp.readdir(dir);
            let mine;
            if (kind === 'full') {
                const present = new Set(names);
                c.backupWritten = (c.backupWritten || []).filter(n => present.has(n) && pattern.test(n)).concat([path.basename(file)]);
                mine = c.backupWritten.slice().sort().reverse();
            } else {
                mine = names.filter(n => pattern.test(n)).sort().reverse();
            }
            if (!pruneBlocked) {
                for (const n of mine.slice(keep)) {
                    try { await fsp.unlink(path.join(dir, n)); deleted.push(n); } catch (e) { /* in use */ }
                }
            }
            if (kind === 'full') {
                const gone = new Set(deleted);
                c.backupWritten = c.backupWritten.filter(n => !gone.has(n));
                c.backupLastSuccess = new Date().toISOString();
                c.backupLastFile = path.basename(file);
                c.backupLastError = null;
                if (hash) c.backupLastHash = hash;
                // A sharp drop does not lower the reference count, so the next run keeps protecting older files
                if (!pruneBlocked) c.backupLastCount = count;
                saveConfig();
            }
            return { ok: true, file, deleted, warning: pruneBlocked || undefined };
        } catch (e) {
            if (kind === 'full') {
                c.backupLastError = { at: new Date().toISOString(), message: e.message || String(e) };
                saveConfig();
            }
            return { ok: false, error: e.message || String(e) };
        }
    });
    // Latest pre-edit backup (for undoing the last bulk edit): { ok, name, mtime, json }
    ipcMain.handle('ta:read-latest-pre-edit', async () => {
        const dir = userFile('pre-edit-backups');
        try {
            const names = (await fsp.readdir(dir)).filter(n => /^TacticalArchive_BeforeEdit_\d{8}_\d{6}(_\d+)?\.json$/.test(n)).sort().reverse();
            if (!names.length) return { ok: false, error: '一括修正前のバックアップがありません' };
            const file = path.join(dir, names[0]);
            const st = await fsp.stat(file);
            return { ok: true, name: names[0], mtime: st.mtimeMs, json: await fsp.readFile(file, 'utf8') };
        } catch (e) {
            return { ok: false, error: e.code === 'ENOENT' ? '一括修正前のバックアップがありません' : (e.message || String(e)) };
        }
    });
    ipcMain.handle('ta:open-folder', async (_e, which) => {
        const c = getConfig();
        const target = which === 'backup' ? c.backupFolder
            : which === 'pre-edit' ? userFile('pre-edit-backups')
            : which === 'screenshots' ? c.folder : '';
        if (!target) return 'フォルダが未設定です';
        await fsp.mkdir(target, { recursive: true }).catch(() => {});
        return shell.openPath(target);
    });

    ipcMain.handle('ta:processed-count', (_e, status) => {
        const all = Object.values(getProcessed().entries);
        return typeof status === 'string' ? all.filter(e => e && e.status === status).length : all.length;
    });
    // status given (e.g. 'nonResult'): forget only those entries, so the next patrol looks at them again
    ipcMain.handle('ta:reset-processed', (_e, status) => {
        const entries = getProcessed().entries;
        if (typeof status === 'string') {
            let n = 0;
            for (const [k, e] of Object.entries(entries)) if (e && e.status === status) { delete entries[k]; n++; }
            saveProcessedSoon();
            return n;
        }
        const n = Object.keys(entries).length;
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
    if (!gotSingleInstanceLock) return;
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
