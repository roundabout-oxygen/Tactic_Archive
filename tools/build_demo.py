"""Build the read-only demo (docs/demo/) from the Android app's web assets and a backup JSON.

Usage:
    python tools/build_demo.py --backup path/to/TacticalArchive_Full_xxx.json [--since 2026-09-14] [--until 2026-11-10]
    python tools/build_demo.py --keep-data      # rebuild the app files only, keep the current demo-data.json

What it does:
  * Copies the Web version (docs/: index.html, app.js, ...) into docs/demo/ and patches them:
      - separate IndexedDB / localStorage names, so the demo never touches the Web version's data
        (both live on the same origin: roundabout-oxygen.github.io)
      - the app starts only after demo-loader.js has loaded demo-data.json into the demo DB
      - upload / settings / editing are hidden (read-only)
      - adds the analysis tab (demo-analysis.js / demo-extras.css, ported from the PC version)
  * Writes an anonymized docs/demo/demo-data.json:
      - opponent names -> random fictional katakana names, 4-5 chars (CSPRNG,
        same opponent -> same name, "匿名" kept). The mapping is never written anywhere.
      - battles whose student icons cannot be shown (early data from before the roster
        was settled) are excluded
      - opponent avatar dictionary: only opponents that appear in the history, re-keyed
      - notes / filenames cleared, rename dictionary and calibration removed,
        roster face-feature vectors removed (not needed for viewing)
"""
import argparse
import datetime as dt
import json
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'docs'  # the Web version is the source of the demo
OUT = ROOT / 'docs' / 'demo'
TEMPLATE = Path(__file__).resolve().parent / 'demo'

COPY_FILES = ['index.css', 'students_data.js', 'icon.png', 'favicon.png']

# Syllables for fictional proper-noun-like names (katakana, pronounceable)
NAME_SYLLABLES = list(
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ'
    'ガギグゲゴザジズゼゾダデドバビブベボパピプペポ'
)
NAME_LENGTHS = (4, 5)
PLACEHOLDER_NAMES = {'', '生徒', '未登録', '?', 'Unknown'}


def read_text(path):
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def write_text(path, text):
    path.write_text(text.replace('\n', '\r\n'), encoding='utf-8', newline='')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'[build_demo] patch "{label}" expected 1 match, found {count}')
    return text.replace(old, new)


# Added to the demo's app.js (module scope, before historyMatchesCriteria). Ported from the PC version
# (pc-app/renderer/app.js: window.taApp / analysisIdFilter); read-only parts only.
DEMO_ANALYSIS_JS = r"""// ==== DEMO: analysis tab support (added by tools/build_demo.py, ported from the PC version) ====
// Records chosen on the analysis tab ({ ids: Set, label }) - shown with a banner on the history tabs
let analysisIdFilter = null;
function updateAnalysisFilterBanner() {
    ['attack', 'defense'].forEach(type => {
        const pane = document.getElementById(`tab-${type}`);
        if (!pane) return;
        let bar = pane.querySelector('.analysis-filter-bar');
        if (!analysisIdFilter) { if (bar) bar.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'analysis-filter-bar';
            bar.innerHTML = '<i class="fa-solid fa-chart-simple"></i><span class="afb-label"></span><button type="button" class="afb-clear"><i class="fa-solid fa-xmark"></i> 解除</button>';
            bar.querySelector('.afb-clear').addEventListener('click', () => clearAnalysisFilter());
            const wrapper = pane.querySelector('.history-list-wrapper');
            if (wrapper) wrapper.parentNode.insertBefore(bar, wrapper); else pane.prepend(bar);
        }
        bar.querySelector('.afb-label').textContent = `分析から絞り込み中：${analysisIdFilter.label}`;
    });
}
function clearAnalysisFilter(refresh = true) {
    if (!analysisIdFilter) return;
    analysisIdFilter = null;
    updateAnalysisFilterBanner();
    if (refresh) updateHistoryView();
}
// Read-only access to the app state for demo-analysis.js
window.taApp = {
    async getHistory() {
        if (!isFullHistoryLoaded) await ensureFullHistoryLoaded();
        return currentHistory;
    },
    getOpponentAvatar: (name) => (opponentDirectory && opponentDirectory[name]) || null,
    resolveSlot: (item, team, index) => resolveHistorySlotStudent(item, team, index),
    showOpponentRosterPopup: (name) => showOpponentRosterPopup(name),
    // Show the given records on the attack / defense tab (banner with a clear button)
    showHistoryByIds(ids, label, type) {
        analysisIdFilter = { ids: new Set(ids), label: label || `${ids.length}件` };
        activePositionFilter = null;
        activeTeamFilter = null;
        ['attack', 'defense'].forEach(t => renderTeamFilterBanner(t));
        syncSearchInput('', false);
        updateAnalysisFilterBanner();
        window.switchToTab(type === 'defense' ? 'defense' : 'attack');
    }
};
// ==== /DEMO ====

"""


DEMO_ANALYSIS_PANE = """        <!-- ===== Analysis (DEMO: ported from the PC version, see demo-analysis.js) ===== -->
        <section id="tab-analysis" class="tab-pane">
            <div class="page-wrap analysis-wrap">
                <div class="analysis-controls">
                    <div class="seg" id="an-type" role="group" aria-label="攻撃・防衛">
                        <button type="button" class="seg-btn active" data-val="attack"><i class="fa-solid fa-bolt"></i> 攻撃</button>
                        <button type="button" class="seg-btn" data-val="defense"><i class="fa-solid fa-shield-halved"></i> 防衛</button>
                    </div>
                    <div class="seg" id="an-period" role="group" aria-label="期間">
                        <button type="button" class="seg-btn active" data-val="all">全期間</button>
                        <button type="button" class="seg-btn" data-val="30">直近30日</button>
                        <button type="button" class="seg-btn" data-val="custom">任意期間</button>
                    </div>
                    <div class="an-range" id="an-range" hidden>
                        <input type="date" id="an-from" aria-label="開始日"> <span>〜</span> <input type="date" id="an-to" aria-label="終了日">
                    </div>
                </div>
                <div id="analysis-body" class="analysis-body"></div>
            </div>
        </section>

"""


def build_app_js():
    js = read_text(ASSETS / 'app.js')
    js = replace_once(js, "const DB_NAME = 'TacticalArchiveDB';",
                      "const DB_NAME = 'TacticalArchiveDemoDB'; // DEMO: separate from the Web version's DB",
                      'DB_NAME')
    keys = js.count("'tactical_archive_")
    if keys == 0:
        raise SystemExit('[build_demo] no localStorage keys found to namespace')
    js = js.replace("'tactical_archive_", "'tactical_archive_demo_")
    js = replace_once(js, "    initOCRWorker();\n",
                      "    // DEMO: OCR is not used (read-only), Tesseract is not loaded\n", 'initOCRWorker')
    js = replace_once(js, "    initWebInputSources();\n",
                      "    // DEMO: no paste / drop / capture (read-only)\n", 'initWebInputSources')
    js = replace_once(js, "document.addEventListener('DOMContentLoaded', async () => {",
                      "(window.__taDemoReady || Promise.resolve()).then(async () => { // DEMO: start after demo data is loaded",
                      'DOMContentLoaded')
    # Analysis tab (demo-analysis.js, ported from the PC version): app state API + "narrowed from analysis"
    js = replace_once(js, "function historyMatchesCriteria(item, criteria) {\n",
                      DEMO_ANALYSIS_JS + "function historyMatchesCriteria(item, criteria) {\n"
                      "    if (analysisIdFilter && !analysisIdFilter.ids.has(item.id)) return false; // DEMO: narrowed from the analysis tab\n",
                      'historyMatchesCriteria')
    js = replace_once(js, "    if (clearPositionFilter) {\n        activePositionFilter = null;\n    }\n",
                      "    if (clearPositionFilter) {\n        activePositionFilter = null;\n"
                      "        clearAnalysisFilter(false); // DEMO: analysis tab narrowing\n    }\n", 'syncSearchInput')
    js = replace_once(js, "        if (tabName === 'attack' || tabName === 'defense') {\n            filterHistory(tabName);\n        }\n",
                      "        if (tabName === 'attack' || tabName === 'defense') {\n            filterHistory(tabName);\n        }\n"
                      "        if (tabName === 'analysis' && window.taAnalysis) window.taAnalysis.render(); // DEMO: analysis tab\n",
                      'switchToTab analysis')
    header = '// ==== GENERATED by tools/build_demo.py from docs/app.js — do not edit ====\n'
    write_text(OUT / 'app.js', header + js)
    return keys


def build_index_html(period_label):
    html = read_text(ASSETS / 'index.html')
    html = replace_once(html, '    <link rel="apple-touch-icon" href="icon.png">\n', '', 'apple-touch-icon')
    html = replace_once(html, '    <link rel="manifest" href="manifest.json">\n', '', 'manifest')
    html = replace_once(html, '    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>\n', '', 'tesseract')
    html = replace_once(html, '<link rel="stylesheet" href="index.css">',
                        '<link rel="stylesheet" href="index.css">\n    <link rel="stylesheet" href="demo.css">', 'demo.css')
    html = replace_once(html, '<script src="app.js" type="module"></script>',
                        '<script src="demo-loader.js"></script>\n    <script src="app.js" type="module"></script>', 'demo-loader')
    # Analysis tab (ported from the PC version) + extra viewing styles
    html = replace_once(html, '<link rel="stylesheet" href="demo.css">',
                        '<link rel="stylesheet" href="demo.css">\n    <link rel="stylesheet" href="demo-extras.css">', 'demo-extras.css')
    html = replace_once(html, '<script src="app.js" type="module"></script>',
                        '<script src="app.js" type="module"></script>\n<script src="demo-analysis.js" type="module"></script>', 'demo-analysis')
    defense_tab = '<span class="tab-label">防衛</span></button>\n'
    html = replace_once(html, defense_tab,
                        defense_tab + '            <button class="tab-btn" data-tab="analysis"><i class="fa-solid fa-chart-simple"></i><span class="tab-label">分析</span></button>\n',
                        'analysis tab button')
    html = replace_once(html, '        <section id="tab-upload" class="tab-pane">',
                        DEMO_ANALYSIS_PANE + '        <section id="tab-upload" class="tab-pane">', 'analysis pane')
    html = replace_once(html, '<h2>履歴詳細・編集</h2>', '<h2>履歴詳細</h2>', 'detail title')
    html = html.replace('<title>', '<title>【デモ】', 1)
    html = replace_once(html, '<body ', f'<body data-demo-period="{period_label}" ', '<body>')
    sw_start = html.find("<script>\n    if ('serviceWorker' in navigator")
    if sw_start == -1:
        raise SystemExit('[build_demo] service worker registration not found')
    sw_end = html.index('</script>\n', sw_start) + len('</script>\n')
    html = html[:sw_start] + html[sw_end:]
    write_text(OUT / 'index.html', '<!-- GENERATED by tools/build_demo.py — do not edit -->\n' + html)


def random_name(used):
    """Random fictional katakana name (4-5 chars). 'ン' may appear (not first, not twice in a row)."""
    while True:
        length = secrets.choice(NAME_LENGTHS)
        chars = [secrets.choice(NAME_SYLLABLES)]
        while len(chars) < length:
            if chars[-1] != 'ン' and secrets.randbelow(8) == 0:
                chars.append('ン')
            else:
                chars.append(secrets.choice(NAME_SYLLABLES))
        name = ''.join(chars)
        if name not in used:
            used.add(name)
            return name


def build_icon_checker(roster):
    """Returns a function telling whether every slot of a record can show a student icon in the app
    (same lookup as createStudentIconRowElement: roster by saved name, then by student ID)."""
    by_name = {s.get('name'): s for s in roster if s.get('name')}
    by_id = {s.get('id'): s for s in roster if s.get('id') is not None}

    def slot_ok(names, team, i):
        name = names[i] if i < len(names) else ''
        student = by_name.get(name) if name not in PLACEHOLDER_NAMES else None
        if student is None:
            sid = team[i] if i < len(team) else None
            student = by_id.get(sid) if sid else None
        return bool(student and student.get('icon_path'))

    def has_all_icons(rec):
        an, dn = rec.get('attack_names') or [], rec.get('defense_names') or []
        at, dt_ = rec.get('attack_team') or [], rec.get('defense_team') or []
        return all(slot_ok(an, at, i) and slot_ok(dn, dt_, i) for i in range(6))

    return has_all_icons


def local_date(ms):
    return dt.datetime.fromtimestamp(ms / 1000).date()


def build_data(backup_path, since, until):
    src = json.loads(Path(backup_path).read_text(encoding='utf-8'))
    history = src.get('battle_history') or []

    def in_range(rec):
        ts = rec.get('created_at')
        if not ts:
            return False
        d = local_date(ts)
        return (since is None or d >= since) and (until is None or d <= until)

    history = [r for r in history if in_range(r)]
    has_all_icons = build_icon_checker(src.get('roster_students') or [])
    before = len(history)
    history = [r for r in history if has_all_icons(r)]
    excluded_no_icon = before - len(history)
    if not history:
        raise SystemExit('[build_demo] no battle records in the selected period')

    # Opponent names -> random fictional names (mapping kept in memory only).
    # Never reuse a student name or "匿名" so a fake name cannot be mistaken for them.
    used = {s.get('name') for s in (src.get('roster_students') or []) if s.get('name')} | {'匿名'}
    name_map = {}
    for rec in history:
        name = rec.get('commander_name') or ''
        if name and name != '匿名' and name not in name_map:
            name_map[name] = random_name(used)

    out_history = []
    for rec in history:
        r = dict(rec)
        name = r.get('commander_name') or ''
        r['commander_name'] = name_map.get(name, name)
        r['notes'] = ''
        r['filename'] = ''
        r['opponent_avatar'] = None
        out_history.append(r)

    out_opponents = []
    for entry in src.get('opponent_directory') or []:
        name = entry.get('name')
        if name in name_map:
            out_opponents.append({'name': name_map[name], 'avatar': entry.get('avatar'), 'updated_at': entry.get('updated_at')})
        elif name == '匿名':
            out_opponents.append(entry)

    out_roster = []
    for s in src.get('roster_students') or []:
        r = dict(s)
        r['features'] = []
        out_roster.append(r)

    dates = sorted(local_date(r['created_at']) for r in out_history)
    data = {
        'version': 2,
        'demo': True,
        'period': {'from': dates[0].isoformat(), 'to': dates[-1].isoformat()},
        'roster_students': out_roster,
        'battle_history': out_history,
        'opponent_directory': out_opponents,
    }
    (OUT / 'demo-data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    name_map.clear()
    data['_excluded_no_icon'] = excluded_no_icon
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--backup', help='Tactical Archive backup JSON (Full)')
    ap.add_argument('--keep-data', action='store_true', help='keep the current docs/demo/demo-data.json (same fictional names)')
    ap.add_argument('--since', type=dt.date.fromisoformat, help='first day to include (YYYY-MM-DD)')
    ap.add_argument('--until', type=dt.date.fromisoformat, help='last day to include (YYYY-MM-DD)')
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.keep_data:
        data = json.loads((OUT / 'demo-data.json').read_text(encoding='utf-8'))
        data['_excluded_no_icon'] = '(kept)'
    elif args.backup:
        data = build_data(args.backup, args.since, args.until)
    else:
        raise SystemExit('[build_demo] --backup or --keep-data is required')
    period = f"{data['period']['from'].replace('-', '/')}〜{data['period']['to'].replace('-', '/')}"
    keys = build_app_js()
    build_index_html(period)
    for name in COPY_FILES:
        shutil.copyfile(ASSETS / name, OUT / name)
    for f in TEMPLATE.iterdir():
        shutil.copyfile(f, OUT / f.name)

    size = (OUT / 'demo-data.json').stat().st_size / 1e6
    h = data['battle_history']
    print(f"[build_demo] {len(h)} battles ({period}), "
          f"attack {sum(1 for r in h if r.get('battle_type') != 'defense')} / defense {sum(1 for r in h if r.get('battle_type') == 'defense')}, "
          f"excluded (icons missing) {data['_excluded_no_icon']}, "
          f"roster {len(data['roster_students'])}, opponent icons {len(data['opponent_directory'])}, "
          f"demo-data.json {size:.2f} MB, localStorage keys namespaced: {keys}")


if __name__ == '__main__':
    main()
