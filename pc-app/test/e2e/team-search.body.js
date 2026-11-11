// Checks that 「全体で編成検索」 from the roster popup's 攻撃 mode narrows the DEFENSE tab by the opponent's
// attack team, which is stored in defense_team (attack_team is always the user's team).
const DEMO = JSON.parse(fs.readFileSync(process.env.TA_DEMO, 'utf8'));

(async () => {
    await connect();
    await send('Runtime.enable');
    await send('Page.enable');
    await waitFor(`document.readyState === 'complete' && !!window.taDesktop && !!window.taApp`, 20000, 'page ready');
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
    // An opponent with defense records
    const opp = await ev(`window.taApp.getHistory().then(h => { const c = {}; h.filter(x => x.battle_type === 'defense').forEach(x => { c[x.commander_name] = (c[x.commander_name] || 0) + 1; }); return Object.entries(c).filter(([n]) => n && n !== '匿名').sort((a, b) => b[1] - a[1])[0]; })`);
    console.log('  opponent with most defense records:', JSON.stringify(opp));
    await ev(`window.taApp.showOpponentRosterPopup(${JSON.stringify(opp[0])}); true`);
    await sleep(1200);
    const M = '#opponent-roster-modal';
    await ev(`document.querySelector('${M} .orp-mode [data-val="attack"]').click(); true`); await sleep(400);
    // Pick the striker with the most records that sits in exactly one slot (one click narrows)
    const pick = await ev(`(() => { const cells = [...document.querySelectorAll('${M} .orp-student')].map((c, idx) => ({ idx, name: c.querySelector('.orp-name').textContent, segs: c.querySelectorAll('.orp-bar i').length, n: Number(c.querySelector('.orp-count').textContent.slice(1)) })); return cells.filter(c => c.segs === 1 && c.n > 0).sort((a, b) => b.n - a.n)[0] || null; })()`);
    if (!pick) throw new Error('no single-slot striker in attack mode');
    await ev(`document.querySelectorAll('${M} .orp-student')[${pick.idx}].click(); true`); await sleep(400);
    const chip = await ev(`(() => { const c = document.querySelector('${M} .orp-chip'); return { slot: Number(c.querySelector('b').textContent.replace(/\\D/g, '')) - 1, label: c.querySelector('b').textContent, name: c.childNodes[1].textContent }; })()`);
    await ev(`document.querySelector('${M} .orp-global-search').click(); true`);
    await sleep(1000);
    // Expected: defense records (every opponent) whose defense_team slot holds that student; and what the old,
    // wrong rule (attack_team = the user's own team) would have given
    const expect = await ev(`window.taApp.getHistory().then(h => { const d = h.filter(x => x.battle_type === 'defense'); const nm = (x, team, i) => { const s = window.taApp.resolveSlot(x, team, i); return s ? s.name : null; }; return { ok: d.filter(x => nm(x, 'defense', ${chip.slot}) === ${JSON.stringify(chip.name)}).length, wrong: d.filter(x => nm(x, 'attack', ${chip.slot}) === ${JSON.stringify(chip.name)}).length, opps: new Set(d.filter(x => nm(x, 'defense', ${chip.slot}) === ${JSON.stringify(chip.name)}).map(x => x.commander_name)).size }; })`);
    const state = await ev(`({ tab: document.querySelector('.tab-btn.active').dataset.tab, banner: (document.getElementById('team-filter-banner-defense') || {}).textContent || '', stat: Number(document.getElementById('stat-total-battles-defense').textContent) })`);
    // The rows shown: the opponent side of each row must hold the student in that slot
    const rowsOk = await ev(`(() => { const rows = [...document.querySelectorAll('#defense-history-items tr.history-row, #defense-history-items > tr')]; return rows.length; })()`);
    console.log('  pick:', JSON.stringify(pick), 'chip:', JSON.stringify(chip));
    console.log('  expected:', JSON.stringify(expect), 'state:', JSON.stringify(state), 'rows rendered:', rowsOk);
    check(chip.label.startsWith('A'), 'attack mode labels the slot A1-A4');
    check(state.tab === 'defense' && state.banner.includes(chip.label) && state.banner.includes(chip.name), 'team search from 攻撃 mode opens the defense tab with the banner');
    check(state.stat === expect.ok && expect.ok > 0, `defense tab shows the records whose opponent (defense_team) has ${chip.label} ${chip.name} (${expect.ok}; the old rule would give ${expect.wrong})`);
    await shot('20-team-search-defense');
    proc.kill();
    process.exit(process.exitCode || 0);
})().catch(e => { console.error('E2E ERROR', e); try { proc.kill(); } catch (x) {} process.exit(1); });
