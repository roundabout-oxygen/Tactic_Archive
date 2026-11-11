// Packs dist/win-unpacked into ../release/TacticalArchivePC.zip (run by `npm run dist` after electron-builder).
// The zip holds one top folder, TacticalArchivePC/, with TacticalArchivePC.exe and the Electron runtime files.
// The app keeps its data in TacticalArchivePC/data/, which is never in the zip, so extracting a new version
// over the old folder keeps the data.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const unpacked = path.join(root, 'dist', 'win-unpacked');
const outDir = path.join(root, '..', 'release');
const outZip = path.join(outDir, 'TacticalArchivePC.zip');
const folderName = 'TacticalArchivePC';

if (!fs.existsSync(path.join(unpacked, 'TacticalArchivePC.exe'))) {
    console.error('[make-zip] dist/win-unpacked/TacticalArchivePC.exe not found; run electron-builder first');
    process.exit(1);
}

// Stage the files under the top folder name (never include a data folder from a test run)
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-zip-'));
const stageDir = path.join(stage, folderName);
fs.cpSync(unpacked, stageDir, { recursive: true, filter: src => path.basename(src) !== 'data' || path.dirname(src) !== unpacked });

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(outZip, { force: true });

// 7-Zip gives a smaller zip than PowerShell; electron-builder and electron-winstaller ship one
const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache'),
    path.join(root, 'node_modules', 'electron-winstaller', 'vendor', '7z.exe'),
    path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
];
function find7z() {
    for (const c of candidates) {
        if (!fs.existsSync(c)) continue;
        if (fs.statSync(c).isFile()) return c;
        const stack = [c];
        while (stack.length) {
            const d = stack.pop();
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) stack.push(p);
                else if (/^7za?\.exe$/i.test(e.name)) return p;
            }
        }
    }
    return null;
}

try {
    const sevenZip = find7z();
    if (sevenZip) {
        execFileSync(sevenZip, ['a', '-tzip', '-mx=9', '-mfb=258', '-mpass=15', outZip, folderName], { cwd: stage, stdio: 'ignore' });
    } else {
        execFileSync('powershell.exe', ['-NoProfile', '-Command',
            `Compress-Archive -Path '${stageDir.replace(/'/g, "''")}' -DestinationPath '${outZip.replace(/'/g, "''")}' -CompressionLevel Optimal`], { stdio: 'inherit' });
    }
} finally {
    fs.rmSync(stage, { recursive: true, force: true });
}

const mb = n => (n / 1024 / 1024).toFixed(1) + ' MB';
let unpackedSize = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else unpackedSize += fs.statSync(p).size; } })(unpacked);
console.log(`[make-zip] ${path.relative(root, outZip)}: ${mb(fs.statSync(outZip).size)} (unpacked ${mb(unpackedSize)})`);
