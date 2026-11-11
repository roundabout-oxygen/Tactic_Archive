// E2E tests of Tactical Archive PC, driven through the Chrome DevTools Protocol.
//
//   node test/e2e/run.js [suite|team-search|fixes|smoke|all] [--zip ../release/TacticalArchivePC.zip]
//
// Without --zip the tests start the dev app (node_modules/electron + this folder) with a fresh data folder.
// With --zip each test extracts the zip into test/e2e/out/ and starts the packaged TacticalArchivePC.exe there
// (its data folder is next to the exe, so a fresh extraction means fresh data). `smoke` checks the packaged
// build only (data folder, version, bundled OCR, icon font, CSP).
// Test data: the anonymized demo data docs/demo/demo-data.json (override with TA_DEMO). Output (screenshots,
// data folders) goes to test/e2e/out/, which git ignores.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const here = __dirname;
const appRoot = path.join(here, '..', '..');
const out = path.join(here, 'out');
const args = process.argv.slice(2);
const zipIdx = args.indexOf('--zip');
const zip = zipIdx >= 0 ? path.resolve(args[zipIdx + 1]) : null;
const which = args.find((a, i) => !a.startsWith('--') && (zipIdx < 0 || i !== zipIdx + 1)) || 'all';
const all = ['suite', 'team-search', 'fixes', 'smoke'];
const tests = which === 'all' ? all : [which];
if (!tests.every(t => all.includes(t))) { console.error('unknown test: ' + which); process.exit(2); }
const demo = process.env.TA_DEMO || path.join(appRoot, '..', 'docs', 'demo', 'demo-data.json');
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));

fs.mkdirSync(out, { recursive: true });
const harness = fs.readFileSync(path.join(here, 'harness.js'), 'utf8');
let failed = 0;
for (const t of tests) {
    if (t === 'smoke' && !zip) { console.log(`\n== ${t}: skipped (needs --zip)`); continue; }
    const seedFile = path.join(here, `${t}.seed.js`);
    const seed = fs.existsSync(seedFile) ? fs.readFileSync(seedFile, 'utf8') : '';
    const script = path.join(out, `${t}.run.js`);
    fs.writeFileSync(script, harness.replace('/*SEED*/', () => seed) + fs.readFileSync(path.join(here, `${t}.body.js`), 'utf8'));
    let exe, appDir = [];
    if (zip) {
        const dir = path.join(out, `pkg-${t}-${Date.now()}`);
        fs.mkdirSync(dir, { recursive: true });
        // Windows 10+ bsdtar reads zip files (call it by path: Git's GNU tar may come first on PATH)
        execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir]);
        exe = path.join(dir, 'TacticalArchivePC', 'TacticalArchivePC.exe');
    } else {
        exe = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
        appDir = [appRoot];
    }
    console.log(`\n== ${t} (${zip ? 'packaged' : 'dev'})`);
    const r = spawnSync(process.execPath, [script, exe, ...appDir], {
        stdio: 'inherit', timeout: 10 * 60 * 1000,
        env: Object.assign({}, process.env, { TA_DEMO: demo, TA_E2E_OUT: out, TA_EXPECT_VERSION: pkg.version })
    });
    if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
