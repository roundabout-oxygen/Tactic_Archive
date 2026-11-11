'use strict';
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    console.log('[afterPack] Pruning unnecessary files from:', appOutDir);

    // 1. Remove unnecessary locales (keep only ja.pak and en-US.pak)
    const localesDir = path.join(appOutDir, 'locales');
    if (fs.existsSync(localesDir)) {
        const paks = fs.readdirSync(localesDir);
        let removedLocales = 0;
        for (const pak of paks) {
            if (pak !== 'ja.pak' && pak !== 'en-US.pak') {
                fs.unlinkSync(path.join(localesDir, pak));
                removedLocales++;
            }
        }
        console.log(`[afterPack] Removed ${removedLocales} unused locale files (kept ja.pak and en-US.pak)`);
    }

    // 2. Remove heavy unused DLLs / auxiliary files
    const unusedFiles = [
        'dxcompiler.dll',             // ~24.6 MB (DirectX 12 shader compiler, not used for standard 2D canvas/UI)
        'vk_swiftshader.dll',         // ~5.2 MB (Vulkan software rasterizer fallback)
        'vk_swiftshader_icd.json',    // Vulkan configuration
        'vulkan-1.dll',               // ~0.9 MB (Vulkan loader)
        'd3dcompiler_47.dll',         // ~4.5 MB (Included in all modern Windows 10/11 system32)
        'LICENSES.chromium.html'      // ~5.4 MB (Raw license HTML, electron license is in LICENSE.electron.txt)
    ];

    for (const f of unusedFiles) {
        const filePath = path.join(appOutDir, f);
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            console.log(`[afterPack] Removed unused file: ${f} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
        }
    }

    // 3. elevate.exe is only used by the NSIS installer
    const targets = (context.targets || []).map(t => t.name);
    if (!targets.includes('nsis')) {
        const elevate = path.join(appOutDir, 'resources', 'elevate.exe');
        if (fs.existsSync(elevate)) {
            fs.unlinkSync(elevate);
            console.log('[afterPack] Removed resources/elevate.exe (not an NSIS build)');
        }
    }

    console.log('[afterPack] Pruning complete.');
};
