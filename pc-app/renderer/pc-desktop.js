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

function showSummaryDialog(text, s) {
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
        box.innerHTML = `<h3>${escapeHtml(title)}</h3><ul class="ta-summary-list">${rows.map(([k, v]) =>
            `<li><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></li>`).join('')}</ul>
            <div class="ta-dialog-actions"><button type="button" class="btn-primary" data-act="ok">OK</button></div>`;
        const ok = box.querySelector('[data-act="ok"]');
        ok.onclick = () => close(true);
        return { focus: ok, onEnter: () => close(true), cancelValue: true };
    });
}

// ---------- Folder patrol ----------
let patrolRunning = false;

const patrolHooks = {
    // Called by app.js for every file of a batch
    onFileOutcome(file, outcome, detail) {
        if (!desk || !file || !file.__taPath) return;
        if (outcome === 'error') return; // retried on the next patrol
        const rec = { path: file.__taPath, mtimeMs: file.__taMtime, status: outcome };
        if (outcome === 'aspect') rec.aspect = (detail && detail.aspect) || lsGet(ASPECT_KEY) || '';
        desk.markProcessed(rec).catch(e => console.warn('[Patrol] markProcessed failed', e));
    },
    onBatchEnd(stats, info) {
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
    const aspect = lsGet(ASPECT_KEY);
    if (!aspect) {
        toast('先にアスペクト比を選んでください（設定 → アスペクト比）', 'warn');
        return;
    }
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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// For automated checks
window.taRunPatrol = runPatrol;
