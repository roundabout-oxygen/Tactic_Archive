// Tactical Archive DEMO loader (copied into docs/demo/ by tools/build_demo.py)
// Loads demo-data.json into a dedicated IndexedDB (TacticalArchiveDemoDB) on every visit, then lets
// app.js start. Any edits made in the demo are discarded on the next load.
(function () {
    'use strict';

    var DB_NAME = 'TacticalArchiveDemoDB';
    var DB_VERSION = 4;
    var STORES = ['roster_students', 'battle_history', 'opponent_directory', 'opponent_renames'];

    try {
        localStorage.setItem('tactical_archive_demo_first_launch_done', 'true');
        localStorage.setItem('tactical_archive_demo_defense_feature_notified', 'true');
        localStorage.setItem('tactical_archive_demo_migrated_all_to_attack_v1124', 'true');
        // Web v2: skip the platform choice screen (the demo never reads screenshots)
        localStorage.setItem('tactical_archive_demo_web_platform', 'pc');
        localStorage.setItem('tactical_archive_demo_web_pc_aspect', '16:9');
    } catch (e) {}

    function openDemoDB() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('roster_students')) {
                    var s = db.createObjectStore('roster_students', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('name', 'name', { unique: true });
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
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function seed(data) {
        return openDemoDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORES, 'readwrite');
                STORES.forEach(function (name) { tx.objectStore(name).clear(); });
                (data.roster_students || []).forEach(function (r) { tx.objectStore('roster_students').put(r); });
                (data.battle_history || []).forEach(function (r) { tx.objectStore('battle_history').put(r); });
                (data.opponent_directory || []).forEach(function (r) { tx.objectStore('opponent_directory').put(r); });
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function () { reject(tx.error); };
                tx.onabort = function () { reject(tx.error); };
            });
        });
    }

    function showOverlay(text) {
        var el = document.getElementById('demo-loading');
        if (!el) {
            el = document.createElement('div');
            el.id = 'demo-loading';
            document.body.appendChild(el);
        }
        el.textContent = text;
        return el;
    }

    function addBadge(data) {
        var badge = document.createElement('div');
        badge.className = 'demo-badge';
        var period = document.body.getAttribute('data-demo-period') || '';
        var count = (data.battle_history || []).length;
        badge.textContent = 'デモ（閲覧専用）' + (period ? '・' + period : '') + '・' + count + '戦の実戦データ';
        document.body.appendChild(badge);
    }

    window.__taDemoReady = new Promise(function (resolve) {
        function start() {
            var overlay = showOverlay('デモデータを読み込んでいます...');
            fetch('demo-data.json', { cache: 'no-cache' })
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                })
                .then(function (data) {
                    return seed(data).then(function () { addBadge(data); });
                })
                .then(function () {
                    overlay.remove();
                    resolve();
                })
                .catch(function (err) {
                    console.error('[demo] failed to load demo data:', err);
                    overlay.textContent = 'デモデータの読み込みに失敗しました。ページを再読み込みしてください。';
                });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    });
})();
