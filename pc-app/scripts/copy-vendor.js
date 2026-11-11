// Copies the bundled libraries into renderer/vendor (run automatically by `npm start` / `npm run dist`).
//   renderer/vendor/tesseract/       tesseract.js 5.1.1 (main + worker)
//   renderer/vendor/tesseract-core/  tesseract.js-core 5.1.1 (LSTM builds; the .wasm.js files embed the wasm, so the bare .wasm files are not needed)
//   renderer/vendor/tessdata/        jpn.traineddata.gz (4.0.0_best_int, same data the Web version loads from the CDN)
//   renderer/vendor/fontawesome/     Font Awesome Free 6.4.0 (css + woff2 webfonts; no .ttf fallbacks, no brand icons)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const vendor = path.join(root, 'renderer', 'vendor');

function copy(srcRel, dstRel) {
    const src = path.join(nm, srcRel);
    const dst = path.join(vendor, dstRel);
    if (!fs.existsSync(src)) {
        console.error(`[copy-vendor] missing: ${src}\n  -> run "npm install" first`);
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
}

fs.rmSync(vendor, { recursive: true, force: true });
copy('tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js');
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js');
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
    copy(`tesseract.js-core/${f}`, `tesseract-core/${f}`);
}
copy('@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz', 'tessdata/jpn.traineddata.gz');
copy('@fortawesome/fontawesome-free/css/all.min.css', 'fontawesome/css/all.min.css');
for (const f of ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'fa-v4compatibility.woff2']) {
    copy(`@fortawesome/fontawesome-free/webfonts/${f}`, `fontawesome/webfonts/${f}`);
}
copy('@fortawesome/fontawesome-free/LICENSE.txt', 'fontawesome/LICENSE.txt');
copy('tesseract.js/LICENSE.md', 'tesseract/LICENSE.md');
console.log('[copy-vendor] done ->', path.relative(root, vendor));
