
// Tactical Archive Android Application Version
const APP_VERSION = 'Web v2.0.0';

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

// Characters used for anonymized opponent names: hiragana + half-width alphanumerics
const CSV_RANDOM_NAME_CHARS = Array.from(
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
);
const CSV_RANDOM_NAME_LENGTH = 6;

// Generate a random 6-char name with a cryptographically secure RNG (rejection sampling avoids bias)
function generateRandomOpponentName() {
    const chars = CSV_RANDOM_NAME_CHARS;
    const limit = 256 - (256 % chars.length);
    let result = '';
    while (result.length < CSV_RANDOM_NAME_LENGTH) {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        for (const b of buf) {
            if (b >= limit) continue;
            result += chars[b % chars.length];
            if (result.length === CSV_RANDOM_NAME_LENGTH) break;
        }
    }
    return result;
}

// Build a per-export mapping (same opponent -> same random name). The mapping is never stored,
// and the random names are not derived from the original names, so they cannot be reversed.
function buildRandomOpponentNameMap(records) {
    const map = new Map();
    const used = new Set();
    records.forEach(item => {
        const name = item.commander_name || '';
        if (!name || name === '匿名' || map.has(name)) return;
        let randomName;
        do {
            randomName = generateRandomOpponentName();
        } while (used.has(randomName));
        used.add(randomName);
        map.set(name, randomName);
    });
    return map;
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
    const randomizeOpponentName = document.getElementById('chk-csv-randomize-opponent-name')?.checked || false;

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

    // Re-generated on every export; discarded when this function returns
    const randomNameMap = randomizeOpponentName ? buildRandomOpponentNameMap(records) : null;

    records.forEach(item => {
        // 1. Result
        const res = item.result || '';
        // 2. Utility
        const util = item.utility_level || '高';
        // 3. Date (Includes hours, minutes, seconds)
        let dateStr = '';
        if (item.created_at) {
            const d = new Date(item.created_at);
            if (!isNaN(d.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                dateStr = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            }
        }
        // 4. Opponent Name
        const rawOpponent = item.commander_name || '';
        const opponent = randomNameMap ? (randomNameMap.get(rawOpponent) || rawOpponent) : rawOpponent;
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


// Built-in Battle Type (Attack Sword) Template — shared constant to avoid duplication
// This same base64 PNG is referenced in BUILTIN_CALIBRATION_PROFILES and openCropInspector()
const BUILTIN_BATTLE_TYPE_TEMPLATE = "data:image/png;base64,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";

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
    // Web PC client: default crop layout per chosen aspect ratio (screenshots are resized to 1920x1080 / 1600x1200 first)
    "pc-16:9": {
        "aspectRatio": "pc-16:9",
        "relModal": {
            "rx": 0.019791666666666666,
            "ry": 0.13148148148148148,
            "rw": 0.9598958333333333,
            "rh": 0.7351851851851852
        },
        "normalizedWidth": 2400,
        "normalizedHeight": 1040,
        "winLose": {
            "sx": 110,
            "sy": 100,
            "sw": 280,
            "sh": 160,
            "dw": 280,
            "dh": 160
        },
        "battleTypeIcon": {
            "sx": 58,
            "sy": 167,
            "sw": 110,
            "sh": 110
        },
        "battleTypeTemplate": "data:image/png;base64,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",
        "oppAvatar": {
            "sx": 1718,
            "sy": 162,
            "sw": 120,
            "sh": 120,
            "dw": 100,
            "dh": 100
        },
        "oppName": {
            "sx": 1995,
            "sy": 142,
            "sw": 375,
            "sh": 58,
            "dw": 1100,
            "dh": 200
        },
        "atkCenters": [
            206,
            353,
            500,
            646,
            794,
            941
        ],
        "defCenters": [
            1450,
            1596,
            1744,
            1890,
            2036,
            2185
        ],
        "cardTop": 859,
        "cardSize": 88
    },
    "pc-4:3": {
        "aspectRatio": "pc-4:3",
        "relModal": {
            "rx": 0.02,
            "ry": 0.22333333333333333,
            "rw": 0.96,
            "rh": 0.5516666666666666
        },
        "normalizedWidth": 2400,
        "normalizedHeight": 1040,
        "winLose": {
            "sx": 110,
            "sy": 100,
            "sw": 280,
            "sh": 160,
            "dw": 280,
            "dh": 160
        },
        "battleTypeIcon": {
            "sx": 58,
            "sy": 172,
            "sw": 110,
            "sh": 110
        },
        "battleTypeTemplate": "data:image/png;base64,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",
        "oppAvatar": {
            "sx": 1718,
            "sy": 162,
            "sw": 120,
            "sh": 120,
            "dw": 100,
            "dh": 100
        },
        "oppName": {
            "sx": 1995,
            "sy": 142,
            "sw": 375,
            "sh": 58,
            "dw": 1100,
            "dh": 200
        },
        "atkCenters": [
            206,
            353,
            500,
            646,
            793,
            941
        ],
        "defCenters": [
            1450,
            1596,
            1744,
            1890,
            2036,
            2185
        ],
        "cardTop": 860,
        "cardSize": 88
    },
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
        "battleTypeTemplate": BUILTIN_BATTLE_TYPE_TEMPLATE,
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
        "battleTypeTemplate": BUILTIN_BATTLE_TYPE_TEMPLATE,
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

let _cachedDB = null;
let _dbOpeningPromise = null;

function openDB() {
    if (_cachedDB) {
        return Promise.resolve(_cachedDB);
    }
    if (_dbOpeningPromise) {
        return _dbOpeningPromise;
    }

    _dbOpeningPromise = new Promise((resolve, reject) => {
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
        request.onsuccess = (e) => {
            _cachedDB = e.target.result;
            _dbOpeningPromise = null;
            _cachedDB.onclose = () => {
                _cachedDB = null;
            };
            _cachedDB.onversionchange = () => {
                _cachedDB.close();
                _cachedDB = null;
            };
            resolve(_cachedDB);
        };
        request.onerror = (e) => {
            _dbOpeningPromise = null;
            reject(e.target.error);
        };
    });
    return _dbOpeningPromise;
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
        const allHistory = isFullHistoryLoaded ? currentHistory : await getHistory();
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
        };
        request.onerror = () => reject(request.error);
        // Resolve after all writes (including the avatar link) are committed
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => reject(transaction.error);
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

// Fast initial fetch: retrieves only the most recent N records using reverse cursor (prev)
// Returns in ~5-15ms, eliminating the initial 5-second blank/empty state delay!
async function getLatestHistoryFast(limit = 15) {
    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction('battle_history', 'readonly');
        const store = transaction.objectStore('battle_history');
        const request = store.openCursor(null, 'prev');
        const results = [];
        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && results.length < limit) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => resolve([]);
    });
}

// Load up to `limit` records with id < upperId (newest first). upperId = null starts from the newest.
async function getHistoryChunkBefore(upperId, limit) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('battle_history', 'readonly');
        const store = transaction.objectStore('battle_history');
        const range = (upperId === null || upperId === undefined) ? null : IDBKeyRange.upperBound(upperId, true);
        const request = store.openCursor(range, 'prev');
        const results = [];
        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && results.length < limit) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

const HISTORY_LOAD_CHUNK = 100;

// Load all records older than the ones already in memory, chunk by chunk, merging each chunk into the view
async function loadRemainingHistoryProgressively() {
    const ids = currentHistory.map(h => h.id).filter(id => typeof id === 'number');
    let upperId = ids.length > 0 ? Math.min(...ids) : null;
    while (true) {
        const chunk = await getHistoryChunkBefore(upperId, HISTORY_LOAD_CHUNK);
        if (chunk.length === 0) break;
        upperId = chunk[chunk.length - 1].id;
        // currentHistory may have been replaced meanwhile (restore / delete all), so dedupe against it each time
        const known = new Set(currentHistory.map(h => h.id));
        const fresh = chunk.filter(h => !known.has(h.id));
        if (fresh.length > 0) {
            currentHistory.push(...fresh);
            appendLoadedRecordsToView(fresh);
        }
        if (chunk.length < HISTORY_LOAD_CHUNK) break;
        await new Promise(r => setTimeout(r, 0)); // yield so taps / typing stay responsive
    }
}

// Remove any existing Defense battle records from IndexedDB
// Defense feature is now fully supported
async function cleanupDefenseRecords() {
    return false;
}

// Helper: escape text for safe insertion into innerHTML templates
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

// Pre-normalized feature vector calculation for ZNCC template
function getNormalizedFeatureVector(vec) {
    if (!vec) return null;
    if (vec._normalized) return vec._normalized;
    const n = vec.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += vec[i];
    mean /= n;
    let den = 0;
    for (let i = 0; i < n; i++) {
        const d = vec[i] - mean;
        den += d * d;
    }
    const invStd = den > 0 ? (1 / Math.sqrt(den)) : 0;
    const norm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        norm[i] = (vec[i] - mean) * invStd;
    }
    vec._normalized = norm;
    return norm;
}

// Find best matching student in the roster using pre-normalized fast dot product
function matchStudent(queryFeatures, roster) {
    let bestMatch = null;
    let bestSimilarity = -1;
    if (!roster || roster.length === 0 || !queryFeatures) {
        return { student: null, similarity: 0 };
    }

    // Normalize query vector once for all student comparisons
    const normQuery = getNormalizedFeatureVector(queryFeatures);
    if (!normQuery) return { student: null, similarity: 0 };
    const n = normQuery.length;

    for (let s = 0; s < roster.length; s++) {
        const student = roster[s];
        const templates = student.features;
        if (!templates || templates.length === 0) continue;

        for (let t = 0; t < templates.length; t++) {
            const normTemplate = getNormalizedFeatureVector(templates[t]);
            if (!normTemplate) continue;

            // Fast dot product: sum(normQuery[i] * normTemplate[i])
            let dot = 0;
            for (let i = 0; i < n; i++) {
                dot += normQuery[i] * normTemplate[i];
            }
            if (dot > bestSimilarity) {
                bestSimilarity = dot;
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

// Levenshtein Distance for fuzzy string matching (optimized 1D rolling buffer)
function getLevenshteinDistance(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = new Int32Array(n + 1);
    let curr = new Int32Array(n + 1);

    for (let j = 0; j <= n; j++) {
        prev[j] = j;
    }

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        const charA = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const cost = (charA === b.charCodeAt(j - 1)) ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,       // deletion
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost // substitution
            );
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }
    return prev[n];
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

// Reusable 32x32 Canvas for grayscale feature vector extraction (Zero-allocation pool)
let _featureCanvas32 = null;
let _featureCtx32 = null;

// Image Utility: extract grayscale feature vector (32x32 = 1024 floats)
function extractFeaturesFromCanvas(canvas) {
    if (!_featureCanvas32) {
        _featureCanvas32 = document.createElement('canvas');
        _featureCanvas32.width = 32;
        _featureCanvas32.height = 32;
        _featureCtx32 = _featureCanvas32.getContext('2d', { willReadFrequently: true });
    }
    _featureCtx32.clearRect(0, 0, 32, 32);
    _featureCtx32.drawImage(canvas, 0, 0, 32, 32);
    
    const imgData = _featureCtx32.getImageData(0, 0, 32, 32).data;
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
let manualIconDataUrl = ''; // Icon data URL for the Student Add modal (shared with bulk roster flow)
let pendingBulkSlotSave = null; // Bulk roster flow: callback(name) invoked by the Student Add modal save button
let uploadQueue = []; // Queue of File objects to review sequentially
let activePositionFilter = null;

// Team search across every opponent (set from the opponent roster popup's 「全体で編成検索」)
// { tabs: ['attack'|'defense'], conds: [{ kind: 'striker', slot: 0-3, name } | { kind: 'special', name }] }
// Conditions apply to the opponent's team: the defense team in attack records, the attack team in defense records.
let activeTeamFilter = null;

function teamFilterMatches(item, tf) {
    const team = item.battle_type === 'defense' ? 'attack' : 'defense';
    return tf.conds.every(f => {
        if (f.kind === 'striker') {
            const s = resolveHistorySlotStudent(item, team, f.slot);
            return !!s && s.name === f.name;
        }
        return [4, 5].some(i => {
            const s = resolveHistorySlotStudent(item, team, i);
            return !!s && s.name === f.name;
        });
    });
}

function renderTeamFilterBanner(type) {
    const pane = document.getElementById(`tab-${type}`);
    const wrapper = pane && pane.querySelector('.history-list-wrapper');
    if (!wrapper) return;
    let banner = document.getElementById(`team-filter-banner-${type}`);
    const tf = activeTeamFilter && activeTeamFilter.tabs.includes(type) ? activeTeamFilter : null;
    if (!tf) {
        if (banner) banner.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = `team-filter-banner-${type}`;
        banner.className = 'team-filter-banner';
        wrapper.parentNode.insertBefore(banner, wrapper);
    }
    const prefix = type === 'defense' ? 'A' : 'D'; // the opponent's attack / defense team
    banner.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'tfb-label';
    label.innerHTML = '<i class="fa-solid fa-people-group"></i> 編成検索';
    banner.appendChild(label);
    tf.conds.forEach(f => {
        const chip = document.createElement('span');
        chip.className = 'tfb-chip';
        const tag = f.kind === 'striker' ? `${prefix}${f.slot + 1}` : 'SP';
        if (f.kind === 'striker' && typeof ROSTER_SLOT_COLORS !== 'undefined') chip.style.setProperty('--slot-color', ROSTER_SLOT_COLORS[f.slot]);
        chip.innerHTML = `<b>${tag}</b>${escapeHtml(f.name)}`;
        banner.appendChild(chip);
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tfb-clear';
    clear.innerHTML = '<i class="fa-solid fa-xmark"></i> 解除';
    clear.addEventListener('click', () => {
        activeTeamFilter = null;
        ['attack', 'defense'].forEach(t => renderTeamFilterBanner(t));
        filterHistory(type);
    });
    banner.appendChild(clear);
} // Filter for specific position: { sourceTab: 'attack'|'defense', team: 'attack'|'defense', index: 0-5, studentName: string }

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
let currentUploadExtractedTimestamp = null; // Extracted timestamp (including HH:mm:ss) of currently processing File
let isScanCancelled = false; // Flag to abort processing if cancelled

// ==========================================
// FAST MODE (auto-register screenshots that need no manual check)
// ==========================================
let isFastMode = false;
try {
    isFastMode = localStorage.getItem('tactical_archive_fast_mode') === 'true';
} catch (e) {}
let fastModeAutoSavedCount = 0; // Number of records auto-registered in the current upload batch

// ==========================================
// WEB PLATFORM (PC browser / smartphone & tablet browser)
// ==========================================
// PC: screenshots from the PC client can change size, but are always 4:3 or 16:9.
//     The user picks one ratio; other ratios are skipped, and accepted images are resized
//     to one canonical size so a single calibration (crop layout) fits every screenshot.
// Mobile: screenshot size never changes, so it works like the Android app
//     (one calibration profile per exact aspect ratio).
const WEB_PLATFORM_KEY = 'tactical_archive_web_platform';
const WEB_PC_ASPECT_KEY = 'tactical_archive_web_pc_aspect';
const PC_ASPECTS = {
    '4:3': { ratio: 4 / 3, width: 1600, height: 1200 },
    '16:9': { ratio: 16 / 9, width: 1920, height: 1080 }
};
const PC_ASPECT_TOLERANCE = 0.03; // ±3% (window captures can be a few pixels off)
let pcSkippedCount = 0; // Screenshots skipped in the current batch because of the aspect ratio

// ==========================================
// FORCED LANDSCAPE (phones held upright show the landscape UI rotated 90°)
// ==========================================
// body gets .force-landscape (rotated), .narrow (< 1024px wide) and .compact (<= 520px tall),
// computed from the *effective* (possibly rotated) size, plus --app-w / --app-h for CSS.
let _layoutLastW = 0;
function updateViewportLayout() {
    const w = window.innerWidth, h = window.innerHeight;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const b = document.body;
    if (!b) return;
    // Phones and tablets held upright always show the landscape UI rotated 90°
    const force = coarse && h > w;
    // While typing on a rotated screen the soft keyboard only changes the height: keep the layout stable
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
    if (force && typing && b.classList.contains('force-landscape') && w === _layoutLastW) return;
    _layoutLastW = w;
    b.classList.toggle('force-landscape', force);
    const aw = force ? h : w;
    const ah = force ? w : h;
    document.documentElement.style.setProperty('--app-w', aw + 'px');
    document.documentElement.style.setProperty('--app-h', ah + 'px');
    b.classList.toggle('narrow', aw < 1024);
    b.classList.toggle('compact', ah <= 520);
    b.classList.toggle('landscape', aw > ah); // icon auto-sizing applies to landscape screens only
    requestAnimationFrame(updateHistoryIconSize);
}

// Team icon size in the history table: as large as possible until either the list shows
// 10 rows or the team column runs out of width (never smaller than the default 44px unless
// the column itself is narrower). Sets --icon-size on the visible table.
function updateHistoryIconSize() {
    ['attack', 'defense'].forEach(type => {
        const pane = document.getElementById(`tab-${type}`);
        if (!pane || !pane.classList.contains('active')) return;
        const table = pane.querySelector('.history-table');
        const wrapper = pane.querySelector('.history-list-wrapper');
        const th = pane.querySelector('thead th.td-left');
        if (!table || !wrapper || !th) return;
        const sample = pane.querySelector('tbody td.td-left');
        const row = sample ? sample.querySelector('.team-icons-row') : null;
        const cs = sample ? getComputedStyle(sample) : null;
        const padH = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth || 0) : 18;
        const padV = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 1 : 17;
        const gap = row ? (parseFloat(getComputedStyle(row).columnGap) || 4) : 4;
        const fitWidth = () => Math.floor((th.offsetWidth - padH - gap * 5) / 6); // offsetWidth forces layout
        // Icons too small: narrow the opponent column, then also hide the opponent's face icon
        pane.classList.remove('comm-s', 'comm-xs');
        if (!th.offsetWidth) return;
        if (fitWidth() < 32) {
            pane.classList.add('comm-s');
            if (fitWidth() < 28) pane.classList.add('comm-xs');
        }
        if (!document.body.classList.contains('landscape')) {
            table.style.removeProperty('--icon-size'); // portrait: icons fill the team cells
            return;
        }
        const widthLimit = fitWidth();
        const thead = table.querySelector('thead');
        const listH = wrapper.clientHeight - (thead && getComputedStyle(thead).display !== 'none' ? thead.offsetHeight : 0);
        const heightLimit = Math.floor(listH / 10 - padV);
        const size = Math.max(Math.min(widthLimit, 44), Math.min(widthLimit, heightLimit, 120));
        table.style.setProperty('--icon-size', Math.max(16, size) + 'px');
    });
}
function isForcedLandscape() {
    return !!(document.body && document.body.classList.contains('force-landscape'));
}
// Screen (client) point -> app point. The app is rotated 90° clockwise: screen(X, Y) = (vw - y, x)
function toAppPoint(x, y) {
    return isForcedLandscape() ? { x: y, y: window.innerWidth - x } : { x, y };
}
function evAppX(p) { return toAppPoint(p.clientX, p.clientY).x; }
function evAppY(p) { return toAppPoint(p.clientX, p.clientY).y; }
function pointerSource(e) { return (e.touches && e.touches[0]) ? e.touches[0] : e; }
// Element rect in app coordinates
function appRect(el) {
    const r = el.getBoundingClientRect();
    if (!isForcedLandscape()) return r;
    const vw = window.innerWidth;
    return { left: r.top, top: vw - r.right, right: r.bottom, bottom: vw - r.left, width: r.height, height: r.width };
}
function appViewport() {
    return isForcedLandscape() ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight };
}
updateViewportLayout();
window.__taUpdateLayout = updateViewportLayout;
window.addEventListener('resize', updateViewportLayout);
window.addEventListener('orientationchange', () => setTimeout(updateViewportLayout, 250));
window.addEventListener('load', updateViewportLayout);
document.addEventListener('DOMContentLoaded', updateViewportLayout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewportLayout);
if (window.matchMedia) {
    const _mqOrient = window.matchMedia('(orientation: portrait)');
    if (_mqOrient.addEventListener) _mqOrient.addEventListener('change', updateViewportLayout);
}

function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
}
function getWebPlatform() {
    const v = lsGet(WEB_PLATFORM_KEY);
    return (v === 'pc' || v === 'mobile') ? v : null;
}
function getPcAspect() {
    const v = lsGet(WEB_PC_ASPECT_KEY);
    return PC_ASPECTS[v] ? v : null;
}
function isPcMode() {
    return getWebPlatform() === 'pc' && !!getPcAspect();
}
function guessWebPlatform() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    return coarse ? 'mobile' : 'pc';
}
function classifyPcAspect(width, height) {
    if (!width || !height) return null;
    const r = width / height;
    for (const [key, a] of Object.entries(PC_ASPECTS)) {
        if (Math.abs(r - a.ratio) / a.ratio <= PC_ASPECT_TOLERANCE) return key;
    }
    return null;
}
// Calibration profiles are stored per key: PC uses one key per chosen ratio, mobile the exact ratio
function getCalibrationKeyForImage(img) {
    if (isPcMode()) return 'pc-' + getPcAspect();
    return (img.width / img.height).toFixed(3);
}
// Redraw a PC screenshot at the canonical size of its ratio (same layout, so the same crops apply)
function normalizePcScreenshot(img, aspectKey) {
    const a = PC_ASPECTS[aspectKey];
    if (!a || (img.width === a.width && img.height === a.height)) return Promise.resolve(img);
    const canvas = document.createElement('canvas');
    canvas.width = a.width;
    canvas.height = a.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, a.width, a.height);
    return new Promise((resolve, reject) => {
        const out = new Image();
        out.onload = () => resolve(out);
        out.onerror = reject;
        out.src = canvas.toDataURL('image/png');
    });
}

function showToast(message, kind = 'info', duration = 4000) {
    let host = document.getElementById('toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    const icon = kind === 'warn' ? 'fa-triangle-exclamation' : kind === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
    el.querySelector('span').textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

function getPlatformLabel() {
    const p = getWebPlatform();
    if (p === 'pc') return `PC版ブルーアーカイブ（${getPcAspect() || '未選択'}）`;
    if (p === 'mobile') return 'スマホ・タブレット版';
    return '未設定';
}

function updatePlatformUI() {
    const p = getWebPlatform() || 'unset';
    document.body.dataset.platform = p;
    const label = document.getElementById('web-platform-label');
    if (label) label.textContent = getPlatformLabel();
    const hint = document.getElementById('upload-platform-hint');
    if (hint) {
        hint.innerHTML = isPcMode()
            ? `<i class="fa-solid fa-desktop"></i> PCモード：<b>${getPcAspect()}</b> のスクリーンショットのみ読み込みます（サイズ違いは自動でリサイズ）`
            : `<i class="fa-solid fa-mobile-screen"></i> スマホ・タブレットモード`;
    }
    const capture = document.getElementById('btn-web-capture');
    if (capture) {
        const canCapture = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
        capture.hidden = !(canCapture && p === 'pc');
    }
}

// Welcome screen: first launch (or "使用環境" in Settings) — choose PC (4:3 / 16:9) or mobile
function openWelcomeScreen({ isFreshInstall = false, isChange = false } = {}) {
    const screen = document.getElementById('welcome-screen');
    if (!screen) return;
    let platform = getWebPlatform() || guessWebPlatform();
    let aspect = getPcAspect();
    const prevPlatform = getWebPlatform();
    const prevAspect = getPcAspect();

    const cards = screen.querySelectorAll('[data-platform-choice]');
    const aspectBox = document.getElementById('welcome-aspect');
    const aspectBtns = screen.querySelectorAll('[data-aspect-choice]');
    const startBtn = document.getElementById('btn-welcome-start');
    const cancelBtn = document.getElementById('btn-welcome-cancel');
    const presetRow = document.getElementById('welcome-preset-row');
    const presetChk = document.getElementById('welcome-use-preset');
    // Preset student icons: offered on the first choice only (Settings has its own button)
    if (presetRow) presetRow.hidden = isChange;
    if (presetChk) presetChk.checked = true;

    const render = () => {
        cards.forEach(c => c.classList.toggle('selected', c.dataset.platformChoice === platform));
        aspectBtns.forEach(b => b.classList.toggle('selected', b.dataset.aspectChoice === aspect));
        if (aspectBox) aspectBox.hidden = platform !== 'pc';
        if (startBtn) startBtn.disabled = platform === 'pc' && !aspect;
    };
    cards.forEach(c => { c.onclick = () => { platform = c.dataset.platformChoice; render(); }; });
    aspectBtns.forEach(b => { b.onclick = () => { aspect = b.dataset.aspectChoice; render(); }; });
    if (cancelBtn) {
        cancelBtn.hidden = !isChange;
        cancelBtn.onclick = () => { screen.classList.remove('active'); };
    }
    if (startBtn) {
        startBtn.textContent = isChange ? 'この設定で保存' : 'はじめる';
        startBtn.onclick = () => {
            if (platform === 'pc' && !aspect) return;
            const changed = platform !== prevPlatform || (platform === 'pc' && aspect !== prevAspect);
            lsSet(WEB_PLATFORM_KEY, platform);
            if (platform === 'pc') lsSet(WEB_PC_ASPECT_KEY, aspect);
            screen.classList.remove('active');
            updatePlatformUI();
            if (!isChange && presetChk) {
                if (presetChk.checked) {
                    loadDefaultRoster()
                        .then(r => { if (r.added > 0) showToast(`プリセットアイコン: 生徒辞書に ${r.added} 人を登録しました`, 'success'); })
                        .catch(e => console.warn('[DefaultRoster] not loaded:', e));
                } else {
                    lsSet(DEFAULT_ROSTER_FLAG, 'true'); // the user chose not to use the presets
                }
            }
            if (isFreshInstall) {
                lsSet('tactical_archive_first_launch_done', 'true');
                window.switchToTab('upload');
                const msg = platform === 'pc'
                    ? `戦術対抗戦の戦闘履歴のスクリーンショットを読み込んでください。トリミング位置は設定済みなので、そのまま読み取れます。<br><br>今後も <b>${aspect}</b> のスクリーンショットを読み込んでください（サイズが違っても同じ比率なら自動でリサイズします）。<br>位置がずれる場合は「設定 → トリミング範囲の再設定」で調整できます。`
                    : '戦術対抗戦の戦闘履歴のスクリーンショット（初回は攻撃のリザルト）を読み込んでください。';
                setTimeout(() => showTutorialPopup(msg, '<i class="fa-solid fa-cloud-arrow-up"></i>', '初回セットアップ'), 150);
            } else if (changed) {
                showToast(platform === 'pc'
                    ? `使用環境を「${getPlatformLabel()}」に設定しました`
                    : `使用環境を「${getPlatformLabel()}」に設定しました。この環境で初めて読み込むときはトリミング位置の調整画面が開きます`, 'success', 6000);
            }
        };
    }
    render();
    screen.classList.add('active');
}

function initWebPlatformUI({ isFreshInstall = false } = {}) {
    updatePlatformUI();
    const btn = document.getElementById('btn-web-platform');
    if (btn) btn.addEventListener('click', () => openWelcomeScreen({ isChange: true }));
    if (!getWebPlatform()) {
        openWelcomeScreen({ isFreshInstall });
    }
}

// ---- Default student dictionary (docs/default_roster.json) ----
const DEFAULT_ROSTER_FLAG = 'tactical_archive_default_roster_loaded';
async function loadDefaultRoster() {
    const res = await fetch('default_roster.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = (data && Array.isArray(data.students)) ? data.students : [];
    let added = 0, merged = 0;
    for (const s of list) {
        if (!s || !s.name) continue;
        const exists = currentRoster.some(r => r.name === s.name);
        // Existing students keep their own icon; only the face patterns are added
        await addOrUpdateStudent({
            name: s.name,
            icon_path: exists ? undefined : s.icon_path,
            features: Array.isArray(s.features) ? s.features : [],
            created_at: Date.now()
        });
        if (exists) merged++; else added++;
    }
    lsSet(DEFAULT_ROSTER_FLAG, 'true');
    currentRoster = await getStudents();
    updateRosterView();
    return { added, merged };
}
async function seedDefaultRosterIfEmpty() {
    if (lsGet(DEFAULT_ROSTER_FLAG) === 'true' || currentRoster.length > 0) return;
    if (!getWebPlatform()) return; // first launch: decided by the "プリセットアイコンを使用" option
    try {
        const r = await loadDefaultRoster();
        if (r.added > 0) showToast(`生徒辞書に ${r.added} 人を初期登録しました`, 'success');
    } catch (e) {
        console.warn('[DefaultRoster] not loaded:', e);
    }
}

// Review: flag an opponent name that never appeared in the history (likely an OCR misread or a new opponent)
function updateReviewNameCheck() {
    const input = document.getElementById('review-opponent-name');
    const group = input && input.closest('.opponent-input-group');
    if (!group) return;
    const norm = (v) => (v || '').replace(/[\s　]+/g, '');
    const name = norm(input.value);
    const known = !!name && currentHistory.some(h => norm(h.commander_name) === name);
    group.classList.toggle('needs-check', !known);
}

// Student selector: show the face cropped from the screenshot, so a wrong match is easy to fix
function showSelectorCrop(slot) {
    const box = document.getElementById('selector-crop');
    if (!box) return;
    const src = slot && slot.cropIcon;
    box.hidden = !src;
    const img = document.getElementById('selector-crop-img');
    if (src && img) img.src = src;
}

// Settings: re-adjust / reset the crop layout, load the default student dictionary
function initWebSettingsExtras() {
    const reviewNameInput = document.getElementById('review-opponent-name');
    if (reviewNameInput) reviewNameInput.addEventListener('input', updateReviewNameCheck);

    const recalibInput = document.getElementById('recalib-input');
    const btnRecalib = document.getElementById('btn-recalibrate');
    if (btnRecalib && recalibInput) {
        btnRecalib.addEventListener('click', () => { recalibInput.value = ''; recalibInput.click(); });
        recalibInput.addEventListener('change', async () => {
            const file = recalibInput.files && recalibInput.files[0];
            if (!file) return;
            try {
                let img = await loadImageFromFile(file);
                if (isPcMode()) {
                    const pcAspect = getPcAspect();
                    const detected = classifyPcAspect(img.width, img.height);
                    if (detected !== pcAspect) {
                        showToast(`${pcAspect} のスクリーンショットを選んでください（${detected || img.width + '×' + img.height} の画像です）`, 'warn', 5000);
                        return;
                    }
                    img = await normalizePcScreenshot(img, pcAspect);
                }
                const { profile } = getOrComputeCalibrationProfile(img, null);
                lastUploadedImage = img;
                currentActiveProfile = profile;
                currentUploadData = null;   // calibration only: nothing is registered
                currentUploadFile = null;
                currentUploadExtractedDate = null;
                openCropInspector();
            } catch (e) {
                console.error('[Recalibrate]', e);
                alert('画像を読み込めませんでした: ' + (e && e.message ? e.message : e));
            }
        });
    }

    const btnReset = document.getElementById('btn-reset-calibration');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            const pc = isPcMode();
            const msg = pc
                ? `${getPcAspect()} のトリミング範囲を初期値に戻しますか？`
                : 'トリミング範囲の設定を消しますか？次に読み込むスクショで調整画面が開きます。';
            if (!confirm(msg)) return;
            let profiles = {};
            try { profiles = JSON.parse(lsGet('tactical_archive_calibration_profiles') || '{}'); } catch (e) {}
            if (pc) {
                delete profiles['pc-' + getPcAspect()];
            } else {
                Object.keys(profiles).filter(k => !k.startsWith('pc-')).forEach(k => delete profiles[k]);
            }
            lsSet('tactical_archive_calibration_profiles', JSON.stringify(profiles));
            showToast(pc ? 'トリミング範囲を初期値に戻しました' : 'トリミング範囲の設定を消しました', 'success');
        });
    }

    const btnDefaultRoster = document.getElementById('btn-load-default-roster');
    if (btnDefaultRoster) {
        btnDefaultRoster.addEventListener('click', async () => {
            if (!confirm('初期の生徒辞書を読み込みますか？\n未登録の生徒は追加され、登録済みの生徒には顔パターンだけが追加されます。')) return;
            try {
                const r = await loadDefaultRoster();
                showToast(`生徒辞書: ${r.added} 人を追加、${r.merged} 人に顔パターンを追加しました`, 'success', 5000);
            } catch (e) {
                alert('初期の生徒辞書を読み込めませんでした: ' + (e && e.message ? e.message : e));
            }
        });
    }
}

// Paste (Ctrl+V), drag & drop anywhere, and screen capture (PC browsers)
function initWebInputSources() {
    window.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl.type !== 'file') return;
        if (document.querySelector('.modal-overlay.active') || document.getElementById('welcome-screen')?.classList.contains('active')) return;
        const files = [];
        for (const item of e.clipboardData.items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) files.push(new File([blob], `paste_${Date.now()}_${files.length}.png`, { type: blob.type, lastModified: Date.now() }));
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            window.switchToTab('upload');
            processMultipleScreenshotUploads(files);
        }
    });

    window.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        if (dropZone.contains(e.target)) return;
        e.preventDefault();
        if (document.querySelector('.modal-overlay.active')) return;
        const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            window.switchToTab('upload');
            processMultipleScreenshotUploads(imageFiles);
        }
    });

    const btnWebCapture = document.getElementById('btn-web-capture');
    if (btnWebCapture) {
        btnWebCapture.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'window' }, audio: false });
                const video = document.createElement('video');
                video.srcObject = stream;
                video.muted = true;
                await video.play();
                const capCanvas = document.createElement('canvas');
                capCanvas.width = video.videoWidth;
                capCanvas.height = video.videoHeight;
                capCanvas.getContext('2d').drawImage(video, 0, 0, capCanvas.width, capCanvas.height);
                stream.getTracks().forEach(t => t.stop());
                capCanvas.toBlob((blob) => {
                    if (blob) {
                        processMultipleScreenshotUploads([new File([blob], `capture_${Date.now()}.png`, { type: 'image/png', lastModified: Date.now() })]);
                    }
                }, 'image/png');
            } catch (err) {
                if (err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                    console.error('Screen capture error:', err);
                    alert('画面キャプチャ中にエラーが発生しました: ' + (err.message || err));
                }
            }
        });
    }
}

function updateFastModeButton() {
    const btn = document.getElementById('btn-fast-mode');
    const label = document.getElementById('btn-fast-mode-label');
    if (!btn) return;
    if (label) label.innerText = isFastMode ? '高速モード ON' : '高速モード OFF';
    btn.classList.toggle('is-on', isFastMode);
    btn.setAttribute('aria-pressed', isFastMode ? 'true' : 'false');
}

function toggleFastMode() {
    isFastMode = !isFastMode;
    try {
        localStorage.setItem('tactical_archive_fast_mode', isFastMode ? 'true' : 'false');
    } catch (e) {}
    updateFastModeButton();
}

// Returns the reason the screenshot needs a manual check, or null if it can be auto-registered
function getFastModeStopReason(data) {
    if (!data) return '認識結果がありません';
    const allSlots = [...(data.attack || []), ...(data.defense || [])];
    if (allSlots.length < 12 || allSlots.some(slot => !slot || !slot.studentId)) {
        return '未登録の生徒がいるため確認が必要です';
    }
    const name = (data.opponentName || '').replace(/[\s　]+/g, '');
    const rawName = (data.rawOcrOpponentName || '').replace(/[\s　]+/g, '');
    if (!name) {
        return '対戦相手の名前を読み取れなかったため確認が必要です';
    }
    if (data.battleType !== 'defense' && (name === '匿名' || rawName === '匿名')) {
        return '匿名相手の攻撃のため、相手SPの固有を入力してください';
    }
    const hasFoughtBefore = currentHistory.some(h => (h.commander_name || '') === name);
    if (!hasFoughtBefore) {
        return '初めて対戦する相手のため確認が必要です';
    }
    return null;
}

// ==========================================
// KEYBOARD UTILITY (Soft Keyboard Auto-Dismiss)
// ==========================================
function dismissKeyboard() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    if (window.AndroidApp && typeof window.AndroidApp.hideKeyboard === 'function') {
        try {
            window.AndroidApp.hideKeyboard();
        } catch (e) {
            console.error('Failed to call AndroidApp.hideKeyboard:', e);
        }
    }
}

// Global Enter / Done key listener for text input & textarea elements
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
        // IME変換・予測変換中は漢字確定を優先し、キーボードは閉じない
        if (e.isComposing) return;

        const target = e.target;
        if (!target) return;

        // 1. INPUT elements
        if (target.tagName === 'INPUT') {
            const type = (target.type || '').toLowerCase();
            if (['text', 'search', 'number', 'email', 'password', 'url', 'tel', ''].includes(type)) {
                e.preventDefault();
                target.blur();
                dismissKeyboard();
            }
        }
        // 2. TEXTAREA elements (メモ欄 / パレット: 改行ではなく確定してキーボードを閉じる)
        else if (target.tagName === 'TEXTAREA') {
            if (target.id === 'notes-palette-textarea') {
                if (!e.shiftKey) {
                    e.preventDefault();
                    if (typeof window.closeNotesPalette === 'function') {
                        window.closeNotesPalette(true);
                    }
                }
                return;
            }
            e.preventDefault();
            target.blur();
            dismissKeyboard();
        }
    }
});

// Async click handler with re-entrancy guard (prevents duplicate saves on double tap)
function addGuardedClickListener(btn, handler) {
    if (!btn) return;
    let running = false;
    btn.addEventListener('click', async (e) => {
        if (running) return;
        running = true;
        btn.disabled = true;
        try {
            await handler(e);
        } catch (err) {
            console.error('Save handler failed:', err);
            alert('保存中にエラーが発生しました: ' + (err && err.message ? err.message : err));
        } finally {
            running = false;
            btn.disabled = false;
        }
    });
}

// Enable instant :active state on touch devices
document.addEventListener('touchstart', () => {}, { passive: true });

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

// Global Full History Loading State
let isFullHistoryLoaded = false;
let fullHistoryLoadPromise = null;

// Ensure full history is loaded before executing complete search / filter
async function ensureFullHistoryLoaded() {
    if (isFullHistoryLoaded) return;
    if (fullHistoryLoadPromise) {
        await fullHistoryLoadPromise;
    }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Open DB and Load Data
    try {
        // STEP 1: ULTRA-FAST INITIAL RENDER (< 50ms)
        // Load student dictionary (for icons) and latest 15 battle records in parallel
        const [roster, initialHistory] = await Promise.all([
            getStudents(),
            getLatestHistoryFast(15)
        ]);
        currentRoster = roster || [];
        currentHistory = initialHistory || [];
        
        // Render UI INSTANTLY so latest 15 battles appear immediately on startup!
        updateRosterView();
        updateHistoryView();

        // STEP 2: BACKGROUND PROGRESSIVE LOADING (Non-blocking)
        // Older records are loaded HISTORY_LOAD_CHUNK at a time (newest first) and merged into the
        // visible list as they arrive, so recent battles and search results appear immediately.
        fullHistoryLoadPromise = (async () => {
            try {
                const [opponents, renames] = await Promise.all([getOpponents(), getRenames()]);
                opponentDirectory = opponents || {};
                opponentRenames = renames || [];
                updateHistoryView(); // re-render so opponent avatars appear on the initial rows

                await loadRemainingHistoryProgressively();
                isFullHistoryLoaded = true;
                refreshHistoryEmptyStates();

                // Background migration (non-blocking)
                migrateOpponentAvatars();
                backfillHistorySnapshots().catch(err => console.warn("Background backfill error:", err));
            } catch (err) {
                console.error("Background full history load error:", err);
                // Fallback: load everything at once so no data is missing
                try {
                    const all = await getHistory();
                    const known = new Set(currentHistory.map(h => h.id));
                    const missing = all.filter(h => !known.has(h.id));
                    currentHistory.push(...missing);
                    appendLoadedRecordsToView(missing);
                } catch (e2) {
                    console.error("Fallback full history load failed:", e2);
                }
                isFullHistoryLoaded = true;
                refreshHistoryEmptyStates();
            }
        })();
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
    }, { passive: true });

    // ==========================================
    // NOTES INPUT PALETTE CONTROLLER (IME Jitter-Free Input Overlay)
    // ==========================================
    let activeNotesTargetId = null;

    window.openNotesPalette = function(targetId) {
        activeNotesTargetId = targetId;
        const targetEl = document.getElementById(targetId);
        const paletteModal = document.getElementById('notes-palette-modal');
        const paletteTextarea = document.getElementById('notes-palette-textarea');
        if (!paletteModal || !paletteTextarea) return;

        paletteTextarea.value = targetEl ? targetEl.value : '';
        paletteModal.classList.add('active');

        // Autofocus on top-level palette textarea smoothly
        setTimeout(() => {
            paletteTextarea.focus();
            try {
                const len = paletteTextarea.value.length;
                paletteTextarea.setSelectionRange(len, len);
            } catch (err) {}
            window.scrollTo(0, 0);
        }, 50);
    };

    window.closeNotesPalette = function(shouldSave = false) {
        const paletteModal = document.getElementById('notes-palette-modal');
        const paletteTextarea = document.getElementById('notes-palette-textarea');

        if (shouldSave && activeNotesTargetId && paletteTextarea) {
            const targetEl = document.getElementById(activeNotesTargetId);
            if (targetEl) {
                targetEl.value = paletteTextarea.value.trim();
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                targetEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        if (paletteModal) {
            paletteModal.classList.remove('active');
        }
        activeNotesTargetId = null;
        dismissKeyboard();
        window.scrollTo(0, 0);
    };

    function initNotesInputPalette() {
        const noteIds = ['review-notes', 'detail-notes'];
        noteIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            // Tap / Click opens the clean top palette, preventing modal layout shift
            el.addEventListener('click', (e) => {
                e.preventDefault();
                openNotesPalette(id);
            });
            el.addEventListener('focus', (e) => {
                e.preventDefault();
                el.blur();
                openNotesPalette(id);
            });
        });

        // Palette action buttons
        const btnDone = document.getElementById('btn-palette-done');
        const btnCancel = document.getElementById('btn-palette-cancel');
        const paletteModal = document.getElementById('notes-palette-modal');
        const paletteTextarea = document.getElementById('notes-palette-textarea');

        if (btnDone) {
            btnDone.addEventListener('click', () => closeNotesPalette(true));
        }
        if (btnCancel) {
            btnCancel.addEventListener('click', () => closeNotesPalette(false));
        }
        if (paletteModal) {
            paletteModal.addEventListener('click', (e) => {
                if (e.target === paletteModal) {
                    closeNotesPalette(false);
                }
            });
        }
        if (paletteTextarea) {
            paletteTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    if (e.isComposing) return;
                    if (!e.shiftKey) {
                        e.preventDefault();
                        closeNotesPalette(true);
                    }
                }
            });
        }
    }
    initNotesInputPalette();

    document.addEventListener('focusout', (e) => {
        setTimeout(() => {
            const currentActive = document.activeElement;
            if (!currentActive || (currentActive.tagName !== 'INPUT' && currentActive.tagName !== 'TEXTAREA')) {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            }
        }, 50);
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
            const defenseNotified = true; // Web v2: the old "defense feature added" notice is not shown
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

    // Web v2: choose PC (4:3 / 16:9) or smartphone/tablet first; fresh installs then get the upload tutorial
    initWebPlatformUI({ isFreshInstall: !isDone && !hasCalibration && !hasData });
    initWebSettingsExtras();
    seedDefaultRosterIfEmpty();

    // Synchronized Search Inputs (Shared across Attack and Defense tabs)
    const searchAtk = document.getElementById('search-commander-attack');
    const btnClearAtk = document.getElementById('btn-clear-search-attack');
    const searchDef = document.getElementById('search-commander-defense');
    const btnClearDef = document.getElementById('btn-clear-search-defense');

    if (searchAtk) {
        // 'input' fires per character; composition events cover IMEs that skip 'input' while converting
        ['input', 'compositionupdate', 'compositionend'].forEach(evt => {
            searchAtk.addEventListener(evt, () => scheduleSearchInput(searchAtk));
        });
    }
    if (btnClearAtk) {
        btnClearAtk.addEventListener('click', () => {
            syncSearchInput('', true);
        });
    }

    if (searchDef) {
        // 'input' fires per character; composition events cover IMEs that skip 'input' while converting
        ['input', 'compositionupdate', 'compositionend'].forEach(evt => {
            searchDef.addEventListener(evt, () => scheduleSearchInput(searchDef));
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

    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('button:not(.dz-pick)') || e.target.closest('input')) return;
        fileInput.value = '';
        fileInput.click();
    });

    const btnFastMode = document.getElementById('btn-fast-mode');
    if (btnFastMode) btnFastMode.addEventListener('click', (e) => { e.stopPropagation(); toggleFastMode(); });
    updateFastModeButton();
    initWebInputSources();

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

    document.getElementById('btn-student-cancel').addEventListener('click', () => {
        pendingBulkSlotSave = null;
        studentModal.classList.remove('active');
    });

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

    addGuardedClickListener(document.getElementById('btn-student-save'), async () => {
        const name = document.getElementById('add-student-name').value.trim();
        if (!name) {
            alert('生徒名を入力してください。');
            return;
        }

        // Bulk roster flow: delegate to the bulk registration callback only
        if (pendingBulkSlotSave) {
            const bulkSave = pendingBulkSlotSave;
            pendingBulkSlotSave = null;
            await bulkSave(name);
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

    // Web: also called from top-level code (queue skip / error paths, paste, drop, capture)
    window.processMultipleScreenshotUploads = processMultipleScreenshotUploads;
    window.processNextInUploadQueue = processNextInUploadQueue;

    async function processMultipleScreenshotUploads(files) {
        const fileList = Array.from(files); // Copy before awaiting (input may be reset meanwhile)
        fastModeAutoSavedCount = 0;
        pcSkippedCount = 0;
        // Startup loads only the latest 15 records; make sure duplicate check sees the full history
        // (no wait if the background full load has already finished)
        if (!isFullHistoryLoaded) {
            await ensureFullHistoryLoaded();
        }
        const duplicateNames = [];
        const validFiles = [];
        
        fileList.forEach(file => {
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
            if (fastModeAutoSavedCount > 0) {
                const count = fastModeAutoSavedCount;
                fastModeAutoSavedCount = 0;
                alert(`高速モードで ${count} 件の戦績を自動登録しました。`);
            }
            if (pcSkippedCount > 0) {
                const skipped = pcSkippedCount;
                pcSkippedCount = 0;
                alert(`アスペクト比が ${getPcAspect()} ではないスクリーンショット ${skipped} 件をスキップしました。\n${getPcAspect()} のスクリーンショットを読み込んでください。`);
            }
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

    // Save the record currently shown in the Review Modal (used by the save button and by Fast Mode)
    async function saveReviewFromModal() {
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
        // Merge date input with exact time (hours, minutes, seconds)
        let finalCreatedAt = currentUploadData.timestamp || Date.now();
        if (dateInput) {
            const parts = dateInput.split('-').map(Number);
            if (parts.length === 3) {
                const base = new Date(finalCreatedAt);
                base.setFullYear(parts[0], parts[1] - 1, parts[2]);
                finalCreatedAt = base.getTime();
            }
        }

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
            created_at: finalCreatedAt,
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

        const savedId = await addHistory(record);
        record.id = savedId;
        
        // Refresh views incrementally
        currentRoster = await getStudents();
        if (Array.isArray(currentHistory)) {
            currentHistory.unshift(record);
        } else {
            currentHistory = [record];
        }
        updateRosterView();
        updateHistoryView();
        
        reviewModal.classList.remove('active');
        uploadQueue.shift();
        processNextInUploadQueue();
    }
    window.saveReviewFromModal = saveReviewFromModal;
    addGuardedClickListener(document.getElementById('btn-review-save'), saveReviewFromModal);

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
            const delIdx = currentHistory.findIndex(h => h.id === editingRecord.id);
            if (delIdx !== -1) {
                currentHistory.splice(delIdx, 1);
            }
            updateHistoryView();
            detailModal.classList.remove('active');
            editingRecord = null;
            detailEditedData = null;
        }
    });

    addGuardedClickListener(btnDetailSave, async () => {
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

        // Preserve existing hours, minutes, seconds when updating date
        let finalCreatedAt = editingRecord.created_at || Date.now();
        if (dateInput) {
            const parts = dateInput.split('-').map(Number);
            if (parts.length === 3) {
                const base = new Date(finalCreatedAt);
                base.setFullYear(parts[0], parts[1] - 1, parts[2]);
                finalCreatedAt = base.getTime();
            }
        }

        // Update the record fields
        editingRecord.commander_name = opponentName;
        editingRecord.result = result;
        editingRecord.battle_type = battleType;
        editingRecord.utility_level = utility;
        editingRecord.notes = notes;
        editingRecord.created_at = finalCreatedAt;
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

        // Refresh views incrementally
        currentRoster = await getStudents();
        const updIdx = currentHistory.findIndex(h => h.id === editingRecord.id);
        if (updIdx !== -1) {
            currentHistory[updIdx] = editingRecord;
        } else {
            currentHistory.unshift(editingRecord);
        }
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
            pendingBulkSlotSave = null;
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

        const rect = appRect(boxEl);
        const vp = appViewport();
        const popupWidth = customTagPopup.offsetWidth || 220;
        const popupHeight = customTagPopup.offsetHeight || 90;

        let left = rect.left + window.scrollX;
        let top = rect.bottom + window.scrollY + 4;

        if (left + popupWidth > vp.w) {
            left = vp.w - popupWidth - 10;
        }
        if (top + popupHeight > vp.h) {
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
    const aspectKey = getCalibrationKeyForImage(img); // Web: 'pc-4:3' / 'pc-16:9' in PC mode
    
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
        battleTypeTemplate = builtinMatch.battleTypeTemplate || BUILTIN_BATTLE_TYPE_TEMPLATE;
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

    // Web PC mode: the built-in layout of the chosen aspect ratio is used as is (no first-time calibration).
    // It can be re-adjusted later from Settings (トリミング範囲の再設定).
    if (isPcMode() && BUILTIN_CALIBRATION_PROFILES[aspectKey]) {
        try {
            cachedProfiles[aspectKey] = profile;
            localStorage.setItem('tactical_archive_calibration_profiles', JSON.stringify(cachedProfiles));
        } catch (e) {}
        return { profile, isCached: true };
    }
    // NOTE: Not persisted here. The profile is saved only when the user completes the Crop Inspector
    // (applyCropInspector), so cancelling the first-time calibration shows the wizard again next time.
    return { profile, isCached: false };
}

// Extract date & timestamp from File object (using filename patterns or lastModified timestamp, with local timezone fallback)
function extractDateFromFile(file) {
    let dateStr = '';
    let timestamp = null;

    if (file && file.name) {
        // Pattern 1: YYYY-MM-DD or YYYY_MM_DD with optional time HH-MM-SS / HH_MM_SS / HHMMSS
        const mDelim = file.name.match(/(?:^|[^0-9])(20\d{2})[-_. /](0[1-9]|1[0-2])[-_. /](0[1-9]|[12]\d|3[01])(?:[-_. T/]?([01]\d|2[0-3])[-_.:]?([0-5]\d)[-_.:]?([0-5]\d)?)?(?:[^0-9]|$)/);
        if (mDelim) {
            const y = parseInt(mDelim[1], 10);
            const m = parseInt(mDelim[2], 10);
            const d = parseInt(mDelim[3], 10);
            const hh = mDelim[4] ? parseInt(mDelim[4], 10) : null;
            const mm = mDelim[5] ? parseInt(mDelim[5], 10) : null;
            const ss = mDelim[6] ? parseInt(mDelim[6], 10) : null;
            dateStr = `${mDelim[1]}-${mDelim[2]}-${mDelim[3]}`;

            if (hh !== null && mm !== null) {
                timestamp = new Date(y, m - 1, d, hh, mm, ss || 0).getTime();
            }
        }

        // Pattern 2: YYYYMMDD with optional HHMMSS (e.g. Screenshot_20260919_185700.png)
        if (!dateStr) {
            const mConsec = file.name.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[-_T]?([01]\d|2[0-3])([0-5]\d)([0-5]\d)?)?(?:[^0-9]|$)/);
            if (mConsec) {
                const y = parseInt(mConsec[1], 10);
                const m = parseInt(mConsec[2], 10);
                const d = parseInt(mConsec[3], 10);
                const hh = mConsec[4] ? parseInt(mConsec[4], 10) : null;
                const mm = mConsec[5] ? parseInt(mConsec[5], 10) : null;
                const ss = mConsec[6] ? parseInt(mConsec[6], 10) : null;
                dateStr = `${mConsec[1]}-${mConsec[2]}-${mConsec[3]}`;

                if (hh !== null && mm !== null) {
                    timestamp = new Date(y, m - 1, d, hh, mm, ss || 0).getTime();
                }
            }
        }
    }

    // If filename gave date but not full time, try using file.lastModified for time
    if (file && file.lastModified) {
        const fileDate = new Date(file.lastModified);
        if (!isNaN(fileDate.getTime())) {
            const now = new Date();
            const maxFuture = now.getTime() + 24 * 60 * 60 * 1000;
            if (fileDate.getFullYear() >= 2020 && fileDate.getTime() <= maxFuture) {
                if (!dateStr) {
                    const pad = (n) => String(n).padStart(2, '0');
                    dateStr = `${fileDate.getFullYear()}-${pad(fileDate.getMonth() + 1)}-${pad(fileDate.getDate())}`;
                }
                if (!timestamp) {
                    if (dateStr) {
                        const parts = dateStr.split('-').map(Number);
                        const combined = new Date(file.lastModified);
                        combined.setFullYear(parts[0], parts[1] - 1, parts[2]);
                        timestamp = combined.getTime();
                    } else {
                        timestamp = file.lastModified;
                    }
                }
            }
        }
    }

    // Fallback: device local current time
    if (!timestamp) {
        timestamp = Date.now();
    }
    if (!dateStr) {
        const d = new Date(timestamp);
        const pad = (n) => String(n).padStart(2, '0');
        dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    console.log(`Extracted Date & Time: dateStr="${dateStr}", timestamp=${timestamp} (${new Date(timestamp).toLocaleString('ja-JP')})`);
    return { dateStr, timestamp };
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
    
    // Extract Date and Timestamp (including hours, minutes, seconds)
    const dateInfo = extractDateFromFile(file);
    const extractedDate = dateInfo.dateStr;
    const extractedTimestamp = dateInfo.timestamp;

    try {
        let img = new Image();
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

        // Web PC mode: only the chosen aspect ratio is accepted; other sizes of it are resized
        if (isPcMode()) {
            const pcAspect = getPcAspect();
            const detected = classifyPcAspect(img.width, img.height);
            if (detected !== pcAspect) {
                pcSkippedCount++;
                const what = detected ? `${detected} の画像` : `${img.width}×${img.height} の画像`;
                showToast(`${pcAspect} のスクリーンショットを読み込んでください（${what}をスキップしました）`, 'warn', 5000);
                scannerScreen.style.display = 'none';
                dropZone.style.display = 'flex';
                uploadQueue.shift();
                processNextInUploadQueue();
                return;
            }
            img = await normalizePcScreenshot(img, pcAspect);
            if (isScanCancelled) return;
        }

        lastUploadedImage = img;
        currentUploadFile = file;
        currentUploadExtractedDate = extractedDate;
        currentUploadExtractedTimestamp = extractedTimestamp;

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
        await runRecognitionPipeline(img, profile, file, extractedDate, extractedTimestamp);

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

async function runRecognitionPipeline(img, profile, file, extractedDate, extractedTimestamp) {
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
    if (isScanCancelled) return;

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
    if (isScanCancelled) return;

    const reviewData = {
        result: battleResult,
        battleType: detectedBattleType,
        date: extractedDate,
        timestamp: extractedTimestamp,
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
            cropIcon: iconDataUrl, // raw crop from the screenshot (shown in the student selector)
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
            cropIcon: iconDataUrl, // raw crop from the screenshot (shown in the student selector)
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

    if (isScanCancelled) return;

    // Populate Review UI
    currentUploadData = reviewData;
    populateReviewModal(reviewData);

    // Fast Mode: auto-register when no manual check is needed, then continue with the next screenshot
    const fastModeStopReason = isFastMode ? getFastModeStopReason(reviewData) : null;
    if (isFastMode && !fastModeStopReason && typeof window.saveReviewFromModal === 'function') {
        if (isScanCancelled) return;
        scanStatusText.innerText = '高速モード: 自動登録しています...';
        // Count before saving: the save advances the queue and the batch-end summary may run inside it
        fastModeAutoSavedCount++;
        try {
            await window.saveReviewFromModal();
            return;
        } catch (err) {
            fastModeAutoSavedCount = Math.max(0, fastModeAutoSavedCount - 1);
            console.error('Fast mode auto-save failed:', err);
            scannerScreen.style.display = 'none';
            reviewModal.classList.add('active');
            return;
        }
    }

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
    updateReviewNameCheck();
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
        showSelectorCrop(slotData);
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
        currentActiveProfile.battleTypeTemplate = BUILTIN_BATTLE_TYPE_TEMPLATE;
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
    const rect = appRect(cropInspectorCanvas);
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
        const rect = appRect(cropInspectorCanvas);
        lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        lastTouchMidX = (evAppX(t1) + evAppX(t2)) / 2 - rect.left;
        lastTouchMidY = (evAppY(t1) + evAppY(t2)) / 2 - rect.top;
    } else {
        startPointerX = evAppX(pointerSource(e));
        startPointerY = evAppY(pointerSource(e));
    }
}

function handleInspectorPointerMove(e) {
    if (!isPanning || !cropInspectorCanvas) return;

    if (e.touches && e.touches.length >= 2) {
        // Pinch to Zoom centered at finger midpoint
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const rect = appRect(cropInspectorCanvas);
        const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const curMidX = (evAppX(t1) + evAppX(t2)) / 2 - rect.left;
        const curMidY = (evAppY(t1) + evAppY(t2)) / 2 - rect.top;

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

    const curX = evAppX(pointerSource(e));
    const curY = evAppY(pointerSource(e));
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
    const rect = appRect(cropInspectorCanvas);
    const mx = evAppX(e) - rect.left;
    const my = evAppY(e) - rect.top;

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
        if (currentUploadFile && currentUploadExtractedDate && !isScanCancelled) {
            await runRecognitionPipeline(lastUploadedImage, currentActiveProfile, currentUploadFile, currentUploadExtractedDate, currentUploadExtractedTimestamp);
        } else if (!currentUploadFile) {
            showToast('トリミング範囲を保存しました。次に読み込むスクショから反映されます', 'success');
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
        slotData.cropIcon = iconDataUrl;
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
        slotData.cropIcon = iconDataUrl;
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
        // Review Modal: keep the face features cropped from the screenshot so they are learned as a new pattern on save.
        // Detail Modal: slots hold no crop features (only the previously shown student's), so use the selected student's.
        if (modal === 'detail' || !slot.faceFeatures) {
            slot.faceFeatures = (student.features && student.features.length > 0) ? student.features[0] : null;
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
    
    // Use LOCAL date (toISOString() is UTC and shifts JST 0:00-8:59 records to the previous day)
    const createdDate = new Date(item.created_at);
    const isValidDate = !isNaN(createdDate.getTime());
    const padDate = (n) => String(n).padStart(2, '0');
    const formattedDate = isValidDate
        ? `${createdDate.getFullYear()}-${padDate(createdDate.getMonth() + 1)}-${padDate(createdDate.getDate())}`
        : '';
    document.getElementById('detail-date-input').value = formattedDate;
    document.getElementById('detail-date-str').innerText = isValidDate ? createdDate.toLocaleDateString('ja-JP') : '';
    
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
        const firstDefStudent = currentRoster.find(s => s.id === (item.defense_team && item.defense_team[0]));
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
        showSelectorCrop(null);
        searchSelectorInput.value = '';
        renderSelectorRoster();
        selectorModal.classList.add('active');
    });

    return slotEl;
}

// ---- History search (fast) ----
// Per-record cache of normalized strings (WeakMap: not stored into IndexedDB).
// Signature check keeps it valid when a record is edited in place.
const _historySearchKeyCache = new WeakMap();

function getHistorySearchKeys(item) {
    const atk = item.attack_names || [];
    const def = item.defense_names || [];
    const sig = (item.commander_name || '') + '\u0001' + atk.join('\u0002') + '\u0001' + def.join('\u0002');
    const cached = _historySearchKeyCache.get(item);
    if (cached && cached.sig === sig) return cached;
    const names = [...atk, ...def].filter(Boolean);
    const keys = {
        sig,
        cmdLower: (item.commander_name || '').toLowerCase(),
        cmdHira: toHiragana(item.commander_name || ''),
        namesLower: names.map(n => n.toLowerCase()),
        namesHira: names.map(n => toHiragana(n))
    };
    _historySearchKeyCache.set(item, keys);
    return keys;
}

// Build the search criteria once per search (terms, normalized forms, matching roster IDs)
function buildHistorySearchCriteria(type) {
    const searchEl = document.getElementById(`search-commander-${type}`);
    const searchVal = (searchEl?.value || '').toLowerCase().trim();
    const terms = searchVal === '' ? [] : searchVal.split(/[\s,，、]+/).filter(t => t.length > 0).map(term => {
        const lowerTerm = term.toLowerCase();
        const hiraTerm = toHiragana(term);
        const studentIds = new Set(
            currentRoster
                .filter(s => s.name && (s.name.toLowerCase().includes(lowerTerm) || (hiraTerm && toHiragana(s.name).includes(hiraTerm))))
                .map(s => s.id)
        );
        return { lowerTerm, hiraTerm, studentIds };
    });
    return {
        type,
        searchVal,
        terms,
        positionFilter: getEffectivePositionFilter(type),
        teamFilter: (activeTeamFilter && activeTeamFilter.tabs.includes(type)) ? activeTeamFilter : null
    };
}

function historyMatchesCriteria(item, criteria) {
    // Tab (battle type)
    if (criteria.type === 'defense') {
        if (item.battle_type !== 'defense') return false;
    } else if (item.battle_type === 'defense') {
        return false;
    }

    // Position Filter (D1 Eimi, D5/D6 Special order-independent, etc.)
    const pf = criteria.positionFilter;
    if (pf) {
        const { team, index, studentName } = pf;
        const namesArray = (team === 'attack') ? item.attack_names : item.defense_names;
        const matchSlot = (i) => {
            if (!studentName || studentName === '生徒' || studentName === '未登録') return false;
            return (namesArray && namesArray[i]) === studentName;
        };
        if (index >= 4) {
            if (!matchSlot(4) && !matchSlot(5)) return false;
        } else if (!matchSlot(index)) {
            return false;
        }
    }

    // Team search across every opponent (「全体で編成検索」)
    if (criteria.teamFilter && !teamFilterMatches(item, criteria.teamFilter)) return false;

    // Search commander name / student name / team composition (all terms must match)
    if (criteria.terms.length > 0) {
        const keys = getHistorySearchKeys(item);
        for (const t of criteria.terms) {
            // 1. Commander name (Hiragana / Katakana bidirectional match)
            if (keys.cmdLower.includes(t.lowerTerm) || (t.hiraTerm && keys.cmdHira.includes(t.hiraTerm))) continue;
            // 2. Student names saved in the record
            let matched = false;
            for (let i = 0; i < keys.namesLower.length; i++) {
                if (keys.namesLower[i].includes(t.lowerTerm) || (t.hiraTerm && keys.namesHira[i].includes(t.hiraTerm))) {
                    matched = true;
                    break;
                }
            }
            // 3. Student IDs (records whose snapshot names are missing)
            if (!matched && t.studentIds.size > 0) {
                matched = (item.attack_team || []).some(id => t.studentIds.has(id)) ||
                          (item.defense_team || []).some(id => t.studentIds.has(id));
            }
            if (!matched) return false;
        }
    }
    return true;
}

function compareHistoryDesc(a, b) {
    return (b.created_at - a.created_at) || ((b.id || 0) - (a.id || 0));
}

function isHistoryTab(type) {
    return type === 'attack' || type === 'defense';
}

// Filter and render History items (only the requested tab)
async function filterHistory(type = 'attack') {
    // Web: when narrowed to anonymous opponents, the table shows a slim name column and the SP tags
    const searchEl = document.getElementById(`search-commander-${type}`);
    const paneEl = document.getElementById(`tab-${type}`);
    if (paneEl) paneEl.classList.toggle('anon-filter', ((searchEl && searchEl.value) || '').replace(/[\s　]+/g, '') === '匿名');
    const criteria = buildHistorySearchCriteria(type);
    const filtered = currentHistory.filter(item => historyMatchesCriteria(item, criteria));
    renderTeamFilterBanner(type);
    renderHistoryItems(filtered, type, criteria);
    requestAnimationFrame(updateHistoryIconSize);
}

// Render History View: only the visible history tab is searched.
// The other tab is re-filtered when it is opened (switchToTab calls filterHistory).
async function updateHistoryView() {
    if (isHistoryTab(activeTab)) {
        await filterHistory(activeTab);
    }
}

// Merge newly loaded (older) records into the visible tab without re-rendering everything
function appendLoadedRecordsToView(newItems) {
    if (!newItems || newItems.length === 0) return;
    const type = activeTab;
    if (!isHistoryTab(type)) return;
    const state = historyRenderState[type];
    if (!state || !state.criteria) return;

    const matched = newItems.filter(item => historyMatchesCriteria(item, state.criteria));
    if (matched.length === 0) return;

    const tbody = document.getElementById(`${type}-history-items`);
    if (!tbody) return;
    if (state.allFiltered.length === 0) {
        tbody.innerHTML = ''; // remove the empty-state row
    }

    // Keep the number of rendered rows (first page, or how far the user has scrolled)
    const renderLimit = Math.max(HISTORY_PAGE_SIZE, state.renderedCount);

    matched.sort(compareHistoryDesc);
    for (const item of matched) {
        // Binary search for the insertion point in the date-descending list
        let lo = 0, hi = state.allFiltered.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (compareHistoryDesc(state.allFiltered[mid], item) <= 0) lo = mid + 1;
            else hi = mid;
        }
        state.allFiltered.splice(lo, 0, item);
        if (lo < state.renderedCount) {
            // Falls inside the already-rendered range: insert the row at its place
            tbody.insertBefore(createHistoryRowElement(item, type), tbody.children[lo] || null);
            state.renderedCount++;
            // Rows pushed past the limit are removed; they stay in allFiltered and render again on scroll
            while (state.renderedCount > renderLimit && tbody.lastElementChild) {
                tbody.removeChild(tbody.lastElementChild);
                state.renderedCount--;
            }
        }
        state.total++;
        if (item.result === 'WIN') state.wins++;
    }
    updateHistoryStats(type, state.total, state.wins);

    // Fill the first page if it is not full yet
    if (state.renderedCount < HISTORY_PAGE_SIZE) {
        renderNextHistoryBatch(type, HISTORY_PAGE_SIZE - state.renderedCount);
    }
}

// Synchronized Search Input handler (Shared across Attack and Defense tabs, callable from any scope)
async function syncSearchInput(value, clearPositionFilter = false) {
    // A direct call (clear button, commander tap, etc.) supersedes any pending typed search
    if (_searchInputTimer) {
        clearTimeout(_searchInputTimer);
        _searchInputTimer = null;
    }
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

    // Search what is loaded now; older records are merged in as they finish loading
    await updateHistoryView();
}
window.syncSearchInput = syncSearchInput;

// Typing: search on every character, including uncommitted IME text (no need to confirm conversion).
// Events in the same tick are coalesced into one search, and the value is read when the search runs
// so it always reflects the latest composing text.
let _searchInputTimer = null;
function scheduleSearchInput(inputEl) {
    if (_searchInputTimer) return;
    _searchInputTimer = setTimeout(() => {
        _searchInputTimer = null;
        syncSearchInput(inputEl.value, false);
    }, 0);
}

const HISTORY_PAGE_SIZE = 30;

// Pagination state for incremental rendering
const historyRenderState = {
    attack: { allFiltered: [], renderedCount: 0, total: 0, wins: 0, criteria: null },
    defense: { allFiltered: [], renderedCount: 0, total: 0, wins: 0, criteria: null }
};

function updateHistoryStats(type, total, wins) {
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const statTotalEl = document.getElementById(`stat-total-battles-${type}`);
    const statWinRateEl = document.getElementById(`stat-win-rate-${type}`);
    const statRatioEl = document.getElementById(`stat-win-lose-ratio-${type}`);
    if (statTotalEl) statTotalEl.innerText = total;
    if (statWinRateEl) statWinRateEl.innerText = `${winRate}%`;
    if (statRatioEl) statRatioEl.innerText = `${wins} / ${total - wins}`;
}

function getHistoryEmptyStateHtml() {
    const msg = isFullHistoryLoaded
        ? '対戦履歴が見つかりません。スクショをアップロードしてください。'
        : '対戦履歴を読み込み中です...';
    const icon = isFullHistoryLoaded ? 'fa-box-open' : 'fa-circle-notch fa-spin';
    return `
            <tr>
                <td colspan="8" class="empty-state">
                    <i class="fa-solid ${icon}"></i>
                    <p>${msg}</p>
                </td>
            </tr>
        `;
}

// After loading finishes, replace "loading" placeholders with the normal empty message
function refreshHistoryEmptyStates() {
    ['attack', 'defense'].forEach(type => {
        const state = historyRenderState[type];
        const tbody = document.getElementById(`${type}-history-items`);
        if (state && tbody && state.allFiltered.length === 0) {
            tbody.innerHTML = getHistoryEmptyStateHtml();
        }
    });
}

async function renderNextHistoryBatch(type = 'attack', count = HISTORY_PAGE_SIZE) {
    const state = historyRenderState[type];
    if (!state) return;
    if (state.renderedCount >= state.allFiltered.length) return;

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

function renderHistoryItems(historyArray, type = 'attack', criteria = null) {
    // 1. Calculate stats on the filtered dataset (grows as older records finish loading)
    const total = historyArray.length;
    let wins = 0;
    historyArray.forEach(h => {
        if (h.result === 'WIN') wins++;
    });
    updateHistoryStats(type, total, wins);

    const tbody = document.getElementById(`${type}-history-items`);
    if (!tbody) return;
    tbody.innerHTML = '';

    // Sort all matched data by Date descending (fall back to ID descending for same-day items)
    const sorted = [...historyArray].sort(compareHistoryDesc);

    // Set pagination state (criteria is kept so progressively loaded records use the same filter)
    historyRenderState[type] = {
        allFiltered: sorted,
        renderedCount: 0,
        total,
        wins,
        criteria: criteria || buildHistorySearchCriteria(type)
    };

    if (sorted.length === 0) {
        tbody.innerHTML = getHistoryEmptyStateHtml();
        return;
    }

    // Reset scroll position to top
    const wrapper = document.querySelector(`#tab-${type} .history-list-wrapper`);
    if (wrapper) wrapper.scrollTop = 0;

    // Render initial batch of 30 records
    renderNextHistoryBatch(type, HISTORY_PAGE_SIZE);
}

function createHistoryRowElement(item, type = 'attack') {
    const row = document.createElement('tr');
    // Web v2: which side won (for the phone card colors) and which team is the user's own
    const recType = item.battle_type === 'defense' ? 'defense' : 'attack';
    row.className = `history-row ${item.result === 'WIN' ? 'row-win' : 'row-lose'}`;
    row.dataset.mine = recType;
    row.dataset.winner = ((item.result === 'WIN') === (recType === 'attack')) ? 'attack' : 'defense';
    
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
    resBadge.className = `result-badge ${(item.result || 'lose').toLowerCase()}`;
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
    tdDate.className = 'history-date-cell td-date';
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
        const firstDefStudent = currentRoster.find(s => s.id === (item.defense_team && item.defense_team[0]));
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
    
    // Long-press (or right-click) on the opponent name: popup with the students this opponent has used
    {
        let lpTimer = null, lpX = 0, lpY = 0;
        const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        commEl.style.webkitUserSelect = 'none';
        commEl.style.userSelect = 'none';
        commEl.style.webkitTouchCallout = 'none';
        commEl.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            commEl.dataset.longpress = '';
            lpX = e.clientX; lpY = e.clientY;
            cancelLp();
            lpTimer = setTimeout(() => {
                lpTimer = null;
                commEl.dataset.longpress = '1'; // the click that follows the release must not filter
                showOpponentRosterPopup(item.commander_name);
            }, 550);
        });
        commEl.addEventListener('pointermove', (e) => {
            if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) cancelLp();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => commEl.addEventListener(t, cancelLp));
        commEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelLp();
            showOpponentRosterPopup(item.commander_name);
        });
    }

    commEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (commEl.dataset.longpress === '1') {
            commEl.dataset.longpress = '';
            return;
        }
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
        const studentId = item.attack_team ? item.attack_team[i] : null;
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
        const studentId = item.defense_team ? item.defense_team[i] : null;
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
    
    tdResult.className = 'td-result';
    tdUtility.className = 'td-utility';
    tdComm.className = 'td-commander';
    tdAttack.className = 'td-team td-attack';
    tdVs.className = 'td-vs';
    tdDefense.className = 'td-team td-defense';
    tdTags.className = 'td-tags';
    row.appendChild(tdResult);
    row.appendChild(tdUtility);
    row.appendChild(tdDate);
    row.appendChild(tdComm);
    // Web: the user's own team is always on the left (defense records: defense | attack)
    const leftTeam = recType === 'defense' ? tdDefense : tdAttack;
    const rightTeam = recType === 'defense' ? tdAttack : tdDefense;
    leftTeam.classList.add('td-left');
    rightTeam.classList.add('td-right');
    row.appendChild(leftTeam);
    row.appendChild(tdVs);
    row.appendChild(rightTeam);
    row.appendChild(tdTags);
    
    return row;
}

// ==========================================
// OPPONENT ROSTER POPUP (long-press / right-click on an opponent name)
// Lists every student the opponent has used in the history: strikers (slots 1-4) and specials (5-6)
// ==========================================
function resolveHistorySlotStudent(item, team, index) {
    const names = team === 'attack' ? item.attack_names : item.defense_names;
    const ids = team === 'attack' ? item.attack_team : item.defense_team;
    const savedName = names && names[index];
    const validSaved = savedName && savedName !== '生徒' && savedName !== '未登録';
    let student = null;
    if (validSaved) student = currentRoster.find(s => s.name === savedName);
    if (!student && ids && ids[index]) student = currentRoster.find(s => s.id === ids[index]);
    const name = (student && student.name) || (validSaved ? savedName : '');
    return name ? { name, icon: (student && student.icon_path) || null } : null;
}

async function showOpponentRosterPopup(opponentName) {
    opponentName = (opponentName || '').trim();
    if (!opponentName || opponentName === 'Unknown') return;

    let overlay = document.getElementById('opponent-roster-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'opponent-roster-modal';
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2600';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
        document.body.appendChild(overlay);
    }
    // A long-press can also fire 'contextmenu': don't rebuild the same popup twice
    if (overlay.classList.contains('active') && overlay.dataset.name === opponentName) return;

    if (!isFullHistoryLoaded) {
        try { await ensureFullHistoryLoaded(); } catch (e) {}
    }
    const allRecords = currentHistory.filter(h => (h.commander_name || '').trim() === opponentName);
    // The opponent's team: defense team in my attack records, attack team in my defense records
    const oppTeamOf = (item) => item.battle_type === 'defense' ? 'attack' : 'defense';

    // Narrowing: { kind: 'striker', slot: 0-3, name } / { kind: 'special', name } — all must match
    let filters = [];
    const matchesFilters = (item) => filters.every(f => {
        const team = oppTeamOf(item);
        if (f.kind === 'striker') {
            const s = resolveHistorySlotStudent(item, team, f.slot);
            return !!s && s.name === f.name;
        }
        return [4, 5].some(i => {
            const s = resolveHistorySlotStudent(item, team, i);
            return !!s && s.name === f.name;
        });
    });

    // mode: 'defense' = the opponent's defense team (my attack records), 'attack' = the opponent's attack team (my defense records), 'both'
    // base* = every record of the mode (keeps the list and layout stable); count / slots = narrowed records
    const aggregate = (mode) => {
        const base = allRecords.filter(h => mode === 'both' || (mode === 'attack' ? h.battle_type === 'defense' : h.battle_type !== 'defense'));
        const narrowed = filters.length ? base.filter(matchesFilters) : base;
        const strikers = new Map();
        const specials = new Map();
        const add = (item, isBase) => {
            const team = oppTeamOf(item);
            for (let i = 0; i < 6; i++) {
                const s = resolveHistorySlotStudent(item, team, i);
                if (!s) continue;
                const map = i >= 4 ? specials : strikers;
                const entry = map.get(s.name) || { name: s.name, icon: s.icon, count: 0, slots: [0, 0, 0, 0], baseCount: 0, baseSlots: [0, 0, 0, 0] };
                if (isBase) {
                    entry.baseCount++;
                    if (i < 4) entry.baseSlots[i]++;
                } else {
                    entry.count++;
                    if (i < 4) entry.slots[i]++;
                }
                if (!entry.icon && s.icon) entry.icon = s.icon;
                map.set(s.name, entry);
            }
        };
        base.forEach(item => add(item, true));
        narrowed.forEach(item => add(item, false));
        return { records: narrowed, total: base.length, strikers, specials };
    };
    const SLOT_PREFIX = { defense: 'D', attack: 'A', both: '' };
    const MODE_LABEL = { both: '両方', defense: '防衛', attack: '攻撃' };
    let mode = 'defense';

    overlay.innerHTML = '';
    overlay.dataset.name = opponentName;
    const card = document.createElement('div');
    card.className = 'modal-card opponent-roster-card';
    card.style.cssText = 'width:min(560px,94%);max-width:560px;max-height:calc(100% - 24px);display:flex;flex-direction:column;padding:0;overflow:hidden;background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(16,32,56,0.25);';

    // Header: avatar + name + record count
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e1e7f0;flex-shrink:0;';
    const avatarSrc = opponentDirectory[opponentName];
    if (avatarSrc) {
        const av = document.createElement('img');
        av.src = avatarSrc;
        av.style.cssText = 'width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#e6ecf4;';
        header.appendChild(av);
    }
    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';
    const title = document.createElement('div');
    title.textContent = opponentName;
    title.style.cssText = 'font-size:16px;font-weight:800;color:#18273a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11.5px;color:#8a97a8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    titleBox.appendChild(title);
    titleBox.appendChild(sub);
    header.appendChild(titleBox);
    // Which of the opponent's teams to show (default: defense = the team I attacked)
    const seg = document.createElement('div');
    seg.className = 'seg orp-mode';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', '相手の編成');
    ['both', 'defense', 'attack'].forEach(m => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg-btn' + (m === mode ? ' active' : '');
        b.dataset.val = m;
        b.textContent = MODE_LABEL[m];
        b.title = m === 'defense' ? '相手の防衛編成（こちらが攻撃した戦績）' : m === 'attack' ? '相手の攻撃編成（こちらが防衛した戦績）' : '攻撃・防衛の両方';
        b.addEventListener('click', () => {
            if (mode === m) return;
            mode = m;
            filters = []; // slot labels differ between modes: start over
            seg.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x.dataset.val === m));
            renderBody();
        });
        seg.appendChild(b);
    });
    // Search every opponent's history with the selected placement conditions
    const globalBtn = document.createElement('button');
    globalBtn.type = 'button';
    globalBtn.className = 'orp-global-search';
    globalBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 全体で編成検索';
    globalBtn.title = '選んでいる条件で、すべての対戦相手の履歴を絞り込みます';
    globalBtn.addEventListener('click', () => {
        if (!filters.length) return;
        const tabs = mode === 'both' ? ['attack', 'defense'] : [mode === 'defense' ? 'attack' : 'defense'];
        activeTeamFilter = { tabs, conds: filters.map(f => Object.assign({}, f)) };
        overlay.classList.remove('active');
        const target = (mode === 'both' && isHistoryTab(activeTab)) ? activeTab : tabs[0];
        syncSearchInput('', true); // other opponents too: clear the name search
        window.switchToTab(target);
    });
    header.appendChild(globalBtn);
    header.appendChild(seg);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.style.cssText = 'width:34px;height:34px;border-radius:10px;border:1px solid #e1e7f0;background:#fff;color:#536377;font-size:15px;cursor:pointer;flex-shrink:0;';
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    header.appendChild(closeBtn);
    card.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'overflow-y:auto;padding:12px 14px 16px;display:flex;flex-direction:column;gap:14px;';

    const isStrikerSelected = (name) => filters.some(f => f.kind === 'striker' && f.name === name);
    const isSpecialSelected = (name) => filters.some(f => f.kind === 'special' && f.name === name);
    const pickStriker = (name, slot) => {
        if (slot == null) filters = filters.filter(f => !(f.kind === 'striker' && f.name === name));
        else filters = filters.filter(f => !(f.kind === 'striker' && f.slot === slot)).concat([{ kind: 'striker', slot, name }]);
        renderBody();
    };
    const toggleSpecial = (name) => {
        if (isSpecialSelected(name)) filters = filters.filter(f => !(f.kind === 'special' && f.name === name));
        else filters = filters.concat([{ kind: 'special', name }]);
        renderBody();
    };

    // Active narrowing conditions
    const buildFilterBar = () => {
        const bar = document.createElement('div');
        bar.className = 'orp-filterbar';
        const label = document.createElement('span');
        label.className = 'orp-filterbar-label';
        label.innerHTML = '<i class="fa-solid fa-filter"></i> 絞り込み';
        bar.appendChild(label);
        filters.forEach(f => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'orp-chip' + (f.kind === 'special' ? ' sp' : '');
            if (f.kind === 'striker') chip.style.setProperty('--slot-color', ROSTER_SLOT_COLORS[f.slot]);
            const tag = f.kind === 'striker' ? `${SLOT_PREFIX[mode] || ''}${f.slot + 1}` : 'SP';
            chip.innerHTML = `<b>${tag}</b>${escapeHtml(f.name)}<i class="fa-solid fa-xmark"></i>`;
            chip.title = 'この条件を外す';
            chip.addEventListener('click', () => {
                filters = filters.filter(x => x !== f);
                renderBody();
            });
            bar.appendChild(chip);
        });
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'orp-clear';
        clear.textContent = 'すべて解除';
        clear.addEventListener('click', () => { filters = []; renderBody(); });
        bar.appendChild(clear);
        return bar;
    };

    // Specials: click to narrow to records with this student in a special slot
    const specialSection = (map) => {
        const color = '#1a8cff';
        const wrap = document.createElement('div');
        const head = document.createElement('div');
        head.textContent = `スペシャル（${map.size}人）`;
        head.style.cssText = `font-size:12.5px;font-weight:800;color:${color};margin-bottom:8px;padding-left:8px;border-left:3px solid ${color};`;
        wrap.appendChild(head);
        if (map.size === 0) {
            const empty = document.createElement('div');
            empty.textContent = '記録がありません';
            empty.style.cssText = 'font-size:12px;color:#8a97a8;padding:4px 8px;';
            wrap.appendChild(empty);
            return wrap;
        }
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:8px;';
        [...map.values()].sort((a, b) => b.baseCount - a.baseCount || a.name.localeCompare(b.name, 'ja')).forEach(st => {
            const selected = isSpecialSelected(st.name);
            const cell = document.createElement('div');
            cell.className = 'orp-sp-cell' + (st.count === 0 ? ' zero' : '') + (selected ? ' selected' : '');
            cell.title = selected ? 'クリックで絞り込みを外す' : (st.count ? 'クリックでこの生徒の編成に絞り込み' : '');
            const img = st.icon ? `<img src="${escapeHtml(st.icon)}" alt="">` : `<div class="orp-ph">${escapeHtml(st.name.slice(0, 2))}</div>`;
            cell.innerHTML = `${img}<div class="orp-name">${escapeHtml(st.name)}</div><span class="orp-count sp">×${st.count}</span>`;
            cell.addEventListener('click', () => {
                if (st.count === 0 && !selected) return;
                toggleSpecial(st.name);
            });
            grid.appendChild(cell);
        });
        wrap.appendChild(grid);
        return wrap;
    };

    // Widen the card so every striker fits on one row (sized for "both" so switching does not resize it)
    const maxStrikers = aggregate('both').strikers.size;
    card.style.width = `min(${Math.max(560, maxStrikers * 78 + 60)}px, 94%)`;
    card.style.maxWidth = '94%';
    card.appendChild(body);

    const renderBody = () => {
        const { records, total, strikers, specials } = aggregate(mode);
        const countText = filters.length ? `${records.length} / ${total}戦` : `${total}戦`;
        globalBtn.disabled = filters.length === 0;
        sub.textContent = `手持ち生徒・${MODE_LABEL[mode]}（${countText}の記録から）` + (opponentName === '匿名' ? '・匿名の相手はまとめて集計' : '');
        body.innerHTML = '';
        if (filters.length) body.appendChild(buildFilterBar());
        const strikerFlow = buildStrikerSlotFlow(strikers, SLOT_PREFIX[mode], { isSelected: isStrikerSelected, onPick: pickStriker });
        if (strikerFlow) body.appendChild(strikerFlow);
        body.appendChild(specialSection(specials));
        if (strikerFlow && strikerFlow._draw) requestAnimationFrame(strikerFlow._draw);
    };

    overlay.appendChild(card);
    overlay.classList.add('active');
    renderBody();
}

// Slot colors for positions 1-4 (lines use the color of the slot they lead to)
const ROSTER_SLOT_COLORS = ['#f08c00', '#0ca678', '#228be6', '#7048e8'];

// ctx: { isSelected(name), onPick(name, slot | null) } — clicking a student narrows the popup to that placement
function buildStrikerSlotFlow(strikers, slotPrefix = '', ctx = null) {
    const wrapEmpty = () => {
        const wrap = document.createElement('div');
        wrap.innerHTML = '<div class="orp-section-head">ストライカー（0人）</div><div style="font-size:12px;color:#8a97a8;padding:4px 8px;">記録がありません</div>';
        return wrap;
    };
    if (!strikers || strikers.size === 0) return wrapEmpty();
    const list = [...strikers.values()].map(st => {
        const baseSlots = st.baseSlots || st.slots;
        const placed = baseSlots.reduce((a, b) => a + b, 0) || 1;
        const mean = baseSlots.reduce((a, c, i) => a + c * i, 0) / placed;
        return Object.assign({}, st, { mean });
    });
    // Order by the average slot (over all records of the mode, so the layout stays put while narrowing)
    list.sort((a, b) => a.mean - b.mean || (b.baseCount || b.count) - (a.baseCount || a.count) || a.name.localeCompare(b.name, 'ja'));
    const maxPair = Math.max(1, ...list.map(st => Math.max(...st.slots)));
    const slotTotals = [0, 1, 2, 3].map(i => list.filter(st => st.slots[i] > 0).length);

    const wrap = document.createElement('div');
    wrap.className = 'orp-flow';
    const head = document.createElement('div');
    head.className = 'orp-section-head';
    head.innerHTML = `ストライカー（${list.length}人）<span>線の太さ ＝ その位置で使われた回数・生徒をクリックで絞り込み</span>`;
    wrap.appendChild(head);

    const stage = document.createElement('div');
    stage.className = 'orp-stage';
    const slotsRow = document.createElement('div');
    slotsRow.className = 'orp-slots';
    const slotEls = [0, 1, 2, 3].map(i => {
        const el = document.createElement('div');
        el.className = 'orp-slot';
        el.dataset.slot = i;
        el.style.setProperty('--slot-color', ROSTER_SLOT_COLORS[i]);
        el.innerHTML = `<b>${slotPrefix}${i + 1}</b><span>${slotTotals[i]}人</span>`;
        slotsRow.appendChild(el);
        return el;
    });
    stage.appendChild(slotsRow);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'orp-lines');
    svg.setAttribute('aria-hidden', 'true');
    stage.appendChild(svg);

    const slotLabel = (i) => slotPrefix ? `${slotPrefix}${i + 1}` : `${i + 1}番`;
    let openChooser = null;
    const closeChooser = () => { if (openChooser) { openChooser.remove(); openChooser = null; } };

    const row = document.createElement('div');
    row.className = 'orp-students';
    const cellEls = list.map((st, idx) => {
        const selected = !!(ctx && ctx.isSelected(st.name));
        const cell = document.createElement('div');
        cell.className = 'orp-student' + (st.count === 0 ? ' zero' : '') + (selected ? ' selected' : '');
        cell.dataset.st = idx;
        cell.title = `${st.name}（${st.count}回）\n` + st.slots.map((c, i) => `${slotLabel(i)}：${c}回`).join('　')
            + (ctx ? (selected ? '\nクリックで絞り込みを外す' : (st.count ? '\nクリックでこの配置に絞り込み' : '')) : '');
        const img = st.icon ? `<img src="${escapeHtml(st.icon)}" alt="">` : `<div class="orp-ph">${escapeHtml(st.name.slice(0, 2))}</div>`;
        const bar = st.slots.map((c, i) => c ? `<i style="flex:${c};background:${ROSTER_SLOT_COLORS[i]}"></i>` : '').join('');
        cell.innerHTML = `${img}<span class="orp-count">×${st.count}</span><div class="orp-name">${escapeHtml(st.name)}</div><div class="orp-bar">${bar}</div>`;
        if (ctx) {
            cell.addEventListener('click', (e) => {
                if (e.target.closest('.orp-chooser')) return;
                if (selected) { closeChooser(); ctx.onPick(st.name, null); return; }
                if (st.count === 0) return;
                const used = st.slots.map((c, i) => c ? i : -1).filter(i => i >= 0);
                if (used.length === 1) { closeChooser(); ctx.onPick(st.name, used[0]); return; }
                // Placed in several slots: choose which one to narrow by
                const wasOpen = openChooser && openChooser.parentElement === cell;
                closeChooser();
                if (wasOpen) return;
                const menu = document.createElement('div');
                menu.className = 'orp-chooser';
                used.forEach(i => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.style.setProperty('--slot-color', ROSTER_SLOT_COLORS[i]);
                    b.innerHTML = `<b>${slotLabel(i)}</b>×${st.slots[i]}`;
                    b.addEventListener('click', (ev) => { ev.stopPropagation(); closeChooser(); ctx.onPick(st.name, i); });
                    menu.appendChild(b);
                });
                cell.appendChild(menu);
                openChooser = menu;
            });
        }
        row.appendChild(cell);
        return cell;
    });
    stage.appendChild(row);
    wrap.appendChild(stage);

    const draw = () => {
        if (!stage.isConnected) return;
        const base = appRect(stage);
        if (!base.width) return;
        svg.setAttribute('width', base.width);
        svg.setAttribute('height', base.height);
        svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
        svg.innerHTML = '';
        const slotRects = slotEls.map(el => appRect(el));
        const cellRects = cellEls.map(el => appRect(el));
        // Spread the line ends along each slot's bottom edge, in the order of the students below
        const slotUsers = [0, 1, 2, 3].map(i => list.map((st, idx) => st.slots[i] ? idx : -1).filter(idx => idx >= 0));
        const paths = [];
        list.forEach((st, idx) => {
            st.slots.forEach((c, i) => {
                if (!c) return;
                const sr = slotRects[i];
                const users = slotUsers[i];
                const pos = users.indexOf(idx);
                const pad = Math.min(18, sr.width * 0.18);
                const x1 = sr.left - base.left + pad + (sr.width - pad * 2) * (users.length > 1 ? pos / (users.length - 1) : 0.5);
                const y1 = sr.bottom - base.top;
                const cr = cellRects[idx];
                const used = st.slots.map((v, k) => v ? k : -1).filter(k => k >= 0);
                const off = used.length > 1 ? (used.indexOf(i) - (used.length - 1) / 2) * Math.min(9, cr.width / (used.length + 1)) : 0;
                const x2 = cr.left - base.left + cr.width / 2 + off;
                const y2 = cr.top - base.top + 1;
                const midY = (y1 + y2) / 2;
                const ratio = c / maxPair;
                const p = document.createElementNS(svgNS, 'path');
                p.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${midY.toFixed(1)} ${x2.toFixed(1)},${midY.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
                p.setAttribute('stroke', ROSTER_SLOT_COLORS[i]);
                p.setAttribute('stroke-width', (1.25 + ratio * 5.5).toFixed(2));
                p.setAttribute('stroke-opacity', (0.28 + ratio * 0.62).toFixed(2));
                p.dataset.st = idx;
                p.dataset.slot = i;
                paths.push({ p, c });
            });
        });
        // Thin lines underneath, thick ones on top
        paths.sort((a, b) => a.c - b.c).forEach(({ p }) => svg.appendChild(p));
    };
    wrap._draw = draw;
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(stage);

    // Hover (mouse): highlight one student's or one slot's lines
    const focus = (attr, val) => {
        stage.classList.toggle('orp-focus', val != null);
        svg.querySelectorAll('path').forEach(p => p.classList.toggle('on', val != null && p.dataset[attr] === String(val)));
        cellEls.forEach((el, idx) => el.classList.toggle('on', val != null && (attr === 'st' ? String(idx) === String(val) : list[idx].slots[val] > 0)));
        slotEls.forEach((el, i) => el.classList.toggle('on', val != null && (attr === 'slot' ? String(i) === String(val) : list[val].slots[i] > 0)));
    };
    cellEls.forEach((el, idx) => {
        el.addEventListener('mouseenter', (e) => { if (e.pointerType !== 'touch') focus('st', idx); });
        el.addEventListener('mouseleave', () => focus(null, null));
    });
    slotEls.forEach((el, i) => {
        el.addEventListener('mouseenter', () => focus('slot', i));
        el.addEventListener('mouseleave', () => focus(null, null));
    });
    return wrap;
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
    if (!currentHistory || currentHistory.length === 0) {
        // 履歴が空 = 旧データなし。移行済みとしてマークしないと、後から登録した防衛記録が次回起動時に攻撃へ上書きされる
        localStorage.setItem('tactical_archive_migrated_all_to_attack_v1124', 'true');
        return;
    }
    const db = await openDB();
    const itemsToUpdate = [];

    const isAllMigrated = localStorage.getItem('tactical_archive_migrated_all_to_attack_v1124');

    for (const item of currentHistory) {
        let itemUpdated = false;
        
        // ユーザー指示: 既存の戦績データは全て攻撃編成とする
        // ※ 防衛機能追加後に登録された 'defense' は正しい値なので保持する（攻撃への上書きでデータが消えるのを防止）
        if (!isAllMigrated) {
            if (item.battle_type !== 'attack' && item.battle_type !== 'defense') {
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
            if (item.attack_icons && !item.attack_icons[i] && item.attack_names && item.attack_names[i]) {
                const s = currentRoster.find(r => r.name === item.attack_names[i]);
                if (s && s.icon_path) {
                    item.attack_icons[i] = s.icon_path;
                    itemUpdated = true;
                }
            }
            if (item.defense_icons && !item.defense_icons[i] && item.defense_names && item.defense_names[i]) {
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

// Parse a backup file leniently: BOM / surrounding whitespace, and extra bytes before or after the JSON object
// (e.g. a prefix added by a file-sharing app, or leftover bytes after the closing brace) are tolerated.
function parseBackupJsonText(raw, file) {
    const text = String(raw || '').replace(/^﻿/, '').trim();
    try {
        return JSON.parse(text);
    } catch (firstErr) {
        const start = text.indexOf('{');
        let end = text.lastIndexOf('}');
        // Try the last few closing braces (extra bytes after the JSON may contain '}' too)
        for (let tries = 0; start !== -1 && end > start && tries < 50; tries++) {
            try {
                const data = JSON.parse(text.slice(start, end + 1));
                console.warn(`[Restore] Ignored ${start} byte(s) before and ${text.length - end - 1} byte(s) after the JSON`);
                return data;
            } catch (e) {
                end = text.lastIndexOf('}', end - 1);
            }
        }
        const head = text.slice(0, 30).replace(/\s+/g, ' ');
        const info = file ? `
ファイル: ${file.name}（${Math.round(file.size / 1024)}KB）` : '';
        throw new Error(`${firstErr.message}${info}
ファイルの先頭: 「${head}」`);
    }
}

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
            const data = parseBackupJsonText(re.target.result, file);
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

    // Merge mode for auto-increment stores: never reuse backup IDs (they may belong to different local records)
    const mergeHistoryStore = (items) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('battle_history', 'readwrite');
            const store = tx.objectStore('battle_history');
            const historyKey = (h) => `${h.filename || ''}|${h.created_at || ''}|${h.commander_name || ''}`;
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
                const existingKeys = new Set((getAllReq.result || []).map(historyKey));
                (items || []).forEach(item => {
                    const key = historyKey(item);
                    if (existingKeys.has(key)) return; // already registered
                    existingKeys.add(key);
                    const copy = { ...item };
                    delete copy.id;
                    store.add(copy);
                });
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    };

    const mergeRosterStore = (items) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('roster_students', 'readwrite');
            const store = tx.objectStore('roster_students');
            const nameIndex = store.index('name');
            (items || []).forEach(item => {
                if (!item || !item.name) return;
                const getReq = nameIndex.get(item.name);
                getReq.onsuccess = () => {
                    const existing = getReq.result;
                    if (existing) {
                        // Same student name: merge feature patterns, keep local ID
                        const features = [...(existing.features || [])];
                        (item.features || []).forEach(f => {
                            if (f && !features.some(ef => arraysEqual(ef, f))) features.push(f);
                        });
                        existing.features = features;
                        if (!existing.icon_path && item.icon_path) existing.icon_path = item.icon_path;
                        store.put(existing);
                    } else {
                        const copy = { ...item };
                        delete copy.id;
                        store.add(copy);
                    }
                };
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    };

    try {
        if (doHistory) {
            if (mode === 'overwrite') {
                await restoreStore('battle_history', pendingRestoreData.battle_history, true);
            } else {
                await mergeHistoryStore(pendingRestoreData.battle_history);
            }
        }
        if (doRoster) {
            if (mode === 'overwrite') {
                await restoreStore('roster_students', pendingRestoreData.roster_students, true);
            } else {
                await mergeRosterStore(pendingRestoreData.roster_students);
            }
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
        const errMsg = (e && (e.message || (e.target && e.target.error && e.target.error.message) || e.name)) || String(e);
        alert('復元中にエラーが発生しました: ' + errMsg);
    }
}

// Cancel ongoing screenshot scanning / upload process
function cancelOngoingUpload() {
    isScanCancelled = true;
    uploadQueue = [];
    currentUploadData = null;
    currentUploadFile = null;
    currentUploadExtractedDate = null;
    currentUploadExtractedTimestamp = null;
    
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
                listEl.innerHTML = `<span style="font-size: 11px; color: #00e676; padding: 4px;"><i class="fa-solid fa-check"></i> 「${escapeHtml(m.name)}」を選択しました</span>`;
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

                let hasUncalibratedImage = false;
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const loadingText = document.getElementById('bulk-roster-loading-text');
                    if (loadingText) {
                        loadingText.innerText = `スクショを解析中 (${i + 1}/${files.length}): ${file.name}`;
                    }

                    const img = await loadImageFromFile(file);
                    const { profile, isCached } = getOrComputeCalibrationProfile(img, null);
                    if (!profile || !profile.modalBox) continue;
                    if (!isCached) hasUncalibratedImage = true;

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

                if (hasUncalibratedImage) {
                    alert('トリミング領域が未設定の画像サイズ（縦横比）が含まれています。\n推定位置で切り抜いているため、アイコンがずれている場合は先に戦績のアップロードからトリミング領域を設定してください。');
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
                <img src="${escapeHtml(slot.iconDataUrl)}" style="width: 52px; height: 52px; border-radius: 6px; border: 1.5px solid #00a3ff; object-fit: cover;">
                <span style="font-size: 8.5px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 115px;">${escapeHtml(slot.filename)}</span>
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
                <img src="${escapeHtml(activeMatchStudent.icon_path || '')}" style="width: 52px; height: 52px; border-radius: 6px; border: 1.5px solid var(--border-color); object-fit: cover; background: #e2e8f0;">
                <span style="font-size: 11px; font-weight: 800; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 115px;">${escapeHtml(activeMatchStudent.name)}</span>
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

        // Route the next save of the Student Add modal to this bulk slot (handled in btn-student-save)
        pendingBulkSlotSave = async (name) => {
            await registerStudentInBulk(name, slot);
            studentModal.classList.remove('active');
            currentBulkRosterIndex++;
            showNextBulkRosterStep();
        };

        studentModal.classList.add('active');
    }
}
