"""
Watch device checks 17 and 18 fail, on the phone, against a real SQLite file.

Four mutations, each breaking one thing the check claims to hold, each restored in `finally`.
A check that does not go red here is decoration (CLAUDE.md), and both of these are new.

    python scripts/device/devpass_s5b_mutations.py

Takes roughly 3 minutes per run. `md5` before and after proves every file was written back.
"""

import hashlib
import pathlib
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEVPASS = str(pathlib.Path(__file__).resolve().parent / 'devpass.sh')

WRITE = 'src/db/write.ts'

# NOTE: `sync_queue.id` is an autoincrement INTEGER. The first version of mutation 3 passed a
# string for it, so the insert THREW and check 18 went red at "could not save the draft" —
# red for the wrong reason, with its actual queue-count assertion still unwatched. Omitting
# `id` is what makes the row land, so the count is what fails.
RUNS = [
    # ── 17: a note must not be a cascade child of `reads` ──
    # The bug this prevents: every quote from a first read vanishes the day the reader
    # tidies up an old read, and nothing else in the app notices.
    ('s5bm1-notes-cascade-from-reads', WRITE,
     """  reads: [
    {
      table: 'sessions',""",
     """  reads: [
    {
      table: 'notes',
      ids: (db, parentId, when) =>
        db
          .select({ id: notes.id })
          .from(notes)
          .where(and(eq(notes.readId, parentId), when(notes.deletedAt)))
          .all()
          .map((r) => r.id),
    },
    {
      table: 'sessions',"""),

    # ── 17: deleting a book must take its notes, and restoring must bring them back ──
    ('s5bm2-book-delete-leaves-notes', WRITE,
     """    {
      table: 'notes',
      ids: (db, parentId, when) =>
        db
          .select({ id: notes.id })
          .from(notes)
          .where(and(eq(notes.bookId, parentId), when(notes.deletedAt)))
          .all()
          .map((r) => r.id),
    },
""", ""),

    # ── 18: a draft must never reach the sync queue ──
    ('s5bm3-draft-enqueues', WRITE,
     """        db.insert(metadataCache)
          .values({ source, sourceId: key, payload, fetchedAt: ts })""",
     """        db.insert(syncQueue)
          .values({
            tableName: 'notes',
            rowId: key,
            operation: 'upsert',
            queuedAt: ts,
          })
          .run()
        db.insert(metadataCache)
          .values({ source, sourceId: key, payload, fetchedAt: ts })"""),

    # ── 18: clearing a draft must actually clear it ──
    ('s5bm4-clear-draft-noop', WRITE,
     """        db.delete(metadataCache)
          .where(and(eq(metadataCache.source, source), eq(metadataCache.sourceId, key)))
          .run()""",
     """        void source"""),
]


def digest(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def run(label, wanted):
    r = subprocess.run(['sh', DEVPASS, label], capture_output=True, text=True,
                       encoding='utf8', errors='replace')
    out = r.stdout
    red = [l for l in out.splitlines() if 'FAILED:' in l and wanted in l]
    totals = [l for l in out.splitlines() if '=====' in l]
    print(f'--- {label}')
    for line in totals:
        print('   ', line.strip())
    if red:
        for line in red:
            print('    RED ', line.strip())
        return True
    print(f'    GREEN  check {wanted} did not notice this mutation')
    return False


before = {}
results = []
for label, path, old, new in RUNS:
    f = ROOT / path
    before[path] = digest(f)
    original = f.read_bytes()
    text = original.decode('utf8')
    assert text.count(old) == 1, (label, 'pattern found %d times' % text.count(old))
    f.write_bytes(text.replace(old, new, 1).encode('utf8'))
    wanted = '17.' if label.startswith(('s5bm1', 's5bm2')) else '18.'
    try:
        results.append((label, run(label, wanted)))
    finally:
        f.write_bytes(original)
        assert digest(f) == before[path], f'{path} was NOT written back after {label}'

print('\nsources written back, md5 verified')
red = sum(1 for _, ok in results if ok)
print(f'{red}/{len(RUNS)} mutations went red')
for label, ok in results:
    if not ok:
        print(f'  NOT CAUGHT: {label}')
sys.exit(0 if red == len(RUNS) else 1)
