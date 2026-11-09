"""Build docs/default_roster.json: the student dictionary that the Web version registers on first launch.

Usage:
    python tools/build_default_roster.py --backup path/to/TacticalArchive_Full_xxx.json

Takes only roster_students from the backup (names, icons, face-feature vectors).
Battle history, opponents, renames and calibration are never read into the output.
  * icons are re-encoded as WebP (smaller download; they are only used for display)
  * feature vectors (32x32 grayscale, 0-255) are rounded to integers (no effect on ZNCC matching)
"""
import argparse
import base64
import datetime as dt
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'default_roster.json'


def to_webp(data_url, quality=90):
    if not data_url or not data_url.startswith('data:image/'):
        return data_url
    raw = base64.b64decode(data_url.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--backup', required=True, help='Tactical Archive backup JSON (must contain roster_students)')
    args = ap.parse_args()

    src = json.loads(Path(args.backup).read_text(encoding='utf-8'))
    roster = src.get('roster_students') or []
    if not roster:
        raise SystemExit('[default_roster] the backup has no roster_students')

    students = []
    for s in roster:
        name = (s.get('name') or '').strip()
        if not name:
            continue
        feats = [[int(round(v)) for v in f] for f in (s.get('features') or []) if f and len(f) == 1024]
        students.append({'name': name, 'icon_path': to_webp(s.get('icon_path')), 'features': feats})

    data = {'version': 1, 'created_at': dt.date.today().isoformat(), 'students': students}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"[default_roster] {len(students)} students, {sum(len(s['features']) for s in students)} face patterns, "
          f"{OUT.stat().st_size / 1e6:.2f} MB -> {OUT.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
