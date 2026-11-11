// E2E check of Tactical Archive PC through the Chrome DevTools Protocol.
// Shared CDP harness, prepended to each *.body.js by run.js (do not run directly).
// argv: <exe-or-electron> [appDir]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRATCH = process.env.TA_E2E_OUT || __dirname;
const exe = process.argv[2];
const appDir = process.argv[3];
let UD = path.join(SCRATCH, 'ud-' + Date.now());
// Packaged build (no appDir): the app ignores TA_USER_DATA and keeps its data next to the exe
if (!appDir) UD = path.join(path.dirname(exe), 'data');
const IMG = path.join(SCRATCH, 'shots-' + Date.now());
fs.mkdirSync(IMG, { recursive: true });
/*SEED*/
const PORT = 9333 + Math.floor(Math.random() * 300);

const args = (appDir ? [appDir] : []).concat([`--remote-debugging-port=${PORT}`]);
const proc = spawn(exe, args, { env: Object.assign({}, process.env, { TA_USER_DATA: UD }), stdio: ['ignore', 'pipe', 'pipe'] });
proc.stdout.on('data', d => process.stdout.write('[app] ' + d));
proc.stderr.on('data', d => { const s = String(d); if (!/DevTools listening|GPU|gpu_|Autofill/.test(s)) process.stdout.write('[app-err] ' + s); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, msgId = 0;
const pending = new Map();
const consoleErrors = [];

async function connect() {
    for (let i = 0; i < 80; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            const page = list.find(p => p.type === 'page' && p.url.startsWith('app://bundle'));
            if (page) {
                ws = new WebSocket(page.webSocketDebuggerUrl);
                await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
                ws.onmessage = (ev) => {
                    const m = JSON.parse(ev.data);
                    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
                    else if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
                    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) consoleErrors.push(m.params.type + ' ' + m.params.args.map(a => a.value || a.description).join(' '));
                    else if (m.method === 'Runtime.consoleAPICalled' && /ResultCheck|Tesseract|Patrol|Opponent Raw OCR|BattleType\] Corr/.test(JSON.stringify(m.params.args))) console.log('  [console]', m.params.args.map(a => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : a.value) : a.description).join(' ').slice(0, 400));
                };
                return;
            }
        } catch (e) { /* not yet */ }
        await sleep(250);
    }
    throw new Error('could not connect');
}
function send(method, params = {}) {
    return new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result.result.value;
}
async function waitFor(expr, ms = 20000, label = expr) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (e) { /* page busy */ }
        await sleep(200);
    }
    throw new Error('timeout: ' + label);
}
async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCRATCH, name + '.png'), Buffer.from(r.result.data, 'base64'));
}
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

