// Tactical Archive PC: bulk edit (opponent name replace / student merge).
// Before any change the whole data is saved to userData/pre-edit-backups (restore it with "リストア").

const desk = window.taDesktop || null;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const normName = (v) => (v || '').replace(/[\s　]+/g, '');
function toast(msg, kind = 'info', ms = 4000) { if (window.showToast) window.showToast(msg, kind, ms); }

async function preEditBackup() {
    const json = await window.taApp.buildFullBackupJson();
    const res = await desk.writeBackup({ kind: 'pre-edit', json });
    if (!res.ok) throw new Error('変更前のバックアップに失敗しました：' + res.error);
    return res.file;
}

// ---------- Opponent name ----------
async function openOpponentReplace() {
    const history = await window.taApp.getHistory();
    const counts = new Map();
    history.forEach(h => { const n = normName(h.commander_name); if (n) counts.set(n, (counts.get(n) || 0) + 1); });
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'ja'));

    await window.taDialog((box, close) => {
        box.classList.add('ta-dialog-wide');
        box.innerHTML = `<h3><i class="fa-solid fa-user-pen"></i> 対戦相手名の一括置換</h3>
            <div class="ta-form">
                <label>旧名（今の名前）<input type="text" id="bo-old" list="bo-names" autocomplete="off"></label>
                <label>新名<input type="text" id="bo-new" list="bo-names" autocomplete="off"></label>
                <datalist id="bo-names">${names.map(n => `<option value="${esc(n)}">${counts.get(n)}件</option>`).join('')}</datalist>
                <label class="ta-check"><input type="checkbox" id="bo-rename" checked> 修正辞書にも登録する（次回から OCR の「旧名」を自動で「新名」に直します）</label>
                <div class="ta-preview" id="bo-preview">旧名と新名を入力してください</div>
            </div>
            <div class="ta-dialog-actions">
                <button type="button" class="btn-secondary" data-act="cancel">キャンセル</button>
                <button type="button" class="btn-primary" data-act="run" disabled>置き換える</button>
            </div>`;
        const oldEl = box.querySelector('#bo-old'), newEl = box.querySelector('#bo-new');
        const prev = box.querySelector('#bo-preview'), run = box.querySelector('[data-act="run"]');
        let targets = [];
        const update = () => {
            const o = normName(oldEl.value), n = normName(newEl.value);
            targets = o ? history.filter(h => normName(h.commander_name) === o) : [];
            const atk = targets.filter(h => h.battle_type !== 'defense').length;
            if (!o) prev.textContent = '旧名と新名を入力してください';
            else if (targets.length === 0) prev.textContent = `「${o}」の戦績はありません`;
            else prev.innerHTML = `該当 <b>${targets.length}件</b>（攻撃 ${atk}件・防衛 ${targets.length - atk}件）` + (n && counts.has(n) && n !== o ? `<br>「${esc(n)}」の戦績 ${counts.get(n)}件 とまとまります` : '');
            run.disabled = !(targets.length > 0 && n && n !== o);
        };
        oldEl.addEventListener('input', update);
        newEl.addEventListener('input', update);
        box.querySelector('[data-act="cancel"]').onclick = () => close(null);
        run.onclick = async () => {
            const o = normName(oldEl.value), n = normName(newEl.value);
            const addRule = box.querySelector('#bo-rename').checked;
            if (!confirm(`対戦相手「${o}」の戦績 ${targets.length}件を「${n}」に置き換えます。\n${addRule ? '修正辞書にも登録します。\n' : ''}実行前に今のデータを自動でバックアップします。よろしいですか？`)) return;
            run.disabled = true;
            run.textContent = '処理中...';
            box.dataset.busy = '1';
            try {
                const backupFile = await preEditBackup();
                const changed = targets.map(h => Object.assign({}, h, { commander_name: n }));
                await window.taApp.putHistoryRecords(changed);
                // Rules that turned some OCR text into the old name now give the new name
                // (the dictionary is applied once, so "X → old" would otherwise keep producing the old name)
                const chained = (window.taApp.getRenames() || []).filter(r => normName(r.corrected_name) === o && normName(r.ocr_name) !== n);
                for (const r of chained) await window.taApp.saveRename(r.ocr_name, n);
                if (addRule) await window.taApp.saveRename(o, n);
                // Keep the opponent's icon (the directory is keyed by name)
                const av = window.taApp.getOpponentAvatar(o);
                if (av) await window.taApp.saveOpponentAvatar(n, av);
                await window.taApp.reloadAll();
                close(true);
                await window.taShowAlert('置き換えました', `${changed.length}件の対戦相手名を「${o}」→「${n}」に変えました。${addRule ? '\n修正辞書にも登録しました。' : ''}\n\n変更前のデータ：\n${backupFile}\n（元に戻すときは「設定 → 直前の一括修正を元に戻す」）`);
            } catch (e) {
                console.error(e);
                run.disabled = false;
                run.textContent = '置き換える';
                delete box.dataset.busy;
                alert('一括置換に失敗しました：' + (e && e.message || e));
            }
        };
        return { focus: oldEl, cancelValue: null };
    });
}

// ---------- Student merge ----------
function slotMatches(h, side, i, src) {
    const names = side === 'attack' ? h.attack_names : h.defense_names;
    const ids = side === 'attack' ? h.attack_team : h.defense_team;
    // Same priority as the display (resolveHistorySlotStudent): the saved name wins, the ID counts only when the
    // name is missing. Records merged from another device can carry IDs that mean a different local student.
    const saved = names && names[i];
    if (saved && saved !== '生徒' && saved !== '未登録') return saved === src.name;
    return !!src.id && !!ids && ids[i] === src.id;
}
function countStudentUses(history, src) {
    let records = 0, slots = 0;
    for (const h of history) {
        let hit = false;
        for (const side of ['attack', 'defense']) for (let i = 0; i < 6; i++) if (slotMatches(h, side, i, src)) { slots++; hit = true; }
        if (hit) records++;
    }
    return { records, slots };
}

async function openStudentMerge() {
    const history = await window.taApp.getHistory();
    const roster = window.taApp.getRoster().slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    // Names that appear only in the history (e.g. a student deleted from the dictionary)
    const extra = new Set();
    history.forEach(h => [...(h.attack_names || []), ...(h.defense_names || [])].forEach(n => {
        if (n && n !== '生徒' && n !== '未登録' && !roster.some(r => r.name === n)) extra.add(n);
    }));
    const srcOptions = roster.map(r => r.name).concat([...extra].sort((a, b) => a.localeCompare(b, 'ja')));
    const findSrc = (name) => roster.find(r => r.name === name) || (extra.has(name) ? { name, id: 0 } : null);

    await window.taDialog((box, close) => {
        box.classList.add('ta-dialog-wide');
        box.innerHTML = `<h3><i class="fa-solid fa-people-arrows"></i> 生徒の一括置換（統合）</h3>
            <div class="ta-form">
                <label>置き換える生徒（統合元）<input type="text" id="bs-src" list="bs-src-list" autocomplete="off"></label>
                <label>置き換え先の生徒（統合先・生徒図鑑にいる生徒）<input type="text" id="bs-dst" list="bs-dst-list" autocomplete="off"></label>
                <datalist id="bs-src-list">${srcOptions.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                <datalist id="bs-dst-list">${roster.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
                <div class="ta-merge-icons" id="bs-icons"></div>
                <label class="ta-check"><input type="checkbox" id="bs-delete" checked> 統合元を生徒図鑑から削除し、顔データを統合先に移す</label>
                <div class="ta-preview" id="bs-preview">2人の生徒を選んでください</div>
            </div>
            <div class="ta-dialog-actions">
                <button type="button" class="btn-secondary" data-act="cancel">キャンセル</button>
                <button type="button" class="btn-primary" data-act="run" disabled>置き換える</button>
            </div>`;
        const srcEl = box.querySelector('#bs-src'), dstEl = box.querySelector('#bs-dst');
        const prev = box.querySelector('#bs-preview'), run = box.querySelector('[data-act="run"]');
        const icons = box.querySelector('#bs-icons'), delEl = box.querySelector('#bs-delete');
        let src = null, dst = null, uses = { records: 0, slots: 0 };
        const iconOf = (s) => s && s.icon_path ? `<img src="${esc(s.icon_path)}" alt="">` : `<span class="ph">${esc(s ? s.name.slice(0, 2) : '?')}</span>`;
        const update = () => {
            src = findSrc(srcEl.value.trim());
            dst = roster.find(r => r.name === dstEl.value.trim()) || null;
            icons.innerHTML = (src || dst) ? `<div>${iconOf(src)}<small>${esc(src ? src.name : '—')}</small></div><i class="fa-solid fa-arrow-right"></i><div>${iconOf(dst)}<small>${esc(dst ? dst.name : '—')}</small></div>` : '';
            const srcInRoster = !!(src && roster.some(r => r.id === src.id && r.name === src.name));
            delEl.disabled = !srcInRoster;
            if (!srcInRoster) delEl.checked = false;
            if (!src) { prev.textContent = srcEl.value.trim() ? '統合元の生徒が見つかりません' : '2人の生徒を選んでください'; run.disabled = true; return; }
            uses = countStudentUses(history, src);
            if (!dst) { prev.innerHTML = `「${esc(src.name)}」を使った戦績 <b>${uses.records}件</b>（${uses.slots}枠）。統合先を選んでください（生徒図鑑にいる生徒）`; run.disabled = true; return; }
            if (src.name === dst.name) { prev.textContent = '同じ生徒です'; run.disabled = true; return; }
            prev.innerHTML = `該当 <b>${uses.records}件</b>の戦績・<b>${uses.slots}枠</b>を「${esc(src.name)}」→「${esc(dst.name)}」に置き換えます`;
            run.disabled = uses.slots === 0 && !srcInRoster;
        };
        srcEl.addEventListener('input', update);
        dstEl.addEventListener('input', update);
        box.querySelector('[data-act="cancel"]').onclick = () => close(null);
        run.onclick = async () => {
            const del = delEl.checked;
            if (!confirm(`「${src.name}」を「${dst.name}」に置き換えます（戦績 ${uses.records}件・${uses.slots}枠）。\n${del ? '統合元は生徒図鑑から削除し、顔データは統合先に移します。\n' : ''}実行前に今のデータを自動でバックアップします。よろしいですか？`)) return;
            run.disabled = true;
            run.textContent = '処理中...';
            box.dataset.busy = '1';
            try {
                const backupFile = await preEditBackup();
                const changed = [];
                for (const h of history) {
                    let rec = null;
                    for (const side of ['attack', 'defense']) {
                        for (let i = 0; i < 6; i++) {
                            if (!slotMatches(h, side, i, src)) continue;
                            if (!rec) rec = Object.assign({}, h, {
                                attack_names: (h.attack_names || []).slice(), defense_names: (h.defense_names || []).slice(),
                                attack_team: (h.attack_team || []).slice(), defense_team: (h.defense_team || []).slice(),
                                attack_icons: (h.attack_icons || []).slice(), defense_icons: (h.defense_icons || []).slice()
                            });
                            rec[`${side}_names`][i] = dst.name;
                            rec[`${side}_team`][i] = dst.id;
                            rec[`${side}_icons`][i] = dst.icon_path || '';
                        }
                    }
                    if (rec) changed.push(rec);
                }
                if (changed.length) await window.taApp.putHistoryRecords(changed);
                if (del && src.id) {
                    await window.taApp.mergeStudentFeatures(dst.name, src.features || []);
                    await window.taApp.deleteStudent(src.id);
                }
                await window.taApp.reloadAll();
                close(true);
                await window.taShowAlert('置き換えました', `${changed.length}件の戦績で「${src.name}」を「${dst.name}」に置き換えました。${del ? '\n統合元を生徒図鑑から削除しました。' : ''}\n\n変更前のデータ：\n${backupFile}\n（元に戻すときは「設定 → 直前の一括修正を元に戻す」）`);
            } catch (e) {
                console.error(e);
                run.disabled = false;
                run.textContent = '置き換える';
                delete box.dataset.busy;
                alert('一括置換に失敗しました：' + (e && e.message || e));
            }
        };
        return { focus: srcEl, cancelValue: null };
    });
}

function initTools() {
    if (!desk) return;
    const a = document.getElementById('btn-bulk-opponent');
    if (a) a.addEventListener('click', openOpponentReplace);
    const b = document.getElementById('btn-bulk-student');
    if (b) b.addEventListener('click', openStudentMerge);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTools);
else initTools();

window.taTools = { openOpponentReplace, openStudentMerge };
