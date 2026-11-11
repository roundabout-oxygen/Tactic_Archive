// v1.1.6 fixes (run on the dev app or the packaged build; loads the anonymized demo data first):
//  1. two organize requests that end up with the same name never overwrite each other
//  3. right after startup, taApp.getHistory() waits for the full history instead of returning a partial list
//  4. Cancel is disabled while a bulk edit runs
// Before launch (fixes.seed.js): config.json has folder = ORG, organizeEnabled, organizeRename.
const DEMO = JSON.parse(fs.readFileSync(process.env.TA_DEMO, 'utf8'));

(async () => {
    await connect();
    await send('Runtime.enable');
    await send('Page.enable');
    await waitFor(`document.readyState === 'complete' && !!window.taDesktop && !!window.taApp`, 30000, 'page ready');
    await sleep(800);
    await ev(`(() => { const p = document.getElementById('welcome-use-preset'); if (p) p.checked = false; const a = document.querySelector('[data-aspect-choice="16:9"]'); if (a) a.click(); const b = document.getElementById('btn-welcome-start'); if (b) b.click(); return true; })()`);
    await sleep(500);
    await ev(`(async () => {
        const data = ${JSON.stringify({ roster: DEMO.roster_students, history: DEMO.battle_history, opp: DEMO.opponent_directory })};
        const db = await new Promise((res, rej) => { const r = indexedDB.open('TacticalArchiveDB'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        await new Promise((res, rej) => {
            const tx = db.transaction(['roster_students', 'battle_history', 'opponent_directory'], 'readwrite');
            data.roster.forEach(s => tx.objectStore('roster_students').put(s));
            data.history.forEach(h => tx.objectStore('battle_history').put(h));
            data.opp.forEach(o => tx.objectStore('opponent_directory').put(o));
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        await window.taApp.reloadAll();
        return true;
    })()`);
    // 3. Ask for the history before app.js has started its background load (first DOMContentLoaded listener)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded', () => { window.__early = 'pending'; window.taApp.getHistory().then(h => { window.__early = h.length; }, e => { window.__early = 'error ' + e; }); });" });
    await send('Page.reload');
    await sleep(1500);
    await waitFor(`document.readyState === 'complete' && !!window.taDesktop && !!window.taApp`, 30000, 'page ready');
    await waitFor(`typeof window.__early === 'number'`, 30000, 'early history');
    const early = await ev(`window.__early`);
    const dbCount = await ev(`new Promise((res, rej) => { const r = indexedDB.open('TacticalArchiveDB'); r.onsuccess = () => { const q = r.result.transaction('battle_history').objectStore('battle_history').count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; })`);
    console.log('  early getHistory():', early, 'records in DB:', dbCount);
    check(dbCount > 15 && early === dbCount, 'history asked for during startup has every record (not the first 15)');

    // 1. Two images, same target name, organized at the same time
    const rec = { created_at: Date.parse('2026-11-05T12:00:00'), commander_name: '同名テスト', result: 'WIN', battle_type: 'attack' };
    const a = path.join(ORG, 'a.png'), b = path.join(ORG, 'b.png');
    const r = await ev(`Promise.all([
        window.taDesktop.organizeFile({ path: ${JSON.stringify(a)}, mtimeMs: 1, record: ${JSON.stringify(rec)} }),
        window.taDesktop.organizeFile({ path: ${JSON.stringify(b)}, mtimeMs: 2, record: ${JSON.stringify(rec)} })
    ])`);
    const dest = fs.readdirSync(path.join(ORG, '取り込み済み')).sort();
    const sizes = dest.map(n => fs.statSync(path.join(ORG, '取り込み済み', n)).size);
    console.log('  organize:', JSON.stringify(r.map(x => x.ok && path.basename(x.path))), 'folder:', dest.join(', '), sizes.join(','));
    check(r.every(x => x.ok) && dest.length === 3 && dest.includes('2026-11-05_同名テスト_WIN_攻撃_2.png') && dest.includes('2026-11-05_同名テスト_WIN_攻撃_3.png')
        && new Set(sizes).size === 3 && !fs.existsSync(a) && !fs.existsSync(b), 'overlapping organize runs get _2 / _3 and keep the existing file (nothing overwritten)');

    // 4. Cancel disabled while the bulk opponent rename runs
    const opp = await ev(`window.taApp.getHistory().then(h => { const c = {}; h.forEach(x => { c[x.commander_name] = (c[x.commander_name] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; })`);
    await ev(`window.confirm = () => true; window.taShowAlert = async () => true; document.getElementById('btn-bulk-opponent').click(); true`);
    await sleep(800);
    const during = await ev(`(() => { const o = document.getElementById('bo-old'), n = document.getElementById('bo-new'); o.value = ${JSON.stringify(opp)}; o.dispatchEvent(new Event('input')); n.value = ${JSON.stringify(opp + '_改')}; n.dispatchEvent(new Event('input')); const run = document.querySelector('.ta-dialog-actions [data-act="run"]'); const runnable = !run.disabled; run.click(); const cancel = document.querySelector('.ta-dialog-actions [data-act="cancel"]'); return { runnable, cancelDisabled: cancel.disabled }; })()`);
    await waitFor(`!document.getElementById('bo-old')`, 30000, 'rename done');
    console.log('  during:', JSON.stringify(during));
    check(during.runnable && during.cancelDisabled, 'Cancel is disabled while the bulk edit runs');
    const errs = consoleErrors.filter(e => !/Autofill/.test(e));
    console.log('  console errors:', JSON.stringify(errs.slice(0, 5)));
    proc.kill();
    process.exit(process.exitCode || 0);
})().catch(e => { console.error('E2E ERROR', e); try { proc.kill(); } catch (x) {} process.exit(1); });
