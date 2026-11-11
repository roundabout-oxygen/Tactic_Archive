
// ---- seed config before launch is done by the wrapper (see PRE_CONFIG) ----
const DEMO = JSON.parse(fs.readFileSync(process.env.TA_DEMO, 'utf8'));
const BK = path.join(UD, '..', path.basename(UD) + '-bk');

(async () => {
    await connect();
    await send('Runtime.enable');
    await send('Page.enable');
    await waitFor(`document.readyState === 'complete' && !!window.taDesktop && !!window.taApp`, 20000, 'page ready');
    await sleep(800);

    // Welcome: 16:9, no preset icons (the demo roster is loaded instead)
    await ev(`document.getElementById('welcome-use-preset').checked = false; document.querySelector('[data-aspect-choice="16:9"]').click(); document.getElementById('btn-welcome-start').click(); true`);
    await sleep(500);
    await ev(`(document.querySelector('#tutorial-popup .btn-primary, #btn-tutorial-ok, #tutorial-ok-btn')||{click(){}}).click(); true`);

    // 1. Startup backup (4 s after start) + generation pruning
    await sleep(5000);
    let files = fs.readdirSync(BK).sort();
    console.log('  backup folder:', files.join(', '));
    const full = files.filter(n => /^TacticalArchive_Full_\d{8}_\d{6}(_\d+)?\.json$/.test(n));
    // Rules: only files this automatic backup wrote (config.backupWritten) are pruned, newest backupKeep (3) kept.
    // Seeded: 2021/2022/2023 are listed as written by the app, 2020 is a hand-made full backup with the same name pattern.
    const appStartup = full.filter(n => n.startsWith('TacticalArchive_Full_2026'));
    check(appStartup.length === 1 && files.includes('TacticalArchive_Full_20220101_000000.json') && files.includes('TacticalArchive_Full_20230101_000000.json'), 'startup backup written; the newest 3 app-written generations are kept');
    check(!files.includes('TacticalArchive_Full_20210101_000000.json'), 'oldest app-written backup deleted');
    check(files.includes('TacticalArchive_Full_20200101_000000.json'), 'a hand-made full backup with the same name pattern is never deleted');
    check(files.includes('other.json') && files.includes('TacticalArchive_Full_memo.json'), 'files not made by the app are kept');
    // Unchanged data: an automatic run writes nothing; the manual 「今すぐ」 (force) always writes
    const cfg1 = JSON.parse(fs.readFileSync(path.join(UD, 'config.json'), 'utf8'));
    const same = await ev(`window.taApp.buildFullBackupJson().then(j => window.taDesktop.writeBackup({ kind: 'full', json: j }))`);
    check(same && same.ok && same.skipped && fs.readdirSync(BK).length === files.length, 'automatic backup with unchanged data writes nothing: ' + JSON.stringify(same && { skipped: same.skipped }));
    check(Array.isArray(cfg1.backupWritten) && cfg1.backupWritten.length === 3, 'config tracks the 3 app-written backups');
    const newest = JSON.parse(fs.readFileSync(path.join(BK, full[full.length - 1]), 'utf8'));
    check(newest.version === 2 && newest.included_sections && newest.included_sections.history && Array.isArray(newest.battle_history), 'backup JSON has the Web/Android format (version 2, all sections)');
    await ev(`window.switchToTab('settings'); true`);
    await sleep(300);
    console.log('  settings backup status:', await ev(`document.getElementById('backup-status-label').textContent`));

    // 2. Seed the anonymized demo data
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
    console.log('  history loaded:', await ev(`window.taApp.getHistory().then(h => h.length)`));

    // 3. Analysis tab
    await ev(`window.switchToTab('analysis'); true`);
    await waitFor(`document.querySelectorAll('#analysis-body .an-row').length > 0`, 15000, 'analysis rows');
    const an = await ev(`({
        total: document.querySelector('.an-stat b').textContent,
        rate: document.querySelector('.an-stat-main b').textContent,
        cards: [...document.querySelectorAll('.an-card-title')].map(e => e.textContent.trim()),
        bars: document.querySelectorAll('.an-bar').length,
        firstTeam: document.querySelector('[data-row="ownTeams:0"] td.num').textContent
    })`);
    console.log('  analysis attack:', JSON.stringify(an));
    check(Number(an.total) > 0 && an.cards.length >= 5, 'analysis shows summary, trend and tables');
    await shot('10-analysis-attack');
    const sc = await ev(`(() => { const p = document.getElementById('tab-analysis'); p.scrollTop = p.scrollHeight; const last = [...p.querySelectorAll('.an-card')].pop().getBoundingClientRect(); const pr = p.getBoundingClientRect(); const r = { sh: p.scrollHeight, ch: p.clientHeight, top: p.scrollTop, lastBottom: Math.round(last.bottom), paneBottom: Math.round(pr.bottom) }; return r; })()`);
    console.log('  analysis scroll:', JSON.stringify(sc));
    check(sc.top > 0 && sc.lastBottom <= sc.paneBottom, 'analysis tab scrolls and the last card is fully visible');
    await shot('10b-analysis-bottom');
    const fitOf = () => ev(`(() => { const h = document.getElementById('an-trend-host'); const s = h.querySelector('svg'); const labels = [...s.querySelectorAll('text.an-axis')].filter(x => x.getAttribute('text-anchor') === 'middle').map(x => x.getBoundingClientRect()); let overlap = false; for (let i = 1; i < labels.length; i++) if (labels[i].left < labels[i-1].right - 0.5) overlap = true; return { host: h.clientWidth, svg: Number(s.getAttribute('width')), bars: s.querySelectorAll('.an-bar').length, overlap }; })()`);
    await ev(`document.getElementById('tab-analysis').scrollTop = 0; document.querySelector('#an-period [data-val="30"]').click(); true`); await sleep(500);
    const fit30 = await fitOf(); await shot('10c-analysis-30d');
    await ev(`document.querySelector('#an-period [data-val="all"]').click(); true`); await sleep(500);
    const fitAll = await fitOf();
    console.log('  trend fit:', JSON.stringify({ fit30, fitAll }));
    check(Math.abs(fit30.svg - fit30.host) <= 1 && !fit30.overlap && fitAll.svg >= fitAll.host - 1 && !fitAll.overlap, 'trend chart fills the card width (30 days) and date labels do not overlap');
    await ev(`document.getElementById('tab-analysis').scrollTop = 0; true`);
    // Row -> history tab narrowed
    await ev(`document.querySelector('[data-row="ownTeams:0"]').click(); true`);
    await sleep(800);
    const narrowed = await ev(`({ tab: document.querySelector('.tab-btn.active').dataset.tab, banner: (document.querySelector('#tab-attack .analysis-filter-bar .afb-label')||{}).textContent, rows: document.querySelectorAll('#attack-history-items tr.history-row, #attack-history-items > tr').length, stat: document.getElementById('stat-total-battles-attack').textContent })`);
    console.log('  narrowed:', JSON.stringify(narrowed));
    check(narrowed.tab === 'attack' && !!narrowed.banner && narrowed.stat === an.firstTeam, 'row click shows only the matching records (count matches)');
    await shot('11-narrowed');
    await ev(`document.querySelector('#tab-attack .afb-clear').click(); true`);
    await sleep(500);
    check(await ev(`!document.querySelector('.analysis-filter-bar') && Number(document.getElementById('stat-total-battles-attack').textContent) > ${Number(an.firstTeam)}`), 'clear button restores the full list');
    await sleep(400); await shot('11b-history-vs');
    const vsInfo = await ev(`(() => { const v = document.querySelector('#tab-attack .history-row .td-vs .vs-text'); const b = document.querySelector('#tab-attack .history-row .result-badge'); const cs = getComputedStyle(v), bs = getComputedStyle(b); const td = v.closest('td').getBoundingClientRect(), vr = v.getBoundingClientRect(); return { vs: cs.display, color: cs.color, inside: vr.left >= td.left && vr.right <= td.right + 0.5, radius: bs.borderRadius, bw: bs.width }; })()`);
    console.log('  vs/badge:', JSON.stringify(vsInfo));
    check(vsInfo.vs !== 'none' && vsInfo.color === 'rgb(255, 96, 151)' && vsInfo.inside && vsInfo.radius === '50%' && vsInfo.bw === '32px', 'history list shows VS between the teams and round W/L badges');
    // ---- PC: romaji search for kana names (IME text being typed such as "けｎ" must not empty the list) ----
    const searchCount = async (q) => {
        await ev(`(() => { const el = document.getElementById('search-commander-attack'); el.value = ${JSON.stringify(q)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await sleep(350);
        return ev(`({ n: Number(document.getElementById('stat-total-battles-attack').textContent), names: [...new Set([...document.querySelectorAll('#attack-history-items .commander-clickable')].map(e => e.textContent.trim()))].slice(0, 5) })`);
    };
    const rKana = await searchCount('ケヌ');
    const rTyping = await searchCount('けｎ');
    const rRoma = await searchCount('kenu');
    const rRoma2 = await searchCount('KENUMEDOSU');
    const rSt = await searchCount('シュン');
    const rStR = await searchCount('syun');
    const rStR2 = await searchCount('shun');
    const rNone = await searchCount('zzzq');
    console.log('  romaji search:', JSON.stringify({ rKana, rTyping, rRoma, rRoma2, rSt, rStR, rStR2, rNone }));
    check(rKana.n > 0 && rTyping.n >= rKana.n && rTyping.names.includes('ケヌメドス'), 'IME text being typed ("けｎ") keeps matching instead of emptying the list');
    check(rRoma.n === rKana.n && rRoma2.n === rKana.n, 'romaji ("kenu", "KENUMEDOSU") finds the kana opponent name');
    check(rStR.n === rSt.n && rStR2.n === rSt.n && rSt.n > 0, 'romaji variants (syun / shun) find kana student names');
    check(rNone.n === 0, 'unrelated romaji matches nothing');
    await ev(`window.syncSearchInput ? window.syncSearchInput('', false) : (() => { const el = document.getElementById('search-commander-attack'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); })(); true`);
    await sleep(300);
    // Defense + last 30 days + custom
    await ev(`window.switchToTab('analysis'); document.querySelector('#an-type [data-val="defense"]').click(); true`);
    await sleep(600);
    console.log('  analysis defense total:', await ev(`document.querySelector('.an-stat b').textContent`), 'rate label:', await ev(`document.querySelector('.an-stat-main span').textContent`));
    await shot('12-analysis-defense');
    await ev(`document.querySelector('#an-period [data-val="custom"]').click(); true`);
    await sleep(300);
    const p = DEMO.period || {};
    console.log('  demo period:', JSON.stringify(p));
    await ev(`(() => { const f = document.getElementById('an-from'); f.value = '2026-08-01'; f.dispatchEvent(new Event('change')); const t = document.getElementById('an-to'); t.value = '2026-08-31'; t.dispatchEvent(new Event('change')); return true; })()`);
    await sleep(600);
    console.log('  custom 2026-08 defense total:', await ev(`document.querySelector('.an-stat b').textContent`), '| period:', await ev(`document.querySelector('.an-stat-wide b').textContent`));
    await ev(`document.querySelector('#an-period [data-val="all"]').click(); document.querySelector('#an-type [data-val="attack"]').click(); true`);
    await sleep(500);
    // Opponent roster popup from the ranking
    await ev(`document.querySelector('[data-roster]').click(); true`);
    await sleep(600);
    check(await ev(`document.getElementById('opponent-roster-modal') && document.getElementById('opponent-roster-modal').classList.contains('active')`), 'opponent roster popup opens from the ranking');
    await shot('13-roster-popup');
    const flow = await ev(`(() => { const m = document.getElementById('opponent-roster-modal'); const cells = [...m.querySelectorAll('.orp-student')]; const paths = m.querySelectorAll('.orp-lines path').length; const bars = cells.reduce((a, c) => a + c.querySelectorAll('.orp-bar i').length, 0); const card = m.querySelector('.modal-card').getBoundingClientRect(); const over = cells.some(c => { const r = c.getBoundingClientRect(); return r.right > card.right + 0.5 || r.left < card.left - 0.5; }); return { cells: cells.length, paths, bars, over }; })()`);
    console.log('  roster flow:', JSON.stringify(flow));
    check(flow.cells > 0 && flow.paths === flow.bars && !flow.over, 'striker slot map: one line per student/slot pair, all students inside the popup');
    await ev(`document.querySelector('#opponent-roster-modal .orp-student').dispatchEvent(new MouseEvent('mouseenter')); true`);
    await sleep(250);
    await shot('13b-roster-hover');
    await ev(`document.getElementById('opponent-roster-modal').classList.remove('active'); window.taApp.showOpponentRosterPopup('ケヌメドス'); true`);
    await sleep(800);
    await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student, #opponent-roster-modal .orp-slot').forEach(e => e.dispatchEvent(new MouseEvent('mouseleave'))); true`);
    await sleep(250);
    await shot('13c-roster-normal');
    const modeInfo = async () => ev(`(() => { const m = document.getElementById('opponent-roster-modal'); return { active: m.querySelector('.orp-mode .seg-btn.active').dataset.val, labels: [...m.querySelectorAll('.orp-slot b')].map(b => b.textContent).join(','), sub: [...m.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.startsWith('手持ち生徒')).textContent, total: [...m.querySelectorAll('.orp-student .orp-count')].reduce((a, e) => a + Number(e.textContent.slice(1)), 0) }; })()`);
    const recs = await ev(`(async () => { const h = (await window.taApp.getHistory()).filter(x => (x.commander_name||'').trim() === 'ケヌメドス'); return { atk: h.filter(x => x.battle_type !== 'defense').length, def: h.filter(x => x.battle_type === 'defense').length }; })()`);
    const mDef = await modeInfo();
    await ev(`document.querySelector('#opponent-roster-modal .orp-mode [data-val="attack"]').click(); true`); await sleep(300);
    const mAtk = await modeInfo();
    await shot('13d-roster-attack');
    await ev(`document.querySelector('#opponent-roster-modal .orp-mode [data-val="both"]').click(); true`); await sleep(300);
    const mBoth = await modeInfo();
    console.log('  modes:', JSON.stringify({ recs, mDef, mAtk, mBoth }));
    check(mDef.active === 'defense' && mDef.labels === 'D1,D2,D3,D4' && mDef.sub.includes(`防衛（${recs.atk}戦`), 'roster popup opens on the defense team (my attack records) with D1-D4');
    check(mAtk.labels === 'A1,A2,A3,A4' && mAtk.sub.includes(`攻撃（${recs.def}戦`), 'attack mode uses my defense records with A1-A4');
    check(mBoth.labels === '1,2,3,4' && mBoth.sub.includes(`（${recs.atk + recs.def}戦`) && mBoth.total === mDef.total + mAtk.total, 'both mode sums the two with 1-4');
    // ---- Narrowing by clicking students (ported from the Web version) ----
    await ev(`document.querySelector('#opponent-roster-modal .orp-mode [data-val="defense"]').click(); true`); await sleep(300);
    // Expected counts computed independently from the history
    const expect = async (conds) => ev(`(async () => {
        const h = (await window.taApp.getHistory()).filter(x => (x.commander_name||'').trim() === 'ケヌメドス' && x.battle_type !== 'defense');
        const conds = ${JSON.stringify(conds)};
        const nm = (x, i) => { const s = window.taApp.resolveSlot(x, 'defense', i); return s ? s.name : null; };
        return h.filter(x => conds.every(c => c.kind === 'striker' ? nm(x, c.slot) === c.name : [4, 5].some(i => nm(x, i) === c.name))).length;
    })()`);
    const popState = () => ev(`(() => { const m = document.getElementById('opponent-roster-modal');
        const cells = [...m.querySelectorAll('.orp-student')];
        return { sub: [...m.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.startsWith('手持ち生徒')).textContent,
            names: cells.map(c => c.querySelector('.orp-name').textContent).join(','),
            zero: cells.filter(c => c.classList.contains('zero')).length,
            zeroCounts: cells.filter(c => c.classList.contains('zero')).every(c => c.querySelector('.orp-count').textContent === '×0'),
            selected: [...m.querySelectorAll('.orp-student.selected, .orp-sp-cell.selected')].map(c => c.querySelector('.orp-name').textContent),
            chips: [...m.querySelectorAll('.orp-chip')].map(c => c.textContent.trim()),
            spZero: m.querySelectorAll('.orp-sp-cell.zero').length, spCells: m.querySelectorAll('.orp-sp-cell').length }; })()`);
    const s0 = await popState();
    // The student with the most records placed in a single slot, and one placed in several slots
    const pick = await ev(`(() => { const m = document.getElementById('opponent-roster-modal');
        const cells = [...m.querySelectorAll('.orp-student')].map((c, idx) => ({ idx, name: c.querySelector('.orp-name').textContent, segs: c.querySelectorAll('.orp-bar i').length, n: Number(c.querySelector('.orp-count').textContent.slice(1)) }));
        const single = cells.filter(c => c.segs === 1).sort((a, b) => b.n - a.n)[0];
        const multi = cells.filter(c => c.segs > 1).sort((a, b) => b.n - a.n)[0];
        return { single, multi }; })()`);
    console.log('  narrow picks:', JSON.stringify(pick));
    if (pick.multi) {
        const M = '#opponent-roster-modal';
        await ev(`document.querySelectorAll('${M} .orp-student')[${pick.multi.idx}].click(); true`); await sleep(300);
        const armedState = await ev(`({ hint: !!document.querySelector('${M} .orp-pick-hint'), pick: [...document.querySelectorAll('${M} .orp-slot.pick')].map(s => s.querySelector('b').textContent + s.querySelector('.orp-pick-count').textContent), nopick: document.querySelectorAll('${M} .orp-slot.nopick').length, armed: document.querySelectorAll('${M} .orp-student.armed').length, menu: !!document.querySelector('${M} .orp-chooser') })`);
        await shot('13f-roster-chooser');
        // a slot the student was never placed in does nothing
        await ev(`document.querySelector('${M} .orp-slot.nopick') && document.querySelector('${M} .orp-slot.nopick').click(); true`); await sleep(200);
        const stillArmed = await ev(`document.querySelectorAll('${M} .orp-student.armed').length === 1 && document.querySelectorAll('${M} .orp-chip').length === 0`);
        // Esc cancels (popup stays open), clicking the student again cancels
        await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`); await sleep(200);
        const escClosed = await ev(`document.getElementById('opponent-roster-modal').classList.contains('active') && !document.querySelector('${M} .orp-student.armed') && !document.querySelector('${M} .orp-slot.pick')`);
        await ev(`document.querySelectorAll('${M} .orp-student')[${pick.multi.idx}].click(); true`); await sleep(200);
        await ev(`document.querySelectorAll('${M} .orp-student')[${pick.multi.idx}].click(); true`); await sleep(200);
        const reClosed = await ev(`!document.querySelector('${M} .orp-student.armed') && document.querySelectorAll('${M} .orp-chip').length === 0`);
        // pick the last offered slot from the boxes above
        await ev(`document.querySelectorAll('${M} .orp-student')[${pick.multi.idx}].click(); true`); await sleep(200);
        const target = await ev(`(() => { const p = [...document.querySelectorAll('${M} .orp-slot.pick')].pop(); const lab = p.querySelector('b').textContent; p.click(); return lab; })()`);
        await sleep(300);
        const chip = await ev(`[...document.querySelectorAll('${M} .orp-chip')].map(c => c.textContent.trim())`);
        console.log('  slot pick:', JSON.stringify({ armedState, stillArmed, escClosed, reClosed, target, chip }));
        check(!armedState.hint && armedState.pick.length === pick.multi.segs && armedState.pick.every(o => /^D[1-4]×[0-9]+$/.test(o)) && armedState.nopick === 4 - pick.multi.segs && armedState.armed === 1 && !armedState.menu, 'a student used in several slots highlights the D1-D4 boxes to pick from (no menu, no hint banner)');
        check(stillArmed && escClosed && reClosed, 'unused slots are not clickable; Esc / clicking the student again cancels');
        check(chip.length === 1 && chip[0].startsWith(target) && chip[0].includes(pick.multi.name), 'clicking a highlighted slot box narrows to that placement');

        // ---- The other way round: D1-D4 box first, then a student placed there ----
        await ev(`document.querySelector('${M} .orp-clear') && document.querySelector('${M} .orp-clear').click(); true`); await sleep(250);
        const sf = await ev(`(() => { const M = document.querySelector('${M}');
            const slots = [...M.querySelectorAll('.orp-slot')];
            const cells = [...M.querySelectorAll('.orp-student')];
            // a slot with at least one student, and a student never placed there
            const used = (c, i) => { const segs = [...c.querySelectorAll('.orp-bar i')].map(x => x.style.background); return null; };
            return { n: slots.length, title: slots[0].title }; })()`);
        await ev(`document.querySelectorAll('${M} .orp-slot')[1].click(); true`); await sleep(250);
        const sfArmed = await ev(`({ armed: [...document.querySelectorAll('${M} .orp-slot.armed-slot')].map(s => s.querySelector('b').textContent), on: [...document.querySelectorAll('${M} .orp-student.on')].map(c => c.querySelector('.orp-name').textContent), off: [...document.querySelectorAll('${M} .orp-student:not(.on)')].map(c => c.querySelector('.orp-name').textContent) })`);
        await shot('13h-roster-slot-first');
        // a student not placed in D2 is ignored
        if (sfArmed.off.length) await ev(`[...document.querySelectorAll('${M} .orp-student')].find(c => c.querySelector('.orp-name').textContent === ${JSON.stringify(sfArmed.off[0] || '')}).click(); true`);
        await sleep(200);
        const sfIgnored = await ev(`document.querySelectorAll('${M} .orp-chip').length === 0 && document.querySelectorAll('${M} .orp-slot.armed-slot').length === 1`);
        // same box again cancels; Esc cancels
        await ev(`document.querySelectorAll('${M} .orp-slot')[1].click(); true`); await sleep(200);
        const sfToggle = await ev(`document.querySelectorAll('${M} .orp-slot.armed-slot').length === 0`);
        await ev(`document.querySelectorAll('${M} .orp-slot')[1].click(); true`); await sleep(200);
        await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`); await sleep(200);
        const sfEsc = await ev(`document.querySelectorAll('${M} .orp-slot.armed-slot').length === 0 && document.getElementById('opponent-roster-modal').classList.contains('active')`);
        // pick: D2 then a student placed there
        await ev(`document.querySelectorAll('${M} .orp-slot')[1].click(); true`); await sleep(200);
        await ev(`[...document.querySelectorAll('${M} .orp-student')].find(c => c.querySelector('.orp-name').textContent === ${JSON.stringify(sfArmed.on[0] || '')}).click(); true`); await sleep(300);
        const sfChip = await ev(`[...document.querySelectorAll('${M} .orp-chip')].map(c => c.textContent.trim())`);
        console.log('  slot first:', JSON.stringify({ sf, sfArmed, sfIgnored, sfToggle, sfEsc, sfChip }));
        check(sf.title.includes('クリックしてから生徒を選ぶ') && sfArmed.armed.join() === 'D2' && sfArmed.on.length > 0, 'clicking a D1-D4 box first arms it and highlights the students placed there');
        check(sfIgnored && sfToggle && sfEsc, 'students never placed there are ignored; the same box again / Esc cancels');
        check(sfChip.length === 1 && sfChip[0] === 'D2' + sfArmed.on[0], 'then clicking a highlighted student narrows to that placement');
        await ev(`document.querySelector('${M} .orp-clear').click(); true`); await sleep(250);
    }
    // 1) single-slot student: click narrows directly
    await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student')[${pick.single.idx}].click(); true`); await sleep(300);
    const s1 = await popState();
    const slot1 = await ev(`(() => { const chip = document.querySelector('#opponent-roster-modal .orp-chip b'); return Number(chip.textContent.replace(/\\D/g, '')) - 1; })()`);
    const e1 = await expect([{ kind: 'striker', slot: slot1, name: pick.single.name }]);
    await shot('13e-roster-narrow1');
    // 2) multi-slot student (if still available): chooser, pick the first slot
    let s2 = s1, e2 = e1, chooserShown = null;
    if (pick.multi) {
        const multiIdx = await ev(`[...document.querySelectorAll('#opponent-roster-modal .orp-student')].findIndex(c => c.querySelector('.orp-name').textContent === ${JSON.stringify(pick.multi.name)})`);
        const multiZero = await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student')[${multiIdx}].classList.contains('zero')`);
        const multiSegs = await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student')[${multiIdx}].querySelectorAll('.orp-bar i').length`);
        if (!multiZero) {
            await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student')[${multiIdx}].click(); true`); await sleep(250);
            chooserShown = await ev(`document.querySelectorAll('#opponent-roster-modal .orp-slot.pick').length`);
            if (multiSegs > 1) await shot('13f-roster-chooser');
            if (chooserShown) await ev(`document.querySelector('#opponent-roster-modal .orp-slot.pick').click(); true`);
            await sleep(300);
            s2 = await popState();
            const conds = await ev(`[...document.querySelectorAll('#opponent-roster-modal .orp-chip')].map(c => ({ kind: 'striker', slot: Number(c.querySelector('b').textContent.replace(/\\D/g, '')) - 1, name: c.childNodes[1].textContent }))`);
            e2 = await expect(conds);
            console.log('  narrow conds:', JSON.stringify(conds), 'chooser options:', chooserShown, 'segs:', multiSegs);
        }
    }
    console.log('  narrow states:', JSON.stringify({ s0, s1, e1, s2, e2 }));
    check(s1.sub.includes(`${e1} / ${recs.atk}戦`) && s1.names === s0.names && s1.selected.includes(pick.single.name) && s1.chips.length === 1, 'clicking a striker narrows to that placement (count matches, layout unchanged)');
    check(s1.zero > 0 ? s1.zeroCounts : true, 'students left with no records stay as ×0 (greyed out)');
    check(s2.sub.includes(`${e2} / ${recs.atk}戦`) && s2.names === s0.names, 'second student narrows further (AND)' + (chooserShown ? ' via the slot chooser' : ''));
    // 3) special
    const sp = await ev(`(() => { const c = [...document.querySelectorAll('#opponent-roster-modal .orp-sp-cell')].find(x => !x.classList.contains('zero')); if (!c) return null; const n = c.querySelector('.orp-name').textContent; c.click(); return n; })()`);
    await sleep(300);
    const s3 = await popState();
    const conds3 = await ev(`[...document.querySelectorAll('#opponent-roster-modal .orp-chip')].map(c => c.classList.contains('sp') ? ({ kind: 'special', name: c.childNodes[1].textContent }) : ({ kind: 'striker', slot: Number(c.querySelector('b').textContent.replace(/\\D/g, '')) - 1, name: c.childNodes[1].textContent }))`);
    const e3 = await expect(conds3);
    check(!!sp && s3.sub.includes(`${e3} / ${recs.atk}戦`) && s3.selected.includes(sp), 'clicking a special adds it to the narrowing');
    // 4) remove one chip, click a selected student again, clear all, mode switch resets
    await ev(`document.querySelector('#opponent-roster-modal .orp-chip.sp').click(); true`); await sleep(250);
    const afterChip = (await popState()).chips.length;
    await ev(`document.querySelector('#opponent-roster-modal .orp-student.selected').click(); true`); await sleep(250);
    const afterReclick = (await popState()).chips.length;
    await ev(`document.querySelector('#opponent-roster-modal .orp-clear') && document.querySelector('#opponent-roster-modal .orp-clear').click(); true`); await sleep(250);
    const sClear = await popState();
    check(afterChip === s3.chips.length - 1 && afterReclick === afterChip - 1 && sClear.chips.length === 0 && sClear.sub.includes(`（${recs.atk}戦`), 'chip ×, clicking a selected student again and すべて解除 remove the conditions');
    await ev(`document.querySelector('#opponent-roster-modal .orp-student:not(.zero)').click(); true`); await sleep(250);
    await ev(`document.querySelector('#opponent-roster-modal .orp-slot.pick') && document.querySelector('#opponent-roster-modal .orp-slot.pick').click(); true`); await sleep(250);
    await ev(`document.querySelector('#opponent-roster-modal .orp-mode [data-val="attack"]').click(); true`); await sleep(300);
    const sMode = await popState();
    check(sMode.chips.length === 0 && !sMode.sub.includes(' / '), 'switching 両方/防衛/攻撃 resets the narrowing');
    // ---- 「全体で編成検索」 (ported from the Web version) ----
    const gbDisabled = await ev(`(() => { const b = document.querySelector('#opponent-roster-modal .orp-global-search'); return { exists: !!b, disabled: b && b.disabled, beforeSeg: b && b.nextElementSibling && b.nextElementSibling.classList.contains('orp-mode') }; })()`);
    await ev(`document.querySelector('#opponent-roster-modal .orp-mode [data-val="defense"]').click(); true`); await sleep(300);
    const gIdx = await ev(`[...document.querySelectorAll('#opponent-roster-modal .orp-student')].findIndex(c => c.querySelector('.orp-name').textContent === ${JSON.stringify(pick.single.name)})`);
    await ev(`document.querySelectorAll('#opponent-roster-modal .orp-student')[${gIdx}].click(); true`); await sleep(300);
    const gCond = await ev(`(() => { const c = document.querySelector('#opponent-roster-modal .orp-chip'); return { slot: Number(c.querySelector('b').textContent.replace(/\\D/g, '')) - 1, name: c.childNodes[1].textContent }; })()`);
    const gEnabled = await ev(`!document.querySelector('#opponent-roster-modal .orp-global-search').disabled`);
    await ev(`document.getElementById('search-commander-attack').value = 'ケヌメドス'; document.querySelector('#opponent-roster-modal .orp-global-search').click(); true`);
    await sleep(800);
    const gExpect = await ev(`(async () => { const h = (await window.taApp.getHistory()).filter(x => x.battle_type !== 'defense'); return { n: h.filter(x => { const s = window.taApp.resolveSlot(x, 'defense', ${gCond.slot}); return s && s.name === ${JSON.stringify(gCond.name)}; }).length, opps: new Set(h.filter(x => { const s = window.taApp.resolveSlot(x, 'defense', ${gCond.slot}); return s && s.name === ${JSON.stringify(gCond.name)}; }).map(x => x.commander_name)).size }; })()`);
    const gState = await ev(`({ popup: document.getElementById('opponent-roster-modal').classList.contains('active'), tab: document.querySelector('.tab-btn.active').dataset.tab, search: document.getElementById('search-commander-attack').value, banner: (document.getElementById('team-filter-banner-attack') || {}).textContent || '', stat: document.getElementById('stat-total-battles-attack').textContent })`);
    console.log('  global search:', JSON.stringify({ gbDisabled, gCond, gEnabled, gExpect, gState }));
    check(gbDisabled.exists && gbDisabled.disabled && gbDisabled.beforeSeg && gEnabled, '「全体で編成検索」 sits left of 両方/防衛/攻撃 and is disabled until a condition is chosen');
    check(!gState.popup && gState.tab === 'attack' && gState.search === '' && gState.banner.includes('編成検索') && gState.banner.includes(`D${gCond.slot + 1}`) && gState.banner.includes(gCond.name) && Number(gState.stat) === gExpect.n && gExpect.opps > 1, 'global team search narrows the attack tab across every opponent (count matches)');
    await shot('13g-team-search');
    await ev(`document.querySelector('#team-filter-banner-attack .tfb-clear').click(); true`); await sleep(500);
    const gCleared = await ev(`({ banner: !!document.getElementById('team-filter-banner-attack'), stat: document.getElementById('stat-total-battles-attack').textContent })`);
    check(!gCleared.banner && Number(gCleared.stat) > Number(gState.stat), '解除 removes the team search');
    await ev(`window.switchToTab('analysis'); true`); await sleep(400);

    await ev(`document.getElementById('opponent-roster-modal').classList.remove('active'); true`);
    // Right-click on the history tab opponent name
    await ev(`window.switchToTab('attack'); true`);
    await sleep(500);
    await ev(`(() => { const el = document.querySelector('#attack-history-items .commander-clickable'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return true; })()`);
    await sleep(600);
    check(await ev(`document.getElementById('opponent-roster-modal').classList.contains('active')`), 'right-click on an opponent name opens the popup');
    await ev(`document.getElementById('opponent-roster-modal').classList.remove('active'); true`);

    // 4. Bulk opponent rename
    await ev(`window.confirm = () => true; window.switchToTab('settings'); true`);
    await ev(`document.getElementById('btn-bulk-opponent').click(); true`);
    await sleep(500);
    await ev(`(() => { const o = document.getElementById('bo-old'); o.value = 'フゾンデカ'; o.dispatchEvent(new Event('input')); const n = document.getElementById('bo-new'); n.value = 'テスト改名'; n.dispatchEvent(new Event('input')); return true; })()`);
    console.log('  preview:', await ev(`document.getElementById('bo-preview').textContent`));
    await shot('14-bulk-opponent');
    await ev(`document.querySelector('.ta-dialog [data-act="run"]').click(); true`);
    await waitFor(`[...document.querySelectorAll('.ta-dialog h3')].some(h => h.textContent.includes('置き換えました'))`, 20000, 'opponent done');
    const after = await ev(`window.taApp.getHistory().then(h => ({ renamed: h.filter(x => x.commander_name === 'テスト改名').length, old: h.filter(x => x.commander_name === 'フゾンデカ').length, rule: window.taApp.getRenames().some(r => r.ocr_name === 'フゾンデカ' && r.corrected_name === 'テスト改名') }))`);
    console.log('  after rename:', JSON.stringify(after));
    check(after.renamed === 46 && after.old === 0 && after.rule, 'opponent replaced (46) and rename rule registered');
    await ev(`document.querySelector('.ta-dialog [data-act="ok"]').click(); true`);
    const pre = fs.readdirSync(path.join(UD, 'pre-edit-backups'));
    check(pre.length === 1 && /^TacticalArchive_BeforeEdit_\d{8}_\d{6}\.json$/.test(pre[0]), 'pre-edit backup saved before the change');
    const preData = JSON.parse(fs.readFileSync(path.join(UD, 'pre-edit-backups', pre[0]), 'utf8'));
    check(preData.battle_history.filter(x => x.commander_name === 'フゾンデカ').length === 46, 'pre-edit backup holds the old names');

    // 5. Student merge
    const before = await ev(`window.taApp.getHistory().then(h => h.filter(x => [...(x.attack_names||[]), ...(x.defense_names||[])].includes('ユウカ')).length)`);
    await ev(`document.getElementById('btn-bulk-student').click(); true`);
    await sleep(500);
    await ev(`(() => { const o = document.getElementById('bs-src'); o.value = 'ユウカ'; o.dispatchEvent(new Event('input')); const n = document.getElementById('bs-dst'); n.value = 'ハスミ（水着）'; n.dispatchEvent(new Event('input')); return true; })()`);
    console.log('  merge preview:', await ev(`document.getElementById('bs-preview').textContent`));
    await shot('15-bulk-student');
    await ev(`document.querySelector('.ta-dialog [data-act="run"]').click(); true`);
    await waitFor(`[...document.querySelectorAll('.ta-dialog h3')].some(h => h.textContent.includes('置き換えました'))`, 20000, 'merge done');
    await ev(`document.querySelector('.ta-dialog [data-act="ok"]').click(); true`);
    const merged = await ev(`window.taApp.getHistory().then(h => ({ left: h.filter(x => [...(x.attack_names||[]), ...(x.defense_names||[])].includes('ユウカ')).length, inRoster: window.taApp.getRoster().some(s => s.name === 'ユウカ') }))`);
    console.log('  records with ユウカ before:', before, 'after:', JSON.stringify(merged));
    check(before > 0 && merged.left === 0 && !merged.inRoster, 'student merged and removed from the dictionary');

    // 6. Organize + after-patrol backup
    await ev(`(async () => { await window.taDesktop.setConfig({ backupAfterPatrol: true }); return true; })()`);
    const images = await ev(`(async () => {
        const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        const out = {};
        let c = mk(1920, 1080), x = c.getContext('2d'); x.fillStyle = '#f7f7f7'; x.fillRect(0, 0, 1920, 1080);
        out['Screenshot_20261102_100000_menu.png'] = c.toDataURL('image/png').split(',')[1];
        c = mk(1600, 1200); x = c.getContext('2d'); x.fillStyle = '#888'; x.fillRect(0, 0, 1600, 1200);
        out['Screenshot_20261102_100100_43.png'] = c.toDataURL('image/png').split(',')[1];
        const W = 1920, H = 1080;
        c = mk(W, H); x = c.getContext('2d');
        x.fillStyle = '#2b3442'; x.fillRect(0, 0, W, H);
        const mb = { x: 0.019791666666666666 * W, y: 0.13148148148148148 * H, w: 0.9598958333333333 * W, h: 0.7351851851851852 * H };
        const nx = (v) => mb.x + v * mb.w / 2400, ny = (v) => mb.y + v * mb.h / 1040;
        x.fillStyle = '#ffffff'; x.fillRect(mb.x, mb.y, mb.w, mb.h);
        x.fillStyle = '#ffd23c'; x.font = 'bold ' + Math.round(110 * mb.h / 1040) + 'px sans-serif'; x.fillText('WIN', nx(115), ny(230));
        const roster = window.taApp.getRoster().filter(s => s.icon_path);
        const centers = [206, 353, 500, 646, 794, 941, 1450, 1596, 1744, 1890, 2036, 2185];
        for (let i = 0; i < 12; i++) {
            const img = new Image(); img.src = roster[i * 3 % roster.length].icon_path; await img.decode();
            x.drawImage(img, nx(centers[i] - 44), ny(853), nx(centers[i] + 44) - nx(centers[i] - 44), ny(953) - ny(853));
        }
        x.fillStyle = '#222'; x.font = Math.round(40 * mb.h / 1040) + 'px sans-serif'; x.fillText('Lv.90 テスト:先生?', nx(2000), ny(190));
        out['Screenshot_20261102_110000_result.png'] = c.toDataURL('image/png').split(',')[1];
        return out;
    })()`);
    for (const [name, data] of Object.entries(images)) fs.writeFileSync(path.join(IMG, name), Buffer.from(data, 'base64'));
    // an existing file with the target name -> numbered
    fs.mkdirSync(path.join(IMG, '取り込み済み'), { recursive: true });
    await ev(`window.switchToTab('upload'); document.getElementById('btn-patrol').click(); true`);
    await waitFor(`document.getElementById('review-modal').classList.contains('active') || !!document.querySelector('.ta-dialog')`, 60000, 'review');
    if (await ev(`document.getElementById('review-modal').classList.contains('active')`)) {
        await ev(`(() => { const i = document.getElementById('review-opponent-name'); i.value = 'テスト:先生?'; i.dispatchEvent(new Event('input')); document.getElementById('review-win-btn').click(); return true; })()`);
        const typeIsDef = await ev(`document.getElementById('review-type-defense-btn').classList.contains('active')`);
        console.log('  review type defense:', typeIsDef);
        await ev(`document.getElementById('btn-review-save').click(); true`);
    }
    await waitFor(`!!document.querySelector('.ta-dialog')`, 60000, 'summary');
    console.log('  summary:', (await ev(`document.querySelector('.ta-dialog').innerText`)).replace(/\n/g, ' '));
    await ev(`document.querySelector('.ta-dialog [data-act="ok"]').click(); true`);
    await sleep(2500);
    const top = fs.readdirSync(IMG).sort();
    const moved = fs.readdirSync(path.join(IMG, '取り込み済み'));
    console.log('  folder:', top.join(', '));
    console.log('  imported folder:', moved.join(', '));
    check(!top.includes('Screenshot_20261102_110000_result.png') && moved.length === 1 && /^\d{4}-\d{2}-\d{2}_テスト_先生__WIN_(攻撃|防衛)\.png$/.test(moved[0]), 'imported screenshot moved and renamed (invalid characters replaced)');
    check(top.includes('Screenshot_20261102_100000_menu.png') && top.includes('Screenshot_20261102_100100_43.png'), 'non-result / wrong-aspect screenshots stay in place');
    files = fs.readdirSync(BK).filter(n => /^TacticalArchive_Full_/.test(n) && n !== 'TacticalArchive_Full_memo.json').sort();
    check(files.filter(n => n.startsWith('TacticalArchive_Full_2026')).length === 2 && files.includes('TacticalArchive_Full_20230101_000000.json') && !files.includes('TacticalArchive_Full_20220101_000000.json') && files.includes('TacticalArchive_Full_20200101_000000.json'), 'after-patrol backup written, 3 app-written generations kept, hand-made one untouched: ' + files.join(', '));
    // Fix: the organized (renamed) file name is stored on the record, so the renamed image is never imported again
    const orgRec = await ev(`window.taApp.getHistory().then(h => { const r = h.find(x => x.organized_filename); return r ? { name: r.organized_filename, filename: r.filename } : null; })`);
    check(!!orgRec && orgRec.name === moved[0] && orgRec.filename === 'Screenshot_20261102_110000_result.png', 'record remembers the organized file name: ' + JSON.stringify(orgRec));
    const histN0 = await ev(`window.taApp.getHistory().then(h => h.length)`);
    const dropB64 = fs.readFileSync(path.join(IMG, '取り込み済み', moved[0])).toString('base64');
    const dropAlert = await ev(`(async () => { let msg = ''; const a = window.alert; window.alert = (m) => { msg += m; }; const bin = Uint8Array.from(atob(${JSON.stringify(dropB64)}), c => c.charCodeAt(0)); await window.processMultipleScreenshotUploads([new File([bin], ${JSON.stringify(moved[0])}, { type: 'image/png' })]); await new Promise(r => setTimeout(r, 500)); window.alert = a; return msg; })()`);
    await ev(`document.querySelectorAll('.ta-dialog [data-act="ok"]').forEach(b => b.click()); true`);
    check(dropAlert.includes(moved[0]) && (await ev(`window.taApp.getHistory().then(h => h.length)`)) === histN0, 'dropping the renamed image is refused as already registered');
    // ... also after 「処理済みの記録をリセット」 with subfolders on (the 取り込み済み folder is listed again)
    await ev(`window.taDesktop.setConfig({ includeSubfolders: true, organizeSubfolder: '整理2' }).then(() => window.taDesktop.resetProcessed()).then(() => true)`);
    await ev(`document.getElementById('btn-patrol').click(); true`);
    await waitFor(`!!document.querySelector('.ta-dialog') || [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('未処理の画像はありません'))`, 60000, 'patrol after reset');
    await sleep(800);
    const reviewOpen = await ev(`document.getElementById('review-modal').classList.contains('active')`);
    if (reviewOpen) await ev(`document.getElementById('btn-review-cancel') && document.getElementById('btn-review-cancel').click(); true`);
    await ev(`document.querySelectorAll('.ta-dialog [data-act="ok"]').forEach(b => b.click()); true`);
    check(!reviewOpen && (await ev(`window.taApp.getHistory().then(h => h.length)`)) === histN0, 'after resetting the processed list, patrol does not import the renamed image again');
    await ev(`window.taDesktop.setConfig({ includeSubfolders: false, organizeSubfolder: '取り込み済み' }).then(() => true)`);
    await sleep(500);
    // Re-patrol with subfolders on: the moved file must not be imported again
    await ev(`window.taDesktop.setConfig({ includeSubfolders: true }).then(() => true)`);
    await ev(`document.getElementById('btn-patrol').click(); true`);
    await waitFor(`[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('未処理の画像はありません'))`, 15000, 'nothing left');
    check(true, 'moved file is not processed again');
    await ev(`window.switchToTab('settings'); true`);
    await sleep(400);
    await shot('16-settings');
    // Settings layout: sub-options follow their parent setting
    const vis = (g) => ev(`[...document.querySelectorAll('[data-sub-of="${g}"]')].map(e => e.offsetParent !== null || e.id === 'backup-status-label' && !e.hidden)`);
    const ids = ['btn-pick-folder','chk-include-subfolders','chk-auto-skip-nonresult','btn-web-platform','chk-organize','btn-organize-folder-name','chk-organize-rename','btn-pick-backup-folder','chk-backup-startup','chk-backup-patrol','num-backup-keep','btn-backup-now','btn-db-backup','btn-db-restore','btn-open-preedit','btn-bulk-roster','btn-load-default-roster','btn-bulk-student','btn-bulk-opponent','btn-manage-renames','btn-csv-export','btn-db-delete','btn-recalibrate','btn-reset-calibration','btn-reset-processed','btn-open-detection-log','link-open-data-folder'];
    check(await ev(`${JSON.stringify(ids)}.every(id => document.getElementById(id))`), 'every setting is still present after the reorganisation');
    await ev(`document.querySelectorAll('.toast').forEach(t => t.remove()); document.getElementById('btn-pick-backup-folder').scrollIntoView({block:'start'}); true`); await sleep(300); await shot('16b-settings-backup');
    const orgOn = await vis('organize'), bkOn = await vis('backup');
    await ev(`(() => { const o = document.getElementById('chk-organize'); o.checked = false; o.dispatchEvent(new Event('change')); return true; })()`);
    await sleep(500);
    const orgOff = await vis('organize');
    check(orgOn.every(Boolean) && orgOff.every(v => !v), 'organize sub-options shown only while organize is ON');
    await ev(`window.confirm = () => true; document.getElementById('btn-clear-backup-folder').click(); true`);
    await sleep(600);
    const bkOff = await vis('backup');
    const cfgAfter = JSON.parse(fs.readFileSync(path.join(UD, 'config.json'), 'utf8'));
    check(bkOn.every(Boolean) && bkOff.every(v => !v) && !cfgAfter.backupFolder && fs.readdirSync(BK).filter(n => n.startsWith('TacticalArchive_Full_2')).length === 4, 'stop auto backup clears the folder, hides its options, keeps the files');
    await ev(`document.getElementById('tab-settings').scrollTop = 0; true`);
    await shot('17-settings-top');
    await ev(`(() => { document.querySelector('.settings-advanced').open = true; const p = document.getElementById('tab-settings'); p.scrollTop = p.scrollHeight; return true; })()`);
    await sleep(300);
    await shot('18-settings-bottom');

    console.log('  console errors/warnings:', consoleErrors.length ? '\n    ' + consoleErrors.slice(0, 20).join('\n    ') : 'none');
    proc.kill();
    process.exit();
})().catch(async (e) => {
    console.error('E2E ERROR', e);
    try { await shot('99-error'); } catch (x) {}
    console.log('  console errors/warnings:', consoleErrors.slice(0, 20).join('\n    '));
    proc.kill();
    process.exit(1);
});
