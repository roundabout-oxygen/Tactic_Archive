// Smoke check of the packaged folder build: OCR worker loads from the trimmed vendor files under the stricter CSP,
// icon font loads (woff2 only), data goes to <exe dir>\data, student icon picker click still works.
(async () => {
    await connect();
    await send('Runtime.enable');
    await send('Page.enable');
    // Record CSP violations from the first script on (then reload so load-time ones are caught too)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || '') + ':' + e.lineNumber));" });
    await send('Page.reload');
    await sleep(1500);
    await waitFor(`document.readyState === 'complete' && !!window.taDesktop && !!window.taApp`, 30000, 'page ready');
    const info = await ev(`window.taDesktop.appInfo()`);
    console.log('  appInfo:', JSON.stringify(info));
    check(/[\\/]data$/.test(info.userData) && path.resolve(info.userData).toLowerCase() === path.join(path.resolve(path.dirname(exe)), 'data').toLowerCase(), 'data folder is next to the exe');
    check(info.version === process.env.TA_EXPECT_VERSION, 'version ' + process.env.TA_EXPECT_VERSION);
    // OCR worker of the app
    await waitFor(`(async () => true)()`, 1000);
    const ocr = await ev(`(async () => {
        const base = new URL('vendor/', location.href).href;
        const w = await Tesseract.createWorker('jpn', 1, { workerPath: base + 'tesseract/worker.min.js', corePath: base + 'tesseract-core', langPath: base + 'tessdata', workerBlobURL: false, cacheMethod: 'none', gzip: true });
        await w.setParameters({ tessedit_pageseg_mode: '7' });
        const c = document.createElement('canvas'); c.width = 520; c.height = 90;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; g.font = '48px "Yu Gothic", "Meiryo", sans-serif'; g.fillText('戦術対抗戦 12345', 10, 62);
        const r = await w.recognize(c);
        await w.terminate();
        return r.data.text.trim();
    })()`);
    console.log('  OCR text:', JSON.stringify(ocr));
    check(/12345/.test(ocr) && /対抗/.test(ocr), 'bundled OCR works (no bare .wasm files, no unsafe-inline)');
    await sleep(300);
    const font = await ev(`(async () => { await document.fonts.ready; await document.fonts.load('900 16px "Font Awesome 6 Free"'); await document.fonts.load('400 16px "Font Awesome 6 Free"'); return { solid: document.fonts.check('900 16px "Font Awesome 6 Free"'), regular: document.fonts.check('400 16px "Font Awesome 6 Free"'), faces: [...document.fonts].filter(f => /Font Awesome/.test(f.family)).map(f => f.family + ' ' + f.weight + ' ' + f.status) }; })()`);
    console.log('  fonts:', JSON.stringify(font));
    check(font.solid && font.regular, 'icon font (woff2) loads');
    // Icon picker: clicking the zone clicks the hidden file input
    const pick = await ev(`(() => { const inp = document.getElementById('student-icon-input'); let n = 0; const orig = inp.click; inp.click = () => { n++; }; document.getElementById('icon-drop-zone').click(); inp.click = orig; return n; })()`);
    check(pick === 1, 'student icon zone opens the file picker (listener instead of inline onclick)');
    const csp = await ev('window.__csp || ["(no recorder)"]');
    console.log('  CSP violations:', JSON.stringify(csp));
    console.log('  console errors:', JSON.stringify(consoleErrors.slice(0, 10)));
    check(csp.length === 0, 'no CSP violations');
    await shot('30-packaged');
    proc.kill();
    process.exit(process.exitCode || 0);
})().catch(e => { console.error('SMOKE ERROR', e); try { proc.kill(); } catch (x) {} process.exit(1); });
