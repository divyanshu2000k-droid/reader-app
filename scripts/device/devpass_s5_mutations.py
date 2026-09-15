import pathlib
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEVPASS = str(pathlib.Path(__file__).resolve().parent / 'devpass.sh')

RUNS = [
    ('s5m1-finish-does-not-move', 'src/features/finish/finishForm.ts',
     "  if (read.status !== 'finished') patch.status = 'finished'\n", ""),
    ('s5m2-reread-copies-rating', 'src/features/book/queries.ts',
     "    status: 'reading',\n    rating: null,", "    status: 'reading',\n    rating: 4,"),
    ('s5m3-details-overwrite-reader', 'src/domain/bookDetails.ts',
     "  if (stored.description === null && fetched.description !== null) {",
     "  if (fetched.description !== null) {"),
]


def run(label):
    r = subprocess.run(['sh', DEVPASS, label], capture_output=True, text=True, encoding='utf8', errors='replace')
    print(f'--- {label}')
    for line in r.stdout.splitlines():
        if 'FAIL' in line or '=====' in line:
            print('   ', line)


for label, path, old, new in RUNS:
    f = ROOT / path
    original = f.read_bytes()
    text = original.decode('utf8')
    assert text.count(old) == 1, (label, text.count(old))
    f.write_bytes(text.replace(old, new, 1).encode('utf8'))
    try:
        run(label)
    finally:
        f.write_bytes(original)
print('sources written back')
