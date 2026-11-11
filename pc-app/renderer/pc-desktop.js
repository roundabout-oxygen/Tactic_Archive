// Tactical Archive PC (Windows desktop): screenshot folder, folder patrol, in-page dialogs.
// Loaded after app.js. Talks to the main process only through window.taDesktop (preload).

const desk = window.taDesktop || null;
const AUTO_SKIP_KEY = 'tactical_archive_pc_auto_skip_nonresult';
const ASPECT_KEY = 'tactical_archive_web_pc_aspect';

function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }
function toast(msg, kind = 'info', ms = 4000) {
    if (typeof window.showToast === 'function') window.showToast(msg, kind, ms);
    else console.log('[toast]', msg);
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- In-page dialogs ----------
function openDialog(buildBody) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ta-dialog-overlay';
        const box = document.createElement('div');
        box.className = 'ta-dialog';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        overlay.appendChild(box);
        const close = (value) => {
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            resolve(value);
        };
        const api = buildBody(box, close);
        const onKey = (e) => {
            if (e.key === 'Escape' && box.dataset.busy) { e.preventDefault(); e.stopPropagation(); return; } // still working
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(api && 'cancelValue' in api ? api.cancelValue : null); }
            else if (e.key === 'Enter' && api && api.onEnter) { e.preventDefault(); e.stopPropagation(); api.onEnter(); }
        };
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        if (api && api.focus) setTimeout(() => api.focus.focus(), 0);
    });
}

// window.prompt() replacement (Electron does not implement prompt). Returns a Promise<string|null>.
window.taPrompt = function (message, defaultValue = '') {
    return openDialog((box, close) => {
        box.innerHTML = `<p></p><input type="text"><div class="ta-dialog-actions">
            <button type="button" class="btn-secondary" data-act="cancel">キャンセル</button>
            <button type="button" class="btn-primary" data-act="ok">OK</button></div>`;
        box.querySelector('p').textContent = message;
        const input = box.querySelector('input');
        input.value = defaultValue == null ? '' : String(defaultValue);
        box.querySelector('[data-act="cancel"]').onclick = () => close(null);
        box.querySelector('[data-act="ok"]').onclick = () => close(input.value);
        setTimeout(() => input.select(), 0);
        return { focus: input, onEnter: () => close(input.value), cancelValue: null };
    });
};

// Screenshots judged 'not a battle result' in the current / last batch (to list them and re-import on demand)
let batchSkippedFiles = [];
let lastSkippedFiles = [];

function showSummaryDialog(text, s) {
    const skipped = lastSkippedFiles;
    lastSkippedFiles = [];
    const lines = String(text).split('\n');
    const title = lines[0] || '結果';
    return openDialog((box, close) => {
        const rows = [
            ['取り込み', s.imported + '件' + (s.autoSaved > 0 ? `（うち自動登録 ${s.autoSaved}件）` : '')],
            ['スキップ（対戦履歴以外）', s.nonResult + '件'],
            ['アスペクト比違い', s.aspect + '件']
        ];
        if (s.duplicate > 0) rows.push(['登録済みのため除外', s.duplicate + '件']);
        if (s.userSkipped > 0) rows.push(['確認画面でスキップ', s.userSkipped + '件']);
        if (s.error > 0) rows.push(['エラー（次回の巡回で再試行）', s.error + '件']);
        // The result detection is not verified on every screen yet: show what was skipped and allow importing it
        const skippedHtml = skipped.length ? `<details class="ta-skipped"><summary>対戦履歴以外としてスキップした画像（${skipped.length}件）</summary>
                <ul>${skipped.map(f => `<li>${escapeHtml(f.name)}</li>`).join('')}</ul>
                <p>戦績の画像が混ざっていたら、確認画面で取り込めます。</p></details>` : '';
        box.innerHTML = `<h3>${escapeHtml(title)}</h3><ul class="ta-summary-list">${rows.map(([k, v]) =>
            `<li><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></li>`).join('')}</ul>${skippedHtml}
            <div class="ta-dialog-actions">${skipped.length ? `<button type="button" class="btn-secondary" data-act="review"><i class="fa-solid fa-eye"></i> スキップした画像を確認画面で取り込む</button>` : ''}<button type="button" class="btn-primary" data-act="ok">OK</button></div>`;
        const ok = box.querySelector('[data-act="ok"]');
        ok.onclick = () => close(true);
        const review = box.querySelector('[data-act="review"]');
        if (review) review.onclick = () => {
            close(true);
            // Next tick: the summary dialog closes first, then the review screen opens for each skipped image
            setTimeout(() => window.processMultipleScreenshotUploads(skipped, { forceReview: true }), 0);
        };
        return { focus: ok, onEnter: () => close(true), cancelValue: true };
    });
}

// ---------- Folder patrol ----------
let patrolRunning = false;
let cachedCfg = {};

// ---------- Automatic backup ----------
let backupRunning = false;
function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function updateBackupLabels() {
    const c = cachedCfg;
    const fl = document.getElementById('backup-folder-label');
    if (fl) fl.textContent = c.backupFolder || '未設定（自動バックアップしません）';
    const st = document.getElementById('backup-status-label');
    if (st) {
        const parts = [];
        parts.push(c.backupLastSuccess ? `最後に成功：${formatDateTime(c.backupLastSuccess)}（${c.backupLastFile || ''}）` : 'まだバックアップしていません');
        if (c.backupLastError && (!c.backupLastSuccess || c.backupLastError.at > c.backupLastSuccess)) {
            parts.push(`前回失敗：${formatDateTime(c.backupLastError.at)}（${c.backupLastError.message}）`);
        }
        st.textContent = parts.join(' / ');
        st.classList.toggle('backup-error', !!(c.backupLastError && (!c.backupLastSuccess || c.backupLastError.at > c.backupLastSuccess)));
    }
    const chkS = document.getElementById('chk-backup-startup');
    if (chkS) chkS.checked = !!c.backupOnStartup;
    const chkP = document.getElementById('chk-backup-patrol');
    if (chkP) chkP.checked = !!c.backupAfterPatrol;
    const num = document.getElementById('num-backup-keep');
    if (num && document.activeElement !== num) num.value = String(c.backupKeep || 10);
    // Sub-options only make sense once a backup folder is set
    showSubOptions('backup', !!c.backupFolder);
    const hint = document.getElementById('backup-folder-hint');
    if (hint) hint.hidden = !!c.backupFolder;
}
function showSubOptions(group, on) {
    document.querySelectorAll(`[data-sub-of="${group}"]`).forEach(el => { el.hidden = !on; });
}
function notifyBackupFailure(message) {
    toast('自動バックアップに失敗しました：' + message, 'warn', 8000);
    try { new Notification('Tactical Archive PC', { body: '自動バックアップに失敗しました：' + message }); } catch (e) { /* ignore */ }
}
// reason: '起動時' / '巡回後' / '手動'. Returns the result of the main process (or null when not configured).
async function runAutoBackup(reason) {
    if (!desk || !window.taApp) return null;
    cachedCfg = await desk.getConfig();
    if (!cachedCfg.backupFolder) {
        if (reason === '手動') toast('先にバックアップ先フォルダを選んでください', 'warn');
        return null;
    }
    if (backupRunning) return null;
    backupRunning = true;
    let res;
    try {
        const json = await window.taApp.buildFullBackupJson();
        // 手動 always writes; automatic runs skip unchanged content (so old generations are not pushed out)
        res = await desk.writeBackup({ kind: 'full', json, force: reason === '手動' });
    } catch (e) {
        res = { ok: false, error: String(e && e.message || e) };
    } finally {
        backupRunning = false;
    }
    cachedCfg = await desk.getConfig();
    updateBackupLabels();
    if (res.ok) {
        console.log(`[AutoBackup] (${reason}) ${res.skipped ? 'skipped (unchanged)' : 'saved'}`, res.file, 'deleted:', res.deleted);
        if (reason === '手動') toast('バックアップを保存しました', 'success');
        if (res.warning) toast(res.warning, 'warn', 10000);
    } else {
        notifyBackupFailure(res.error);
    }
    return res;
}
window.taRunAutoBackup = runAutoBackup;

function updateOrganizeLabels() {
    const name = cachedCfg.organizeSubfolder || '取り込み済み';
    ['organize-folder-label', 'organize-folder-label2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    });
    const o = document.getElementById('chk-organize');
    if (o) o.checked = !!cachedCfg.organizeEnabled;
    const r = document.getElementById('chk-organize-rename');
    if (r) r.checked = !!cachedCfg.organizeRename;
    showSubOptions('organize', !!cachedCfg.organizeEnabled);
}
async function setCfg(partial) {
    cachedCfg = await desk.setConfig(partial);
    updateOrganizeLabels();
    updateBackupLabels();
    return cachedCfg;
}
function initOrganizeAndBackupSettings() {
    const o = document.getElementById('chk-organize');
    if (o) o.addEventListener('change', async () => {
        await setCfg({ organizeEnabled: o.checked });
        toast(o.checked ? `取り込んだ画像を「${cachedCfg.organizeSubfolder}」フォルダへ移動します` : '取り込んだ画像は移動しません', 'info');
    });
    const r = document.getElementById('chk-organize-rename');
    if (r) r.addEventListener('change', () => setCfg({ organizeRename: r.checked }));
    const btnName = document.getElementById('btn-organize-folder-name');
    if (btnName) btnName.addEventListener('click', async () => {
        const v = await window.taPrompt('移動先フォルダの名前（登録フォルダの中に作ります）', cachedCfg.organizeSubfolder || '取り込み済み');
        if (v == null) return;
        await setCfg({ organizeSubfolder: v });
        toast(`移動先フォルダ：${cachedCfg.organizeSubfolder}`, 'success');
    });

    const btnFolder = document.getElementById('btn-pick-backup-folder');
    if (btnFolder) btnFolder.addEventListener('click', async () => {
        const f = await desk.pickBackupFolder();
        cachedCfg = await desk.getConfig();
        updateBackupLabels();
        if (f) toast('バックアップ先フォルダを登録しました', 'success');
    });
    const chkS = document.getElementById('chk-backup-startup');
    if (chkS) chkS.addEventListener('change', () => setCfg({ backupOnStartup: chkS.checked }));
    const chkP = document.getElementById('chk-backup-patrol');
    if (chkP) chkP.addEventListener('change', () => setCfg({ backupAfterPatrol: chkP.checked }));
    const num = document.getElementById('num-backup-keep');
    if (num) num.addEventListener('change', () => setCfg({ backupKeep: Number(num.value) || 10 }));
    const btnNow = document.getElementById('btn-backup-now');
    if (btnNow) btnNow.addEventListener('click', () => runAutoBackup('手動'));
    const btnClear = document.getElementById('btn-clear-backup-folder');
    if (btnClear) btnClear.addEventListener('click', async () => {
        if (!confirm('自動バックアップをやめますか？\n保存先フォルダの登録を解除します（保存済みのバックアップファイルは消しません）。')) return;
        await desk.clearBackupFolder();
        cachedCfg = await desk.getConfig();
        updateBackupLabels();
        toast('自動バックアップをやめました', 'info');
    });
    const btnPre = document.getElementById('btn-open-preedit');
    if (btnPre) btnPre.addEventListener('click', () => desk.openFolder('pre-edit'));
    // Undo the last bulk edit: the restore dialog opens with the pre-edit backup in 「完全上書き」 mode
    // (「追加・統合」 would add the old records next to the renamed ones, or skip the merged ones)
    const btnUndo = document.getElementById('btn-undo-bulk');
    if (btnUndo) btnUndo.addEventListener('click', async () => {
        const res = await desk.readLatestPreEdit();
        if (!res.ok) { toast(res.error, 'warn'); return; }
        let data;
        try { data = JSON.parse(res.json); } catch (e) { toast('バックアップを読み込めませんでした：' + e.message, 'warn'); return; }
        const n = Array.isArray(data.battle_history) ? data.battle_history.length : 0;
        if (!confirm(`${formatDateTime(res.mtime)} の一括修正の直前の状態に戻します（戦績 ${n}件）。\n\n戦績・生徒図鑑・修正辞書を、そのときの内容で上書きします。一括修正のあとに取り込んだ戦績は消えます。\n\n次の画面で項目を確認して「復元を実行」を押してください。`)) return;
        window.taApp.openRestoreData(data, { mode: 'overwrite', sections: { history: true, roster: true, calibration: false, opponents: true } });
    });
}

const patrolHooks = {
    // Called by app.js for every file of a batch
    onFileOutcome(file, outcome, detail) {
        if (file && outcome === 'nonResult') batchSkippedFiles.push(file); // dropped files too (listed in the summary)
        if (!desk || !file || !file.__taPath) return;
        if (outcome === 'error') return; // retried on the next patrol
        if (outcome === 'imported' && cachedCfg.organizeEnabled) {
            // Move (and optionally rename) the imported screenshot; the main process updates the processed list
            desk.organizeFile({ path: file.__taPath, mtimeMs: file.__taMtime, record: detail || null })
                .then(r => {
                    if (!r.ok) {
                        console.warn('[Organize] failed', file.__taPath, r.error);
                        toast(`「${file.name}」を移動できませんでした（${r.error}）`, 'warn', 6000);
                    }
                })
                .catch(e => console.warn('[Organize] failed', e));
            return;
        }
        const rec = { path: file.__taPath, mtimeMs: file.__taMtime, status: outcome };
        if (outcome === 'aspect') rec.aspect = (detail && detail.aspect) || lsGet(ASPECT_KEY) || '';
        desk.markProcessed(rec).catch(e => console.warn('[Patrol] markProcessed failed', e));
    },
    onBatchEnd(stats, info) {
        lastSkippedFiles = batchSkippedFiles;
        batchSkippedFiles = [];
        if (info && info.patrol) {
            patrolRunning = false;
            updatePatrolButton();
            const st = document.getElementById('patrol-status');
            if (st) {
                const t = new Date();
                const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                st.textContent = `前回の巡回（${hhmm}${info.cancelled ? '・中断' : ''}）：取り込み ${stats.imported}件・スキップ（対戦履歴以外）${stats.nonResult}件・アスペクト比違い ${stats.aspect}件`;
            }
        }
        refreshProcessedCount();
        if (info && info.patrol && stats.imported > 0 && desk) {
            desk.getConfig().then(c => {
                cachedCfg = c;
                if (c.backupAfterPatrol) runAutoBackup('巡回後');
            });
        }
    },
    showSummary(text, stats) {
        showSummaryDialog(text, stats);
    }
};
window.taPatrol = patrolHooks;

function makeLazyEntry(f) {
    // Looks like a File to app.js (name / lastModified / type); the bytes are read when its turn comes
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/png';
    return {
        name: f.name,
        lastModified: f.mtimeMs,
        size: f.size,
        type,
        __taPath: f.path,
        __taMtime: f.mtimeMs,
        async __taLoad() {
            const bytes = await desk.readFile(f.path);
            const file = new File([bytes], f.name, { type, lastModified: f.mtimeMs });
            file.__taPath = f.path;
            file.__taMtime = f.mtimeMs;
            return file;
        }
    };
}

async function runPatrol() {
    if (!desk) return;
    if (patrolRunning || (typeof window.isUploadBusy === 'function' && window.isUploadBusy())) {
        toast('取り込み中です。終わってからもう一度お試しください', 'warn');
        return;
    }
    const aspect = lsGet(ASPECT_KEY) || '16:9';
    const cfg = await desk.getConfig();
    if (!cfg.folder) {
        toast('スクリーンショットフォルダが未登録です。フォルダを選んでください', 'warn');
        const picked = await pickFolder();
        if (!picked) return;
    }
    patrolRunning = true;
    updatePatrolButton();
    let res;
    try {
        res = await desk.listUnprocessed({ aspect });
    } catch (e) {
        res = { ok: false, error: String(e && e.message || e) };
    }
    if (!res.ok) {
        patrolRunning = false;
        updatePatrolButton();
        toast(res.error === 'not-found' ? 'スクリーンショットフォルダが見つかりません。設定でフォルダを選び直してください' : `フォルダを読み込めませんでした（${res.error}）`, 'warn', 6000);
        return;
    }
    if (res.files.length === 0) {
        patrolRunning = false;
        updatePatrolButton();
        toast(`未処理の画像はありません（フォルダ内の画像 ${res.total}件）`, 'success');
        return;
    }
    // A manual import may have started while the folder was being listed; it would refuse this batch
    // without calling onBatchEnd, which would leave the patrol button disabled
    if (typeof window.isUploadBusy === 'function' && window.isUploadBusy()) {
        patrolRunning = false;
        updatePatrolButton();
        toast('取り込み中です。終わってからもう一度お試しください', 'warn');
        return;
    }
    toast(`未処理の画像 ${res.files.length}件を取り込みます`, 'info', 3000);
    if (typeof window.switchToTab === 'function') window.switchToTab('upload');
    const entries = res.files.map(makeLazyEntry);
    try {
        await window.processMultipleScreenshotUploads(entries, { patrol: true });
    } catch (e) {
        console.error('[Patrol] failed', e);
        patrolRunning = false;
        updatePatrolButton();
        toast('巡回中にエラーが発生しました: ' + (e && e.message || e), 'warn', 6000);
    }
    // If nothing was queued (e.g. all were already registered), onBatchEnd has already reset the state
}

function updatePatrolButton() {
    const btn = document.getElementById('btn-patrol');
    if (!btn) return;
    btn.disabled = patrolRunning;
    btn.innerHTML = patrolRunning
        ? '<i class="fa-solid fa-arrows-rotate fa-spin"></i> 巡回中...'
        : '<i class="fa-solid fa-arrows-rotate"></i> フォルダを巡回';
}

async function refreshFolderLabels() {
    if (!desk) return;
    const cfg = await desk.getConfig();
    const label = document.getElementById('patrol-folder-label');
    if (label) {
        label.textContent = cfg.folder || '未登録（設定で選んでください）';
        label.title = cfg.folder || '';
        label.classList.toggle('unset', !cfg.folder);
    }
    const sl = document.getElementById('settings-folder-label');
    if (sl) sl.textContent = cfg.folder || '未登録';
    const sub = document.getElementById('chk-include-subfolders');
    if (sub) sub.checked = !!cfg.includeSubfolders;
}

async function refreshProcessedCount() {
    if (!desk) return;
    const el = document.getElementById('processed-count');
    if (el) el.textContent = String(await desk.processedCount());
    const nr = document.getElementById('nonresult-count');
    if (nr) nr.textContent = String(await desk.processedCount('nonResult'));
}

async function pickFolder() {
    const folder = await desk.pickFolder();
    if (folder) {
        await refreshFolderLabels();
        toast('スクリーンショットフォルダを登録しました', 'success');
    }
    return folder;
}

function init() {
    // Student icon picker (was an inline onclick; the CSP no longer allows inline scripts)
    const iconZone = document.getElementById('icon-drop-zone');
    if (iconZone) iconZone.addEventListener('click', () => { const inp = document.getElementById('student-icon-input'); if (inp) inp.click(); });
    if (!desk) {
        console.warn('[PC] taDesktop API is not available (not running in the desktop app)');
        return;
    }
    // Status line under the patrol bar
    const bar = document.getElementById('patrol-bar');
    if (bar && !document.getElementById('patrol-status')) {
        const st = document.createElement('div');
        st.className = 'patrol-status';
        st.id = 'patrol-status';
        bar.appendChild(st);
    }
    const btnPatrol = document.getElementById('btn-patrol');
    if (btnPatrol) btnPatrol.addEventListener('click', runPatrol);
    const btnPick = document.getElementById('btn-pick-folder');
    if (btnPick) btnPick.addEventListener('click', pickFolder);
    const folderLabel = document.getElementById('patrol-folder-label');
    if (folderLabel) {
        folderLabel.style.cursor = 'pointer';
        folderLabel.addEventListener('click', pickFolder);
    }

    const sub = document.getElementById('chk-include-subfolders');
    if (sub) sub.addEventListener('change', async () => {
        await desk.setConfig({ includeSubfolders: sub.checked });
        toast(sub.checked ? 'サブフォルダも巡回します' : '登録フォルダの直下だけを巡回します', 'info');
    });

    const autoSkip = document.getElementById('chk-auto-skip-nonresult');
    if (autoSkip) {
        autoSkip.checked = lsGet(AUTO_SKIP_KEY) !== 'false';
        autoSkip.addEventListener('change', () => {
            lsSet(AUTO_SKIP_KEY, autoSkip.checked ? 'true' : 'false');
            toast(autoSkip.checked ? '対戦履歴以外の画像を自動でスキップします' : 'すべての画像で確認画面を開きます', 'info');
        });
    }

    const btnReset = document.getElementById('btn-reset-processed');
    if (btnReset) btnReset.addEventListener('click', async () => {
        const n = await desk.processedCount();
        if (n === 0) { toast('処理済みの記録はありません', 'info'); return; }
        if (!confirm(`処理済みの記録 ${n}件を消しますか？\n次の巡回でフォルダ内の全画像を見直します（登録済みの戦績はファイル名で除外されます）。`)) return;
        await desk.resetProcessed();
        await refreshProcessedCount();
        toast('処理済みの記録を消しました', 'success');
    });

    const btnRecheck = document.getElementById('btn-recheck-nonresult');
    if (btnRecheck) btnRecheck.addEventListener('click', async () => {
        const n = await desk.processedCount('nonResult');
        if (n === 0) { toast('対戦履歴以外と判定した画像はありません', 'info'); return; }
        if (!confirm(`対戦履歴以外と判定した画像 ${n}件を、次の巡回でもう一度判定しますか？
（「対戦履歴以外を自動スキップ」を OFF にしてから巡回すると、全部を確認画面で見られます）`)) return;
        await desk.resetProcessed('nonResult');
        await refreshProcessedCount();
        toast(`${n}件を次の巡回で見直します`, 'success');
    });

    const btnLog = document.getElementById('btn-open-detection-log');
    if (btnLog) btnLog.addEventListener('click', async () => {
        const err = await desk.openDetectionLog();
        if (err) toast('ログを開けませんでした: ' + err, 'warn');
    });
    const linkData = document.getElementById('link-open-data-folder');
    if (linkData) linkData.addEventListener('click', (e) => { e.preventDefault(); desk.openDataFolder(); });

    // Ctrl+Shift+P: patrol from anywhere
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); runPatrol(); }
    });

    refreshFolderLabels();
    refreshProcessedCount();
    updatePatrolButton();
    initOrganizeAndBackupSettings();
    desk.getConfig().then(c => {
        cachedCfg = c;
        updateOrganizeLabels();
        updateBackupLabels();
        // Startup backup: after the app has finished loading its data
        if (c.backupOnStartup && c.backupFolder) setTimeout(() => runAutoBackup('起動時'), 4000);
    });
}

// Shared with pc-tools.js
window.taDialog = openDialog;
window.taShowAlert = function (title, message) {
    return openDialog((box, close) => {
        box.innerHTML = `<h3></h3><p></p><div class="ta-dialog-actions"><button type="button" class="btn-primary" data-act="ok">OK</button></div>`;
        box.querySelector('h3').textContent = title;
        box.querySelector('p').textContent = message;
        const ok = box.querySelector('[data-act="ok"]');
        ok.onclick = () => close(true);
        return { focus: ok, onEnter: () => close(true), cancelValue: true };
    });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// For automated checks
window.taRunPatrol = runPatrol;
