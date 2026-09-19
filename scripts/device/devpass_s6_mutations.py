"""
Watch device checks 19 and 20 fail, on a device, against a real SQLite file.

A guard nobody has watched fail is decoration (CLAUDE.md), and both are new.

Assumes a device-pass Metro is already serving on 8081:
    EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --dev-client --clear

    python scripts/device/devpass_s6_mutations.py
"""

import hashlib
import pathlib
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path(__file__).resolve().parents[2]
PKG = 'com.example.reader'

WRITE = 'src/db/write.ts'
TQ = 'src/features/timer/queries.ts'

RUNS = [
    # ── 19: the open/closed shape the recovery gate depends on ──
    ('s6m1-start-writes-a-duration', TQ,
     "    durationSeconds: null,\n    isTimed: 1,",
     "    durationSeconds: 1,\n    isTimed: 1,", '19.'),
    ('s6m2-finish-writes-no-duration', TQ,
     "  const saved = await updateRow('sessions', sessionId, {\n    durationSeconds: Math.floor(durationSeconds),",
     "  const saved = await updateRow('sessions', sessionId, {\n    note: null,\n    // durationSeconds removed\n    ...(false ? { durationSeconds: Math.floor(durationSeconds) } : {}),", '19.'),

    # ── 20: the sweep must take orphans AND keep the reader's work ──
    ('s6m3-sweep-takes-live-drafts', WRITE,
     "    const row = found[0]\n    return row === undefined || row.deleted !== null\n  }\n  if (sourceId.startsWith('new:')) {",
     "    const row = found[0]\n    return row === undefined || row.deleted !== null\n  }\n  if (sourceId.startsWith('new:')) {\n    return true", '20.'),
    ('s6m4-sweep-keeps-orphaned-runs', WRITE,
     "    return row === undefined || row.duration !== null || row.deleted !== null",
     "    return false", '20.'),
]


def digest(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def restore(path, original, label):
    for attempt in range(5):
        try:
            path.write_bytes(original)
            if path.read_bytes() == original:
                return
        except OSError:
            pass
        time.sleep(0.4 * (attempt + 1))
    raise SystemExit(f'\n!!! COULD NOT RESTORE {path} after {label!r}. Run: git checkout -- {path}\n')


def adb(*args):
    return subprocess.run(['adb', *args], capture_output=True, text=True,
                          encoding='utf8', errors='replace').stdout


def run_pass(label, wanted):
    adb('logcat', '-c')
    adb('shell', 'am', 'force-stop', PKG)
    subprocess.run(['adb', 'shell', 'monkey', '-p', PKG,
                    '-c', 'android.intent.category.LAUNCHER', '1'], capture_output=True)
    for _ in range(90):
        out = adb('logcat', '-d')
        if 'RUNTIME' in out:
            break
        time.sleep(3)
    out = adb('logcat', '-d')
    totals = [l for l in out.splitlines() if 'RUNTIME' in l]
    red = [l for l in out.splitlines() if 'FAILED:' in l and wanted in l]
    print(f'--- {label}')
    for t in totals:
        print('   ', t.split('[devcheck]')[-1].strip())
    if red:
        for r in red:
            print('    RED ', r.split('[devcheck]')[-1].strip()[:150])
        return True
    print(f'    GREEN  check {wanted} did not notice this mutation')
    return False


results = []
for label, rel, find, replace, wanted in RUNS:
    f = ROOT / rel
    original = f.read_bytes()
    before = digest(f)
    text = original.decode('utf-8')
    if find not in text:
        print(f'SKIP  {label} (pattern gone from {rel})')
        results.append((label, False))
        continue
    f.write_bytes(text.replace(find, replace, 1).encode('utf-8'))
    try:
        results.append((label, run_pass(label, wanted)))
    finally:
        restore(f, original, label)
        assert digest(f) == before

print('\nsources restored, md5 verified')
red = sum(1 for _, ok in results if ok)
print(f'{red}/{len(RUNS)} mutations went red')
for label, ok in results:
    if not ok:
        print(f'  NOT CAUGHT: {label}')
sys.exit(0 if red == len(RUNS) else 1)
