// Tactical Archive PC: analysis tab (attack / defense, period filter, team / student / opponent stats, daily trend).
// Rows open the matching records on the history tab (window.taApp.showHistoryByIds).

const state = { type: 'attack', period: 'all', from: '', to: '', studentSide: 'own', expanded: {} };
const LIST_LIMIT = 15;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pct(w, n) { return n ? Math.round(w * 1000 / n) / 10 : 0; }
function dayKey(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfDay(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }

function periodRange() {
    if (state.period === '30') {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
        return { from, to: Infinity, label: '直近30日' };
    }
    if (state.period === 'custom') {
        const from = state.from ? startOfDay(state.from) : -Infinity;
        const to = state.to ? startOfDay(state.to) + 86400000 - 1 : Infinity;
        return { from, to, label: `${state.from || '最初'} 〜 ${state.to || '最後'}` };
    }
    return { from: -Infinity, to: Infinity, label: '全期間' };
}

// The 6 students of one side of a record: [{ name, icon }] (unknown slots -> name '未登録')
function sideSlots(item, side) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        const s = window.taApp.resolveSlot(item, side, i);
        out.push(s || { name: '未登録', icon: null, unknown: true });
    }
    return out;
}

function aggregateTeams(records, side) {
    const map = new Map();
    for (const item of records) {
        const slots = sideSlots(item, side);
        const key = slots.map(s => s.name).sort((a, b) => a.localeCompare(b, 'ja')).join('|');
        let e = map.get(key);
        if (!e) { e = { key, slots, n: 0, w: 0, ids: [] }; map.set(key, e); }
        e.n++;
        if (item.result === 'WIN') e.w++;
        e.ids.push(item.id);
    }
    return [...map.values()].sort((a, b) => b.n - a.n || pct(b.w, b.n) - pct(a.w, a.n));
}
function aggregateStudents(records, side) {
    const map = new Map();
    for (const item of records) {
        const seen = new Set();
        sideSlots(item, side).forEach(s => {
            if (s.unknown || seen.has(s.name)) return;
            seen.add(s.name);
            let e = map.get(s.name);
            if (!e) { e = { name: s.name, icon: s.icon, n: 0, w: 0, ids: [] }; map.set(s.name, e); }
            if (!e.icon && s.icon) e.icon = s.icon;
            e.n++;
            if (item.result === 'WIN') e.w++;
            e.ids.push(item.id);
        });
    }
    return [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ja'));
}
function aggregateOpponents(records) {
    const map = new Map();
    for (const item of records) {
        const name = (item.commander_name || '').trim() || 'Unknown';
        let e = map.get(name);
        if (!e) { e = { name, n: 0, w: 0, ids: [] }; map.set(name, e); }
        e.n++;
        if (item.result === 'WIN') e.w++;
        e.ids.push(item.id);
    }
    return [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ja'));
}
function aggregateDays(records) {
    const map = new Map();
    for (const item of records) {
        const k = dayKey(item.created_at);
        let e = map.get(k);
        if (!e) { e = { day: k, n: 0, w: 0, ids: [] }; map.set(k, e); }
        e.n++;
        if (item.result === 'WIN') e.w++;
        e.ids.push(item.id);
    }
    if (map.size === 0) return [];
    // Continuous days between the first and the last battle
    const keys = [...map.keys()].sort();
    const out = [];
    const d = new Date(startOfDay(keys[0]));
    const last = keys[keys.length - 1];
    for (let guard = 0; guard < 4000; guard++) {
        const k = dayKey(d.getTime());
        out.push(map.get(k) || { day: k, n: 0, w: 0, ids: [] });
        if (k >= last) break;
        d.setDate(d.getDate() + 1);
    }
    return out;
}

function iconHtml(s, size = 34) {
    const title = esc(s.name);
    if (s.icon) return `<img class="an-icon" style="width:${size}px;height:${size}px" src="${esc(s.icon)}" alt="${title}" title="${title}">`;
    return `<span class="an-icon an-icon-ph" style="width:${size}px;height:${size}px" title="${title}">${esc(s.name.slice(0, 2))}</span>`;
}
function rateBar(w, n) {
    const r = pct(w, n);
    return `<div class="an-rate"><div class="an-rate-bar"><span style="width:${r}%"></span></div><b>${r.toFixed(1)}%</b></div>`;
}

function tableCard({ id, title, icon, cols, rows, emptyText, bare = false }) {
    const expanded = !!state.expanded[id];
    const shown = expanded ? rows : rows.slice(0, LIST_LIMIT);
    const more = rows.length > LIST_LIMIT
        ? `<button type="button" class="an-more" data-expand="${id}">${expanded ? '上位だけ表示' : `すべて表示（${rows.length}件）`}</button>` : '';
    const body = shown.length
        ? shown.map((r, i) => `<tr class="an-row" data-row="${id}:${i}">${r.cells.map((c, j) => `<td class="${cols[j].cls || ''}">${c}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="an-empty">${esc(emptyText || 'データがありません')}</td></tr>`;
    const table = `<div class="an-table-wrap"><table class="an-table">
            <thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody>${body}</tbody>
        </table></div>${more}`;
    if (bare) return table;
    return `<section class="an-card" data-card="${id}">
        <h3 class="an-card-title"><i class="fa-solid ${icon}"></i> ${esc(title)}</h3>
        ${table}</section>`;
}

function trendSvg(days) {
    if (days.length === 0) return '<div class="an-empty">データがありません</div>';
    const barW = 18, gap = 6, h = 180, top = 16, bottom = 34, left = 34, right = 34;
    const plotH = h - top - bottom;
    const maxN = Math.max(1, ...days.map(d => d.n));
    const w = left + right + days.length * (barW + gap);
    const y = (v) => top + plotH - (v / maxN) * plotH;
    const yr = (r) => top + plotH - (r / 100) * plotH;
    let bars = '', pts = [], labels = '';
    days.forEach((d, i) => {
        const x = left + i * (barW + gap);
        if (d.n > 0) {
            bars += `<rect class="an-bar" data-day="${i}" x="${x}" y="${y(d.n)}" width="${barW}" height="${top + plotH - y(d.n)}" rx="3"><title>${d.day}：${d.n}戦 ${d.w}勝 ${pct(d.w, d.n).toFixed(1)}%</title></rect>`;
            pts.push(`${x + barW / 2},${yr(pct(d.w, d.n))}`);
        }
        const dd = d.day.slice(5).replace('-', '/');
        if (days.length <= 31 || i % Math.ceil(days.length / 31) === 0) {
            labels += `<text class="an-axis" x="${x + barW / 2}" y="${h - 14}" text-anchor="middle">${dd}</text>`;
        }
    });
    const grid = [0, 50, 100].map(r => `<line class="an-grid" x1="${left}" x2="${w - right}" y1="${yr(r)}" y2="${yr(r)}"/><text class="an-axis" x="${w - right + 4}" y="${yr(r) + 4}">${r}%</text>`).join('')
        + `<text class="an-axis" x="${left - 6}" y="${y(maxN) + 4}" text-anchor="end">${maxN}</text><text class="an-axis" x="${left - 6}" y="${top + plotH + 4}" text-anchor="end">0</text>`;
    const line = pts.length > 1 ? `<polyline class="an-line" points="${pts.join(' ')}"/>` : '';
    const dots = pts.map(p => { const [cx, cy] = p.split(','); return `<circle class="an-dot" cx="${cx}" cy="${cy}" r="3"/>`; }).join('');
    return `<div class="an-trend-scroll"><svg class="an-trend" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="日別の戦数と勝率">${grid}${bars}${line}${dots}${labels}</svg></div>
        <div class="an-legend"><span><i class="an-lg-bar"></i>戦数</span><span><i class="an-lg-line"></i>${state.type === 'defense' ? '防衛率' : '勝率'}</span></div>`;
}

let rowActions = {};
async function render() {
    const body = document.getElementById('analysis-body');
    if (!body || !window.taApp) return;
    const history = await window.taApp.getHistory();
    const range = periodRange();
    const type = state.type;
    const records = history.filter(h => (type === 'defense' ? h.battle_type === 'defense' : h.battle_type !== 'defense')
        && h.created_at >= range.from && h.created_at <= range.to);
    const own = type === 'attack' ? 'attack' : 'defense';
    const opp = type === 'attack' ? 'defense' : 'attack';
    const rateLabel = type === 'defense' ? '防衛率' : '勝率';
    const typeLabel = type === 'defense' ? '防衛' : '攻撃';
    const wins = records.filter(r => r.result === 'WIN').length;
    rowActions = {};
    const open = (ids, label) => () => window.taApp.showHistoryByIds(ids, `${typeLabel}・${range.label}・${label}`, type);

    const teamRows = (list, cardId) => list.map((e, i) => {
        rowActions[`${cardId}:${i}`] = open(e.ids, `${e.slots.map(s => s.name).join('・')}（${e.ids.length}件）`);
        return { cells: [`<div class="an-team">${e.slots.slice(0, 4).map(s => iconHtml(s)).join('')}<span class="an-sep"></span>${e.slots.slice(4).map(s => iconHtml(s)).join('')}</div>`, `${e.n}`, rateBar(e.w, e.n)] };
    });
    const ownTeams = aggregateTeams(records, own);
    const oppTeams = aggregateTeams(records, opp);
    const students = aggregateStudents(records, state.studentSide === 'own' ? own : opp);
    const opponents = aggregateOpponents(records);
    const days = aggregateDays(records);
    days.forEach((d, i) => { rowActions[`day:${i}`] = open(d.ids, `${d.day}（${d.ids.length}件）`); });

    const cards = [];
    cards.push(tableCard({
        id: 'ownTeams', icon: type === 'attack' ? 'fa-bolt' : 'fa-shield-halved',
        title: type === 'attack' ? '自軍の攻撃編成（並び順を問わない組み合わせ）' : '自軍の防衛編成（並び順を問わない組み合わせ）',
        cols: [{ label: '編成（ストライカー｜スペシャル）' }, { label: type === 'attack' ? '使用回数' : '防衛回数', cls: 'num' }, { label: rateLabel, cls: 'rate' }],
        rows: teamRows(ownTeams, 'ownTeams')
    }));
    cards.push(tableCard({
        id: 'oppTeams', icon: type === 'attack' ? 'fa-shield-halved' : 'fa-bolt',
        title: type === 'attack' ? '相手の防衛編成' : '相手の攻撃編成',
        cols: [{ label: '編成（ストライカー｜スペシャル）' }, { label: '対戦数', cls: 'num' }, { label: rateLabel, cls: 'rate' }],
        rows: teamRows(oppTeams, 'oppTeams')
    }));
    const studentRows = students.map((e, i) => {
        rowActions[`students:${i}`] = open(e.ids, `${state.studentSide === 'own' ? '自軍' : '相手'}に${e.name}（${e.ids.length}件）`);
        return { cells: [`<div class="an-student">${iconHtml(e, 30)}<span>${esc(e.name)}</span></div>`, `${e.n}`, `${pct(e.n, records.length).toFixed(1)}%`, rateBar(e.w, e.n)] };
    });
    cards.push(`<section class="an-card" data-card="students-wrap">
        <div class="an-card-head"><h3 class="an-card-title"><i class="fa-solid fa-user-graduate"></i> 生徒別の採用数・${rateLabel}</h3>
        <div class="seg seg-sm" id="an-student-side"><button type="button" class="seg-btn ${state.studentSide === 'own' ? 'active' : ''}" data-val="own">自軍</button><button type="button" class="seg-btn ${state.studentSide === 'opp' ? 'active' : ''}" data-val="opp">相手</button></div></div>
        ${tableCard({ id: 'students', bare: true, cols: [{ label: '生徒' }, { label: '採用数', cls: 'num' }, { label: '採用率', cls: 'num' }, { label: rateLabel, cls: 'rate' }], rows: studentRows })}
    </section>`);
    const oppRows = opponents.map((e, i) => {
        rowActions[`opponents:${i}`] = open(e.ids, `相手 ${e.name}（${e.ids.length}件）`);
        const av = window.taApp.getOpponentAvatar(e.name);
        return { cells: [`<div class="an-student">${av ? `<img class="an-icon an-round" src="${esc(av)}" alt="">` : '<span class="an-icon an-icon-ph an-round"><i class="fa-solid fa-user"></i></span>'}<span>${esc(e.name)}</span></div>`,
            `${e.n}`, rateBar(e.w, e.n), `<button type="button" class="an-roster-btn" data-roster="${esc(e.name)}" title="この相手の手持ち生徒"><i class="fa-solid fa-users"></i> 手持ち</button>`] };
    });
    cards.push(tableCard({
        id: 'opponents', icon: 'fa-ranking-star', title: 'よく当たる相手',
        cols: [{ label: '対戦相手' }, { label: '対戦数', cls: 'num' }, { label: rateLabel, cls: 'rate' }, { label: '', cls: 'act' }],
        rows: oppRows
    }));

    body.innerHTML = `
        <div class="an-summary">
            <div class="an-stat"><span>戦数</span><b>${records.length}</b></div>
            <div class="an-stat an-stat-main"><span>${rateLabel}</span><b>${pct(wins, records.length).toFixed(1)}%</b></div>
            <div class="an-stat"><span>勝敗</span><b>${wins} / ${records.length - wins}</b></div>
            <div class="an-stat an-stat-wide"><span>期間</span><b>${esc(range.label)}</b></div>
        </div>
        <section class="an-card"><h3 class="an-card-title"><i class="fa-solid fa-chart-column"></i> 日別の戦数と${rateLabel}の推移</h3>${trendSvg(days)}</section>
        <div class="an-grid-2">${cards.join('')}</div>
        <p class="an-note"><i class="fa-solid fa-hand-pointer"></i> 行・棒をクリックすると、該当する戦績を${typeLabel}タブで表示します（タブ上の「解除」で元に戻ります）。</p>`;
}

function initAnalysis() {
    const pane = document.getElementById('tab-analysis');
    if (!pane) return;
    const bindSeg = (id, key, after) => {
        const seg = document.getElementById(id);
        if (!seg) return;
        seg.addEventListener('click', (e) => {
            const b = e.target.closest('.seg-btn');
            if (!b) return;
            seg.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
            state[key] = b.dataset.val;
            if (after) after();
            render();
        });
    };
    bindSeg('an-type', 'type', () => { state.expanded = {}; });
    bindSeg('an-period', 'period', () => {
        const range = document.getElementById('an-range');
        if (range) range.hidden = state.period !== 'custom';
    });
    ['an-from', 'an-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { state[id === 'an-from' ? 'from' : 'to'] = el.value; render(); });
    });
    pane.addEventListener('click', (e) => {
        const rosterBtn = e.target.closest('[data-roster]');
        if (rosterBtn) { e.stopPropagation(); window.taApp.showOpponentRosterPopup(rosterBtn.dataset.roster); return; }
        const side = e.target.closest('#an-student-side .seg-btn');
        if (side) { state.studentSide = side.dataset.val; state.expanded.students = false; render(); return; }
        const more = e.target.closest('[data-expand]');
        if (more) { state.expanded[more.dataset.expand] = !state.expanded[more.dataset.expand]; render(); return; }
        const bar = e.target.closest('[data-day]');
        if (bar) { const f = rowActions[`day:${bar.dataset.day}`]; if (f) f(); return; }
        const row = e.target.closest('[data-row]');
        if (row) { const f = rowActions[row.dataset.row]; if (f) f(); }
    });
    // Right-click on an opponent row: the roster popup (same as on the history tabs)
    pane.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('[data-row^="opponents:"]');
        if (!row) return;
        const btn = row.querySelector('[data-roster]');
        if (btn) { e.preventDefault(); window.taApp.showOpponentRosterPopup(btn.dataset.roster); }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAnalysis);
else initAnalysis();

window.taAnalysis = { render, state };
