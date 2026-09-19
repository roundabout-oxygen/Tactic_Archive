
// CSV EXPORT CONTROLLER
// ==========================================
function getStudentNameForExport(item, team, index) {
    const savedName = (team === 'attack') ? (item.attack_names && item.attack_names[index]) : (item.defense_names && item.defense_names[index]);
    if (savedName && savedName !== '生徒' && savedName !== '未登録' && savedName !== '?' && savedName !== 'Unknown') {
        return savedName;
    }
    const studentId = (team === 'attack') ? (item.attack_team && item.attack_team[index]) : (item.defense_team && item.defense_team[index]);
    if (studentId) {
        const student = currentRoster.find(s => s.id === studentId);
        if (student && student.name && student.name !== '生徒' && student.name !== '未登録' && student.name !== '?' && student.name !== 'Unknown') {
            return student.name;
        }
    }
    return '';
}

function isRecordCompleteForExport(item) {
    for (let i = 0; i < 6; i++) {
        if (!getStudentNameForExport(item, 'attack', i)) return false;
        if (!getStudentNameForExport(item, 'defense', i)) return false;
    }
    return true;
}

function formatCustomTagForExport(color, val) {
    if (!val) return '';
    if (color === 'yellow') return `☆${val}`;
    if (color === 'blue') return `固有${val}`;
    return `${val}`;
}

function openCsvExportModal() {
    const modal = document.getElementById('csv-export-modal');
    if (!modal) return;
    updateCsvExportPreview();
    modal.classList.add('active');
}

function closeCsvExportModal() {
    const modal = document.getElementById('csv-export-modal');
    if (modal) modal.classList.remove('active');
}

function getFilteredRecordsForExport() {
    const selectedTypeEl = document.querySelector('input[name="csv-export-type"]:checked');
    const selectedType = selectedTypeEl ? selectedTypeEl.value : 'attack';

    return currentHistory.filter(item => {
        // Battle type filter
        const isDef = (item.battle_type === 'defense');
        if (selectedType === 'defense' && !isDef) return false;
        if (selectedType === 'attack' && isDef) return false;

        // Exclude battles with unknown students
        return isRecordCompleteForExport(item);
    });
}

function updateCsvExportPreview() {
    const previewEl = document.getElementById('csv-export-count-preview');
    if (!previewEl) return;
    const records = getFilteredRecordsForExport();
    previewEl.innerText = `${records.length} 件`;
}

function executeCsvExport() {
    const selectedTypeEl = document.querySelector('input[name="csv-export-type"]:checked');
    const selectedType = selectedTypeEl ? selectedTypeEl.value : 'attack';
    const omitOpponentName = document.getElementById('chk-csv-omit-opponent-name')?.checked || false;

    const records = getFilteredRecordsForExport();
    if (records.length === 0) {
        alert('出力対象となる戦績データがありません。\n（※不明・未登録の生徒が含まれる編成は除外されます）');
        return;
    }

    const headers = [
        '勝敗', '実用度', '日付', '対戦相手の名前', '攻撃/防衛',
        '自1', '自2', '自3', '自4', '自5', '自6',
        '敵1', '敵2', '敵3', '敵4', '敵5', '敵6',
        '相手SP固有', 'メモ'
    ];

    const escapeCsv = (str) => {
        const s = (str ?? '').toString();
        return '"' + s.replace(/"/g, '""') + '"';
    };

    const rows = [headers.map(escapeCsv).join(',')];

    records.forEach(item => {
        // 1. Result
        const res = item.result || '';
        // 2. Utility
        const util = item.utility_level || '高';
        // 3. Date
        let dateStr = '';
        if (item.created_at) {
            const d = new Date(item.created_at);
            if (!isNaN(d.getTime())) {
                dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
            }
        }
        // 4. Opponent Name
        const opponent = omitOpponentName ? '' : (item.commander_name || '');
        // 5. Attack / Defense
        const battleTypeStr = (item.battle_type === 'defense') ? '防衛' : '攻撃';

        // 6..11. 自1..自6
        const aNames = [];
        for (let i = 0; i < 6; i++) {
            aNames.push(getStudentNameForExport(item, 'attack', i));
        }

        // 12..17. 敵1..敵6
        const dNames = [];
        for (let i = 0; i < 6; i++) {
            dNames.push(getStudentNameForExport(item, 'defense', i));
        }

        // 18. Custom Tag
        const tag1 = formatCustomTagForExport(item.box1_color, item.box1_value);
        const tag2 = formatCustomTagForExport(item.box2_color, item.box2_value);
        const customTag = [tag1, tag2].filter(Boolean).join(' ');

        // 19. Notes
        const notes = item.notes || '';

        const row = [
            escapeCsv(res),
            escapeCsv(util),
            escapeCsv(dateStr),
            escapeCsv(opponent),
            escapeCsv(battleTypeStr),
            ...aNames.map(escapeCsv),
            ...dNames.map(escapeCsv),
            escapeCsv(customTag),
            escapeCsv(notes)
        ];
        rows.push(row.join(','));
    });

    // UTF-8 BOM + CSV content
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const now = new Date();
    const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const typeLabel = selectedType === 'defense' ? '防衛' : '攻撃';
    const filename = `TacticalArchive_戦績_${typeLabel}_${dateTag}.csv`;

    if (window.AndroidApp && typeof window.AndroidApp.saveTextFile === 'function') {
        const res = window.AndroidApp.saveTextFile(csvContent, filename);
        closeCsvExportModal();
        if (res === "SUCCESS") {
            alert(`${records.length} 件の戦績データを「${filename}」として端末の【ダウンロード (Download)】フォルダに出力しました！`);
        } else {
            alert(`CSV保存に失敗しました: ${res}`);
        }
    } else if (window.AndroidApp && typeof window.AndroidApp.saveFile === 'function') {
        const reader = new FileReader();
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            const res = window.AndroidApp.saveFile(base64Data, filename);
            closeCsvExportModal();
            if (res === "SUCCESS" || res === undefined || res === true) {
                alert(`${records.length} 件の戦績データを「${filename}」として端末の【ダウンロード (Download)】フォルダに出力しました！`);
            } else {
                alert(`CSV保存に失敗しました: ${res}`);
            }
        };
        reader.readAsDataURL(blob);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        closeCsvExportModal();
        alert(`${records.length} 件の戦績データを「${filename}」として出力しました！`);
    }
}

function initCsvExportListeners() {
    const btnOpen = document.getElementById('btn-csv-export');
    const btnClose = document.getElementById('btn-csv-modal-close');
    const btnCancel = document.getElementById('btn-csv-modal-cancel');
    const btnExec = document.getElementById('btn-csv-execute');

    if (btnOpen) btnOpen.addEventListener('click', openCsvExportModal);
    if (btnClose) btnClose.addEventListener('click', closeCsvExportModal);
    if (btnCancel) btnCancel.addEventListener('click', closeCsvExportModal);
    if (btnExec) btnExec.addEventListener('click', executeCsvExport);

    document.querySelectorAll('input[name="csv-export-type"]').forEach(r => {
        r.addEventListener('change', updateCsvExportPreview);
    });
}


// Built-in Sword Template (Attack)
const BUILTIN_ATTACK_SWORD_BASE64 = "data:image/png;base64,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";

// Built-in Shield Template (Defense)
const BUILTIN_DEFENSE_SHIELD_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABXxSURBVGhDjZl5lNXVtedZvXq9P17302T1e0YRjQFFRYwa0+l0eq3uXv3W67w4JFGj0SAgSETFLE3ayKAQFFBiZEZBQGSSgoICCoqpZihqoAYZCgooarpD3apbd/rd33h+46fX+d3CR1zPwF13r3N+55zf+Z3v2WfvffbeI5pvu5/z//wIJx//OnWPPP41euyresMjPy/Qo8P1r8ph+nrflfaw7xfDfbK8evzXyq/qhXFNj/2C+kcf48Rjj9Lw+CO0PfYIp376Uw6Oe4B1/2UUra+9xQj916/A7v2Imhr08gqM8nKMoxVFkvWvtenl5ehfleWFsrzi328Ly6vH/3WbnPuv+q68e+XbFUfQjh5EO3IA61Ap/uFDsGsvsem/Z+/oh2h7dXYjfLcWQaQfHAGqAvlsoVTzoKqgqZBXIZcHZbiuyHGyPwf53L89y35Fg5wcL8fKNgWySqlFUsl+bXynML+tyHknhGuQ78jkLmqQMZJOF93tjZD9YzuH7fkzby28xwp39LiQSBPggNDDzIAwCYeJLsi18IfBMgW+5BJZDYBgElk7g6PhCxVc1AiEILBcsH5wAOR2+rNtgWmDoBJpSmN818GwdR2h4rsCZDxOQK/DyCYeJcKLAswkK1wK4bJICoHg0kZtHhC+XbAQggS946uAZO+4M4Y4O28+pQo5i43oR3C4QWDoBYnCYF1pYw5wAg9KAEWw2I4L/ACQeB5QAg1wAAcO4J3Cpwg5n0N7vC9G77mE84wAg9yB2x3C9M53DNg8/mO+7fK+uH9zO44yO7r4eI2P7j1cE2Z1ZzO0u7Z+d6cI42D2D79mN/9Tff44kHX89w5/4q2r/+N07886N8+Huf15g9+P8pYj79c37uWbbf++8p5j4tD/87fI8x9i5/u5//YI79O7b89B7/z+YpL/71M3yT872Zp6x23n38XvufxL+k833+1P/768+9/lD+y4c/0u39H5tZt7r+mdf/P31O7/e98r/l7/8w08uv2049H6w5v/83z037vH//9X3/7L/2P+n/9q+7f8+xYv7/924+e/X/y9e/9f/Z9mP///+kAAAAASUVORK5CYII=";

// Fast ZNCC comparison helper: Matches cropped image against the template saved during calibration
async function detectBattleTypeFromImage(procCanvas, profile) {
    try {
        const bt = (profile && profile.battleTypeIcon) ? profile.battleTypeIcon : { sx: 58, sy: 172, sw: 110, sh: 110 };
        // procCanvas is normalized 2400 x 1040 (identically aligned with calibration canvas)
        const testCanvas = cropImage(procCanvas, bt.sx, bt.sy, bt.sw, bt.sh, 48, 48);
        const testCtx = testCanvas.getContext('2d');
        const testData = testCtx.getImageData(0, 0, 48, 48).data;

        // Convert test image to normalized grayscale float array
        const testNorm = new Float32Array(48 * 48);
        let testSum = 0;
        for (let i = 0; i < 48 * 48; i++) {
            const val = 0.299 * testData[i * 4] + 0.587 * testData[i * 4 + 1] + 0.114 * testData[i * 4 + 2];
            testNorm[i] = val;
            testSum += val;
        }
        const testMean = testSum / (48 * 48);
        let testVar = 0;
        for (let i = 0; i < 48 * 48; i++) {
            testNorm[i] -= testMean;
            testVar += testNorm[i] * testNorm[i];
        }
        const testStd = Math.sqrt(testVar);
        if (testStd < 1e-4) return 'attack';

        // Retrieve or generate template grayscale array from user's calibration profile
        let templGrayscale = profile && profile.battleTypeGrayscale ? new Float32Array(profile.battleTypeGrayscale) : null;
        let templSource = profile ? profile.battleTypeTemplate : null;
        if (!templGrayscale && templSource) {
            const tImg = new Image();
            tImg.src = templSource;
            if (!tImg.complete) {
                await new Promise(resolve => {
                    tImg.onload = resolve;
                    tImg.onerror = resolve;
                });
            }
            if (tImg.naturalWidth > 0) {
                const templCanvas = document.createElement('canvas');
                templCanvas.width = 48;
                templCanvas.height = 48;
                const templCtx = templCanvas.getContext('2d');
                templCtx.drawImage(tImg, 0, 0, 48, 48);
                const templData = templCtx.getImageData(0, 0, 48, 48).data;

                templGrayscale = new Float32Array(48 * 48);
                for (let i = 0; i < 48 * 48; i++) {
                    templGrayscale[i] = 0.299 * templData[i * 4] + 0.587 * templData[i * 4 + 1] + 0.114 * templData[i * 4 + 2];
                }
                if (profile) profile.battleTypeGrayscale = Array.from(templGrayscale);
            }
        }

        // If no template is found in active profile, fallback to builtin default template
        if (!templGrayscale) {
            const defaultTemplate = (BUILTIN_CALIBRATION_PROFILES["2.166"] && BUILTIN_CALIBRATION_PROFILES["2.166"].battleTypeTemplate);
            if (defaultTemplate) {
                const tImg = new Image();
                tImg.src = defaultTemplate;
                if (!tImg.complete) {
                    await new Promise(resolve => {
                        tImg.onload = resolve;
                        tImg.onerror = resolve;
                    });
                }
                if (tImg.naturalWidth > 0) {
                    const templCanvas = document.createElement('canvas');
                    templCanvas.width = 48;
                    templCanvas.height = 48;
                    const templCtx = templCanvas.getContext('2d');
                    templCtx.drawImage(tImg, 0, 0, 48, 48);
                    const templData = templCtx.getImageData(0, 0, 48, 48).data;

                    templGrayscale = new Float32Array(48 * 48);
                    for (let i = 0; i < 48 * 48; i++) {
                        templGrayscale[i] = 0.299 * templData[i * 4] + 0.587 * templData[i * 4 + 1] + 0.114 * templData[i * 4 + 2];
                    }
                }
            }
        }

        if (!templGrayscale) return 'attack';

        let templSum = 0;
        for (let i = 0; i < 48 * 48; i++) {
            templSum += templGrayscale[i];
        }
        const templMean = templSum / (48 * 48);
        const normTempl = new Float32Array(48 * 48);
        let templVar = 0;
        for (let i = 0; i < 48 * 48; i++) {
            normTempl[i] = templGrayscale[i] - templMean;
            templVar += normTempl[i] * normTempl[i];
        }
        const templStd = Math.sqrt(templVar);
        if (templStd < 1e-4) return 'attack';

        // Multi-shift ZNCC to handle minor pixel shifts (±4px)
        let maxCorrelation = -1.0;
        for (let dy = -4; dy <= 4; dy += 2) {
            for (let dx = -4; dx <= 4; dx += 2) {
                let dot = 0;
                let count = 0;
                for (let y = 0; y < 48; y++) {
                    const ty = y + dy;
                    if (ty < 0 || ty >= 48) continue;
                    for (let x = 0; x < 48; x++) {
                        const tx = x + dx;
                        if (tx < 0 || tx >= 48) continue;
                        dot += testNorm[y * 48 + x] * normTempl[ty * 48 + tx];
                        count++;
                    }
                }
                if (count > 0) {
                    const corr = dot / (testStd * templStd + 1e-5);
                    if (corr > maxCorrelation) maxCorrelation = corr;
                }
            }
        }

        console.log(`[BattleType] Correlation with User-Calibrated Template: ${maxCorrelation.toFixed(3)}`);
        // Threshold: 0.65 (Same-device Attack match is typically > 0.85, Defense vs Attack is < 0.50)
        // 一致する場合は「攻撃」、一致しない場合は「防衛」
        const decision = (maxCorrelation >= 0.65) ? 'attack' : 'defense';
        console.log(`[BattleType] Recognition Decision: ${decision.toUpperCase()}`);
        return decision;
    } catch (e) {
        console.warn('[BattleType] Failed to recognize battle type, defaulting to attack:', e);
        return 'attack';
    }
}


// Built-in verified calibration profiles
const BUILTIN_CALIBRATION_PROFILES = {
    "2.166": {
        "aspectRatio": "2.166",
        "relModal": {
            "rx": 0.07251082251082251,
            "ry": 0.1,
            "rw": 0.854978354978355,
            "rh": 0.7984375
        },
        "modalBox": { "x": 201, "y": 128, "w": 2370, "h": 1022 },
        "normalizedWidth": 2400,
        "normalizedHeight": 1040,
        "winLose": { "sx": 110, "sy": 100, "sw": 280, "sh": 160, "dw": 280, "dh": 160 },
        "battleTypeIcon": { "sx": 58, "sy": 172, "sw": 110, "sh": 110 },
        "battleTypeTemplate": "data:image/png;base64,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",
        "oppAvatar": { "sx": 1715, "sy": 165, "sw": 120, "sh": 120, "dw": 100, "dh": 100 },
        "oppName": { "sx": 1995, "sy": 144, "sw": 370, "sh": 55, "dw": 1100, "dh": 200 },
        "atkCenters": [206, 352, 499, 646, 793, 940],
        "defCenters": [1449, 1596, 1743, 1890, 2036, 2184],
        "cardTop": 859,
        "cardSize": 88
    },
    "2.223": {
        "aspectRatio": "2.223",
        "relModal": {
            "rx": 0.05641592920353982,
            "ry": 0.07540983606557378,
            "rw": 0.8864306784660767,
            "rh": 0.85
        },
        "modalBox": { "x": 153, "y": 92, "w": 2404, "h": 1037 },
        "normalizedWidth": 2400,
        "normalizedHeight": 1040,
        "winLose": { "sx": 110, "sy": 100, "sw": 280, "sh": 160, "dw": 280, "dh": 160 },
        "battleTypeIcon": { "sx": 58, "sy": 172, "sw": 110, "sh": 110 },
        "battleTypeTemplate": "data:image/png;base64,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",
        "oppAvatar": { "sx": 1720, "sy": 160, "sw": 120, "sh": 120, "dw": 100, "dh": 100 },
        "oppName": { "sx": 1995, "sy": 141, "sw": 380, "sh": 60, "dw": 1100, "dh": 200 },
        "atkCenters": [206, 353, 500, 646, 795, 941],
        "defCenters": [1451, 1597, 1744, 1891, 2037, 2185],
        "cardTop": 857,
        "cardSize": 88
    }
};

// IndexedDB Database management
const DB_NAME = 'TacticalArchiveDB';
const DB_VERSION = 4;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('roster_students')) {
                const studentStore = db.createObjectStore('roster_students', { keyPath: 'id', autoIncrement: true });
                studentStore.createIndex('name', 'name', { unique: true });
            }
            if (!db.objectStoreNames.contains('battle_history')) {
                db.createObjectStore('battle_history', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('opponent_directory')) {
                db.createObjectStore('opponent_directory', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('opponent_renames')) {
                db.createObjectStore('opponent_renames', { keyPath: 'ocr_name' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// Opponent Directory Operations
async function getOpponents() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('opponent_directory', 'readonly');
        const store = transaction.objectStore('opponent_directory');
        const request = store.getAll();
        request.onsuccess = () => {
            const map = {};
            request.result.forEach(item => {
                map[item.name] = item.avatar;
            });
            resolve(map);
        };
        request.onerror = () => reject(request.error);
    });
}

async function saveOpponent(name, avatar, overwrite = false) {
    if (!name || !avatar) return false;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('opponent_directory', 'readwrite');
        const store = transaction.objectStore('opponent_directory');
        const getReq = store.get(name);
        getReq.onsuccess = () => {
            if (!getReq.result || overwrite) {
                const putReq = store.put({ name, avatar, updated_at: new Date().getTime() });
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            } else {
                resolve(false);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

// Automatic DB Migration: Extract bloated opponent_avatar base64 strings from battle_history
// into opponent_directory, and set record.opponent_avatar = null.
// Dramatically reduces DB size from megabytes to kilobytes and makes list loading instantaneous!
async function migrateOpponentAvatars() {
    try {
        const db = await openDB();
        const allHistory = await getHistory();
        const allRenames = await getRenames();
        
        let needMigrationCount = 0;
        for (const item of allHistory) {
            if (item.opponent_avatar) {
                needMigrationCount++;
            }
        }
        if (needMigrationCount === 0) return;

        console.log(`[DB Optimization] Found ${needMigrationCount} records with bloated avatar base64. Starting cleanup migration...`);
        
        const transaction = db.transaction(['battle_history', 'opponent_directory'], 'readwrite');
        const histStore = transaction.objectStore('battle_history');
        const oppStore = transaction.objectStore('opponent_directory');

        for (const item of allHistory) {
            if (item.opponent_avatar) {
                let cName = item.commander_name;
                const rRule = allRenames.find(r => r.ocr_name === cName);
                if (rRule) cName = rRule.corrected_name;

                if (cName) {
                    oppStore.put({ name: cName, avatar: item.opponent_avatar, updated_at: Date.now() });
                }
                item.opponent_avatar = null;
                histStore.put(item);
            }
        }

        await new Promise(resolve => {
            transaction.oncomplete = resolve;
            transaction.onerror = resolve;
        });

        opponentDirectory = await getOpponents();
        console.log(`[DB Optimization] Successfully migrated ${needMigrationCount} avatars to opponent_directory and sanitized battle_history!`);
    } catch (err) {
        console.warn('migrateOpponentAvatars failed:', err);
    }
}

// Rename Dictionary Operations
async function getRenames() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('opponent_renames', 'readonly');
        const store = transaction.objectStore('opponent_renames');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function saveRename(ocrName, correctedName) {
    if (!ocrName || !correctedName) return false;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['opponent_renames', 'opponent_directory'], 'readwrite');
        const store = transaction.objectStore('opponent_renames');
        const oppStore = transaction.objectStore('opponent_directory');
        
        const request = store.put({ ocr_name: ocrName, corrected_name: correctedName, created_at: new Date().getTime() });
        request.onsuccess = () => {
            // Also link avatar under correctedName if available
            const getOldAv = oppStore.get(ocrName);
            getOldAv.onsuccess = () => {
                if (getOldAv.result && getOldAv.result.avatar) {
                    oppStore.put({ name: correctedName, avatar: getOldAv.result.avatar, updated_at: Date.now() });
                }
            };
            resolve(true);
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteRename(ocrName) {
    if (!ocrName) return false;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('opponent_renames', 'readwrite');
        const store = transaction.objectStore('opponent_renames');
        const request = store.delete(ocrName);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// Student Database operations
async function getStudents() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('roster_students', 'readonly');
        const store = transaction.objectStore('roster_students');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addOrUpdateStudent(student) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('roster_students', 'readwrite');
        const store = transaction.objectStore('roster_students');
        
        // Check if student with same name exists
        const index = store.index('name');
        const checkRequest = index.get(student.name);
        
        checkRequest.onsuccess = () => {
            let saveRequest;
            if (checkRequest.result) {
                // Merge features if updating
                const existing = checkRequest.result;
                const newFeatures = [...(existing.features || [])];
                
                // Add new feature vector if provided and not duplicate
                if (student.features && student.features.length > 0) {
                    student.features.forEach(f => {
                        if (!newFeatures.some(ef => arraysEqual(ef, f))) {
                            newFeatures.push(f);
                        }
                    });
                }
                
                existing.features = newFeatures;
                if (student.icon_path) {
                    existing.icon_path = student.icon_path;
                }
                saveRequest = store.put(existing);
            } else {
                saveRequest = store.add(student);
            }
            
            saveRequest.onsuccess = () => resolve(saveRequest.result);
            saveRequest.onerror = () => reject(saveRequest.error);
        };
        checkRequest.onerror = () => reject(checkRequest.error);
    });
}

async function deleteStudent(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('roster_students', 'readwrite');
        const store = transaction.objectStore('roster_students');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Battle History Database operations
async function getHistory() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('battle_history', 'readonly');
        const store = transaction.objectStore('battle_history');
        const request = store.getAll();
        request.onsuccess = () => {
            resolve(request.result || []);
        };
        request.onerror = () => reject(request.error);
    });
}

async function addHistory(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('battle_history', 'readwrite');
        const store = transaction.objectStore('battle_history');
        const request = store.add(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteHistory(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('battle_history', 'readwrite');
        const store = transaction.objectStore('battle_history');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Remove any existing Defense battle records from IndexedDB
// Defense feature is now fully supported
async function cleanupDefenseRecords() {
    return false;
}

// Helper: check if two arrays are equal
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// ZNCC Matching Algorithm
// f: query image feature, g: template image feature (both 1024 grayscale values)
function calculateZNCC(f, g) {
    let meanF = 0, meanG = 0;
    const n = f.length;
    for (let i = 0; i < n; i++) {
        meanF += f[i];
        meanG += g[i];
    }
    meanF /= n;
    meanG /= n;

    let num = 0;
    let denF = 0;
    let denG = 0;
    for (let i = 0; i < n; i++) {
        const diffF = f[i] - meanF;
        const diffG = g[i] - meanG;
        num += diffF * diffG;
        denF += diffF * diffF;
        denG += diffG * diffG;
    }
    if (denF === 0 || denG === 0) return 0;
    return num / Math.sqrt(denF * denG);
}

// Find best matching student in the roster
function matchStudent(queryFeatures, roster) {
    let bestMatch = null;
    let bestSimilarity = -1;
    
    for (const student of roster) {
        if (!student.features || student.features.length === 0) continue;
        for (const template of student.features) {
            const sim = calculateZNCC(queryFeatures, template);
            if (sim > bestSimilarity) {
                bestSimilarity = sim;
                bestMatch = student;
            }
        }
    }
    return { student: bestMatch, similarity: bestSimilarity };
}

// Hiragana and Katakana string converters with NFKC normalization
function toHiragana(str) {
    if (!str) return '';
    return str.normalize('NFKC')
        .replace(/[\u30a1-\u30f6]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60))
        .toLowerCase();
}
function toKatakana(str) {
    if (!str) return '';
    return str.normalize('NFKC')
        .replace(/[\u3041-\u3096]/g, match => String.fromCharCode(match.charCodeAt(0) + 0x60))
        .toLowerCase();
}

// X-axis Shift Invariant Student Slot Matching
function matchStudentSlotWithShifts(procCanvas, cx, cardTop, faceSize, faceOffset, roster) {
    if (!roster || roster.length === 0) {
        const centerCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70);
        return {
            student: null,
            similarity: 0,
            bestDx: 0,
            bestFeatures: extractFeaturesFromCanvas(centerCanvas)
        };
    }

    let overallBestMatch = null;
    let overallBestSim = -1;
    let overallBestDx = 0;
    let overallBestFeatures = null;

    // Test X shifts: 0, -2, +2, -4, +4, -6, +6
    const shifts = [0, -2, 2, -4, 4, -6, 6];
    for (const dx of shifts) {
        const faceCanvas = cropImage(procCanvas, cx + dx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70);
        const features = extractFeaturesFromCanvas(faceCanvas);
        const match = matchStudent(features, roster);
        if (match.similarity > overallBestSim) {
            overallBestSim = match.similarity;
            overallBestMatch = match.student;
            overallBestDx = dx;
            overallBestFeatures = features;
        }
        if (overallBestSim >= 0.95) break;
    }

    if (!overallBestFeatures) {
        const centerCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70);
        overallBestFeatures = extractFeaturesFromCanvas(centerCanvas);
    }

    return {
        student: overallBestMatch,
        similarity: overallBestSim,
        bestDx: overallBestDx,
        bestFeatures: overallBestFeatures
    };
}

// Levenshtein Distance for fuzzy string matching
function getLevenshteinDistance(a, b) {
    const tmp = [];
    for (let i = 0; i <= a.length; i++) {
        tmp[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        tmp[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            tmp[i][j] = Math.min(
                tmp[i - 1][j] + 1,
                tmp[i][j - 1] + 1,
                tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return tmp[a.length][b.length];
}

function getFuzzyStringMatchInMaster(query, masterList) {
    if (!query || query.trim().length < 2 || !masterList) return null;
    let bestMatch = null;
    let maxSimilarity = -1;
    
    const cleanQuery = query.toLowerCase().replace(/[\s\(\)（）\*＊【】]/g, '');
    if (cleanQuery.length < 2) return null;
    
    for (const item of masterList) {
        const cleanName = item.name.toLowerCase().replace(/[\s\(\)（）\*＊【】]/g, '');
        const cleanReading = item.reading.toLowerCase().replace(/[\s\(\)（）\*＊【】]/g, '');
        
        if (cleanName === cleanQuery || cleanReading === cleanQuery) {
            return item;
        }
        
        if (cleanQuery.length >= 3 && (cleanName.includes(cleanQuery) || cleanQuery.includes(cleanName))) {
            const sim = Math.min(cleanName.length, cleanQuery.length) / Math.max(cleanName.length, cleanQuery.length);
            if (sim > maxSimilarity) {
                maxSimilarity = sim + 0.1;
                bestMatch = item;
            }
        }
        
        const dist = getLevenshteinDistance(cleanQuery, cleanName);
        const len = Math.max(cleanQuery.length, cleanName.length);
        const sim = len > 0 ? (1 - dist / len) : 0;
        if (sim > maxSimilarity) {
            maxSimilarity = sim;
            bestMatch = item;
        }
    }
    return maxSimilarity >= 0.60 ? bestMatch : null;
}

function getFuzzyStringMatch(query, roster) {
    if (!query || query.trim().length < 2) return null;
    let bestMatch = null;
    let maxSimilarity = -1;
    
    // Normalize query string (remove punctuation/spaces)
    const cleanQuery = query.toLowerCase().replace(/[\s\(\)（）\*＊【】]/g, '');
    if (cleanQuery.length < 2) return null;
    
    for (const student of roster) {
        const cleanName = student.name.toLowerCase().replace(/[\s\(\)（）\*＊【】]/g, '');
        
        // Exact match
        if (cleanName === cleanQuery) {
            return student;
        }
        
        // Substring check only for meaningful length (>= 3 chars)
        if (cleanQuery.length >= 3 && (cleanName.includes(cleanQuery) || cleanQuery.includes(cleanName))) {
            const sim = Math.min(cleanName.length, cleanQuery.length) / Math.max(cleanName.length, cleanQuery.length);
            if (sim > maxSimilarity) {
                maxSimilarity = sim + 0.1;
                bestMatch = student;
            }
        }
        
        // Levenshtein distance check
        const dist = getLevenshteinDistance(cleanQuery, cleanName);
        const len = Math.max(cleanQuery.length, cleanName.length);
        const sim = len > 0 ? (1 - dist / len) : 0;
        if (sim > maxSimilarity) {
            maxSimilarity = sim;
            bestMatch = student;
        }
    }
    return maxSimilarity >= 0.65 ? bestMatch : null;
}

// Image Utility: resize & crop to Canvas
function cropImage(img, sx, sy, sw, sh, dw, dh) {
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    return canvas;
}

// Image Utility: extract grayscale feature vector (32x32 = 1024 floats)
function extractFeaturesFromCanvas(canvas) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 32;
    tempCanvas.height = 32;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 32, 32);
    
    const imgData = ctx.getImageData(0, 0, 32, 32).data;
    const features = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
        const r = imgData[i * 4];
        const g = imgData[i * 4 + 1];
        const b = imgData[i * 4 + 2];
        features[i] = 0.299 * r + 0.587 * g + 0.114 * b; // standard grayscale conversion
    }
    return Array.from(features);
}

// Global Variables
let currentRoster = [];
let currentHistory = [];
let currentUploadData = null; // Holds the processed data of current review screenshot
let tesseractWorker = null; // Shared Tesseract OCR worker
let editingRecord = null; // Record currently being edited in Detail Modal
let detailEditedData = null; // Temporary edits during Detail Modal editing
let opponentDirectory = {}; // Cache of { name: avatar_data_url }
let opponentRenames = []; // Cache of name translation rules: [ { ocr_name, corrected_name } ]
let currentAddStudentFeatures = null; // Extracted face features to save for newly registered student
let uploadQueue = []; // Queue of File objects to review sequentially
let activePositionFilter = null; // Filter for specific position: { sourceTab: 'attack'|'defense', team: 'attack'|'defense', index: 0-5, studentName: string }

function getEffectivePositionFilter(currentType) {
    if (!activePositionFilter) return null;
    const { sourceTab, team, index, studentName } = activePositionFilter;
    // 攻撃タブと防衛タブでAとDを逆に絞り込み（攻撃タブのD1は防衛タブのA1に対応）
    const effectiveTeam = (currentType === sourceTab)
        ? team
        : (team === 'attack' ? 'defense' : 'attack');
    return { team: effectiveTeam, index, studentName };
}
let lastUploadedImage = null; // Raw Image object of current uploaded screenshot
let currentActiveProfile = null; // Calibration layout profile for active screenshot
let currentUploadFile = null; // Currently processing File object
let currentUploadExtractedDate = null; // Extracted date string of currently processing File
let isScanCancelled = false; // Flag to abort processing if cancelled

// Active UI variables
let activeTab = 'attack';
let editingSlot = null; // { team: 'attack'|'defense', index: 0-5, modal: 'review'|'detail' }

// UI Elements
const tabs = document.querySelectorAll('.tab-btn');
const panes = document.querySelectorAll('.tab-pane');
const rosterItems = document.getElementById('roster-items');
const rosterCount = document.getElementById('roster-count');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const scannerScreen = document.getElementById('scanner-screen');
const scanningImg = document.getElementById('scanning-img');
const scanStatusText = document.getElementById('scan-status-text');

// Modals
const reviewModal = document.getElementById('review-modal');
const selectorModal = document.getElementById('selector-modal');
const studentModal = document.getElementById('student-modal');
const detailModal = document.getElementById('detail-modal');
const cropInspectorModal = document.getElementById('crop-inspector-modal');
const cropInspectorCanvas = document.getElementById('crop-inspector-canvas');
const searchSelectorInput = document.getElementById('search-selector');

// ==========================================
// TUTORIAL / ONBOARDING CONTROLLER
// ==========================================
function showTutorialPopup(message, iconHtml = '<i class="fa-solid fa-cloud-arrow-up"></i>', title = '初回セットアップ') {
    const modal = document.getElementById('tutorial-modal');
    if (!modal) return;
    const titleEl = document.getElementById('tutorial-title');
    const msgEl = document.getElementById('tutorial-msg');
    const iconEl = document.getElementById('tutorial-icon');
    const btnOk = document.getElementById('btn-tutorial-ok');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerHTML = message;
    if (iconEl && iconHtml) {
        iconEl.outerHTML = iconHtml.includes('id=') ? iconHtml : iconHtml.replace('<i ', '<i id="tutorial-icon" ');
    }

    modal.classList.add('active');

    const handleOk = () => {
        modal.classList.remove('active');
        localStorage.setItem('tactical_archive_first_launch_done', 'true');
        if (btnOk) btnOk.removeEventListener('click', handleOk);
    };
    if (btnOk) {
        btnOk.addEventListener('click', handleOk, { once: true });
    }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Open DB and Load Data
    try {
        currentRoster = await getStudents();
        currentHistory = await getHistory();
        opponentDirectory = await getOpponents();
        opponentRenames = await getRenames();
        await migrateOpponentAvatars();
        
        // Render UI INSTANTLY (0ms) so battle history list is shown immediately on startup
        updateRosterView();
        updateHistoryView();

        // Background batch backfill (non-blocking)
        backfillHistorySnapshots().catch(err => console.warn("Background backfill error:", err));
    } catch (e) {
        console.error("Failed to load initial database values:", e);
    }
    
    // Initialize Tesseract Worker
    initOCRWorker();

    // Setup Student Name Autocomplete (Furigana / Prefix Match)
    setupStudentAutocomplete();

    // Setup Bulk Roster & Bulk Rename features
    initBulkFeatures();
    initCsvExportListeners();

    // Setup History Infinite Scroll Listeners (30 items batch)
    setupHistoryScrollListeners();

    // Prevent viewport displacement / scroll shifting on virtual keyboard events
    window.addEventListener('scroll', () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }
    });
    document.addEventListener('focusout', () => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    });

    // Tab Navigation setup
    window.switchToTab = function(tabName) {
        window.scrollTo(0, 0);
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        
        const tabEl = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const paneEl = document.getElementById(`tab-${tabName}`);
        if (tabEl) tabEl.classList.add('active');
        if (paneEl) paneEl.classList.add('active');
        activeTab = tabName;
        if (tabName === 'attack' || tabName === 'defense') {
            filterHistory(tabName);
        }

        // Check if defense feature popup should be shown on upload tab
        if (tabName === 'upload') {
            const defenseNotified = localStorage.getItem('tactical_archive_defense_feature_notified') === 'true';
            if (!defenseNotified) {
                localStorage.setItem('tactical_archive_defense_feature_notified', 'true');
                setTimeout(() => {
                    showTutorialPopup(
                        '防衛編成の読み込み機能も追加しました。攻撃・防衛の判定のためにアイコン位置のトリミング範囲を新たに設定してください。<br><br><b style="color: #ff3366; font-size: 13px;">初回は必ず攻撃編成の画像で設定してください</b>',
                        '<i class="fa-solid fa-shield-halved" style="color: #ff3366;"></i>',
                        '防衛機能追加のお知らせ'
                    );
                }, 200);
            }
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            window.switchToTab(tab.dataset.tab);
        });
    });

    // First Launch Tutorial flow:
    // Only display on true fresh install (not marked as done, no calibration profiles, no history or roster data)
    const cachedProfiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
    const hasCalibration = Object.keys(cachedProfiles).length > 0;
    const isDone = localStorage.getItem('tactical_archive_first_launch_done') === 'true';
    const hasData = (currentHistory && currentHistory.length > 0) || (currentRoster && currentRoster.length > 0);

    if (!isDone && !hasCalibration && !hasData) {
        localStorage.setItem('tactical_archive_first_launch_done', 'true');
        window.switchToTab('upload');
        setTimeout(() => {
            showTutorialPopup('戦術対抗戦の戦闘履歴のスクリーンショット（初回は攻撃のリザルト）を張り付けてください', '<i class="fa-solid fa-cloud-arrow-up"></i>', '初回セットアップ');
        }, 150);
    }

    // Synchronized Search Inputs (Shared across Attack and Defense tabs)
    const searchAtk = document.getElementById('search-commander-attack');
    const btnClearAtk = document.getElementById('btn-clear-search-attack');
    const searchDef = document.getElementById('search-commander-defense');
    const btnClearDef = document.getElementById('btn-clear-search-defense');

    if (searchAtk) {
        searchAtk.addEventListener('input', () => {
            syncSearchInput(searchAtk.value, false);
        });
    }
    if (btnClearAtk) {
        btnClearAtk.addEventListener('click', () => {
            syncSearchInput('', true);
        });
    }

    if (searchDef) {
        searchDef.addEventListener('input', () => {
            syncSearchInput(searchDef.value, false);
        });
    }
    if (btnClearDef) {
        btnClearDef.addEventListener('click', () => {
            syncSearchInput('', true);
        });
    }

    // Dropzone Events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            processMultipleScreenshotUploads(e.dataTransfer.files);
        }
    });

    dropZone.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        try {
            if (fileInput.files && fileInput.files.length > 0) {
                processMultipleScreenshotUploads(fileInput.files);
            }
        } catch (err) {
            console.error("fileInput change error:", err);
            alert("画像読み込み中にエラーが発生しました: " + (err.message || err));
        }
    });

    // DB Backup / Restore / Delete handlers
    document.getElementById('btn-db-backup').addEventListener('click', openBackupModal);
    document.getElementById('btn-db-restore').addEventListener('click', openRestoreFilePicker);
    
    const btnDbDelete = document.getElementById('btn-db-delete');
    if (btnDbDelete) btnDbDelete.addEventListener('click', openDeleteModal);

    const btnCancelScan = document.getElementById('btn-cancel-scan');
    if (btnCancelScan) btnCancelScan.addEventListener('click', cancelOngoingUpload);

    if (btnBackupClose) btnBackupClose.addEventListener('click', () => backupModal.classList.remove('active'));
    if (btnBackupCancel) btnBackupCancel.addEventListener('click', () => backupModal.classList.remove('active'));
    if (btnBackupSelectAll) {
        btnBackupSelectAll.addEventListener('click', () => {
            chkBackupHistory.checked = true;
            chkBackupRoster.checked = true;
            chkBackupCalibration.checked = true;
            chkBackupOpponents.checked = true;
            updateBackupFilenamePreview();
        });
    }
    if (btnBackupDeselectAll) {
        btnBackupDeselectAll.addEventListener('click', () => {
            chkBackupHistory.checked = false;
            chkBackupRoster.checked = false;
            chkBackupCalibration.checked = false;
            chkBackupOpponents.checked = false;
            updateBackupFilenamePreview();
        });
    }
    if (chkBackupHistory) chkBackupHistory.addEventListener('change', updateBackupFilenamePreview);
    if (chkBackupRoster) chkBackupRoster.addEventListener('change', updateBackupFilenamePreview);
    if (chkBackupCalibration) chkBackupCalibration.addEventListener('change', updateBackupFilenamePreview);
    if (chkBackupOpponents) chkBackupOpponents.addEventListener('change', updateBackupFilenamePreview);
    if (btnBackupExecute) btnBackupExecute.addEventListener('click', executeBackup);

    if (btnRestoreClose) btnRestoreClose.addEventListener('click', () => restoreModal.classList.remove('active'));
    if (btnRestoreCancel) btnRestoreCancel.addEventListener('click', () => restoreModal.classList.remove('active'));
    if (btnRestoreExecute) btnRestoreExecute.addEventListener('click', executeRestore);

    if (btnDeleteClose) btnDeleteClose.addEventListener('click', () => deleteModal.classList.remove('active'));
    if (btnDeleteCancel) btnDeleteCancel.addEventListener('click', () => deleteModal.classList.remove('active'));
    if (btnDeleteSelectAll) {
        btnDeleteSelectAll.addEventListener('click', () => {
            if (chkDeleteHistory) chkDeleteHistory.checked = true;
            if (chkDeleteRoster) chkDeleteRoster.checked = true;
            if (chkDeleteCalibration) chkDeleteCalibration.checked = true;
            if (chkDeleteOpponents) chkDeleteOpponents.checked = true;
        });
    }
    if (btnDeleteDeselectAll) {
        btnDeleteDeselectAll.addEventListener('click', () => {
            if (chkDeleteHistory) chkDeleteHistory.checked = false;
            if (chkDeleteRoster) chkDeleteRoster.checked = false;
            if (chkDeleteCalibration) chkDeleteCalibration.checked = false;
            if (chkDeleteOpponents) chkDeleteOpponents.checked = false;
        });
    }
    if (btnDeleteExecute) btnDeleteExecute.addEventListener('click', executeDelete);

    // Semi-Manual Calibration Wizard triggers & event listeners
    const btnOpenInspector = document.getElementById('btn-open-inspector');
    if (btnOpenInspector) btnOpenInspector.addEventListener('click', openCropInspector);

    const btnInspectorClose = document.getElementById('btn-inspector-close');
    if (btnInspectorClose) btnInspectorClose.addEventListener('click', closeCropInspector);

    const btnSlotReset = document.getElementById('btn-slot-reset');
    if (btnSlotReset) btnSlotReset.addEventListener('click', resetActiveSlot);

    const btnStepPrev = document.getElementById('btn-step-prev');
    if (btnStepPrev) btnStepPrev.addEventListener('click', () => setWizardStep(wizardCurrentStep - 1));

    const btnStepNext = document.getElementById('btn-step-next');
    if (btnStepNext) btnStepNext.addEventListener('click', () => {
        if (wizardCurrentStep === WIZARD_STEPS.length - 1) {
            applyCropInspector();
        } else {
            setWizardStep(wizardCurrentStep + 1);
        }
    });

    const btnInspectorApply = document.getElementById('btn-inspector-apply');
    if (btnInspectorApply) btnInspectorApply.addEventListener('click', applyCropInspector);

    // Wizard tab direct navigation (3-row grid)
    document.querySelectorAll('.wizard-tab-btn').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            const stepIdx = parseInt(tabBtn.dataset.step, 10);
            if (!isNaN(stepIdx)) setWizardStep(stepIdx);
        });
    });

    // Zoom Toolbar buttons
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => {
        wizardZoom = Math.min(5.0, wizardZoom * 1.25);
        document.getElementById('zoom-level-text').innerText = `${Math.round(wizardZoom * 100)}%`;
        renderCropInspectorCanvas();
    });

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => {
        wizardZoom = Math.max(0.5, wizardZoom / 1.25);
        document.getElementById('zoom-level-text').innerText = `${Math.round(wizardZoom * 100)}%`;
        renderCropInspectorCanvas();
    });

    const btnZoomFocus = document.getElementById('btn-zoom-focus');
    if (btnZoomFocus) btnZoomFocus.addEventListener('click', focusOnActiveSlot);

    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => {
        wizardZoom = 1.0;
        wizardPanX = 0;
        wizardPanY = 0;
        document.getElementById('zoom-level-text').innerText = '100%';
        renderCropInspectorCanvas();
    });

    // Nudge D-Pad buttons
    const btnNudgeUp = document.getElementById('btn-nudge-up');
    if (btnNudgeUp) btnNudgeUp.addEventListener('click', () => nudgeActiveSlot(0, -1));

    const btnNudgeDown = document.getElementById('btn-nudge-down');
    if (btnNudgeDown) btnNudgeDown.addEventListener('click', () => nudgeActiveSlot(0, 1));

    const btnNudgeLeft = document.getElementById('btn-nudge-left');
    if (btnNudgeLeft) btnNudgeLeft.addEventListener('click', () => nudgeActiveSlot(-1, 0));

    const btnNudgeRight = document.getElementById('btn-nudge-right');
    if (btnNudgeRight) btnNudgeRight.addEventListener('click', () => nudgeActiveSlot(1, 0));

    const btnNudgeCenter = document.getElementById('btn-nudge-center');
    if (btnNudgeCenter) btnNudgeCenter.addEventListener('click', () => {
        wizardNudgeStep = wizardNudgeStep === 1 ? 5 : 1;
        btnNudgeCenter.innerText = `${wizardNudgeStep}px`;
        showInspectorToast(`移動量を ${wizardNudgeStep}px に切り替えました`);
    });

    // Size Adjust buttons
    const btnSizeMinus = document.getElementById('btn-size-minus');
    if (btnSizeMinus) btnSizeMinus.addEventListener('click', () => adjustActiveSlotSize(-1));

    const btnSizePlus = document.getElementById('btn-size-plus');
    if (btnSizePlus) btnSizePlus.addEventListener('click', () => adjustActiveSlotSize(1));

    // Canvas Pointer / Touch / Wheel Listeners
    if (cropInspectorCanvas) {
        cropInspectorCanvas.addEventListener('mousedown', handleInspectorPointerDown);
        window.addEventListener('mousemove', handleInspectorPointerMove);
        window.addEventListener('mouseup', handleInspectorPointerUp);

        cropInspectorCanvas.addEventListener('touchstart', handleInspectorPointerDown, { passive: false });
        window.addEventListener('touchmove', handleInspectorPointerMove, { passive: false });
        window.addEventListener('touchend', handleInspectorPointerUp);

        cropInspectorCanvas.addEventListener('wheel', handleInspectorWheel, { passive: false });
    }

    // Student Registration Modal events
    const studentIconInput = document.getElementById('student-icon-input');
    let manualIconDataUrl = '';

    document.getElementById('btn-student-cancel').addEventListener('click', () => studentModal.classList.remove('active'));

    studentIconInput.addEventListener('change', () => {
        if (studentIconInput.files.length > 0) {
            readStudentIcon(studentIconInput.files[0]);
        }
    });

    function readStudentIcon(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            manualIconDataUrl = e.target.result;
            document.getElementById('add-student-icon-preview').src = manualIconDataUrl;
            document.getElementById('add-student-icon-preview').style.display = 'block';
            document.getElementById('add-student-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('btn-student-save').addEventListener('click', async () => {
        const name = document.getElementById('add-student-name').value.trim();
        if (!name) {
            alert('生徒名を入力してください。');
            return;
        }
        
        if (currentAddStudentFeatures) {
            // Directly save the ZNCC face features array without re-cropping
            const newStudent = {
                name: name,
                icon_path: manualIconDataUrl,
                features: [currentAddStudentFeatures],
                created_at: new Date().getTime()
            };
            
            await addOrUpdateStudent(newStudent);
            currentRoster = await getStudents();
            updateRosterView();
            studentModal.classList.remove('active');
            
            // If editing slot, automatically select newly created student
            if (editingSlot) {
                const newlyAdded = currentRoster.find(s => s.name === name);
                if (newlyAdded) {
                    selectStudentForEditingSlot(newlyAdded);
                }
            }
        } else if (manualIconDataUrl) {
            // Compute ZNCC feature vector for manual upload
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 100, 100);
                
                // Crop inner face area (70x70) centered at (50, 50)
                const faceCanvas = cropImage(canvas, 15, 15, 70, 70, 70, 70);
                const features = extractFeaturesFromCanvas(faceCanvas);
                
                const newStudent = {
                    name: name,
                    icon_path: manualIconDataUrl,
                    features: [features],
                    created_at: new Date().getTime()
                };
                
                await addOrUpdateStudent(newStudent);
                currentRoster = await getStudents();
                updateRosterView();
                studentModal.classList.remove('active');
                
                // If editing slot, automatically select newly created student
                if (editingSlot) {
                    const newlyAdded = currentRoster.find(s => s.name === name);
                    if (newlyAdded) {
                        selectStudentForEditingSlot(newlyAdded);
                    }
                }
            };
            img.src = manualIconDataUrl;
        } else {
            const newStudent = {
                name: name,
                icon_path: '', // empty placeholder
                features: [],
                created_at: new Date().getTime()
            };
            await addOrUpdateStudent(newStudent);
            currentRoster = await getStudents();
            updateRosterView();
            studentModal.classList.remove('active');
            
            // If editing slot, automatically select newly created student
            if (editingSlot) {
                const newlyAdded = currentRoster.find(s => s.name === name);
                if (newlyAdded) {
                    selectStudentForEditingSlot(newlyAdded);
                }
            }
        }
    });

    // Review Modal outcomes & battle type toggle buttons
    const reviewWinBtn = document.getElementById('review-win-btn');
    const reviewLoseBtn = document.getElementById('review-lose-btn');
    reviewWinBtn.addEventListener('click', () => {
        reviewWinBtn.classList.add('active');
        reviewLoseBtn.classList.remove('active');
    });
    reviewLoseBtn.addEventListener('click', () => {
        reviewLoseBtn.classList.add('active');
        reviewWinBtn.classList.remove('active');
    });

    const reviewTypeAtkBtn = document.getElementById('review-type-attack-btn');
    const reviewTypeDefBtn = document.getElementById('review-type-defense-btn');
    if (reviewTypeAtkBtn && reviewTypeDefBtn) {
        reviewTypeAtkBtn.addEventListener('click', () => {
            if (currentUploadData) currentUploadData.battleType = 'attack';
            reviewTypeAtkBtn.classList.add('active');
            reviewTypeDefBtn.classList.remove('active');
        });
        reviewTypeDefBtn.addEventListener('click', () => {
            if (currentUploadData) currentUploadData.battleType = 'defense';
            reviewTypeDefBtn.classList.add('active');
            reviewTypeAtkBtn.classList.remove('active');
        });
    }

    function resetUploadUI() {
        dropZone.style.display = 'flex';
        scannerScreen.style.display = 'none';
        fileInput.value = '';
        currentUploadData = null;
        uploadQueue = []; // Clear queue when reset
    }

    function processMultipleScreenshotUploads(files) {
        const duplicateNames = [];
        const validFiles = [];
        
        Array.from(files).forEach(file => {
            const isDuplicate = currentHistory.some(item => item.filename === file.name);
            if (isDuplicate) {
                duplicateNames.push(file.name);
            } else {
                validFiles.push(file);
            }
        });
        
        if (duplicateNames.length > 0) {
            alert(`以下のスクリーンショットは既に登録されているため除外されました:\n${duplicateNames.join('\n')}`);
        }
        
        if (validFiles.length === 0) {
            fileInput.value = '';
            return;
        }
        
        // Build the queue of all valid files (no arbitrary limit)
        uploadQueue = validFiles;
        
        // Start processing the first file
        processNextInUploadQueue();
    }

    async function processNextInUploadQueue() {
        if (uploadQueue.length === 0) {
            // Queue is empty: reset UI and switch to Attack tab
            resetUploadUI();
            window.switchToTab('attack');
            return;
        }
        
        const file = uploadQueue[0];
        await handleScreenshotUpload(file);
    }

    // Review Modal cancel/save events
    document.getElementById('btn-review-cancel').addEventListener('click', () => {
        reviewModal.classList.remove('active');
        uploadQueue.shift(); // Proceed to the next image
        processNextInUploadQueue();
    });

    document.getElementById('btn-review-save').addEventListener('click', async () => {
        if (!currentUploadData) return;
        
        const opponentName = document.getElementById('review-opponent-name').value.replace(/[\s\u3000]+/g, '');
        const dateInput = document.getElementById('review-date-input').value;
        const notes = document.getElementById('review-notes').value.trim();
        const result = reviewWinBtn.classList.contains('active') ? 'WIN' : 'LOSE';
        const reviewTypeDefBtn = document.getElementById('review-type-defense-btn');
        const battleType = (reviewTypeDefBtn && reviewTypeDefBtn.classList.contains('active')) ? 'defense' : 'attack';
        
        let utility = '高';
        const checkedUtility = document.querySelector('input[name="review-utility"]:checked');
        if (checkedUtility) {
            utility = checkedUtility.value;
        }
        
        // Compile Attack Team IDs & Snapshot Icons
        const attackTeam = [];
        const attackIcons = [];
        const attackNames = [];
        for (let i = 0; i < 6; i++) {
            const slot = currentUploadData.attack[i];
            attackTeam.push(slot.studentId || 0); // 0 means unrecognized/empty
            attackIcons.push(slot.icon_path || '');
            attackNames.push(slot.studentName || '生徒');
        }

        // Compile Defense Team IDs & Snapshot Icons
        const defenseTeam = [];
        const defenseIcons = [];
        const defenseNames = [];
        for (let i = 0; i < 6; i++) {
            const slot = currentUploadData.defense[i];
            defenseTeam.push(slot.studentId || 0);
            defenseIcons.push(slot.icon_path || '');
            defenseNames.push(slot.studentName || '生徒');
        }

        // Save Battle History Record
        const record = {
            result: result,
            battle_type: battleType,
            utility_level: utility,
            commander_name: opponentName,
            attack_team: attackTeam,
            defense_team: defenseTeam,
            attack_icons: attackIcons,
            defense_icons: defenseIcons,
            attack_names: attackNames,
            defense_names: defenseNames,
            opponent_avatar: null, // Stored cleanly in opponent_directory DB keyed by commander_name
            notes: notes,
            filename: currentUploadData.filename || '', // Save filename to prevent duplicate uploads
            created_at: new Date(dateInput).getTime() || new Date().getTime(),
            box1_color: currentUploadData.box1_color || null,
            box1_value: currentUploadData.box1_value || null,
            box2_color: currentUploadData.box2_color || null,
            box2_value: currentUploadData.box2_value || null
        };

        // Save Opponent Profile Avatar to Opponent Directory (only if first time)
        if (opponentName && currentUploadData.opponentAvatar) {
            await saveOpponent(opponentName, currentUploadData.opponentAvatar);
            opponentDirectory = await getOpponents(); // Refresh cache
        }

        // Save auto-rename mapping rule if user manually changed the name from raw OCR
        if (currentUploadData.rawOcrOpponentName && opponentName !== currentUploadData.rawOcrOpponentName) {
            const existing = opponentRenames.find(r => r.ocr_name === currentUploadData.rawOcrOpponentName);
            if (!existing || existing.corrected_name !== opponentName) {
                await saveRename(currentUploadData.rawOcrOpponentName, opponentName);
                opponentRenames = await getRenames(); // Refresh cache
                console.log(`Auto-registered rename: "${currentUploadData.rawOcrOpponentName}" -> "${opponentName}"`);
            }
        }

        // Human-in-the-loop dictionary synchronization:
        // For each slot where the user manually assigned a student,
        // if this was an update (meaning user corrected a wrong recognition or empty slot),
        // we add the cropped slot face features to the student's dataset!
        for (let i = 0; i < 6; i++) {
            // Attack team slots
            const slot = currentUploadData.attack[i];
            if (slot.userSelected && slot.studentId) {
                const student = currentRoster.find(s => s.id === slot.studentId);
                if (student) {
                    await addOrUpdateStudent({
                        name: student.name,
                        icon_path: slot.icon_path, // save crop as new representitive if manual corrected
                        features: [slot.faceFeatures]
                    });
                }
            }
            // Defense team slots
            const slotDef = currentUploadData.defense[i];
            if (slotDef.userSelected && slotDef.studentId) {
                const student = currentRoster.find(s => s.id === slotDef.studentId);
                if (student) {
                    await addOrUpdateStudent({
                        name: student.name,
                        icon_path: slotDef.icon_path,
                        features: [slotDef.faceFeatures]
                    });
                }
            }
        }

        await addHistory(record);
        
        // Refresh
        currentRoster = await getStudents();
        currentHistory = await getHistory();
        updateRosterView();
        updateHistoryView();
        
        reviewModal.classList.remove('active');
        uploadQueue.shift();
        processNextInUploadQueue();
    });

    // Student Selector Modal handlers
    document.getElementById('btn-selector-close').addEventListener('click', () => {
        selectorModal.classList.remove('active');
    });

    searchSelectorInput.addEventListener('input', () => {
        renderSelectorRoster();
    });

    document.getElementById('btn-selector-add-student').addEventListener('click', () => {
        // Open the Student Add/Edit Modal to register a new student
        document.getElementById('student-modal-title').innerText = '新規生徒追加';
        document.getElementById('add-student-name').value = '';
        currentAddStudentFeatures = null;
        
        // Auto-populate the cropped slot image as the default icon
        if (editingSlot) {
            const { team, index, modal } = editingSlot;
            const dataContainer = (modal === 'detail') ? detailEditedData : currentUploadData;
            if (dataContainer && dataContainer[team][index] && dataContainer[team][index].icon_path) {
                manualIconDataUrl = dataContainer[team][index].icon_path;
                document.getElementById('add-student-icon-preview').src = manualIconDataUrl;
                document.getElementById('add-student-icon-preview').style.display = 'block';
                document.getElementById('add-student-placeholder').style.display = 'none';
                
                // Copy the extracted ZNCC face features directly
                if (dataContainer[team][index].faceFeatures) {
                    currentAddStudentFeatures = dataContainer[team][index].faceFeatures;
                }
            } else {
                document.getElementById('add-student-icon-preview').src = '';
                document.getElementById('add-student-icon-preview').style.display = 'none';
                document.getElementById('add-student-placeholder').style.display = 'block';
                manualIconDataUrl = '';
            }
        } else {
            document.getElementById('add-student-icon-preview').src = '';
            document.getElementById('add-student-icon-preview').style.display = 'none';
            document.getElementById('add-student-placeholder').style.display = 'block';
            manualIconDataUrl = '';
        }
        
        studentModal.classList.add('active');
    });

    // Detail Modal Event Listeners
    const btnDetailBack = document.getElementById('btn-detail-back');
    const btnDetailCancel = document.getElementById('btn-detail-cancel');
    const btnDetailDelete = document.getElementById('btn-detail-delete');
    const btnDetailSave = document.getElementById('btn-detail-save');
    const detailWinBtn = document.getElementById('detail-win-btn');
    const detailLoseBtn = document.getElementById('detail-lose-btn');

    const closeDetailModal = () => {
        detailModal.classList.remove('active');
        editingRecord = null;
        detailEditedData = null;
    };

    btnDetailBack.addEventListener('click', closeDetailModal);
    if (btnDetailCancel) {
        btnDetailCancel.addEventListener('click', closeDetailModal);
    }

    detailWinBtn.addEventListener('click', () => {
        detailWinBtn.classList.add('active');
        detailLoseBtn.classList.remove('active');
    });

    detailLoseBtn.addEventListener('click', () => {
        detailLoseBtn.classList.add('active');
        detailWinBtn.classList.remove('active');
    });

    btnDetailDelete.addEventListener('click', async () => {
        if (!editingRecord) return;
        if (confirm("本当にこの対戦履歴を削除しますか？")) {
            await deleteHistory(editingRecord.id);
            currentHistory = await getHistory();
            updateHistoryView();
            detailModal.classList.remove('active');
            editingRecord = null;
            detailEditedData = null;
        }
    });

    btnDetailSave.addEventListener('click', async () => {
        if (!editingRecord || !detailEditedData) return;

        const opponentName = document.getElementById('detail-opponent-name').value.replace(/[\s\u3000]+/g, '');
        const dateInput = document.getElementById('detail-date-input').value;
        const notes = document.getElementById('detail-notes').value.trim();
        const result = detailWinBtn.classList.contains('active') ? 'WIN' : 'LOSE';
        const battleType = editingRecord.battle_type || 'attack';

        let utility = '高';
        const checkedUtility = document.querySelector('input[name="detail-utility"]:checked');
        if (checkedUtility) {
            utility = checkedUtility.value;
        }

        // Update the record fields
        editingRecord.commander_name = opponentName;
        editingRecord.result = result;
        editingRecord.battle_type = battleType;
        editingRecord.utility_level = utility;
        editingRecord.notes = notes;
        editingRecord.created_at = new Date(dateInput).getTime() || new Date().getTime();
        editingRecord.box1_color = detailEditedData.box1_color || null;
        editingRecord.box1_value = detailEditedData.box1_value || null;
        editingRecord.box2_color = detailEditedData.box2_color || null;
        editingRecord.box2_value = detailEditedData.box2_value || null;

        // Compile Attack Team IDs and Snapshot Icons from edited data
        editingRecord.attack_team = detailEditedData.attack.map(slot => slot.studentId || 0);
        editingRecord.defense_team = detailEditedData.defense.map(slot => slot.studentId || 0);
        editingRecord.attack_icons = detailEditedData.attack.map(slot => slot.icon_path || '');
        editingRecord.defense_icons = detailEditedData.defense.map(slot => slot.icon_path || '');
        editingRecord.attack_names = detailEditedData.attack.map(slot => slot.studentName || '生徒');
        editingRecord.defense_names = detailEditedData.defense.map(slot => slot.studentName || '生徒');

        // Save Opponent Profile Avatar to Opponent Directory if first time
        if (opponentName && editingRecord.opponent_avatar) {
            await saveOpponent(opponentName, editingRecord.opponent_avatar);
            editingRecord.opponent_avatar = null; // Clean up record
            opponentDirectory = await getOpponents(); // Refresh cache
        }

        // Save updated record back to IndexedDB
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('battle_history', 'readwrite');
            const store = transaction.objectStore('battle_history');
            const request = store.put(editingRecord);
            request.onsuccess = resolve;
            request.onerror = (e) => reject(e.target.error);
        });

        // Human-in-the-loop: save manual slot updates if any
        for (let i = 0; i < 6; i++) {
            const slotAtk = detailEditedData.attack[i];
            if (slotAtk.userSelected && slotAtk.studentId && slotAtk.faceFeatures) {
                const student = currentRoster.find(s => s.id === slotAtk.studentId);
                if (student) {
                    await addOrUpdateStudent({
                        name: student.name,
                        icon_path: slotAtk.icon_path,
                        features: [slotAtk.faceFeatures]
                    });
                }
            }
            const slotDef = detailEditedData.defense[i];
            if (slotDef.userSelected && slotDef.studentId && slotDef.faceFeatures) {
                const student = currentRoster.find(s => s.id === slotDef.studentId);
                if (student) {
                    await addOrUpdateStudent({
                        name: student.name,
                        icon_path: slotDef.icon_path,
                        features: [slotDef.faceFeatures]
                    });
                }
            }
        }

        // Refresh views
        currentRoster = await getStudents();
        currentHistory = await getHistory();
        updateRosterView();
        updateHistoryView();

        detailModal.classList.remove('active');
        editingRecord = null;
        detailEditedData = null;
    });

    // Close Modals on Overlay Click
    reviewModal.addEventListener('click', (e) => {
        if (e.target === reviewModal) {
            reviewModal.classList.remove('active');
            uploadQueue.shift();
            processNextInUploadQueue();
        }
    });

    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.remove('active');
            editingRecord = null;
            detailEditedData = null;
        }
    });

    selectorModal.addEventListener('click', (e) => {
        if (e.target === selectorModal) {
            selectorModal.classList.remove('active');
        }
    });

    studentModal.addEventListener('click', (e) => {
        if (e.target === studentModal) {
            studentModal.classList.remove('active');
        }
    });

    // Reset search on clicking Stats Dashboard row
    document.querySelectorAll('.stats-dashboard').forEach(dash => {
        dash.addEventListener('click', () => {
            syncSearchInput('', true);
        });
    });

    // Rename Modal Event Listeners
    const renameModal = document.getElementById('rename-modal');
    const btnManageRenames = document.getElementById('btn-manage-renames');
    const btnRenameClose = document.getElementById('btn-rename-close');
    const btnAddRenameRule = document.getElementById('btn-add-rename-rule');
    const addRenameOcr = document.getElementById('add-rename-ocr');
    const addRenameCorrected = document.getElementById('add-rename-corrected');
    const renameRulesList = document.getElementById('rename-rules-list');

    function renderRenameRules() {
        renameRulesList.innerHTML = '';
        if (opponentRenames.length === 0) {
            renameRulesList.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 12px;">登録されているリネーム辞書がありません。</td>
                </tr>
            `;
            return;
        }

        opponentRenames.forEach(rule => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(0, 163, 255, 0.1)';
            tr.style.height = '32px';

            const tdOcr = document.createElement('td');
            tdOcr.style.padding = '4px 8px';
            tdOcr.style.color = 'var(--text-primary)';
            tdOcr.innerText = rule.ocr_name;

            const tdCorrected = document.createElement('td');
            tdCorrected.style.padding = '4px 8px';
            tdCorrected.style.color = 'var(--color-blue)';
            tdCorrected.innerText = rule.corrected_name;

            const tdActions = document.createElement('td');
            tdActions.style.padding = '4px 8px';
            tdActions.style.textAlign = 'center';

            // Edit button
            const btnEdit = document.createElement('button');
            btnEdit.style.background = 'none';
            btnEdit.style.border = 'none';
            btnEdit.style.color = 'var(--text-secondary)';
            btnEdit.style.cursor = 'pointer';
            btnEdit.style.marginRight = '8px';
            btnEdit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
            btnEdit.addEventListener('click', () => {
                addRenameOcr.value = rule.ocr_name;
                addRenameCorrected.value = rule.corrected_name;
            });

            // Delete button
            const btnDel = document.createElement('button');
            btnDel.style.background = 'none';
            btnDel.style.border = 'none';
            btnDel.style.color = '#ff3b30';
            btnDel.style.cursor = 'pointer';
            btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            btnDel.addEventListener('click', async () => {
                if (confirm(`「${rule.ocr_name}」のリネーム規則を削除しますか？`)) {
                    await deleteRename(rule.ocr_name);
                    opponentRenames = await getRenames();
                    renderRenameRules();
                }
            });

            tdActions.appendChild(btnEdit);
            tdActions.appendChild(btnDel);

            tr.appendChild(tdOcr);
            tr.appendChild(tdCorrected);
            tr.appendChild(tdActions);

            renameRulesList.appendChild(tr);
        });
    }

    btnManageRenames.addEventListener('click', () => {
        addRenameOcr.value = '';
        addRenameCorrected.value = '';
        renderRenameRules();
        renameModal.classList.add('active');
    });

    btnRenameClose.addEventListener('click', () => {
        renameModal.classList.remove('active');
    });

    renameModal.addEventListener('click', (e) => {
        if (e.target === renameModal) {
            renameModal.classList.remove('active');
        }
    });

    btnAddRenameRule.addEventListener('click', async () => {
        const ocr = addRenameOcr.value.trim();
        const corrected = addRenameCorrected.value.trim();

        if (!ocr || !corrected) {
            alert('誤読テキストと修正後の名前の両方を入力してください。');
            return;
        }

        await saveRename(ocr, corrected);
        opponentRenames = await getRenames();
        
        addRenameOcr.value = '';
        addRenameCorrected.value = '';
        renderRenameRules();
    });

    // Custom Tag Boxes event setup
    let activeTagBoxContext = null; // { modalType: 'review'|'detail', boxIndex: 1|2 }
    const customTagPopup = document.getElementById('custom-tag-popup');

    function openTagPopup(boxEl, modalType, boxIndex) {
        activeTagBoxContext = { modalType, boxIndex };
        customTagPopup.style.display = 'block';

        const rect = boxEl.getBoundingClientRect();
        const popupWidth = customTagPopup.offsetWidth || 220;
        const popupHeight = customTagPopup.offsetHeight || 90;

        let left = rect.left + window.scrollX;
        let top = rect.bottom + window.scrollY + 4;

        if (left + popupWidth > window.innerWidth) {
            left = window.innerWidth - popupWidth - 10;
        }
        if (top + popupHeight > window.innerHeight) {
            top = rect.top + window.scrollY - popupHeight - 4;
        }
        if (left < 10) left = 10;

        customTagPopup.style.left = `${left}px`;
        customTagPopup.style.top = `${top}px`;
    }

    // Register click listeners on tag boxes
    ['review', 'detail'].forEach(modalType => {
        [1, 2].forEach(boxIndex => {
            const boxEl = document.getElementById(`${modalType}-box${boxIndex}`);
            if (boxEl) {
                boxEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openTagPopup(boxEl, modalType, boxIndex);
                });
            }
        });
    });

    // Register click listeners on options in popup
    customTagPopup.querySelectorAll('.tag-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeTagBoxContext) return;
            const color = btn.dataset.color || null;
            const valStr = btn.dataset.val;
            const value = valStr ? parseInt(valStr) : null;

            const { modalType, boxIndex } = activeTagBoxContext;
            if (modalType === 'review' && currentUploadData) {
                currentUploadData[`box${boxIndex}_color`] = color;
                currentUploadData[`box${boxIndex}_value`] = value;
                updateBoxDisplay('review', boxIndex, color, value);
            } else if (modalType === 'detail' && detailEditedData) {
                detailEditedData[`box${boxIndex}_color`] = color;
                detailEditedData[`box${boxIndex}_value`] = value;
                updateBoxDisplay('detail', boxIndex, color, value);
            }

            customTagPopup.style.display = 'none';
            activeTagBoxContext = null;
        });
    });

    // Clear button listener
    document.getElementById('btn-clear-tag').addEventListener('click', () => {
        if (!activeTagBoxContext) return;
        const { modalType, boxIndex } = activeTagBoxContext;
        if (modalType === 'review' && currentUploadData) {
            currentUploadData[`box${boxIndex}_color`] = null;
            currentUploadData[`box${boxIndex}_value`] = null;
            updateBoxDisplay('review', boxIndex, null, null);
        } else if (modalType === 'detail' && detailEditedData) {
            detailEditedData[`box${boxIndex}_color`] = null;
            detailEditedData[`box${boxIndex}_value`] = null;
            updateBoxDisplay('detail', boxIndex, null, null);
        }

        customTagPopup.style.display = 'none';
        activeTagBoxContext = null;
    });

    // Hide popup when clicking outside
    document.addEventListener('click', (e) => {
        if (customTagPopup.style.display === 'block') {
            if (!customTagPopup.contains(e.target) && !e.target.classList.contains('custom-tag-box')) {
                customTagPopup.style.display = 'none';
                activeTagBoxContext = null;
            }
        }
    });
});

// Setup Tesseract.js Worker
async function initOCRWorker() {
    console.log("Setting up Tesseract worker...");
    try {
        const isExtension = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL);
        const options = isExtension ? {
            workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
            corePath: chrome.runtime.getURL('lib/tesseract/tesseract-core-simd.wasm.js')
        } : {};
        tesseractWorker = await Tesseract.createWorker('jpn', 1, options);
        await tesseractWorker.setParameters({
            tessedit_pageseg_mode: '7', // Treat the image as a single text line
        });
        console.log("Tesseract worker ready.");
    } catch (e) {
        console.error("Tesseract initialization failed:", e);
    }
}


// Calibration Profile Manager for Dynamic Multi-Aspect-Ratio Support
function getOrComputeCalibrationProfile(img, scanStatusText) {
    const rawAspect = img.width / img.height;
    const aspectKey = rawAspect.toFixed(3);
    
    // Check localStorage cache
    let cachedProfiles = {};
    try {
        cachedProfiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
    } catch (e) {
        cachedProfiles = {};
    }

    if (cachedProfiles[aspectKey]) {
        console.log(`[Calibration] Using cached modal profile for aspect ratio ${aspectKey}`);
        if (scanStatusText) scanStatusText.innerText = `Analyzing screenshot (${aspectKey} cached)...`;
        const p = cachedProfiles[aspectKey];
        
        let pUpdated = false;
        if (!p.battleTypeIcon) {
            p.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
            pUpdated = true;
        }
        if (!p.battleTypeTemplate) {
            const rawAspectVal = parseFloat(aspectKey);
            let builtinMatch = BUILTIN_CALIBRATION_PROFILES[aspectKey];
            if (!builtinMatch) {
                for (const [k, prof] of Object.entries(BUILTIN_CALIBRATION_PROFILES)) {
                    if (Math.abs(parseFloat(k) - rawAspectVal) < 0.035) {
                        builtinMatch = prof;
                        break;
                    }
                }
            }
            if (builtinMatch && builtinMatch.battleTypeTemplate) {
                p.battleTypeTemplate = builtinMatch.battleTypeTemplate;
                pUpdated = true;
            }
        }
        if (pUpdated) {
            try {
                cachedProfiles[aspectKey] = p;
                localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(cachedProfiles));
            } catch (e) {}
        }

        const modalBox = {
            x: Math.round(p.relModal.rx * img.width),
            y: Math.round(p.relModal.ry * img.height),
            w: Math.round(p.relModal.rw * img.width),
            h: Math.round(p.relModal.rh * img.height)
        };
        return {
            profile: {
                ...p,
                modalBox
            },
            isCached: true
        };
    }

    if (scanStatusText) scanStatusText.innerText = `Calibrating layout for aspect ratio ${aspectKey}...`;
    console.log(`[Calibration] Computing Universal Modal Detection for ${img.width}x${img.height} (Aspect: ${aspectKey})...`);

    // 1. Detect White Battle Result Modal Card across ANY aspect ratio (iPad 4:3, 16:10, 16:9, 19.5:9, 21:9, etc.)
    const origW = img.width;
    const origH = img.height;
    const maxDim = 800;
    const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
    const smallW = Math.max(100, Math.round(origW * scale));
    const smallH = Math.max(100, Math.round(origH * scale));

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = smallW;
    smallCanvas.height = smallH;
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.drawImage(img, 0, 0, smallW, smallH);
    const smallImgData = smallCtx.getImageData(0, 0, smallW, smallH).data;

    // Create binary mask of white modal pixels (R>195, G>195, B>195)
    const whiteMask = new Uint8Array(smallW * smallH);
    for (let i = 0; i < smallW * smallH; i++) {
        const r = smallImgData[i * 4];
        const g = smallImgData[i * 4 + 1];
        const b = smallImgData[i * 4 + 2];
        if (r > 195 && g > 195 && b > 195) {
            whiteMask[i] = 1;
        }
    }

    // Row density projection to find vertical boundaries of the modal card
    const rowDensity = new Float32Array(smallH);
    for (let y = 0; y < smallH; y++) {
        let cnt = 0;
        const offset = y * smallW;
        for (let x = 0; x < smallW; x++) {
            if (whiteMask[offset + x] === 1) cnt++;
        }
        rowDensity[y] = cnt / smallW;
    }

    let modalTop = -1;
    let modalBottom = -1;
    const rowThreshold = 0.25;
    for (let y = 0; y < smallH; y++) {
        if (rowDensity[y] >= rowThreshold) {
            if (modalTop === -1) modalTop = y;
            modalBottom = y;
        }
    }
    if (modalTop === -1 || (modalBottom - modalTop) < smallH * 0.25) {
        modalTop = Math.round(smallH * 0.05);
        modalBottom = Math.round(smallH * 0.95);
    }

    // Column density projection within [modalTop, modalBottom]
    const colDensity = new Float32Array(smallW);
    const spanH = modalBottom - modalTop + 1;
    for (let x = 0; x < smallW; x++) {
        let cnt = 0;
        for (let y = modalTop; y <= modalBottom; y++) {
            if (whiteMask[y * smallW + x] === 1) cnt++;
        }
        colDensity[x] = cnt / spanH;
    }

    let modalLeft = -1;
    let modalRight = -1;
    const colThreshold = 0.25;
    for (let x = 0; x < smallW; x++) {
        if (colDensity[x] >= colThreshold) {
            if (modalLeft === -1) modalLeft = x;
            modalRight = x;
        }
    }
    if (modalLeft === -1 || (modalRight - modalLeft) < smallW * 0.35) {
        modalLeft = Math.round(smallW * 0.02);
        modalRight = Math.round(smallW * 0.98);
    }

    const invScale = 1.0 / scale;
    const modalX = Math.max(0, Math.round(modalLeft * invScale));
    const modalY = Math.max(0, Math.round(modalTop * invScale));
    const modalW = Math.min(origW - modalX, Math.round((modalRight - modalLeft + 1) * invScale));
    const modalH = Math.min(origH - modalY, Math.round((modalBottom - modalTop + 1) * invScale));

    const relModal = {
        rx: modalX / origW,
        ry: modalY / origH,
        rw: modalW / origW,
        rh: modalH / origH
    };

    console.log(`[Calibration] Modal detected: [${modalX}, ${modalY}, ${modalW}x${modalH}], Rel:`, relModal);

    // Standardized Normalized Modal dimensions (fixed 2400 x 1040)
    const normalizedWidth = 2400;
    const normalizedHeight = 1040;

    // Check if matching builtin calibration profile exists for this aspect ratio (e.g. 2.166 or 2.223)
    const rawAspectVal = parseFloat(aspectKey);
    let builtinMatch = BUILTIN_CALIBRATION_PROFILES[aspectKey];
    if (!builtinMatch) {
        for (const [k, p] of Object.entries(BUILTIN_CALIBRATION_PROFILES)) {
            if (Math.abs(parseFloat(k) - rawAspectVal) < 0.035) {
                builtinMatch = p;
                break;
            }
        }
    }

    let winLose, battleTypeIcon, battleTypeTemplate, oppAvatar, oppName, atkCenters, defCenters, cardTop, cardSize;
    let finalRelModal = relModal;
    let finalModalBox = { x: modalX, y: modalY, w: modalW, h: modalH };

    if (builtinMatch) {
        winLose = JSON.parse(JSON.stringify(builtinMatch.winLose));
        battleTypeIcon = builtinMatch.battleTypeIcon ? JSON.parse(JSON.stringify(builtinMatch.battleTypeIcon)) : { sx: 58, sy: 172, sw: 110, sh: 110 };
        battleTypeTemplate = builtinMatch.battleTypeTemplate || "data:image/png;base64,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";
        oppAvatar = JSON.parse(JSON.stringify(builtinMatch.oppAvatar));
        oppName = JSON.parse(JSON.stringify(builtinMatch.oppName));
        atkCenters = [...builtinMatch.atkCenters];
        defCenters = [...builtinMatch.defCenters];
        cardTop = builtinMatch.cardTop;
        cardSize = builtinMatch.cardSize;
        if (builtinMatch.relModal) {
            finalRelModal = JSON.parse(JSON.stringify(builtinMatch.relModal));
            finalModalBox = {
                x: Math.round(finalRelModal.rx * origW),
                y: Math.round(finalRelModal.ry * origH),
                w: Math.round(finalRelModal.rw * origW),
                h: Math.round(finalRelModal.rh * origH)
            };
        }
    } else {
        winLose = { sx: 110, sy: 100, sw: 280, sh: 160, dw: 280, dh: 160 };
        oppAvatar = { sx: 1718, sy: 162, sw: 120, sh: 120, dw: 100, dh: 100 };
        oppName = { sx: 1995, sy: 142, sw: 375, sh: 58, dw: 1100, dh: 200 };
        atkCenters = [206, 353, 500, 646, 794, 941];
        defCenters = [1450, 1596, 1744, 1890, 2036, 2185];
        cardTop = 858;
        cardSize = 88;
    }

    const profile = {
        aspectRatio: aspectKey,
        relModal: finalRelModal,
        modalBox: finalModalBox,
        normalizedWidth,
        normalizedHeight,
        winLose,
        battleTypeIcon,
        battleTypeTemplate,
        oppAvatar,
        oppName,
        atkCenters,
        defCenters,
        cardTop,
        cardSize
    };

    // Save to persistent cache
    try {
        cachedProfiles[aspectKey] = profile;
        localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(cachedProfiles));
        console.log(`[Calibration] Successfully cached universal calibration profile for aspect ratio ${aspectKey}!`);
    } catch (e) {
        console.warn("[Calibration] Failed to persist calibration profile:", e);
    }

    return { profile, isCached: false };
}

// Extract date from File object (using filename patterns or lastModified timestamp, with local timezone fallback)
function extractDateFromFile(file) {
    // 1. Try extracting date from filename first (immune to file copy/transfer timestamp changes)
    if (file && file.name) {
        // Pattern A: YYYY-MM-DD, YYYY_MM_DD, YYYY.MM.DD
        const matchDelimited = file.name.match(/(?:^|[^0-9])(20\d{2})[-_. /](0[1-9]|1[0-2])[-_. /](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
        if (matchDelimited) {
            const dateStr = `${matchDelimited[1]}-${matchDelimited[2]}-${matchDelimited[3]}`;
            console.log(`Extracted date from filename (delimited): ${dateStr}`);
            return dateStr;
        }

        // Pattern B: YYYYMMDD (8 consecutive digits, e.g. Screenshot_20260919_185700)
        const matchConsecutive = file.name.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
        if (matchConsecutive) {
            const dateStr = `${matchConsecutive[1]}-${matchConsecutive[2]}-${matchConsecutive[3]}`;
            console.log(`Extracted date from filename (consecutive YYYYMMDD): ${dateStr}`);
            return dateStr;
        }
    }

    // 2. Try file.lastModified (device file modification/creation timestamp)
    if (file && file.lastModified) {
        const d = new Date(file.lastModified);
        if (!isNaN(d.getTime())) {
            const now = new Date();
            const maxFuture = now.getTime() + 24 * 60 * 60 * 1000;
            if (d.getFullYear() >= 2020 && d.getTime() <= maxFuture) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                console.log(`Extracted date from file.lastModified: ${dateStr}`);
                return dateStr;
            }
        }
    }

    // 3. Fallback: device local current date (JST / device timezone)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    console.log(`Fallback date (device local today): ${todayStr}`);
    return todayStr;
}

// SCREENSHOT RECOGNITION PIPELINE
async function handleScreenshotUpload(file) {
    isScanCancelled = false;
    // Check for duplicate upload (preserves duplicate check by filename)
    const isDuplicate = currentHistory.some(item => item.filename === file.name);
    if (isDuplicate) {
        alert(`このスクリーンショット「${file.name}」は既にアップロードされています。`);
        uploadQueue.shift();
        processNextInUploadQueue();
        return;
    }

    dropZone.style.display = 'none';
    scannerScreen.style.display = 'flex';
    scanStatusText.innerText = '画像を読み込んでいます...';
    
    // Set scanning image source
    const reader = new FileReader();
    reader.onload = (e) => {
        if (!isScanCancelled) scanningImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
    
    // Extract Date from file (filename pattern or device lastModified timestamp)
    const extractedDate = extractDateFromFile(file);

    try {
        const img = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
        });
        
        // Wait for reader result
        await new Promise((resolve) => {
            reader.onloadend = resolve;
        });
        if (isScanCancelled) return;
        img.src = reader.result;
        await loadPromise;
        if (isScanCancelled) return;

        lastUploadedImage = img;
        currentUploadFile = file;
        currentUploadExtractedDate = extractedDate;

        // Check if layout calibration profile exists for this aspect ratio
        const { profile, isCached } = getOrComputeCalibrationProfile(img, scanStatusText);
        currentActiveProfile = profile;

        // If not calibrated (first time for this device or calibration reset):
        // Immediately jump to Crop Inspector BEFORE running any OCR or recognition!
        if (!isCached) {
            scannerScreen.style.display = 'none';
            currentUploadData = null; // Awaiting initial calibration
            openCropInspector();
            showTutorialPopup('アイコン枠に合うように緑枠の位置を調整してください。', '<i class="fa-solid fa-crosshairs" style="color: #00e676;"></i>', 'トリミング領域の調整');
            return;
        }

        if (isScanCancelled) return;
        // Calibrated: Run recognition pipeline directly
        await runRecognitionPipeline(img, profile, file, extractedDate);

    } catch (e) {
        if (isScanCancelled) return;
        console.error("Recognition pipeline crashed:", e);
        alert(`エラーが発生しました: ${e.message}`);
        uploadQueue.shift();
        processNextInUploadQueue();
    } finally {
        fileInput.value = '';
    }
}

async function runRecognitionPipeline(img, profile, file, extractedDate) {
    if (isScanCancelled) return;
    dropZone.style.display = 'none';
    scannerScreen.style.display = 'flex';
    scanningImg.src = img.src;
    scanStatusText.innerText = 'レイアウトを解析中...';

    const procCanvas = document.getElementById('proc-canvas');
    procCanvas.width = profile.normalizedWidth;
    procCanvas.height = profile.normalizedHeight;
    const ctx = procCanvas.getContext('2d');
    ctx.drawImage(
        img,
        profile.modalBox.x, profile.modalBox.y, profile.modalBox.w, profile.modalBox.h,
        0, 0, profile.normalizedWidth, profile.normalizedHeight
    );
    
    console.log(`Modal normalized dimensions: ${profile.normalizedWidth}x${profile.normalizedHeight}`);
    
    // 1. WIN / LOSE Color Detection (Fast & Robust)
    scanStatusText.innerText = '勝敗判定を検出中...';
    const winLoseCanvas = cropImage(
        procCanvas,
        profile.winLose.sx, profile.winLose.sy,
        profile.winLose.sw, profile.winLose.sh,
        profile.winLose.dw, profile.winLose.dh
    );
    const winLoseCtx = winLoseCanvas.getContext('2d');
    const wlData = winLoseCtx.getImageData(0, 0, profile.winLose.dw, profile.winLose.dh).data;
    
    let goldPixels = 0;
    let greyPixels = 0;
    for (let i = 0; i < wlData.length; i += 4) {
        const r = wlData[i];
        const g = wlData[i+1];
        const b = wlData[i+2];
        if (r > 200 && g > 165 && b < 100) {
            goldPixels++;
        }
        const diff = Math.max(Math.abs(r-g), Math.abs(g-b), Math.abs(b-r));
        if (r > 100 && r < 200 && diff < 20) {
            greyPixels++;
        }
    }
    
    let battleResult = 'WIN';
    if (goldPixels < 200 && greyPixels > 200) {
        battleResult = 'LOSE';
    }
    console.log(`Win/Lose pixels: Gold=${goldPixels}, Grey=${greyPixels} -> Decision=${battleResult}`);
    
    // 2. Opponent Commander Name OCR (upscaled 2x for better Kanji recognition)
    scanStatusText.innerText = '対戦相手のプレイヤー名を認識中 (OCR)...';
    
    // Save color crop of opponent name for visual comparison on Review Modal
    const oppNameColorCanvas = cropImage(
        procCanvas,
        profile.oppName.sx, profile.oppName.sy,
        profile.oppName.sw, profile.oppName.sh,
        profile.oppName.dw, profile.oppName.dh
    );
    const oppNameCropDataUrl = oppNameColorCanvas.toDataURL();

    const oppCanvas = cropImage(
        procCanvas,
        profile.oppName.sx, profile.oppName.sy,
        profile.oppName.sw, profile.oppName.sh,
        profile.oppName.dw, profile.oppName.dh
    );
    
    const oppCtx = oppCanvas.getContext('2d');
    const oppData = oppCtx.getImageData(0, 0, profile.oppName.dw, profile.oppName.dh);
    const d = oppData.data;
    for (let i = 0; i < d.length; i += 4) {
        const v = (0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2] < 140) ? 0 : 255;
        d[i] = d[i+1] = d[i+2] = v;
    }
    oppCtx.putImageData(oppData, 0, 0);

    let opponentName = '';
    if (tesseractWorker) {
        try {
            const ocrRes = await tesseractWorker.recognize(oppCanvas);
            const text = ocrRes.data.text.trim();
            console.log(`Opponent Raw OCR: "${text}"`);
            opponentName = text.replace(/.*?(?:Lv|Iv|1v|Uv|v|L|I|1)?\.?\s*\d+\s*/i, '');
            opponentName = opponentName.replace(/[\s\u3000]+/g, '');
        } catch (ocrErr) {
            console.error("Opponent OCR failed:", ocrErr);
        }
    }

    // 3. Crop Opponent profile avatar
    const oppAvatarCanvas = cropImage(
        procCanvas,
        profile.oppAvatar.sx, profile.oppAvatar.sy,
        profile.oppAvatar.sw, profile.oppAvatar.sh,
        profile.oppAvatar.dw, profile.oppAvatar.dh
    );
    const oppAvatarDataUrl = oppAvatarCanvas.toDataURL();

    // 4. Characters Recognition Grid
    scanStatusText.innerText = '編成スロットを照合中...';
    
    const renameRule = opponentRenames.find(r => r.ocr_name === opponentName);
    let correctedOpponentName = opponentName;
    if (renameRule) {
        console.log(`Auto-renamed opponent "${opponentName}" -> "${renameRule.corrected_name}"`);
        correctedOpponentName = renameRule.corrected_name;
    }
    
    // Detect Battle Type (Attack vs Defense) via Sword Icon Matching
    let detectedBattleType = 'attack';
    try {
        detectedBattleType = await detectBattleTypeFromImage(procCanvas, profile);
    } catch (e) {
        console.warn('Battle type detection error:', e);
    }

    const reviewData = {
        result: battleResult,
        battleType: detectedBattleType,
        date: extractedDate,
        opponentName: correctedOpponentName,
        rawOcrOpponentName: opponentName,
        opponentAvatar: oppAvatarDataUrl,
        opponentNameCrop: oppNameCropDataUrl,
        filename: file.name,
        attack: [],
        defense: []
    };
    
    const cardTop = profile.cardTop || 858;
    const cardHeight = profile.cardSize || 88;
    const cardWidth = Math.round(cardHeight * 1.11);
    const faceSize = Math.round(cardHeight * 0.84);
    const faceOffset = Math.round((cardHeight - faceSize) / 2);

    // Process Attackers (Image-based Face Feature / ZNCC Matching)
    for (let i = 0; i < 6; i++) {
        const cx = profile.atkCenters[i];
        const matchRes = matchStudentSlotWithShifts(procCanvas, cx, cardTop, faceSize, faceOffset, currentRoster);
        const bestDx = matchRes.bestDx || 0;
        const iconCanvas = cropImage(procCanvas, cx + bestDx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
        const iconDataUrl = iconCanvas.toDataURL();
        const faceFeatures = matchRes.bestFeatures;

        console.log(`Attack Slot ${i} ZNCC Best Match (dx=${bestDx}): ${matchRes.student ? matchRes.student.name : 'None'} (Similarity: ${matchRes.similarity.toFixed(3)})`);
        
        const slotData = {
            studentId: 0,
            studentName: '未登録',
            icon_path: iconDataUrl,
            faceFeatures: faceFeatures,
            userSelected: false,
            isSp: i >= 4
        };

        if (matchRes.student && matchRes.similarity >= 0.85) {
            slotData.studentId = matchRes.student.id;
            slotData.studentName = matchRes.student.name;
            slotData.icon_path = matchRes.student.icon_path || iconDataUrl;
        }
        reviewData.attack.push(slotData);
    }

    // Process Defenders (Image-based Face Feature / ZNCC Matching)
    for (let i = 0; i < 6; i++) {
        const cx = profile.defCenters[i];
        const matchRes = matchStudentSlotWithShifts(procCanvas, cx, cardTop, faceSize, faceOffset, currentRoster);
        const bestDx = matchRes.bestDx || 0;
        const iconCanvas = cropImage(procCanvas, cx + bestDx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
        const iconDataUrl = iconCanvas.toDataURL();
        const faceFeatures = matchRes.bestFeatures;

        console.log(`Defense Slot ${i} ZNCC Best Match (dx=${bestDx}): ${matchRes.student ? matchRes.student.name : 'None'} (Similarity: ${matchRes.similarity.toFixed(3)})`);

        const slotData = {
            studentId: 0,
            studentName: '未登録',
            icon_path: iconDataUrl,
            faceFeatures: faceFeatures,
            userSelected: false,
            isSp: i >= 4
        };

        if (matchRes.student && matchRes.similarity >= 0.85) {
            slotData.studentId = matchRes.student.id;
            slotData.studentName = matchRes.student.name;
            slotData.icon_path = matchRes.student.icon_path || iconDataUrl;
        }
        reviewData.defense.push(slotData);
    }

    // Populate Review UI
    currentUploadData = reviewData;
    populateReviewModal(reviewData);

    // Hide scanner and open Review Modal
    scannerScreen.style.display = 'none';
    reviewModal.classList.add('active');
}

// Populate Review Modal details
function populateReviewModal(data) {
    // Win/Lose toggle state
    const winBtn = document.getElementById('review-win-btn');
    const loseBtn = document.getElementById('review-lose-btn');
    if (data.result === 'WIN') {
        winBtn.classList.add('active');
        loseBtn.classList.remove('active');
    } else {
        loseBtn.classList.add('active');
        winBtn.classList.remove('active');
    }

    // Battle Type toggle state (Attack / Defense)
    const reviewTypeAtkBtn = document.getElementById('review-type-attack-btn');
    const reviewTypeDefBtn = document.getElementById('review-type-defense-btn');
    if (reviewTypeAtkBtn && reviewTypeDefBtn) {
        if (data.battleType === 'defense') {
            reviewTypeDefBtn.classList.add('active');
            reviewTypeAtkBtn.classList.remove('active');
        } else {
            reviewTypeAtkBtn.classList.add('active');
            reviewTypeDefBtn.classList.remove('active');
        }
    }

    // Opponent name & Date
    document.getElementById('review-opponent-name').value = data.opponentName || '';
    document.getElementById('review-date-input').value = data.date;
    document.getElementById('review-date-str').innerText = data.date;
    document.getElementById('review-notes').value = '';

    // Opponent OCR Preview Crop (Only displayed during initial review)
    const oppCropImg = document.getElementById('review-opp-ocr-crop-img');
    const oppCropWrapper = document.getElementById('review-opp-ocr-crop-wrapper');
    if (oppCropImg && oppCropWrapper) {
        if (data.opponentNameCrop) {
            oppCropImg.src = data.opponentNameCrop;
            oppCropWrapper.style.display = 'flex';
        } else {
            oppCropWrapper.style.display = 'none';
        }
    }

    // Set medium utility radio by default
    document.querySelectorAll('input[name="review-utility"]').forEach(radio => {
        if (radio.value === '中') radio.checked = true;
    });

    // Populate Attacking Slots
    const atkContainer = document.getElementById('review-attack-team');
    atkContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const slotData = data.attack[i];
        const slotEl = createReviewSlotElement(slotData, 'attack', i);
        atkContainer.appendChild(slotEl);
    }

    // Populate Defending Slots
    const defContainer = document.getElementById('review-defense-team');
    defContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const slotData = data.defense[i];
        const slotEl = createReviewSlotElement(slotData, 'defense', i);
        defContainer.appendChild(slotEl);
    }

    // Reset custom tag boxes
    if (currentUploadData) {
        currentUploadData.box1_color = null;
        currentUploadData.box1_value = null;
        currentUploadData.box2_color = null;
        currentUploadData.box2_value = null;
    }
    updateBoxDisplay('review', 1, null, null);
    updateBoxDisplay('review', 2, null, null);

    // Set opponent avatar to the cropped avatar
    updateOpponentAvatarReview();
}

function updateOpponentAvatarReview() {
    const oppAvatarWrapper = document.getElementById('review-opponent-avatar-wrapper');
    oppAvatarWrapper.innerHTML = '';
    
    if (currentUploadData && currentUploadData.opponentAvatar) {
        const img = document.createElement('img');
        img.src = currentUploadData.opponentAvatar;
        oppAvatarWrapper.appendChild(img);
    } else {
        const pl = document.createElement('div');
        pl.className = 'slot-placeholder mini';
        pl.innerText = '?';
        oppAvatarWrapper.appendChild(pl);
    }
}

function createReviewSlotElement(slotData, team, index) {
    const slotEl = document.createElement('div');
    slotEl.className = 'student-slot';
    if (index >= 4) slotEl.classList.add('special-slot');
    
    // Unrecognized warn border if student ID is empty
    if (!slotData.studentId) {
        slotEl.classList.add('unrecognized');
    }
    
    slotEl.dataset.team = team;
    slotEl.dataset.index = index;
    
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'slot-icon-wrapper';
    
    if (slotData.icon_path) {
        const img = document.createElement('img');
        img.src = slotData.icon_path;
        iconWrapper.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'slot-placeholder';
        placeholder.innerText = index >= 4 ? 'Sp' : '生徒';
        iconWrapper.appendChild(placeholder);
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'slot-name';
    nameEl.innerText = slotData.studentName || '生徒';
    
    slotEl.appendChild(iconWrapper);
    slotEl.appendChild(nameEl);
    
    // Add slot change selector popup triggers
    slotEl.addEventListener('click', () => {
        editingSlot = { team, index };
        searchSelectorInput.value = '';
        renderSelectorRoster();
        selectorModal.classList.add('active');
    });

    return slotEl;
}

// SEMI-MANUAL CALIBRATION WIZARD ENGINE
const WIZARD_STEPS = [
    { id: 'a1', title: 'A1 (攻撃1・基準) 調整中', desc: '緑の平行四辺形をA1カード外枠に合わせます。Y軸(高さ)と枠サイズが確定します。', isBase: true, team: 'attack', index: 0 },
    { id: 'a2', title: 'A2 (攻撃2) 調整中', desc: 'A2カードの位置へ左右に枠を移動します (高さとサイズはA1と共通)。', isBase: false, team: 'attack', index: 1 },
    { id: 'a3', title: 'A3 (攻撃3) 調整中', desc: 'A3カードの位置へ左右に枠を移動します。', isBase: false, team: 'attack', index: 2 },
    { id: 'a4', title: 'A4 (攻撃4) 調整中', desc: 'A4カードの位置へ左右に枠を移動します。', isBase: false, team: 'attack', index: 3 },
    { id: 'a5', title: 'A5 (攻撃5・Sp1) 調整中', desc: 'A5(Special 1)カードの位置へ左右に枠を移動します。', isBase: false, team: 'attack', index: 4 },
    { id: 'a6', title: 'A6 (攻撃6・Sp2) 調整中', desc: 'A6(Special 2)カードの位置へ左右に枠を移動します。', isBase: false, team: 'attack', index: 5 },
    { id: 'd1', title: 'D1 (防衛1) 調整中', desc: 'D1カードの位置へ左右に枠を移動します (高さとサイズはA1と共通)。', isBase: false, team: 'defense', index: 0 },
    { id: 'd2', title: 'D2 (防衛2) 調整中', desc: 'D2カードの位置へ左右に枠を移動します。', isBase: false, team: 'defense', index: 1 },
    { id: 'd3', title: 'D3 (防衛3) 調整中', desc: 'D3カードの位置へ左右に枠を移動します。', isBase: false, team: 'defense', index: 2 },
    { id: 'd4', title: 'D4 (防衛4) 調整中', desc: 'D4カードの位置へ左右に枠を移動します。', isBase: false, team: 'defense', index: 3 },
    { id: 'd5', title: 'D5 (防衛5・Sp1) 調整中', desc: 'D5(Special 1)カードの位置へ左右に枠を移動します。', isBase: false, team: 'defense', index: 4 },
    { id: 'd6', title: 'D6 (防衛6・Sp2) 調整中', desc: 'D6(Special 2)カードの位置へ左右に枠を移動します。', isBase: false, team: 'defense', index: 5 },
    { id: 'battle_type_icon', title: '攻防アイコン 調整中', desc: '左上の剣マーク枠を合わせます（必ず攻撃編成の画像を使用）。', isBattleType: true },
    { id: 'opp_avatar', title: '相手アイコン 調整中', desc: '対戦相手アイコンの枠位置とサイズを合わせます。', isOppAvatar: true },
    { id: 'opp_name', title: '相手名前(OCR) 調整中', desc: '対戦相手プレイヤー名の文字認識枠(横長)を合わせます。', isOppName: true }
];

let wizardCurrentStep = 0;
let wizardZoom = 1.0;
let wizardPanX = 0;
let wizardPanY = 0;
let wizardNudgeStep = 1; // 1px or 5px

let isDragging = false;
let isPanning = false;
let startPointerX = 0;
let startPointerY = 0;
let lastTouchDist = 0;

function showInspectorToast(msg) {
    const inspectorToast = document.getElementById('inspector-toast');
    if (!inspectorToast) return;
    inspectorToast.innerText = msg;
    inspectorToast.style.opacity = '1';
    setTimeout(() => {
        if (inspectorToast) inspectorToast.style.opacity = '0';
    }, 1800);
}

function openCropInspector() {
    if (!lastUploadedImage || !currentActiveProfile) {
        alert('調整対象のスクリーンショットが読み込まれていません。');
        return;
    }
    // Ensure default cardTop and sizes
    if (!currentActiveProfile.cardTop) currentActiveProfile.cardTop = 858;
    if (!currentActiveProfile.cardSize) currentActiveProfile.cardSize = 88;
    if (!currentActiveProfile.battleTypeIcon) {
        currentActiveProfile.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
    }
    if (!currentActiveProfile.battleTypeTemplate) {
        currentActiveProfile.battleTypeTemplate = "data:image/png;base64,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";
    }

    wizardCurrentStep = 0; // A1 first!
    wizardZoom = 2.4;
    wizardPanX = 0;
    wizardPanY = 0;

    cropInspectorModal.classList.add('active');
    updateWizardUI();
    setTimeout(() => {
        focusOnActiveSlot();
    }, 80);
}

function closeCropInspector() {
    if (cropInspectorModal) {
        cropInspectorModal.classList.remove('active');
    }
    if (!currentUploadData) {
        // If initial setup was cancelled without applying, restore dropzone
        dropZone.style.display = 'flex';
        scannerScreen.style.display = 'none';
        uploadQueue.shift();
        processNextInUploadQueue();
    }
}

function setWizardStep(index) {
    if (index < 0) index = 0;
    if (index >= WIZARD_STEPS.length) index = WIZARD_STEPS.length - 1;
    wizardCurrentStep = index;
    updateWizardUI();
    focusOnActiveSlot();
}

function updateWizardUI() {
    const step = WIZARD_STEPS[wizardCurrentStep];
    const titleEl = document.getElementById('wizard-step-title');
    const badgeEl = document.getElementById('wizard-step-badge');
    const lockBadge = document.getElementById('nudge-y-lock-badge');
    const sizeAdjustContainer = document.getElementById('size-adjust-container');
    const btnNudgeUp = document.getElementById('btn-nudge-up');
    const btnNudgeDown = document.getElementById('btn-nudge-down');
    const btnNudgeCenter = document.getElementById('btn-nudge-center');
    const btnStepPrev = document.getElementById('btn-step-prev');
    const btnStepNext = document.getElementById('btn-step-next');

    if (titleEl) titleEl.innerText = step.title;
    if (badgeEl) {
        badgeEl.style.background = step.isBattleType ? '#ffe135' : (step.team === 'attack' ? '#00e676' : (step.team === 'defense' ? '#ff3366' : '#00a3ff'));
        badgeEl.style.color = (step.team === 'attack' || step.isBattleType) ? '#000' : '#fff';
    }

    if (lockBadge) {
        if (step.id === 'a1') {
            lockBadge.innerText = '基準設定 (XY・サイズ可変)';
            lockBadge.style.color = '#00e676';
        } else if (step.isBattleType || step.isOppAvatar || step.isOppName) {
            lockBadge.innerText = 'XY・サイズ可変';
            lockBadge.style.color = '#ffe135';
        } else {
            lockBadge.innerText = 'X軸移動のみ (Y/サイズ固定)';
            lockBadge.style.color = '#aaa';
        }
    }

    // A2〜A6, D1〜D6: Hide Up/Down buttons completely
    const canMoveY = (step.id === 'a1' || step.isBattleType || step.isOppAvatar || step.isOppName);
    if (btnNudgeUp) {
        btnNudgeUp.style.visibility = canMoveY ? 'visible' : 'hidden';
        btnNudgeUp.style.pointerEvents = canMoveY ? 'auto' : 'none';
    }
    if (btnNudgeDown) {
        btnNudgeDown.style.visibility = canMoveY ? 'visible' : 'hidden';
        btnNudgeDown.style.pointerEvents = canMoveY ? 'auto' : 'none';
    }

    // Automatic move step: 5px for avatar & name, 1px for students
    if (step.isBattleType || step.isOppAvatar || step.isOppName) {
        wizardNudgeStep = 5;
    } else {
        wizardNudgeStep = 1;
    }
    if (btnNudgeCenter) {
        btnNudgeCenter.innerText = `${wizardNudgeStep}px`;
    }

    // Size adjust container: visible for A1, oppAvatar, oppName; hidden for others (maintaining layout width)
    if (sizeAdjustContainer) {
        const canResize = (step.id === 'a1' || step.isBattleType || step.isOppAvatar || step.isOppName);
        sizeAdjustContainer.style.visibility = canResize ? 'visible' : 'hidden';
        sizeAdjustContainer.style.pointerEvents = canResize ? 'auto' : 'none';
    }

    // Prev / Next button states & color styling
    if (btnStepPrev) {
        btnStepPrev.style.opacity = wizardCurrentStep === 0 ? '0.45' : '1';
        btnStepPrev.style.pointerEvents = wizardCurrentStep === 0 ? 'none' : 'auto';
    }
    if (btnStepNext) {
        if (wizardCurrentStep === WIZARD_STEPS.length - 1) {
            btnStepNext.innerHTML = '<i class="fa-solid fa-check"></i> 完了';
            btnStepNext.style.background = '#2563eb';
            btnStepNext.style.borderColor = '#3b82f6';
            btnStepNext.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.4)';
        } else {
            btnStepNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i> 次へ';
            btnStepNext.style.background = '#059669';
            btnStepNext.style.borderColor = '#34d399';
            btnStepNext.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.4)';
        }
    }

    // Highlight tab in 3-row grid
    document.querySelectorAll('.wizard-tab-btn').forEach((btn) => {
        const stepIdx = parseInt(btn.dataset.step, 10);
        if (stepIdx === wizardCurrentStep) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderCropInspectorCanvas();
}

// Center view and zoom in on active slot (slightly to the left of center to clear right panel)
function focusOnActiveSlot() {
    if (!lastUploadedImage || !currentActiveProfile || !cropInspectorCanvas) return;
    const m = currentActiveProfile.modalBox;
    const scaleX = m.w / 2400.0;
    const scaleY = m.h / 1040.0;
    const step = WIZARD_STEPS[wizardCurrentStep];

    let targetNormX = 1200;
    let targetNormY = 858;

    const cardSizeNorm = currentActiveProfile.cardSize || 88;
    const cardTopNorm = currentActiveProfile.cardTop || 858;
    const cardCenterYNorm = cardTopNorm + cardSizeNorm / 2;

    if (step.team === 'defense') {
        targetNormX = currentActiveProfile.defCenters[step.index];
        targetNormY = cardCenterYNorm;
    } else if (step.team === 'attack') {
        targetNormX = currentActiveProfile.atkCenters[step.index];
        targetNormY = cardCenterYNorm;
    } else if (step.isBattleType) {
        if (!currentActiveProfile.battleTypeIcon) currentActiveProfile.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
        targetNormX = currentActiveProfile.battleTypeIcon.sx + currentActiveProfile.battleTypeIcon.sw / 2;
        targetNormY = currentActiveProfile.battleTypeIcon.sy + currentActiveProfile.battleTypeIcon.sh / 2;
    } else if (step.isOppAvatar) {
        targetNormX = currentActiveProfile.oppAvatar.sx + currentActiveProfile.oppAvatar.sw / 2;
        targetNormY = currentActiveProfile.oppAvatar.sy + currentActiveProfile.oppAvatar.sh / 2;
    } else if (step.isOppName) {
        targetNormX = currentActiveProfile.oppName.sx + currentActiveProfile.oppName.sw / 2;
        targetNormY = currentActiveProfile.oppName.sy + currentActiveProfile.oppName.sh / 2;
    }

    const actualX = m.x + targetNormX * scaleX;
    const actualY = m.y + targetNormY * scaleY;

    const cw = cropInspectorCanvas.width || 800;
    const ch = cropInspectorCanvas.height || 600;
    const baseScale = Math.min(cw / lastUploadedImage.width, ch / lastUploadedImage.height);
    const drawW = lastUploadedImage.width * baseScale;
    const drawH = lastUploadedImage.height * baseScale;
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    const posX = drawX + actualX * baseScale;
    const posY = drawY + actualY * baseScale;

    // Preserve the user's zoom level across step changes
    if (!wizardZoom || wizardZoom < 1.5) {
        wizardZoom = 2.4;
    }
    const targetScreenX = cw * 0.35; // Target slot in the left 35% of the screen
    const targetScreenY = ch * 0.48; // Target slot centered vertically

    wizardPanX = targetScreenX - (cw / 2) - (posX - (cw / 2)) * wizardZoom;
    wizardPanY = targetScreenY - (ch / 2) - (posY - (ch / 2)) * wizardZoom;

    document.getElementById('zoom-level-text').innerText = `${Math.round(wizardZoom * 100)}%`;
    renderCropInspectorCanvas();
}

function resetActiveSlot() {
    if (!currentActiveProfile) return;
    const step = WIZARD_STEPS[wizardCurrentStep];
    const aspectKey = currentActiveProfile.aspectRatio;
    const rawAspectVal = parseFloat(aspectKey);
    let builtinMatch = BUILTIN_CALIBRATION_PROFILES[aspectKey];
    if (!builtinMatch) {
        for (const [k, p] of Object.entries(BUILTIN_CALIBRATION_PROFILES)) {
            if (Math.abs(parseFloat(k) - rawAspectVal) < 0.035) {
                builtinMatch = p;
                break;
            }
        }
    }

    const defDefaultCenters = builtinMatch ? [...builtinMatch.defCenters] : [1450, 1596, 1744, 1890, 2036, 2185];
    const atkDefaultCenters = builtinMatch ? [...builtinMatch.atkCenters] : [206, 353, 500, 646, 794, 941];
    const defaultCardTop = builtinMatch ? builtinMatch.cardTop : 858;
    const defaultCardSize = builtinMatch ? builtinMatch.cardSize : 88;
    const defaultOppAvatar = builtinMatch ? JSON.parse(JSON.stringify(builtinMatch.oppAvatar)) : { sx: 1718, sy: 162, sw: 120, sh: 120, dw: 100, dh: 100 };
    const defaultOppName = builtinMatch ? JSON.parse(JSON.stringify(builtinMatch.oppName)) : { sx: 1995, sy: 142, sw: 375, sh: 58, dw: 1100, dh: 200 };

    if (step.team === 'attack') {
        currentActiveProfile.atkCenters[step.index] = atkDefaultCenters[step.index];
        if (step.isBase) {
            currentActiveProfile.cardTop = defaultCardTop;
            currentActiveProfile.cardSize = defaultCardSize;
        }
    } else if (step.team === 'defense') {
        currentActiveProfile.defCenters[step.index] = defDefaultCenters[step.index];
        if (step.isBase) {
            currentActiveProfile.cardTop = defaultCardTop;
            currentActiveProfile.cardSize = defaultCardSize;
        }
    } else if (step.isBattleType) {
        currentActiveProfile.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
    } else if (step.isOppAvatar) {
        currentActiveProfile.oppAvatar = defaultOppAvatar;
    } else if (step.isOppName) {
        currentActiveProfile.oppName = defaultOppName;
    }

    renderCropInspectorCanvas();
    focusOnActiveSlot();
    showInspectorToast('枠の位置を初期値にリセットしました');
}

function renderCropInspectorCanvas() {
    if (!lastUploadedImage || !currentActiveProfile || !cropInspectorCanvas) return;
    const ctx = cropInspectorCanvas.getContext('2d');
    
    // Match CSS canvas display size
    const rect = cropInspectorCanvas.getBoundingClientRect();
    if (cropInspectorCanvas.width !== rect.width || cropInspectorCanvas.height !== rect.height) {
        cropInspectorCanvas.width = rect.width;
        cropInspectorCanvas.height = rect.height;
    }

    const cw = cropInspectorCanvas.width;
    const ch = cropInspectorCanvas.height;
    const imgW = lastUploadedImage.width;
    const imgH = lastUploadedImage.height;

    // Calculate base fit scale
    const baseScale = Math.min(cw / imgW, ch / imgH);
    const drawW = imgW * baseScale;
    const drawH = imgH * baseScale;
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();

    // Pan & Zoom transform around center
    ctx.translate(cw / 2 + wizardPanX, ch / 2 + wizardPanY);
    ctx.scale(wizardZoom, wizardZoom);
    ctx.translate(-cw / 2, -ch / 2);

    // 1. Draw raw screenshot
    ctx.drawImage(lastUploadedImage, drawX, drawY, drawW, drawH);

    // 2. Dim background outside modal
    const m = currentActiveProfile.modalBox;
    const scaleX = (m.w / 2400.0) * baseScale;
    const scaleY = (m.h / 1040.0) * baseScale;
    const modalScreenX = drawX + m.x * baseScale;
    const modalScreenY = drawY + m.y * baseScale;
    const modalScreenW = m.w * baseScale;
    const modalScreenH = m.h * baseScale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(drawX, drawY, drawW, drawH);

    // Clear inside modal
    ctx.save();
    ctx.beginPath();
    ctx.rect(modalScreenX, modalScreenY, modalScreenW, modalScreenH);
    ctx.clip();
    ctx.drawImage(lastUploadedImage, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Modal outline (thin)
    ctx.strokeStyle = 'rgba(0, 163, 255, 0.5)';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(modalScreenX, modalScreenY, modalScreenW, modalScreenH);

    const step = WIZARD_STEPS[wizardCurrentStep];
    const cardSizeNorm = currentActiveProfile.cardSize || 88;
    const cardTopNorm = currentActiveProfile.cardTop || 858;
    const cardHeightNorm = cardSizeNorm;
    const cardWidthNorm = Math.round(cardHeightNorm * 1.11); // True student card aspect ratio (W = 1.11 * H)
    const cardCenterYNorm = cardTopNorm + cardHeightNorm / 2;

    // Draw Attack slots (First)
    for (let i = 0; i < 6; i++) {
        const cxNorm = currentActiveProfile.atkCenters[i];
        const isCurrent = step.team === 'attack' && step.index === i;
        const cx = modalScreenX + cxNorm * scaleX;
        const cy = modalScreenY + cardCenterYNorm * scaleY;
        const w = cardWidthNorm * scaleX;
        const h = cardHeightNorm * scaleY;

        drawParallelogramGuide(ctx, cx, cy, w, h, isCurrent, `A${i + 1}`);
    }

    // Draw Defense slots
    for (let i = 0; i < 6; i++) {
        const cxNorm = currentActiveProfile.defCenters[i];
        const isCurrent = step.team === 'defense' && step.index === i;
        const cx = modalScreenX + cxNorm * scaleX;
        const cy = modalScreenY + cardCenterYNorm * scaleY;
        const w = cardWidthNorm * scaleX;
        const h = cardHeightNorm * scaleY;

        drawParallelogramGuide(ctx, cx, cy, w, h, isCurrent, `D${i + 1}`);
    }

    // Draw Battle Type Icon (Sword/Shield guide)
    if (currentActiveProfile.battleTypeIcon) {
        const bt = currentActiveProfile.battleTypeIcon;
        const bScreenX = modalScreenX + bt.sx * scaleX;
        const bScreenY = modalScreenY + bt.sy * scaleY;
        const bScreenW = bt.sw * scaleX;
        const bScreenH = bt.sh * scaleY;
        const isCurrent = (step.id === 'battle_type_icon');

        ctx.strokeStyle = isCurrent ? '#ffe135' : 'rgba(255, 225, 53, 0.4)';
        ctx.lineWidth = isCurrent ? 2.5 : 1.2;
        ctx.strokeRect(bScreenX, bScreenY, bScreenW, bScreenH);

        ctx.fillStyle = isCurrent ? '#ffe135' : 'rgba(255, 225, 53, 0.7)';
        ctx.font = `bold ${Math.max(9, Math.round(10 * wizardZoom))}px sans-serif`;
        ctx.fillText('攻防判定(剣)', bScreenX + 2, bScreenY - 3);
    }

    // Draw Opponent Avatar (Thin semi-transparent outline)
    const oppAv = currentActiveProfile.oppAvatar;
    if (oppAv) {
        const isCurrent = step.isOppAvatar;
        const avX = modalScreenX + oppAv.sx * scaleX;
        const avY = modalScreenY + oppAv.sy * scaleY;
        const avW = oppAv.sw * scaleX;
        const avH = oppAv.sh * scaleY;

        ctx.strokeStyle = isCurrent ? 'rgba(255, 225, 53, 0.65)' : 'rgba(255, 225, 53, 0.2)';
        ctx.lineWidth = isCurrent ? 1.0 : 0.6;
        ctx.strokeRect(avX, avY, avW, avH);
        if (isCurrent) {
            ctx.fillStyle = 'rgba(255, 225, 53, 0.04)';
            ctx.fillRect(avX, avY, avW, avH);
        }
        ctx.fillStyle = isCurrent ? 'rgba(255, 225, 53, 0.8)' : 'rgba(255, 225, 53, 0.4)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('相手アイコン', avX + 2, avY - 3);
    }

    // Draw Opponent Name (Thin semi-transparent outline)
    const oppNm = currentActiveProfile.oppName;
    if (oppNm) {
        const isCurrent = step.isOppName;
        const nmX = modalScreenX + oppNm.sx * scaleX;
        const nmY = modalScreenY + oppNm.sy * scaleY;
        const nmW = oppNm.sw * scaleX;
        const nmH = oppNm.sh * scaleY;

        ctx.strokeStyle = isCurrent ? 'rgba(0, 210, 255, 0.65)' : 'rgba(0, 210, 255, 0.2)';
        ctx.lineWidth = isCurrent ? 1.0 : 0.6;
        ctx.strokeRect(nmX, nmY, nmW, nmH);
        if (isCurrent) {
            ctx.fillStyle = 'rgba(0, 210, 255, 0.04)';
            ctx.fillRect(nmX, nmY, nmW, nmH);
        }
        ctx.fillStyle = isCurrent ? 'rgba(0, 210, 255, 0.8)' : 'rgba(0, 210, 255, 0.4)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('相手名前', nmX + 2, nmY - 3);
    }

    ctx.restore();
}

function drawParallelogramGuide(ctx, cx, cy, w, h, isHighlighted, label) {
    const skew = 0.10; // Blue Archive UI card skew (slope 0.20 over height)
    const dx = h * skew;

    // Slanted parallelogram outline
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + dx, cy - h / 2);
    ctx.lineTo(cx + w / 2 + dx, cy - h / 2);
    ctx.lineTo(cx + w / 2 - dx, cy + h / 2);
    ctx.lineTo(cx - w / 2 - dx, cy + h / 2);
    ctx.closePath();

    if (isHighlighted) {
        // Semi-transparent thin green outline (0.9px)
        ctx.strokeStyle = 'rgba(0, 230, 118, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 230, 118, 0.03)';
        ctx.fill();

        // Inner centered Red Face Crop Square (matches face size inside card)
        const cropSize = Math.round(h * 0.84);
        ctx.strokeStyle = 'rgba(255, 23, 68, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(cx - cropSize / 2, cy - cropSize / 2, cropSize, cropSize);
        ctx.fillStyle = 'rgba(255, 23, 68, 0.04)';
        ctx.fillRect(cx - cropSize / 2, cy - cropSize / 2, cropSize, cropSize);

        // Subtle faint center dot
        ctx.fillStyle = 'rgba(255, 235, 59, 0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Small semi-transparent label text
        ctx.fillStyle = 'rgba(0, 230, 118, 0.85)';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, cy - h / 2 - 3);
    } else {
        // Very subtle outline for inactive slots
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, cy - h / 2 - 3);
    }
}

// Nudge & Position Modification Handlers
function nudgeActiveSlot(dx, dy) {
    if (!currentActiveProfile) return;
    const step = WIZARD_STEPS[wizardCurrentStep];
    const actualDx = dx * wizardNudgeStep;
    const actualDy = dy * wizardNudgeStep;

    if (step.id === 'a1') {
        currentActiveProfile.atkCenters[0] += actualDx;
        currentActiveProfile.cardTop = (currentActiveProfile.cardTop || 858) + actualDy;
    } else if (step.team === 'attack') {
        currentActiveProfile.atkCenters[step.index] += actualDx;
    } else if (step.team === 'defense') {
        currentActiveProfile.defCenters[step.index] += actualDx;
    } else if (step.isBattleType) {
        if (!currentActiveProfile.battleTypeIcon) currentActiveProfile.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
        currentActiveProfile.battleTypeIcon.sx += actualDx;
        currentActiveProfile.battleTypeIcon.sy += actualDy;
    } else if (step.isOppAvatar) {
        currentActiveProfile.oppAvatar.sx += actualDx;
        currentActiveProfile.oppAvatar.sy += actualDy;
    } else if (step.isOppName) {
        currentActiveProfile.oppName.sx += actualDx;
        currentActiveProfile.oppName.sy += actualDy;
    }

    renderCropInspectorCanvas();
}

function adjustActiveSlotSize(delta) {
    if (!currentActiveProfile) return;
    const step = WIZARD_STEPS[wizardCurrentStep];
    const amount = delta * wizardNudgeStep;

    if (step.id === 'a1') {
        currentActiveProfile.cardSize = Math.max(40, (currentActiveProfile.cardSize || 88) + amount);
    } else if (step.isBattleType) {
        if (!currentActiveProfile.battleTypeIcon) currentActiveProfile.battleTypeIcon = { sx: 58, sy: 172, sw: 110, sh: 110 };
        currentActiveProfile.battleTypeIcon.sw = Math.max(30, currentActiveProfile.battleTypeIcon.sw + amount);
        currentActiveProfile.battleTypeIcon.sh = Math.max(30, currentActiveProfile.battleTypeIcon.sh + amount);
    } else if (step.isOppAvatar) {
        currentActiveProfile.oppAvatar.sw = Math.max(40, currentActiveProfile.oppAvatar.sw + amount);
        currentActiveProfile.oppAvatar.sh = Math.max(40, currentActiveProfile.oppAvatar.sh + amount);
    } else if (step.isOppName) {
        currentActiveProfile.oppName.sw = Math.max(60, currentActiveProfile.oppName.sw + amount * 2);
        currentActiveProfile.oppName.sh = Math.max(20, currentActiveProfile.oppName.sh + amount);
    }

    renderCropInspectorCanvas();
}

let lastTouchMidX = 0;
let lastTouchMidY = 0;

// Mouse & Touch Dragging & Panning on Canvas
function handleInspectorPointerDown(e) {
    if (!cropInspectorCanvas) return;
    isPanning = true;

    if (e.touches && e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const rect = cropInspectorCanvas.getBoundingClientRect();
        lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        lastTouchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
        lastTouchMidY = (t1.clientY + t2.clientY) / 2 - rect.top;
    } else {
        startPointerX = e.clientX || (e.touches && e.touches[0].clientX);
        startPointerY = e.clientY || (e.touches && e.touches[0].clientY);
    }
}

function handleInspectorPointerMove(e) {
    if (!isPanning || !cropInspectorCanvas) return;

    if (e.touches && e.touches.length >= 2) {
        // Pinch to Zoom centered at finger midpoint
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const rect = cropInspectorCanvas.getBoundingClientRect();
        const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const curMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const curMidY = (t1.clientY + t2.clientY) / 2 - rect.top;

        if (lastTouchDist > 0) {
            const factor = curDist / lastTouchDist;
            const oldZoom = wizardZoom;
            const newZoom = Math.max(0.5, Math.min(5.0, wizardZoom * factor));
            const effectiveFactor = newZoom / oldZoom;

            const cw = cropInspectorCanvas.width;
            const ch = cropInspectorCanvas.height;
            const cx = cw / 2;
            const cy = ch / 2;

            // Zoom around the midpoint between the two fingers
            wizardPanX = (curMidX - cx) * (1 - effectiveFactor) + wizardPanX * effectiveFactor;
            wizardPanY = (curMidY - cy) * (1 - effectiveFactor) + wizardPanY * effectiveFactor;

            // Add translation delta of the midpoint
            wizardPanX += (curMidX - lastTouchMidX);
            wizardPanY += (curMidY - lastTouchMidY);

            wizardZoom = newZoom;
            document.getElementById('zoom-level-text').innerText = `${Math.round(wizardZoom * 100)}%`;
            renderCropInspectorCanvas();
        }
        lastTouchDist = curDist;
        lastTouchMidX = curMidX;
        lastTouchMidY = curMidY;
        return;
    }

    const curX = e.clientX || (e.touches && e.touches[0].clientX);
    const curY = e.clientY || (e.touches && e.touches[0].clientY);
    const dx = curX - startPointerX;
    const dy = curY - startPointerY;

    wizardPanX += dx;
    wizardPanY += dy;
    startPointerX = curX;
    startPointerY = curY;

    renderCropInspectorCanvas();
}

function handleInspectorPointerUp() {
    isPanning = false;
    lastTouchDist = 0;
}

function handleInspectorWheel(e) {
    e.preventDefault();
    if (!cropInspectorCanvas) return;
    const rect = cropInspectorCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const oldZoom = wizardZoom;
    const newZoom = Math.max(0.5, Math.min(5.0, wizardZoom * zoomFactor));
    const effectiveFactor = newZoom / oldZoom;

    const cw = cropInspectorCanvas.width;
    const ch = cropInspectorCanvas.height;
    const cx = cw / 2;
    const cy = ch / 2;

    // Zoom centered at mouse cursor
    wizardPanX = (mx - cx) * (1 - effectiveFactor) + wizardPanX * effectiveFactor;
    wizardPanY = (my - cy) * (1 - effectiveFactor) + wizardPanY * effectiveFactor;
    wizardZoom = newZoom;

    document.getElementById('zoom-level-text').innerText = `${Math.round(wizardZoom * 100)}%`;
    renderCropInspectorCanvas();
}

// Complete & Apply Calibration
async function applyCropInspector() {
    if (!currentActiveProfile) return;

    // Save crop template of Attack sword icon from lastUploadedImage
    if (lastUploadedImage && currentActiveProfile.battleTypeIcon) {
        try {
            const m = currentActiveProfile.modalBox;
            const bt = currentActiveProfile.battleTypeIcon;

            // Exactly match the normalized coordinate space (2400 x 1040) used during recognition
            const tempProcCanvas = document.createElement('canvas');
            tempProcCanvas.width = 2400;
            tempProcCanvas.height = 1040;
            const tempCtx = tempProcCanvas.getContext('2d');
            tempCtx.drawImage(
                lastUploadedImage,
                m.x, m.y, m.w, m.h,
                0, 0, 2400, 1040
            );

            const templateCanvas = cropImage(tempProcCanvas, bt.sx, bt.sy, bt.sw, bt.sh, 48, 48);
            currentActiveProfile.battleTypeTemplate = templateCanvas.toDataURL('image/png');
            const tData = templateCanvas.getContext('2d').getImageData(0, 0, 48, 48).data;
            const tGray = [];
            for (let i = 0; i < 48 * 48; i++) {
                tGray.push(Math.round(0.299 * tData[i * 4] + 0.587 * tData[i * 4 + 1] + 0.114 * tData[i * 4 + 2]));
            }
            currentActiveProfile.battleTypeGrayscale = tGray;
            console.log('[Calibration] Successfully captured new Battle Type (Attack) template & grayscale from user device!');
        } catch (e) {
            console.warn('[Calibration] Failed to capture battle type template:', e);
        }
    }

    try {
        const cachedProfiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
        cachedProfiles[currentActiveProfile.aspectRatio] = currentActiveProfile;
        localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(cachedProfiles));
        localStorage.setItem('tactical_archive_defense_feature_notified', 'true');
        console.log(`Saved updated calibration for aspect ratio ${currentActiveProfile.aspectRatio}`);
    } catch (e) {
        console.warn("Failed to persist calibration:", e);
    }

    // If this was first-time setup before recognition:
    if (!currentUploadData) {
        if (cropInspectorModal) cropInspectorModal.classList.remove('active');
        localStorage.setItem('tactical_archive_first_launch_done', 'true');
        if (currentUploadFile && currentUploadExtractedDate) {
            await runRecognitionPipeline(lastUploadedImage, currentActiveProfile, currentUploadFile, currentUploadExtractedDate);
        }
        return;
    }

    if (cropInspectorModal) cropInspectorModal.classList.remove('active');

    // Re-crop all 12 slots from normalized canvas and update review modal
    const procCanvas = document.getElementById('proc-canvas');
    const cardTop = currentActiveProfile.cardTop || 858;
    const cardHeight = currentActiveProfile.cardSize || 88;
    const cardWidth = Math.round(cardHeight * 1.11);
    const faceSize = Math.round(cardHeight * 0.84);
    const faceOffset = Math.round((cardHeight - faceSize) / 2);

    // Re-crop Attack slots
    for (let i = 0; i < 6; i++) {
        const cx = currentActiveProfile.atkCenters[i];
        const iconCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
        const iconDataUrl = iconCanvas.toDataURL();
        const faceCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70);
        const faceFeatures = extractFeaturesFromCanvas(faceCanvas);

        const match = matchStudent(faceFeatures, currentRoster);
        const slotData = currentUploadData.attack[i];
        slotData.icon_path = (match.student && match.similarity >= 0.85) ? (match.student.icon_path || iconDataUrl) : iconDataUrl;
        slotData.faceFeatures = faceFeatures;
        slotData.confidence = match.similarity;
        if (match.student && match.similarity >= 0.85) {
            slotData.studentId = match.student.id;
            slotData.studentName = match.student.name;
        }
    }

    // Re-crop Defense slots
    for (let i = 0; i < 6; i++) {
        const cx = currentActiveProfile.defCenters[i];
        const iconCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
        const iconDataUrl = iconCanvas.toDataURL();
        const faceCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70);
        const faceFeatures = extractFeaturesFromCanvas(faceCanvas);

        const match = matchStudent(faceFeatures, currentRoster);
        const slotData = currentUploadData.defense[i];
        slotData.icon_path = (match.student && match.similarity >= 0.85) ? (match.student.icon_path || iconDataUrl) : iconDataUrl;
        slotData.faceFeatures = faceFeatures;
        slotData.confidence = match.similarity;
        if (match.student && match.similarity >= 0.85) {
            slotData.studentId = match.student.id;
            slotData.studentName = match.student.name;
        }
    }

    // Re-crop Opponent Avatar
    if (currentActiveProfile.oppAvatar) {
        const av = currentActiveProfile.oppAvatar;
        const avCanvas = cropImage(procCanvas, av.sx, av.sy, av.sw, av.sh, 100, 100);
        currentUploadData.opponentAvatar = avCanvas.toDataURL();
    }

    populateReviewModal(currentUploadData);
    closeCropInspector();
    alert('キャリブレーション設定を保存し、編成を再照合・反映しました！');
}

// Render Student Grid inside Roster Tab
function updateRosterView() {
    rosterCount.innerText = currentRoster.length;
    rosterItems.innerHTML = '';
    
    if (currentRoster.length === 0) {
        rosterItems.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-book-open-reader"></i>
                <p>生徒データが登録されていません。ZIPの一括インポートか自動生成を行ってください。</p>
            </div>
        `;
        return;
    }
    
    currentRoster.forEach(student => {
        const card = document.createElement('div');
        card.className = 'roster-card';
        
        // Representation image
        const img = document.createElement('img');
        img.className = 'roster-card-icon';
        img.src = student.icon_path || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23152535"/><text x="50" y="55" font-family="sans-serif" font-size="12" fill="%2356687a" text-anchor="middle">No Icon</text></svg>';
        
        const name = document.createElement('div');
        name.className = 'roster-card-name';
        name.innerText = student.name;
        name.title = student.name;
        
        // Patterns count badge
        const badge = document.createElement('span');
        badge.className = 'roster-card-badge';
        badge.innerText = `${student.features ? student.features.length : 0} patterns`;
        
        const actions = document.createElement('div');
        actions.className = 'roster-card-actions';
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'roster-card-btn edit';
        btnEdit.innerHTML = '<i class="fa-solid fa-pen"></i>';
        btnEdit.title = '生徒名の変更';
        btnEdit.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newName = prompt(`生徒「${student.name}」の新しい名前を入力してください：`, student.name);
            if (newName && newName.trim() !== '') {
                const trimmedName = newName.trim();
                const existing = currentRoster.find(s => s.name === trimmedName && s.id !== student.id);
                if (existing) {
                    alert('すでに同じ名前の生徒が登録されています。');
                    return;
                }
                student.name = trimmedName;
                const db = await openDB();
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction('roster_students', 'readwrite');
                    const store = transaction.objectStore('roster_students');
                    const request = store.put(student);
                    request.onsuccess = resolve;
                    request.onerror = (e) => reject(e.target.error);
                });
                currentRoster = await getStudents();
                updateRosterView();
                updateHistoryView();
                alert('生徒名を更新しました。');
            }
        });

        const btnDelete = document.createElement('button');
        btnDelete.className = 'roster-card-btn delete';
        btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnDelete.title = '生徒の削除';
        btnDelete.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`生徒「${student.name}」を削除しますか？`)) {
                await deleteStudent(student.id);
                currentRoster = await getStudents();
                updateRosterView();
            }
        });
        
        actions.appendChild(btnEdit);
        actions.appendChild(btnDelete);
        card.appendChild(badge);
        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(actions);
        
        rosterItems.appendChild(card);
    });
}

// Render student list inside Selector Popup
function renderSelectorRoster() {
    const selectorGrid = document.getElementById('selector-roster-items');
    selectorGrid.innerHTML = '';
    
    const filter = searchSelectorInput.value.toLowerCase().trim();
    const hiraFilter = toHiragana(filter);
    const filteredRoster = currentRoster.filter(student => 
        (student.name && (student.name.toLowerCase().includes(filter) || toHiragana(student.name).includes(hiraFilter)))
    );

    // Add an "Unknown" option
    const unknownItem = document.createElement('div');
    unknownItem.className = 'selector-item';
    unknownItem.innerHTML = `
        <div style="width:50px; height:50px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-header); display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--text-muted);">?</div>
        <span>未登録 (生徒)</span>
    `;
    unknownItem.addEventListener('click', () => {
        selectStudentForEditingSlot(null);
    });
    selectorGrid.appendChild(unknownItem);

    if (filteredRoster.length === 0) {
        return;
    }

    filteredRoster.forEach(student => {
        const item = document.createElement('div');
        item.className = 'selector-item';
        
        const img = document.createElement('img');
        img.src = student.icon_path || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23152535"/></svg>';
        
        const name = document.createElement('span');
        name.innerText = student.name;
        name.title = student.name;
        
        item.appendChild(img);
        item.appendChild(name);
        
        item.addEventListener('click', () => {
            selectStudentForEditingSlot(student);
        });
        
        selectorGrid.appendChild(item);
    });
}

// Select student in selector and update slot in Review Modal or Detail Modal
function selectStudentForEditingSlot(student) {
    if (!editingSlot) return;
    
    const { team, index, modal } = editingSlot;
    const dataContainer = (modal === 'detail') ? detailEditedData : currentUploadData;
    if (!dataContainer) return;
    
    const slot = dataContainer[team][index];
    
    if (student) {
        slot.studentId = student.id;
        slot.studentName = student.name;
        slot.icon_path = student.icon_path || slot.icon_path;
        slot.userSelected = true; // Mark as user corrected
        if (student.features && student.features.length > 0) {
            slot.faceFeatures = student.features[0];
        }
    } else {
        slot.studentId = null;
        slot.studentName = (modal === 'detail') ? '未登録' : '生徒';
        slot.userSelected = false;
    }
    
    // Re-create the slot DOM node in the layout
    const containerId = (modal === 'detail') 
        ? (team === 'attack' ? 'detail-attack-team' : 'detail-defense-team')
        : (team === 'attack' ? 'review-attack-team' : 'review-defense-team');
        
    const container = document.getElementById(containerId);
    const oldSlotEl = container.querySelector(`.student-slot[data-index="${index}"]`);
    if (oldSlotEl) {
        const newSlotEl = (modal === 'detail')
            ? createDetailSlotElement(slot, team, index)
            : createReviewSlotElement(slot, team, index);
        container.replaceChild(newSlotEl, oldSlotEl);
    }
    
    // Refresh opponent avatar if we modified slot 0 of defender
    if (team === 'defense' && index === 0) {
        if (modal === 'detail') {
            const avWrapper = document.getElementById('detail-opponent-avatar-wrapper');
            avWrapper.innerHTML = '';
            if (slot.icon_path) {
                const img = document.createElement('img');
                img.src = slot.icon_path;
                avWrapper.appendChild(img);
            } else {
                const pl = document.createElement('div');
                pl.className = 'slot-placeholder mini';
                pl.innerText = '?';
                avWrapper.appendChild(pl);
            }
        } else {
            updateOpponentAvatarReview();
        }
    }
    
    selectorModal.classList.remove('active');
}

// Open Detail & Edit Modal for a battle history record
function openBattleDetailModal(item) {
    editingRecord = item;
    
    // Create copy of slot data for editing
    detailEditedData = {
        attack: [],
        defense: [],
        box1_color: item.box1_color || null,
        box1_value: item.box1_value || null,
        box2_color: item.box2_color || null,
        box2_value: item.box2_value || null
    };

    // Populate Win/Lose toggle
    const winBtn = document.getElementById('detail-win-btn');
    const loseBtn = document.getElementById('detail-lose-btn');
    if (item.result === 'WIN') {
        winBtn.classList.add('active');
        loseBtn.classList.remove('active');
    } else {
        loseBtn.classList.add('active');
        winBtn.classList.remove('active');
    }

    detailEditedData.battleType = 'attack';

    // Populate opponent name & Date
    document.getElementById('detail-opponent-name').value = item.commander_name || '';
    
    const formattedDate = new Date(item.created_at).toISOString().split('T')[0];
    document.getElementById('detail-date-input').value = formattedDate;
    document.getElementById('detail-date-str').innerText = new Date(item.created_at).toLocaleDateString('ja-JP');
    
    // Notes
    document.getElementById('detail-notes').value = item.notes || '';

    // Utility
    document.querySelectorAll('input[name="detail-utility"]').forEach(radio => {
        radio.checked = (radio.value === item.utility_level);
    });

    // Populate Opponent Avatar Wrapper
    const avWrapper = document.getElementById('detail-opponent-avatar-wrapper');
    avWrapper.innerHTML = '';
    const cachedAvatar = opponentDirectory[item.commander_name];
    if (cachedAvatar) {
        const img = document.createElement('img');
        img.src = cachedAvatar;
        avWrapper.appendChild(img);
    } else if (item.opponent_avatar) {
        const img = document.createElement('img');
        img.src = item.opponent_avatar;
        avWrapper.appendChild(img);
    } else {
        // Fallback: use first defender student icon
        const firstDefStudent = currentRoster.find(s => s.id === item.defense_team[0]);
        if (firstDefStudent && firstDefStudent.icon_path) {
            const img = document.createElement('img');
            img.src = firstDefStudent.icon_path;
            avWrapper.appendChild(img);
        } else {
            const pl = document.createElement('div');
            pl.className = 'slot-placeholder mini';
            pl.innerText = '?';
            avWrapper.appendChild(pl);
        }
    }

    // Populate Attack Slots
    const atkContainer = document.getElementById('detail-attack-team');
    atkContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const studentId = item.attack_team ? item.attack_team[i] : null;
        const savedIcon = (item.attack_icons && item.attack_icons[i]) || '';
        const savedName = (item.attack_names && item.attack_names[i]) || '';
        
        // Find student in current roster: by Name first, then by ID
        let student = null;
        if (savedName && savedName !== '生徒' && savedName !== '未登録') {
            student = currentRoster.find(s => s.name === savedName);
        }
        if (!student && studentId) {
            student = currentRoster.find(s => s.id === studentId);
        }

        const effectiveIcon = (student && student.icon_path) ? student.icon_path : savedIcon;
        const effectiveName = (student && student.name) || savedName || '未登録';
        const effectiveId = student ? student.id : (savedName && savedName !== '未登録' && savedName !== '生徒' ? 0 : (studentId || null));
        
        const slotData = {
            studentId: effectiveId,
            studentName: effectiveName,
            icon_path: effectiveIcon,
            userSelected: false,
            faceFeatures: (student && student.features && student.features.length > 0) ? student.features[0] : null
        };
        detailEditedData.attack.push(slotData);

        const slotEl = createDetailSlotElement(slotData, 'attack', i);
        atkContainer.appendChild(slotEl);
    }

    // Populate Defense Slots
    const defContainer = document.getElementById('detail-defense-team');
    defContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const studentId = item.defense_team ? item.defense_team[i] : null;
        const savedIcon = (item.defense_icons && item.defense_icons[i]) || '';
        const savedName = (item.defense_names && item.defense_names[i]) || '';
        
        // Find student in current roster: by Name first, then by ID
        let student = null;
        if (savedName && savedName !== '生徒' && savedName !== '未登録') {
            student = currentRoster.find(s => s.name === savedName);
        }
        if (!student && studentId) {
            student = currentRoster.find(s => s.id === studentId);
        }

        const effectiveIcon = (student && student.icon_path) ? student.icon_path : savedIcon;
        const effectiveName = (student && student.name) || savedName || '未登録';
        const effectiveId = student ? student.id : (savedName && savedName !== '未登録' && savedName !== '生徒' ? 0 : (studentId || null));
        
        const slotData = {
            studentId: effectiveId,
            studentName: effectiveName,
            icon_path: effectiveIcon,
            userSelected: false,
            faceFeatures: (student && student.features && student.features.length > 0) ? student.features[0] : null
        };
        detailEditedData.defense.push(slotData);

        const slotEl = createDetailSlotElement(slotData, 'defense', i);
        defContainer.appendChild(slotEl);
    }

    updateBoxDisplay('detail', 1, detailEditedData.box1_color, detailEditedData.box1_value);
    updateBoxDisplay('detail', 2, detailEditedData.box2_color, detailEditedData.box2_value);

    detailModal.classList.add('active');
}

function createDetailSlotElement(slotData, team, index) {
    const slotEl = document.createElement('div');
    slotEl.className = 'student-slot';
    if (index >= 4) slotEl.classList.add('special-slot');
    
    // Only mark unrecognized if name is missing/empty/未登録 AND icon is missing
    if ((!slotData.studentName || slotData.studentName === '未登録' || slotData.studentName === '生徒') && !slotData.icon_path) {
        slotEl.classList.add('unrecognized');
    }
    
    slotEl.dataset.team = team;
    slotEl.dataset.index = index;
    
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'slot-icon-wrapper';
    
    if (slotData.icon_path) {
        const img = document.createElement('img');
        img.src = slotData.icon_path;
        iconWrapper.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'slot-placeholder';
        placeholder.innerText = index >= 4 ? 'Sp' : '生徒';
        iconWrapper.appendChild(placeholder);
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'slot-name';
    nameEl.innerText = slotData.studentName || '未登録';
    
    slotEl.appendChild(iconWrapper);
    slotEl.appendChild(nameEl);
    
    slotEl.addEventListener('click', () => {
        editingSlot = { team, index, modal: 'detail' };
        searchSelectorInput.value = '';
        renderSelectorRoster();
        selectorModal.classList.add('active');
    });

    return slotEl;
}

// Filter and render History items
function filterHistory(type = 'attack') {
    const searchEl = document.getElementById(`search-commander-${type}`);
    const searchVal = (searchEl?.value || '').toLowerCase().trim();

    const baseList = currentHistory.filter(item => {
        if (type === 'defense') {
            return item.battle_type === 'defense';
        } else {
            return item.battle_type !== 'defense';
        }
    });

    const filtered = baseList.filter(item => {
        // Position Filter (D1 Eimi, D5/D6 Special order-independent, etc.)
        const effectiveFilter = getEffectivePositionFilter(type);
        if (effectiveFilter) {
            const { team, index, studentName } = effectiveFilter;
            const namesArray = (team === 'attack') ? item.attack_names : item.defense_names;
            
            const matchSlot = (i) => {
                if (!studentName || studentName === '生徒' || studentName === '未登録') return false;
                const slotName = namesArray && namesArray[i];
                return slotName === studentName;
            };

            if (index >= 4) {
                if (!matchSlot(4) && !matchSlot(5)) return false;
            } else {
                if (!matchSlot(index)) return false;
            }
        }
        
        // Search commander name / student name / team composition
        if (searchVal !== '') {
            const terms = searchVal.split(/[\s,，、]+/).filter(t => t.length > 0);
            
            for (const term of terms) {
                let termMatched = false;
                const lowerTerm = term.toLowerCase();
                const hiraTerm = toHiragana(term);
                
                // 1. Match commander name (Hiragana / Katakana bidirectional match)
                if (item.commander_name) {
                    const cmdLower = item.commander_name.toLowerCase();
                    const cmdHira = toHiragana(item.commander_name);
                    if (cmdLower.includes(lowerTerm) || (hiraTerm && cmdHira.includes(hiraTerm))) {
                        termMatched = true;
                    }
                }
                
                // 2. Match student name (Hiragana / Katakana bidirectional match)
                if (!termMatched) {
                    const matchName = n => n && (n.toLowerCase().includes(lowerTerm) || (hiraTerm && toHiragana(n).includes(hiraTerm)));
                    const hasAtkName = item.attack_names && item.attack_names.some(matchName);
                    const hasDefName = item.defense_names && item.defense_names.some(matchName);
                    if (hasAtkName || hasDefName) {
                        termMatched = true;
                    } else {
                        const matchingStudentIds = currentRoster
                            .filter(s => s.name && (s.name.toLowerCase().includes(lowerTerm) || (hiraTerm && toHiragana(s.name).includes(hiraTerm))))
                            .map(s => s.id);
                        
                        if (matchingStudentIds.length > 0) {
                            const atkStrikers = (item.attack_team || []).slice(0, 4);
                            const defStrikers = (item.defense_team || []).slice(0, 4);
                            const atkSpecials = (item.attack_team || []).slice(4);
                            const defSpecials = (item.defense_team || []).slice(4);
                            
                            const hasAtkStriker = atkStrikers.some(id => matchingStudentIds.includes(id));
                            const hasDefStriker = defStrikers.some(id => matchingStudentIds.includes(id));
                            const hasAtkSpecial = atkSpecials.some(id => matchingStudentIds.includes(id));
                            const hasDefSpecial = defSpecials.some(id => matchingStudentIds.includes(id));
                            
                            if (hasAtkStriker || hasDefStriker || hasAtkSpecial || hasDefSpecial) {
                                termMatched = true;
                            }
                        }
                    }
                }
                
                if (!termMatched) return false;
            }
        }
        
        return true;
    });

    renderHistoryItems(filtered, type);
}

// Render History View
function updateHistoryView() {
    filterHistory('attack');
    filterHistory('defense');
}

// Synchronized Search Input handler (Shared across Attack and Defense tabs, callable from any scope)
function syncSearchInput(value, clearPositionFilter = false) {
    if (clearPositionFilter) {
        activePositionFilter = null;
    }
    const searchAtk = document.getElementById('search-commander-attack');
    const btnClearAtk = document.getElementById('btn-clear-search-attack');
    const searchDef = document.getElementById('search-commander-defense');
    const btnClearDef = document.getElementById('btn-clear-search-defense');

    if (searchAtk && searchAtk.value !== value) searchAtk.value = value;
    if (searchDef && searchDef.value !== value) searchDef.value = value;
    const hasValue = (value.trim() !== '');
    if (btnClearAtk) btnClearAtk.style.display = hasValue ? 'block' : 'none';
    if (btnClearDef) btnClearDef.style.display = hasValue ? 'block' : 'none';
    updateHistoryView();
}
window.syncSearchInput = syncSearchInput;

const HISTORY_PAGE_SIZE = 30;

// Pagination state for incremental rendering
const historyRenderState = {
    attack: {
        allFiltered: [],
        renderedCount: 0
    },
    defense: {
        allFiltered: [],
        renderedCount: 0
    }
};

function renderNextHistoryBatch(type = 'attack', count = HISTORY_PAGE_SIZE) {
    const state = historyRenderState[type];
    if (!state || state.renderedCount >= state.allFiltered.length) return;

    const tbody = document.getElementById(`${type}-history-items`);
    if (!tbody) return;

    const nextBatch = state.allFiltered.slice(state.renderedCount, state.renderedCount + count);
    const fragment = document.createDocumentFragment();

    nextBatch.forEach(item => {
        const row = createHistoryRowElement(item, type);
        fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
    state.renderedCount += nextBatch.length;
}

function renderHistoryItems(historyArray, type = 'attack') {
    // 1. Calculate stats on the FULL filtered dataset (All matched data!)
    const total = historyArray.length;
    let wins = 0;
    historyArray.forEach(h => {
        if (h.result === 'WIN') wins++;
    });
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    
    const statTotalEl = document.getElementById(`stat-total-battles-${type}`);
    const statWinRateEl = document.getElementById(`stat-win-rate-${type}`);
    const statRatioEl = document.getElementById(`stat-win-lose-ratio-${type}`);
    const tbody = document.getElementById(`${type}-history-items`);

    if (statTotalEl) statTotalEl.innerText = total;
    if (statWinRateEl) statWinRateEl.innerText = `${winRate}%`;
    if (statRatioEl) statRatioEl.innerText = `${wins} / ${total - wins}`;

    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (historyArray.length === 0) {
        historyRenderState[type] = { allFiltered: [], renderedCount: 0 };
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>対戦履歴が見つかりません。スクショをアップロードしてください。</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort all matched data by Date descending (fall back to ID descending for same-day items)
    const sorted = [...historyArray].sort((a, b) => b.created_at - a.created_at || (b.id || 0) - (a.id || 0));
    
    // Set pagination state
    historyRenderState[type] = {
        allFiltered: sorted,
        renderedCount: 0
    };

    // Reset scroll position to top
    const wrapper = document.querySelector(`#tab-${type} .history-list-wrapper`);
    if (wrapper) wrapper.scrollTop = 0;

    // Render initial batch of 30 records
    renderNextHistoryBatch(type, HISTORY_PAGE_SIZE);
}

function createHistoryRowElement(item, type = 'attack') {
    const row = document.createElement('tr');
    
    // Click on the row opens Detail/Edit Modal
    row.addEventListener('click', (e) => {
        // Prevent if clicking on commander badge
        if (e.target.classList.contains('commander-clickable') || e.target.closest('.commander-clickable')) {
            return;
        }
        openBattleDetailModal(item);
    });
    
    // 1. Result
    const tdResult = document.createElement('td');
    const resBadge = document.createElement('span');
    resBadge.className = `result-badge ${item.result.toLowerCase()}`;
    resBadge.innerText = item.result === 'WIN' ? 'W' : 'L';
    tdResult.appendChild(resBadge);
    
    // 2. Utility
    const tdUtility = document.createElement('td');
    const utilBadge = document.createElement('span');
    utilBadge.className = `utility-badge ${item.utility_level === '高' ? 'high' : item.utility_level === '中' ? 'mid' : 'low'}`;
    if (item.notes && item.notes.trim() !== '') {
        utilBadge.classList.add('has-notes');
    }
    utilBadge.innerText = item.utility_level;
    tdUtility.appendChild(utilBadge);
    
    // 2b. Date
    const tdDate = document.createElement('td');
    tdDate.className = 'history-date-cell';
    tdDate.style.fontSize = '11px';
    tdDate.style.fontWeight = '700';
    tdDate.style.color = 'var(--text-primary)';
    tdDate.style.textAlign = 'center';
    if (item.created_at) {
        const dateObj = new Date(item.created_at);
        if (!isNaN(dateObj.getTime())) {
            tdDate.innerText = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        }
    }
    
    // 3. Commander Badge (with Opponent Avatar)
    const tdComm = document.createElement('td');
    const commEl = document.createElement('div');
    commEl.className = 'commander-clickable';
    
    // Lookup opponent avatar in the separate dictionary
    const cachedAvatar = opponentDirectory[item.commander_name];
    
    if (cachedAvatar) {
        const avImg = document.createElement('img');
        avImg.className = 'commander-avatar';
        avImg.src = cachedAvatar;
        commEl.appendChild(avImg);
    } else if (item.opponent_avatar) {
        // Backward compatibility
        const avImg = document.createElement('img');
        avImg.className = 'commander-avatar';
        avImg.src = item.opponent_avatar;
        commEl.appendChild(avImg);
    } else {
        // Fallback: first defender slot student icon
        const firstDefStudent = currentRoster.find(s => s.id === item.defense_team[0]);
        if (firstDefStudent && firstDefStudent.icon_path) {
            const avImg = document.createElement('img');
            avImg.className = 'commander-avatar';
            avImg.src = firstDefStudent.icon_path;
            commEl.appendChild(avImg);
        } else {
            const avPl = document.createElement('div');
            avPl.className = 'commander-avatar-placeholder';
            avPl.innerText = '?';
            commEl.appendChild(avPl);
        }
    }
    
    // Highlight commander badge if commander name matches active search term
    const searchInputEl = document.getElementById(`search-commander-${type}`);
    const searchVal = (searchInputEl?.value || '').trim().toLowerCase();
    const terms = searchVal.split(/[\s,，、]+/).filter(t => t.length > 0);
    const isCommanderMatched = terms.some(t => item.commander_name && item.commander_name.toLowerCase().includes(t));
    if (isCommanderMatched) {
        commEl.classList.add('search-highlight-commander');
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'commander-name-text';
    nameSpan.innerText = item.commander_name || 'Unknown';
    nameSpan.title = item.commander_name || 'Unknown';
    commEl.appendChild(nameSpan);
    
    commEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const opponentName = (item.commander_name || '').trim();
        if (!opponentName || opponentName === 'Unknown') return;

        const currentInput = document.getElementById(`search-commander-${type}`);
        const currentSearchVal = (currentInput?.value || '').trim();
        if (currentSearchVal === opponentName) {
            // すでに同じ名前で絞り込まれている場合はトグル解除
            syncSearchInput('', true);
        } else {
            // 対戦相手の名前で絞り込み
            syncSearchInput(opponentName, false);
        }
    });
    tdComm.appendChild(commEl);
    
    // 4. Attack Team
    const tdAttack = document.createElement('td');
    const attackRow = document.createElement('div');
    attackRow.className = 'team-icons-row';
    for (let i = 0; i < 6; i++) {
        const studentId = item.attack_team[i];
        const el = createStudentIconRowElement(studentId, i, 'attack', item, type);
        attackRow.appendChild(el);
    }
    tdAttack.appendChild(attackRow);
    
    // 5. VS separator
    const tdVs = document.createElement('td');
    const vsBadge = document.createElement('span');
    vsBadge.className = 'vs-text';
    vsBadge.innerText = 'VS';
    tdVs.appendChild(vsBadge);
    
    // 6. Defense Team
    const tdDefense = document.createElement('td');
    const defenseRow = document.createElement('div');
    defenseRow.className = 'team-icons-row';
    for (let i = 0; i < 6; i++) {
        const studentId = item.defense_team[i];
        const el = createStudentIconRowElement(studentId, i, 'defense', item, type);
        defenseRow.appendChild(el);
    }
    tdDefense.appendChild(defenseRow);
    
    // 7. Custom Tags
    const tdTags = document.createElement('td');
    tdTags.style.textAlign = 'center';
    
    const tagsWrapper = document.createElement('div');
    tagsWrapper.style.display = 'flex';
    tagsWrapper.style.gap = '4px';
    tagsWrapper.style.justifyContent = 'center';
    tagsWrapper.style.alignItems = 'center';
    
    const renderTag = (color, value) => {
        if (!color && !value) return null;
        const box = document.createElement('div');
        box.style.width = '20px';
        box.style.height = '20px';
        box.style.borderRadius = '3px';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.fontSize = '10px';
        box.style.fontWeight = 'bold';
        
        if (color === 'yellow') {
            box.style.background = '#ffe135';
            box.style.color = '#162435';
            box.style.border = 'none';
        } else if (color === 'blue') {
            box.style.background = '#8be2f8';
            box.style.color = '#162435';
            box.style.border = 'none';
        } else {
            box.style.background = 'transparent';
            box.style.border = '1px solid var(--border-color)';
            box.style.color = 'var(--text-primary)';
        }
        
        box.innerText = value || '';
        return box;
    };
    
    const b1 = renderTag(item.box1_color, item.box1_value);
    const b2 = renderTag(item.box2_color, item.box2_value);
    
    if (b1) tagsWrapper.appendChild(b1);
    if (b2) tagsWrapper.appendChild(b2);
    
    tdTags.appendChild(tagsWrapper);
    
    row.appendChild(tdResult);
    row.appendChild(tdUtility);
    row.appendChild(tdDate);
    row.appendChild(tdComm);
    row.appendChild(tdAttack);
    row.appendChild(tdVs);
    row.appendChild(tdDefense);
    row.appendChild(tdTags);
    
    return row;
}

function setupHistoryScrollListeners() {
    ['attack', 'defense'].forEach(type => {
        const wrapper = document.querySelector(`#tab-${type} .history-list-wrapper`);
        if (!wrapper) return;
        wrapper.addEventListener('scroll', () => {
            if (wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight < 200) {
                renderNextHistoryBatch(type, HISTORY_PAGE_SIZE);
            }
        }, { passive: true });
    });
}

function createStudentIconRowElement(studentId, index, team, item, type = 'attack') {
    const savedName = (team === 'attack') ? (item && item.attack_names && item.attack_names[index]) : (item && item.defense_names && item.defense_names[index]);
    
    // Look up student in current roster by Name first, then by ID
    let student = null;
    if (savedName && savedName !== '生徒' && savedName !== '未登録') {
        student = currentRoster.find(s => s.name === savedName);
    }
    if (!student && studentId) {
        student = currentRoster.find(s => s.id === studentId);
    }

    const studentName = (student && student.name) || savedName || '生徒';
    let el;

    // If student exists in Roster with an icon, render image
    if (student && student.icon_path) {
        const img = document.createElement('img');
        img.className = 'mini-icon';
        img.src = student.icon_path;
        img.title = studentName;
        el = img;
    } else {
        // Fallback: 4-character text badge
        const pl = document.createElement('div');
        pl.className = 'mini-icon placeholder text-badge';
        if (index >= 4) pl.classList.add('special');
        const label = (savedName && savedName !== '生徒' && savedName !== '未登録') 
            ? savedName.substring(0, 4) 
            : (index >= 4 ? 'Sp' : '生徒');
        pl.innerText = label;
        pl.title = studentName;
        el = pl;
    }
    
    // Add highlight class if this icon matches active position filter
    const effectiveFilter = getEffectivePositionFilter(type);
    if (effectiveFilter && effectiveFilter.team === team && effectiveFilter.studentName && effectiveFilter.studentName !== '生徒' && effectiveFilter.studentName !== '未登録') {
        const isSameStudent = (studentName === effectiveFilter.studentName);
        if (isSameStudent) {
            if (effectiveFilter.index >= 4) {
                if (index >= 4) {
                    el.classList.add('active-filter-icon');
                }
            } else if (effectiveFilter.index === index) {
                el.classList.add('active-filter-icon');
            }
        }
    }
    
    // Highlight if search term matches this student name
    const searchInputEl = document.getElementById(`search-commander-${type}`);
    const searchVal = (searchInputEl?.value || '').trim().toLowerCase();
    const terms = searchVal.split(/[\s,，、]+/).filter(t => t.length > 0);
    if (terms.length > 0) {
        const checkName = (student ? student.name : studentName).toLowerCase();
        const isStudentMatched = terms.some(t => checkName.includes(t));
        if (isStudentMatched) {
            el.classList.add('search-highlight-icon');
        }
    }
    
    // Filter on click
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!studentName || studentName === '生徒' || studentName === '未登録') return;
        
        const currentEffective = getEffectivePositionFilter(type);
        const isCurrentlyActive = currentEffective && 
            currentEffective.team === team && 
            currentEffective.studentName === studentName && 
            ((currentEffective.index >= 4 && index >= 4) || (currentEffective.index === index));
            
        if (isCurrentlyActive) {
            // Toggle off
            activePositionFilter = null;
        } else {
            activePositionFilter = { sourceTab: type, team, index, studentName };
        }
        updateHistoryView();
    });
    
    return el;
}

// Backfill historical battle records to guarantee independent snapshot preservation
async function backfillHistorySnapshots() {
    if (!currentHistory || currentHistory.length === 0) return;
    const db = await openDB();
    const itemsToUpdate = [];

    const isAllMigrated = localStorage.getItem('tactical_archive_migrated_all_to_attack_v1124');

    for (const item of currentHistory) {
        let itemUpdated = false;
        
        // ユーザー指示: 既存の戦績データは全て攻撃編成とする
        if (!isAllMigrated) {
            if (item.battle_type !== 'attack') {
                item.battle_type = 'attack';
                itemUpdated = true;
            }
        } else {
            if (!item.battle_type) {
                item.battle_type = 'attack';
                itemUpdated = true;
            }
        }

        if (!item.attack_names || item.attack_names.length < 6) {
            item.attack_names = (item.attack_team || []).map(id => {
                const s = currentRoster.find(r => r.id === id);
                return s ? s.name : '生徒';
            });
            itemUpdated = true;
        }
        if (!item.defense_names || item.defense_names.length < 6) {
            item.defense_names = (item.defense_team || []).map(id => {
                const s = currentRoster.find(r => r.id === id);
                return s ? s.name : '生徒';
            });
            itemUpdated = true;
        }
        if (!item.attack_icons || item.attack_icons.length < 6) {
            item.attack_icons = (item.attack_team || []).map((id, idx) => {
                const name = item.attack_names && item.attack_names[idx];
                const s = (name && name !== '生徒' && name !== '未登録' ? currentRoster.find(r => r.name === name) : null) || currentRoster.find(r => r.id === id);
                return s ? (s.icon_path || '') : '';
            });
            itemUpdated = true;
        }
        if (!item.defense_icons || item.defense_icons.length < 6) {
            item.defense_icons = (item.defense_team || []).map((id, idx) => {
                const name = item.defense_names && item.defense_names[idx];
                const s = (name && name !== '生徒' && name !== '未登録' ? currentRoster.find(r => r.name === name) : null) || currentRoster.find(r => r.id === id);
                return s ? (s.icon_path || '') : '';
            });
            itemUpdated = true;
        }

        // Restore missing icon snapshots from current roster whenever student exists in roster
        for (let i = 0; i < 6; i++) {
            if (!item.attack_icons[i] && item.attack_names && item.attack_names[i]) {
                const s = currentRoster.find(r => r.name === item.attack_names[i]);
                if (s && s.icon_path) {
                    item.attack_icons[i] = s.icon_path;
                    itemUpdated = true;
                }
            }
            if (!item.defense_icons[i] && item.defense_names && item.defense_names[i]) {
                const s = currentRoster.find(r => r.name === item.defense_names[i]);
                if (s && s.icon_path) {
                    item.defense_icons[i] = s.icon_path;
                    itemUpdated = true;
                }
            }
        }

        if (itemUpdated) {
            itemsToUpdate.push(item);
        }
    }

    if (itemsToUpdate.length > 0) {
        await new Promise((res) => {
            const tx = db.transaction('battle_history', 'readwrite');
            const store = tx.objectStore('battle_history');
            for (const item of itemsToUpdate) {
                store.put(item);
            }
            tx.oncomplete = res;
            tx.onerror = res;
        });
        currentHistory = await getHistory();
        updateHistoryView();
    }
    localStorage.setItem('tactical_archive_migrated_all_to_attack_v1124', 'true');
}

// ==========================================
// BACKUP & RESTORE WITH ITEM SELECTION
// ==========================================

const backupModal = document.getElementById('backup-modal');
const btnBackupClose = document.getElementById('btn-backup-close');
const btnBackupCancel = document.getElementById('btn-backup-cancel');
const btnBackupSelectAll = document.getElementById('btn-backup-select-all');
const btnBackupDeselectAll = document.getElementById('btn-backup-deselect-all');
const btnBackupExecute = document.getElementById('btn-backup-execute');

const chkBackupHistory = document.getElementById('backup-chk-history');
const chkBackupRoster = document.getElementById('backup-chk-roster');
const chkBackupCalibration = document.getElementById('backup-chk-calibration');
const chkBackupOpponents = document.getElementById('backup-chk-opponents');
const previewBackupFilename = document.getElementById('backup-preview-filename');

function updateBackupFilenamePreview() {
    if (!previewBackupFilename) return;
    const isHistory = chkBackupHistory.checked;
    const isRoster = chkBackupRoster.checked;
    const isCalibration = chkBackupCalibration.checked;
    const isOpponents = chkBackupOpponents.checked;

    const parts = [];
    if (isHistory && isRoster && isCalibration && isOpponents) {
        parts.push('Full');
    } else {
        if (isHistory) parts.push('戦闘履歴');
        if (isRoster) parts.push('生徒図鑑');
        if (isCalibration) parts.push('トリミング領域設定');
        if (isOpponents) parts.push('修正辞書');
    }

    if (parts.length === 0) {
        previewBackupFilename.innerText = '（項目が選択されていません）';
        btnBackupExecute.disabled = true;
        btnBackupExecute.style.opacity = '0.5';
        return;
    }
    btnBackupExecute.disabled = false;
    btnBackupExecute.style.opacity = '1';

    const now = new Date();
    const dStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    previewBackupFilename.innerText = `TacticalArchive_${parts.join('_')}_${dStr}.json`;
}

async function openBackupModal() {
    const db = await openDB();
    const getStoreCount = (storeName) => {
        return new Promise((resolve) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
    };

    const historyCount = await getStoreCount('battle_history');
    const rosterCount = await getStoreCount('roster_students');
    const calProfiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
    const calCount = Object.keys(calProfiles).length;
    const oppCount = Object.keys(opponentDirectory).length;
    const renameCount = opponentRenames.length;

    const elHist = document.getElementById('backup-count-history');
    const elRost = document.getElementById('backup-count-roster');
    const elCal = document.getElementById('backup-count-calibration');
    const elOpp = document.getElementById('backup-count-opponents');

    if (elHist) elHist.innerText = `(${historyCount}件)`;
    if (elRost) elRost.innerText = `(${rosterCount}件)`;
    if (elCal) elCal.innerText = `(${calCount}件)`;
    if (elOpp) elOpp.innerText = `(アイコン:${oppCount}件 / リネーム:${renameCount}件)`;

    chkBackupHistory.checked = true;
    chkBackupRoster.checked = true;
    chkBackupCalibration.checked = true;
    chkBackupOpponents.checked = true;

    updateBackupFilenamePreview();
    backupModal.classList.add('active');
}

async function executeBackup() {
    const isHistory = chkBackupHistory.checked;
    const isRoster = chkBackupRoster.checked;
    const isCalibration = chkBackupCalibration.checked;
    const isOpponents = chkBackupOpponents.checked;

    if (!isHistory && !isRoster && !isCalibration && !isOpponents) {
        alert('バックアップする項目を1つ以上選択してください。');
        return;
    }

    const filename = previewBackupFilename.innerText;

    // 1. Ensure opponent avatars are migrated into opponent_directory (1 avatar per opponent)
    await migrateOpponentAvatars();

    const db = await openDB();
    const getStoreData = (storeName) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    };

    const backupData = {
        version: 2,
        created_at: new Date().toISOString(),
        included_sections: {
            history: isHistory,
            roster: isRoster,
            calibration: isCalibration,
            opponents: isOpponents
        }
    };

    if (isRoster) {
        backupData.roster_students = await getStoreData('roster_students');
    }

    if (isHistory) {
        const rawHistory = await getStoreData('battle_history');
        // Build set of registered students from roster to strip redundant base64 snapshot images
        const roster = currentRoster || (await getStudents());
        const rosterSet = new Set();
        roster.forEach(s => {
            if (s.name) rosterSet.add(s.name);
            if (s.id) rosterSet.add(s.id);
        });

        // Optimize history records:
        // - Strip duplicate opponent_avatar (stored once in opponent_directory)
        // - Strip duplicate student icon base64 for registered students (huge 95% size reduction)
        backupData.battle_history = rawHistory.map(item => {
            const cleaned = { ...item };
            cleaned.opponent_avatar = null;

            if (Array.isArray(cleaned.attack_icons)) {
                cleaned.attack_icons = cleaned.attack_icons.map((icon, idx) => {
                    const sName = cleaned.attack_names && cleaned.attack_names[idx];
                    const sId = cleaned.attack_team && cleaned.attack_team[idx];
                    const isRegistered = (sName && rosterSet.has(sName)) || (sId && rosterSet.has(sId));
                    return isRegistered ? "" : (icon || "");
                });
            }
            if (Array.isArray(cleaned.defense_icons)) {
                cleaned.defense_icons = cleaned.defense_icons.map((icon, idx) => {
                    const sName = cleaned.defense_names && cleaned.defense_names[idx];
                    const sId = cleaned.defense_team && cleaned.defense_team[idx];
                    const isRegistered = (sName && rosterSet.has(sName)) || (sId && rosterSet.has(sId));
                    return isRegistered ? "" : (icon || "");
                });
            }
            return cleaned;
        });
    }

    if (isCalibration) {
        backupData.calibration_profiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
    }

    if (isOpponents) {
        backupData.opponent_directory = await getStoreData('opponent_directory');
        backupData.opponent_renames = await getStoreData('opponent_renames');
    }

    // Compact JSON (no indent whitespace) to prevent OutOfMemory crashes
    const jsonStr = JSON.stringify(backupData);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    if (window.AndroidApp && typeof window.AndroidApp.saveTextFile === 'function') {
        const res = window.AndroidApp.saveTextFile(jsonStr, filename);
        if (res === "SUCCESS") {
            backupModal.classList.remove('active');
            alert(`バックアップファイル「${filename}」を端末の【ダウンロード (Download)】フォルダに保存しました！`);
        } else {
            alert(`バックアップ保存に失敗しました: ${res}`);
        }
    } else if (window.AndroidApp && typeof window.AndroidApp.saveFile === 'function') {
        const reader = new FileReader();
        reader.onloadend = function() {
            const base64Data = reader.result.split(',')[1];
            const res = window.AndroidApp.saveFile(base64Data, filename);
            if (res === "SUCCESS" || res === undefined || res === true) {
                backupModal.classList.remove('active');
                alert(`バックアップファイル「${filename}」を端末の【ダウンロード (Download)】フォルダに保存しました！`);
            } else {
                alert(`バックアップ保存に失敗しました: ${res}`);
            }
        };
        reader.readAsDataURL(blob);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        backupModal.classList.remove('active');
        alert(`バックアップファイル「${filename}」をダウンロードしました。`);
    }
}

// Restore Modal Logic
let pendingRestoreData = null;
const restoreModal = document.getElementById('restore-modal');
const restoreDetectedList = document.getElementById('restore-detected-list');
const btnRestoreClose = document.getElementById('btn-restore-close');
const btnRestoreCancel = document.getElementById('btn-restore-cancel');
const btnRestoreExecute = document.getElementById('btn-restore-execute');
const dbRestoreInput = document.getElementById('db-restore-input');

function openRestoreFilePicker() {
    dbRestoreInput.value = '';
    dbRestoreInput.click();
}

dbRestoreInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (re) => {
        try {
            const data = JSON.parse(re.target.result);
            if (!data || (data.version === undefined && !data.battle_history && !data.roster_students)) {
                alert('無効なバックアップファイルです。ファイル構造が正しくありません。');
                return;
            }

            pendingRestoreData = data;
            renderRestoreDetectedList(data);
            restoreModal.classList.add('active');
        } catch (err) {
            alert('JSONファイルの解析に失敗しました: ' + err.message);
        }
    };
    reader.readAsText(file);
});

function renderRestoreDetectedList(data) {
    restoreDetectedList.innerHTML = '';

    const hasHistory = Array.isArray(data.battle_history) && data.battle_history.length > 0;
    const hasRoster = Array.isArray(data.roster_students) && data.roster_students.length > 0;
    const hasCalibration = data.calibration_profiles && Object.keys(data.calibration_profiles).length > 0;
    const hasOpponents = (Array.isArray(data.opponent_directory) && data.opponent_directory.length > 0) || (Array.isArray(data.opponent_renames) && data.opponent_renames.length > 0);

    const items = [
        { key: 'history', title: '戦闘履歴', count: hasHistory ? `${data.battle_history.length}件` : 'なし', available: hasHistory },
        { key: 'roster', title: '生徒図鑑', count: hasRoster ? `${data.roster_students.length}人` : 'なし', available: hasRoster },
        { key: 'calibration', title: 'トリミング領域設定', count: hasCalibration ? `${Object.keys(data.calibration_profiles).length}件` : 'なし', available: hasCalibration },
        { key: 'opponents', title: '対戦相手名　修正辞書', count: hasOpponents ? `相手:${(data.opponent_directory||[]).length}件 / リネーム:${(data.opponent_renames||[]).length}件` : 'なし', available: hasOpponents }
    ];

    items.forEach(item => {
        const lbl = document.createElement('label');
        lbl.style.display = 'flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '8px';
        lbl.style.cursor = item.available ? 'pointer' : 'not-allowed';
        lbl.style.opacity = item.available ? '1' : '0.4';
        lbl.style.fontSize = '12px';
        lbl.style.color = 'var(--text-primary)';

        lbl.innerHTML = `
            <input type="checkbox" id="restore-chk-${item.key}" ${item.available ? 'checked' : 'disabled'} style="margin: 0; accent-color: var(--color-blue); width: 15px; height: 15px;">
            <span style="font-weight: 700;">${item.title} <span style="color: ${item.available ? 'var(--color-blue)' : 'var(--text-muted)'}; font-size: 11px; font-weight: normal;">(${item.count})</span></span>
        `;
        restoreDetectedList.appendChild(lbl);
    });
}

async function executeRestore() {
    if (!pendingRestoreData) return;

    const chkHistory = document.getElementById('restore-chk-history');
    const chkRoster = document.getElementById('restore-chk-roster');
    const chkCalibration = document.getElementById('restore-chk-calibration');
    const chkOpponents = document.getElementById('restore-chk-opponents');

    const doHistory = chkHistory && chkHistory.checked && Array.isArray(pendingRestoreData.battle_history);
    const doRoster = chkRoster && chkRoster.checked && Array.isArray(pendingRestoreData.roster_students);
    const doCalibration = chkCalibration && chkCalibration.checked && pendingRestoreData.calibration_profiles;
    const doOpponents = chkOpponents && chkOpponents.checked;

    if (!doHistory && !doRoster && !doCalibration && !doOpponents) {
        alert('復元する項目を1つ以上選択してください。');
        return;
    }

    const mode = document.querySelector('input[name="restore-mode"]:checked')?.value || 'merge';
    const db = await openDB();

    const restoreStore = (storeName, items, isOverwrite) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            const writeItems = () => {
                if (!items || items.length === 0) {
                    resolve();
                    return;
                }
                let count = 0;
                let errOccurred = false;
                items.forEach(item => {
                    const req = store.put(item);
                    req.onsuccess = () => {
                        count++;
                        if (count === items.length && !errOccurred) resolve();
                    };
                    req.onerror = (err) => {
                        errOccurred = true;
                        reject(err);
                    };
                });
            };

            if (isOverwrite) {
                const clearReq = store.clear();
                clearReq.onsuccess = writeItems;
                clearReq.onerror = (err) => reject(err);
            } else {
                writeItems();
            }
        });
    };

    try {
        if (doHistory) {
            await restoreStore('battle_history', pendingRestoreData.battle_history, mode === 'overwrite');
        }
        if (doRoster) {
            await restoreStore('roster_students', pendingRestoreData.roster_students, mode === 'overwrite');
        }
        if (doOpponents) {
            if (pendingRestoreData.opponent_directory) {
                await restoreStore('opponent_directory', pendingRestoreData.opponent_directory, mode === 'overwrite');
            }
            if (pendingRestoreData.opponent_renames) {
                await restoreStore('opponent_renames', pendingRestoreData.opponent_renames, mode === 'overwrite');
            }
        }
        if (doCalibration) {
            if (mode === 'overwrite') {
                localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(pendingRestoreData.calibration_profiles));
            } else {
                const cur = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
                Object.assign(cur, pendingRestoreData.calibration_profiles);
                localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(cur));
            }
        }

        // Refresh all in-memory caches
        currentRoster = await getStudents();
        currentHistory = await getHistory();
        opponentDirectory = await getOpponents();
        opponentRenames = await getRenames();

        await backfillHistorySnapshots();

        updateRosterView();
        updateHistoryView();

        restoreModal.classList.remove('active');
        pendingRestoreData = null;
        alert('選択した項目の復元が正常に完了しました！');
    } catch (e) {
        console.error('Restore execution failed:', e);
        alert('復元中にエラーが発生しました: ' + e.message);
    }
}

// Cancel ongoing screenshot scanning / upload process
function cancelOngoingUpload() {
    isScanCancelled = true;
    uploadQueue = [];
    currentUploadData = null;
    currentUploadFile = null;
    currentUploadExtractedDate = null;
    
    // Hide scanner and modals
    if (scannerScreen) scannerScreen.style.display = 'none';
    if (cropInspectorModal) cropInspectorModal.classList.remove('active');
    if (reviewModal) reviewModal.classList.remove('active');
    const bulkRosterModal = document.getElementById('bulk-roster-modal');
    if (bulkRosterModal) bulkRosterModal.classList.remove('active');
    
    // Restore dropzone & inputs
    if (dropZone) dropZone.style.display = 'flex';
    if (fileInput) fileInput.value = '';
    const bulkRosterInput = document.getElementById('bulk-roster-input');
    if (bulkRosterInput) bulkRosterInput.value = '';
    
    showInspectorToast('画像の取り込みをキャンセルしました');
}

// ==========================================
// DATA DELETION / CLEAR WITH ITEM SELECTION
// ==========================================

const deleteModal = document.getElementById('delete-modal');
const btnDeleteClose = document.getElementById('btn-delete-close');
const btnDeleteCancel = document.getElementById('btn-delete-cancel');
const btnDeleteSelectAll = document.getElementById('btn-delete-select-all');
const btnDeleteDeselectAll = document.getElementById('btn-delete-deselect-all');
const btnDeleteExecute = document.getElementById('btn-delete-execute');

const chkDeleteHistory = document.getElementById('delete-chk-history');
const chkDeleteRoster = document.getElementById('delete-chk-roster');
const chkDeleteCalibration = document.getElementById('delete-chk-calibration');
const chkDeleteOpponents = document.getElementById('delete-chk-opponents');

async function openDeleteModal() {
    const db = await openDB();
    const getStoreCount = (storeName) => {
        return new Promise((resolve) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
    };

    const historyCount = await getStoreCount('battle_history');
    const rosterCount = await getStoreCount('roster_students');
    const calProfiles = JSON.parse(localStorage.getItem('tactical_archive_calibration_profiles') || '{}');
    const calCount = Object.keys(calProfiles).length;
    const oppCount = Object.keys(opponentDirectory).length;
    const renameCount = opponentRenames.length;

    const elHist = document.getElementById('delete-count-history');
    const elRost = document.getElementById('delete-count-roster');
    const elCal = document.getElementById('delete-count-calibration');
    const elOpp = document.getElementById('delete-count-opponents');

    if (elHist) elHist.innerText = `(${historyCount}件)`;
    if (elRost) elRost.innerText = `(${rosterCount}件)`;
    if (elCal) elCal.innerText = `(${calCount}件)`;
    if (elOpp) elOpp.innerText = `(アイコン:${oppCount}件 / リネーム:${renameCount}件)`;

    if (chkDeleteHistory) chkDeleteHistory.checked = false;
    if (chkDeleteRoster) chkDeleteRoster.checked = false;
    if (chkDeleteCalibration) chkDeleteCalibration.checked = false;
    if (chkDeleteOpponents) chkDeleteOpponents.checked = false;

    deleteModal.classList.add('active');
}

async function executeDelete() {
    const isHistory = chkDeleteHistory && chkDeleteHistory.checked;
    const isRoster = chkDeleteRoster && chkDeleteRoster.checked;
    const isCalibration = chkDeleteCalibration && chkDeleteCalibration.checked;
    const isOpponents = chkDeleteOpponents && chkDeleteOpponents.checked;

    if (!isHistory && !isRoster && !isCalibration && !isOpponents) {
        alert('削除する項目を1つ以上選択してください。');
        return;
    }

    const items = [];
    if (isHistory) items.push('戦闘履歴');
    if (isRoster) items.push('生徒図鑑');
    if (isCalibration) items.push('トリミング領域設定');
    if (isOpponents) items.push('対戦相手名　修正辞書');

    if (!confirm(`【最終確認】以下のデータを完全に消去・初期化します。\n・${items.join('\n・')}\n\nこの操作は元に戻せません。本当に削除を実行しますか？`)) {
        return;
    }

    const db = await openDB();
    const clearStore = (storeName) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = (err) => reject(err);
        });
    };

    try {
        if (isHistory) {
            await clearStore('battle_history');
        }
        if (isRoster) {
            await clearStore('roster_students');
            // Clean embedded base64 icon data from battle_history to reclaim storage space
            const allHist = await getHistory();
            if (allHist && allHist.length > 0) {
                const histTx = db.transaction('battle_history', 'readwrite');
                const histStore = histTx.objectStore('battle_history');
                for (const item of allHist) {
                    item.attack_icons = [];
                    item.defense_icons = [];
                    histStore.put(item);
                }
            }
        }
        if (isOpponents) {
            await clearStore('opponent_directory');
            await clearStore('opponent_renames');
        }
        if (isCalibration) {
            localStorage.removeItem('tactical_archive_calibration_profiles');
            localStorage.removeItem('tactical_archive_first_launch_done');
        }

        // Refresh caches
        currentRoster = await getStudents();
        currentHistory = await getHistory();
        opponentDirectory = await getOpponents();
        opponentRenames = await getRenames();

        updateRosterView();
        updateHistoryView();

        deleteModal.classList.remove('active');
        alert('選択した項目の削除・初期化が完了しました。');
    } catch (e) {
        console.error('Delete execution failed:', e);
        alert('データ削除中にエラーが発生しました: ' + e.message);
    }
}

function updateBoxDisplay(modalType, boxIndex, color, value) {
    const boxEl = document.getElementById(`${modalType}-box${boxIndex}`);
    if (!boxEl) return;
    
    // Clear styles
    boxEl.style.background = 'transparent';
    boxEl.style.border = '1px solid var(--border-color)';
    boxEl.style.color = 'var(--text-primary)';
    boxEl.innerText = '';
    
    if (color === 'yellow') {
        boxEl.style.background = '#ffe135';
        boxEl.style.color = '#162435';
        boxEl.style.border = 'none';
    } else if (color === 'blue') {
        boxEl.style.background = '#8be2f8';
        boxEl.style.color = '#162435';
        boxEl.style.border = 'none';
    }
    
    if (value) {
        boxEl.innerText = value;
    }
}

// ==========================================
// STUDENT NAME AUTOCOMPLETE (Furigana / Prefix Match)
// ==========================================
function setupStudentAutocomplete() {
    const nameInput = document.getElementById('add-student-name');
    const listEl = document.getElementById('student-autocomplete-list');
    const hintEl = document.getElementById('autocomplete-count-hint');
    if (!nameInput || !listEl) return;

    nameInput.addEventListener('input', () => {
        const query = nameInput.value.trim();
        if (!query) {
            listEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); padding: 4px;">生徒名を入力すると前方一致で候補が表示されます</span>';
            if (hintEl) hintEl.innerText = '';
            return;
        }

        if (typeof STUDENT_MASTER_LIST === 'undefined' || !Array.isArray(STUDENT_MASTER_LIST)) {
            listEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); padding: 4px;">辞書データを読み込み中...</span>';
            return;
        }

        const queryHira = toHiragana(query.toLowerCase());
        const queryKata = toKatakana(query);

        // Filter master dictionary by prefix match (前方一致)
        const matches = STUDENT_MASTER_LIST.filter(item => {
            const itemHira = toHiragana(item.reading.toLowerCase());
            const itemKata = toKatakana(item.name);
            return itemHira.includes(queryHira) || 
                   itemKata.includes(queryKata) || 
                   item.name.includes(query) ||
                   item.reading.includes(query);
        }).sort((a, b) => {
            const aHira = toHiragana(a.reading.toLowerCase());
            const bHira = toHiragana(b.reading.toLowerCase());
            const aStarts = aHira.startsWith(queryHira) || a.name.startsWith(query);
            const bStarts = bHira.startsWith(queryHira) || b.name.startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });

        listEl.innerHTML = '';
        if (matches.length === 0) {
            listEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); padding: 4px;">該当する候補はありません (新規の名前としてそのまま登録可能)</span>';
            if (hintEl) hintEl.innerText = '0件';
            return;
        }

        if (hintEl) hintEl.innerText = `${matches.length}件`;
        matches.slice(0, 30).forEach(m => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'autocomplete-chip';
            chip.innerText = m.name;
            chip.addEventListener('click', () => {
                nameInput.value = m.name;
                listEl.innerHTML = `<span style="font-size: 11px; color: #00e676; padding: 4px;"><i class="fa-solid fa-check"></i> 「${m.name}」を選択しました</span>`;
                if (hintEl) hintEl.innerText = '';
            });
            listEl.appendChild(chip);
        });
    });
}

// ==========================================
// BULK ROSTER & RENAME DICTIONARY FEATURES
// ==========================================
// Helper to safely load an Image element from a File object
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("画像のデコードに失敗しました: " + file.name));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました: " + file.name));
        reader.readAsDataURL(file);
    });
}

let bulkRosterQueue = [];
let currentBulkRosterIndex = 0;
let bulkProcessedStudents = new Set();
let bulkSavedCount = 0;

function initBulkFeatures() {
    // --- 1. BULK ROSTER (生徒図鑑(Roster) 一括登録) ---
    const bulkRosterModal = document.getElementById('bulk-roster-modal');
    const btnBulkRoster = document.getElementById('btn-bulk-roster');
    const bulkRosterInput = document.getElementById('bulk-roster-input');
    const btnBulkRosterClose = document.getElementById('btn-bulk-roster-close');
    const bulkRosterStepBadge = document.getElementById('bulk-roster-step-badge');
    const bulkRosterRemainingBadge = document.getElementById('bulk-roster-remaining-badge');
    const bulkRosterStepBody = document.getElementById('bulk-roster-step-body');

    if (btnBulkRoster && bulkRosterInput) {
        btnBulkRoster.addEventListener('click', () => {
            bulkRosterInput.value = '';
            bulkRosterInput.click();
        });

        bulkRosterInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;

            bulkRosterQueue = [];
            currentBulkRosterIndex = 0;
            bulkProcessedStudents = new Set();
            bulkSavedCount = 0;

            // Open bulk modal immediately with clear extraction progress inside
            if (bulkRosterModal) bulkRosterModal.classList.add('active');
            if (bulkRosterStepBadge) bulkRosterStepBadge.innerText = `画像を解析中 (0/${files.length})`;
            if (bulkRosterRemainingBadge) bulkRosterRemainingBadge.innerText = `準備中...`;
            if (bulkRosterStepBody) {
                bulkRosterStepBody.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; gap: 12px;">
                        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; color: #00a3ff;"></i>
                        <span id="bulk-roster-loading-text" style="font-size: 13px; font-weight: bold; color: var(--text-primary);">スクショから生徒スロットを高速抽出中...</span>
                    </div>
                `;
            }

            try {
                if (!currentRoster || !Array.isArray(currentRoster)) {
                    currentRoster = (await getStudents()) || [];
                }

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const loadingText = document.getElementById('bulk-roster-loading-text');
                    if (loadingText) {
                        loadingText.innerText = `スクショを解析中 (${i + 1}/${files.length}): ${file.name}`;
                    }

                    const img = await loadImageFromFile(file);
                    const { profile } = getOrComputeCalibrationProfile(img, null);
                    if (!profile || !profile.modalBox) continue;

                    const normW = profile.normalizedWidth || 2400;
                    const normH = profile.normalizedHeight || 1040;
                    const procCanvas = document.createElement('canvas');
                    procCanvas.width = normW;
                    procCanvas.height = normH;
                    const pctx = procCanvas.getContext('2d');
                    pctx.drawImage(
                        img,
                        profile.modalBox.x, profile.modalBox.y, profile.modalBox.w, profile.modalBox.h,
                        0, 0, normW, normH
                    );

                    const cardTop = profile.cardTop || 858;
                    const cardHeight = profile.cardSize || 88;
                    const faceSize = Math.round(cardHeight * 0.84);
                    const faceOffset = Math.round((cardHeight - faceSize) / 2);

                    // 1. Attackers A1 ~ A6
                    const atkCenters = profile.atkCenters || [215, 360, 505, 650, 795, 940];
                    for (let aIdx = 0; aIdx < atkCenters.length; aIdx++) {
                        const cx = atkCenters[aIdx];
                        // Crop exactly matching the calibrated red-box position
                        const iconCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
                        const faceFeatures = extractFeaturesFromCanvas(cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70));
                        const matchRes = matchStudent(faceFeatures, currentRoster);

                        bulkRosterQueue.push({
                            fileIndex: i + 1,
                            totalFiles: files.length,
                            slotName: `A${aIdx + 1}`,
                            slotDesc: `攻撃${aIdx + 1}`,
                            filename: file.name,
                            iconDataUrl: iconCanvas.toDataURL(),
                            faceFeatures: faceFeatures,
                            matchedStudent: matchRes.student,
                            similarity: matchRes.similarity || 0
                        });
                    }

                    // 2. Defenders D1 ~ D6
                    const defCenters = profile.defCenters || [1460, 1605, 1750, 1895, 2040, 2185];
                    for (let dIdx = 0; dIdx < defCenters.length; dIdx++) {
                        const cx = defCenters[dIdx];
                        // Crop exactly matching the calibrated red-box position
                        const iconCanvas = cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 100, 100);
                        const faceFeatures = extractFeaturesFromCanvas(cropImage(procCanvas, cx - faceSize / 2, cardTop + faceOffset, faceSize, faceSize, 70, 70));
                        const matchRes = matchStudent(faceFeatures, currentRoster);

                        bulkRosterQueue.push({
                            fileIndex: i + 1,
                            totalFiles: files.length,
                            slotName: `D${dIdx + 1}`,
                            slotDesc: `防御${dIdx + 1}`,
                            filename: file.name,
                            iconDataUrl: iconCanvas.toDataURL(),
                            faceFeatures: faceFeatures,
                            matchedStudent: matchRes.student,
                            similarity: matchRes.similarity || 0
                        });
                    }
                }

                if (bulkRosterQueue.length === 0) {
                    if (bulkRosterModal) bulkRosterModal.classList.remove('active');
                    alert('スロット画像を抽出できませんでした。画像を確認してください。');
                    return;
                }

                // Start interactive step-by-step review
                showNextBulkRosterStep();

            } catch (err) {
                console.error("Bulk extraction error:", err);
                if (bulkRosterModal) bulkRosterModal.classList.remove('active');
                alert("画像抽出中にエラーが発生しました: " + (err.message || err));
            } finally {
                bulkRosterInput.value = '';
            }
        });
    }

    if (btnBulkRosterClose) {
        btnBulkRosterClose.addEventListener('click', async () => {
            if (bulkRosterModal) bulkRosterModal.classList.remove('active');
            currentRoster = await getStudents();
            updateRosterView();
            updateHistoryView();
        });
    }

    // Helper: Register or overwrite student and dynamically re-match all remaining slots
    async function registerStudentInBulk(studentName, slot) {
        const studentData = {
            name: studentName,
            icon_path: slot.iconDataUrl,
            features: [slot.faceFeatures]
        };
        await addOrUpdateStudent(studentData);

        bulkProcessedStudents.add(studentName);
        bulkSavedCount++;

        // Update in-memory roster immediately
        const existingIdx = currentRoster.findIndex(s => s.name === studentName);
        if (existingIdx >= 0) {
            currentRoster[existingIdx].icon_path = slot.iconDataUrl;
            if (!currentRoster[existingIdx].features) currentRoster[existingIdx].features = [];
            currentRoster[existingIdx].features.push(slot.faceFeatures);
        } else {
            currentRoster.push({
                id: Date.now(),
                name: studentName,
                icon_path: slot.iconDataUrl,
                features: [slot.faceFeatures]
            });
        }

        // Dynamically re-evaluate all remaining slots in the queue against updated roster
        for (let k = currentBulkRosterIndex + 1; k < bulkRosterQueue.length; k++) {
            const nextSlot = bulkRosterQueue[k];
            if (!nextSlot.matchedStudent || nextSlot.similarity < 0.85) {
                const reMatch = matchStudent(nextSlot.faceFeatures, currentRoster);
                if (reMatch.student && reMatch.similarity >= 0.70) {
                    nextSlot.matchedStudent = reMatch.student;
                    nextSlot.similarity = reMatch.similarity;
                }
            }
        }
    }

    function showNextBulkRosterStep() {
        if (!bulkRosterModal || !bulkRosterStepBody) return;

        // Auto-skip slots if this student was already processed/overwritten earlier in this session
        while (currentBulkRosterIndex < bulkRosterQueue.length) {
            const slot = bulkRosterQueue[currentBulkRosterIndex];
            
            // 1. Direct matched student check
            if (slot.matchedStudent && slot.similarity >= 0.75 && bulkProcessedStudents.has(slot.matchedStudent.name)) {
                currentBulkRosterIndex++;
                continue;
            }

            // 2. Live feature check against current roster (in case student was added in previous slot)
            const liveMatch = matchStudent(slot.faceFeatures, currentRoster);
            if (liveMatch.student && liveMatch.similarity >= 0.78 && bulkProcessedStudents.has(liveMatch.student.name)) {
                currentBulkRosterIndex++;
                continue;
            }

            break;
        }

        // All slots finished
        if (currentBulkRosterIndex >= bulkRosterQueue.length) {
            if (bulkRosterModal) bulkRosterModal.classList.remove('active');
            getStudents().then(r => {
                currentRoster = r;
                updateRosterView();
                updateHistoryView();
            });
            alert(`すべてのスロットの確認・上書き登録が完了しました！（更新/登録: ${bulkSavedCount}件）`);
            return;
        }

        const slot = bulkRosterQueue[currentBulkRosterIndex];
        const remaining = bulkRosterQueue.length - currentBulkRosterIndex;

        if (bulkRosterStepBadge) {
            bulkRosterStepBadge.innerText = `[${slot.fileIndex}枚目 / ${slot.totalFiles}枚] ${slot.slotName} (${slot.slotDesc})`;
        }
        if (bulkRosterRemainingBadge) {
            bulkRosterRemainingBadge.innerText = `残り: ${remaining}件 (更新: ${bulkSavedCount}件)`;
        }

        bulkRosterStepBody.innerHTML = '';

        // Check if there is a match in live roster
        let activeMatchStudent = slot.matchedStudent;
        let activeMatchSim = slot.similarity || 0;
        if (!activeMatchStudent || activeMatchSim < 0.70) {
            const liveCheck = matchStudent(slot.faceFeatures, currentRoster);
            if (liveCheck.student && liveCheck.similarity >= 0.70) {
                activeMatchStudent = liveCheck.student;
                activeMatchSim = liveCheck.similarity;
            }
        }

        const isMatch = (activeMatchStudent && activeMatchSim >= 0.70);

        if (isMatch) {
            // MATCH FOUND: 2-Column Comparison
            const compBox = document.createElement('div');
            compBox.style.cssText = 'display: flex; align-items: center; justify-content: space-around; background: #f8fafc; border: 1.5px solid var(--border-color); border-radius: 8px; padding: 8px 12px; gap: 8px;';

            // Left (Newly Cropped Icon)
            const leftCol = document.createElement('div');
            leftCol.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 2px; width: 120px;';
            leftCol.innerHTML = `
                <span style="font-size: 10px; font-weight: bold; color: #0077ff;">${slot.slotName} (${slot.slotDesc}) 新規</span>
                <img src="${slot.iconDataUrl}" style="width: 52px; height: 52px; border-radius: 6px; border: 1.5px solid #00a3ff; object-fit: cover;">
                <span style="font-size: 8.5px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 115px;">${slot.filename}</span>
            `;

            // Arrow
            const arrowCol = document.createElement('div');
            arrowCol.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 2px;';
            arrowCol.innerHTML = `
                <i class="fa-solid fa-arrow-right" style="font-size: 16px; color: var(--color-blue);"></i>
                <span style="font-size: 9px; font-weight: bold; color: #047857; background: rgba(0, 230, 118, 0.15); padding: 1px 5px; border-radius: 4px;">一致度 ${Math.round(activeMatchSim * 100)}%</span>
            `;

            // Right (Existing Roster Student)
            const rightCol = document.createElement('div');
            rightCol.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 2px; width: 120px;';
            rightCol.innerHTML = `
                <span style="font-size: 10px; font-weight: bold; color: var(--text-primary);">辞書登録中の生徒</span>
                <img src="${activeMatchStudent.icon_path || ''}" style="width: 52px; height: 52px; border-radius: 6px; border: 1.5px solid var(--border-color); object-fit: cover; background: #e2e8f0;">
                <span style="font-size: 11px; font-weight: 800; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 115px;">${activeMatchStudent.name}</span>
            `;

            compBox.appendChild(leftCol);
            compBox.appendChild(arrowCol);
            compBox.appendChild(rightCol);

            // Action Buttons
            const actContainer = document.createElement('div');
            actContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 8px;';

            const btnOverwrite = document.createElement('button');
            btnOverwrite.type = 'button';
            btnOverwrite.className = 'btn-primary';
            btnOverwrite.style.cssText = 'flex: 2; height: 34px; font-size: 12px; font-weight: 700; background: #00e676; border: 1.5px solid #00e676; color: #000; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; box-sizing: border-box; margin: 0; line-height: 1;';
            btnOverwrite.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> アイコンデータ上書き (次へ)';
            btnOverwrite.addEventListener('click', async () => {
                btnOverwrite.disabled = true;
                await registerStudentInBulk(activeMatchStudent.name, slot);
                currentBulkRosterIndex++;
                showNextBulkRosterStep();
            });

            const btnSkip = document.createElement('button');
            btnSkip.type = 'button';
            btnSkip.className = 'btn-secondary';
            btnSkip.style.cssText = 'flex: 1; height: 34px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; border: 1.5px solid var(--border-color); background: #ffffff; color: var(--text-primary); box-sizing: border-box; margin: 0; line-height: 1;';
            btnSkip.innerHTML = '<i class="fa-solid fa-forward"></i> スキップ';
            btnSkip.addEventListener('click', () => {
                currentBulkRosterIndex++;
                showNextBulkRosterStep();
            });

            btnRow.appendChild(btnOverwrite);
            btnRow.appendChild(btnSkip);

            const manualRow = document.createElement('div');
            manualRow.style.cssText = 'text-align: center;';
            const btnManual = document.createElement('button');
            btnManual.type = 'button';
            btnManual.style.cssText = 'background: none; border: none; font-size: 10.5px; color: #0077ff; text-decoration: underline; cursor: pointer; padding: 1px 4px;';
            btnManual.innerText = '別の生徒名として新規登録する';
            btnManual.addEventListener('click', () => {
                openStudentModalForSlot(slot);
            });
            manualRow.appendChild(btnManual);

            actContainer.appendChild(btnRow);
            actContainer.appendChild(manualRow);

            bulkRosterStepBody.appendChild(compBox);
            bulkRosterStepBody.appendChild(actContainer);

        } else {
            // NO MATCH FOUND: Horizontal Side-by-Side (Left: Input & Buttons / Right: Candidates in Screen Side Space)
            const newBox = document.createElement('div');
            newBox.style.cssText = 'display: flex; gap: 10px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 6px 10px; box-sizing: border-box; align-items: stretch;';

            // Left Column: Icon + Label + Input + Buttons (Width: ~55%)
            const leftCol = document.createElement('div');
            leftCol.style.cssText = 'flex: 1.2; min-width: 0; display: flex; flex-direction: column; gap: 4px; justify-content: center;';

            const inputLabel = document.createElement('div');
            inputLabel.style.cssText = 'font-size: 11px; font-weight: bold; color: #b45309; display: flex; align-items: center; justify-content: space-between;';
            inputLabel.innerHTML = `
                <span><i class="fa-solid fa-user-plus"></i> 未登録の生徒です。名前を入力してください:</span>
                <span style="font-size: 10px; font-weight: normal; color: #d97706;">${slot.slotName} (${slot.slotDesc})</span>
            `;

            // Single Row containing: Icon + Input + Register Button + Skip Button (All height 34px, perfectly aligned!)
            const controlRow = document.createElement('div');
            controlRow.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 34px;';

            const iconImg = document.createElement('img');
            iconImg.src = slot.iconDataUrl;
            iconImg.style.cssText = 'width: 34px; height: 34px; border-radius: 6px; border: 1.5px solid #f59e0b; object-fit: cover; flex-shrink: 0; box-sizing: border-box;';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input';
            input.placeholder = '生徒名 (例: アツコ)';
            input.style.cssText = 'flex: 1; min-width: 0; height: 34px; font-size: 13px; font-weight: 600; padding: 0 8px; border-radius: 6px; border: 1.5px solid #f59e0b; background: #ffffff; color: #000; box-sizing: border-box; margin: 0;';

            const btnAddNew = document.createElement('button');
            btnAddNew.type = 'button';
            btnAddNew.className = 'btn-primary';
            btnAddNew.style.cssText = 'height: 34px; padding: 0 12px; font-size: 12px; font-weight: bold; background: #00e676; border: 1.5px solid #00e676; color: #000; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 6px; cursor: pointer; box-sizing: border-box; margin: 0; line-height: 1;';
            btnAddNew.innerHTML = '<i class="fa-solid fa-plus"></i> 登録 (次へ)';

            const btnSkip = document.createElement('button');
            btnSkip.type = 'button';
            btnSkip.className = 'btn-secondary';
            btnSkip.style.cssText = 'height: 34px; padding: 0 10px; font-size: 12px; font-weight: 600; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; border: 1.5px solid var(--border-color); background: #ffffff; color: var(--text-primary); cursor: pointer; box-sizing: border-box; margin: 0; line-height: 1;';
            btnSkip.innerText = 'スキップ';

            controlRow.appendChild(iconImg);
            controlRow.appendChild(input);
            controlRow.appendChild(btnAddNew);
            controlRow.appendChild(btnSkip);

            leftCol.appendChild(inputLabel);
            leftCol.appendChild(controlRow);

            // Right Column: Autocomplete Candidate Chips in the Side Space (Width: ~45%)
            const rightCol = document.createElement('div');
            rightCol.style.cssText = 'flex: 1; min-width: 0; border-left: 1.5px dashed #fcd34d; padding-left: 8px; display: flex; flex-direction: column; gap: 2px; justify-content: center;';

            const sugHeader = document.createElement('div');
            sugHeader.style.cssText = 'font-size: 10px; font-weight: bold; color: #b45309; display: flex; justify-content: space-between; align-items: center;';
            sugHeader.innerHTML = '<span><i class="fa-solid fa-list"></i> 名前候補 (タップで選択):</span>';

            const sugContainer = document.createElement('div');
            sugContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 3px; max-height: 48px; min-height: 34px; overflow-y: auto; align-content: flex-start; padding: 2px; box-sizing: border-box;';
            sugContainer.innerHTML = '<span style="font-size: 10px; color: #92400e; padding: 4px 2px;">ふりがな・カタカナを入力すると候補が表示されます</span>';

            rightCol.appendChild(sugHeader);
            rightCol.appendChild(sugContainer);

            newBox.appendChild(leftCol);
            newBox.appendChild(rightCol);

            // Input autocomplete event
            input.addEventListener('input', () => {
                const query = input.value.trim();
                sugContainer.innerHTML = '';
                if (!query || typeof STUDENT_MASTER_LIST === 'undefined') {
                    sugContainer.innerHTML = '<span style="font-size: 10px; color: #92400e; padding: 4px 2px;">ふりがな・カタカナを入力すると候補が表示されます</span>';
                    return;
                }

                const queryHira = toHiragana(query.toLowerCase());
                const queryKata = toKatakana(query);

                const matches = STUDENT_MASTER_LIST.filter(item => {
                    const itemHira = toHiragana(item.reading.toLowerCase());
                    const itemKata = toKatakana(item.name);
                    return itemHira.includes(queryHira) || 
                           itemKata.includes(queryKata) || 
                           item.name.includes(query) ||
                           item.reading.includes(query);
                }).sort((a, b) => {
                    const aHira = toHiragana(a.reading.toLowerCase());
                    const bHira = toHiragana(b.reading.toLowerCase());
                    const aStarts = aHira.startsWith(queryHira) || a.name.startsWith(query);
                    const bStarts = bHira.startsWith(queryHira) || b.name.startsWith(query);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    return 0;
                });

                if (matches.length === 0) {
                    sugContainer.innerHTML = '<span style="font-size: 10px; color: #92400e; padding: 4px 2px;">一致する候補がありません（そのまま登録可）</span>';
                    return;
                }

                matches.slice(0, 10).forEach(m => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'autocomplete-chip';
                    chip.style.cssText = 'font-size: 10px; font-weight: 600; padding: 2px 7px; background: #ffffff; border: 1.2px solid #f59e0b; color: #b45309; border-radius: 4px; cursor: pointer; transition: all 0.1s;';
                    chip.innerText = m.name;
                    chip.addEventListener('click', () => {
                        input.value = m.name;
                        btnAddNew.focus();
                    });
                    sugContainer.appendChild(chip);
                });
            });

            btnAddNew.addEventListener('click', async () => {
                const nameVal = input.value.trim();
                if (!nameVal) {
                    alert('生徒名を入力してください。');
                    return;
                }
                btnAddNew.disabled = true;
                await registerStudentInBulk(nameVal, slot);
                currentBulkRosterIndex++;
                showNextBulkRosterStep();
            });

            btnSkip.addEventListener('click', () => {
                currentBulkRosterIndex++;
                showNextBulkRosterStep();
            });

            bulkRosterStepBody.appendChild(newBox);
        }
    }

    function openStudentModalForSlot(slot) {
        document.getElementById('student-modal-title').innerText = '新規生徒追加';
        document.getElementById('add-student-name').value = '';
        manualIconDataUrl = slot.iconDataUrl;
        currentAddStudentFeatures = slot.faceFeatures;
        document.getElementById('add-student-icon-preview').src = manualIconDataUrl;
        document.getElementById('add-student-icon-preview').style.display = 'block';
        document.getElementById('add-student-placeholder').style.display = 'none';

        // Override save once for this bulk flow
        const origSaveBtn = document.getElementById('btn-student-save');
        const customSave = async () => {
            const name = document.getElementById('add-student-name').value.trim();
            if (!name) {
                alert('生徒名を入力してください。');
                return;
            }
            await registerStudentInBulk(name, slot);
            studentModal.classList.remove('active');
            currentBulkRosterIndex++;
            showNextBulkRosterStep();
            origSaveBtn.removeEventListener('click', customSave);
        };
        origSaveBtn.addEventListener('click', customSave, { once: true });

        studentModal.classList.add('active');
    }
}
