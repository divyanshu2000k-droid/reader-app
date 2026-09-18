"""
Slice 5b, 6.5 then 6.4 — in that order, because two notes are already deleted and waiting.

6.5 reads Recently Deleted and restores from it; 6.4 then deletes and undoes, tapping Undo
before the 5s toast expires.

    python scripts/device/s5b_undo2.py
"""

import re
import sys
import time

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, require, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

BOOK = 'The Long Wolves'
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'
CARD = r'^(Note|Quote)(, page \d+)?, '


def live_notes():
    con = pulldb.pull('n-%d' % int(time.time()))
    return con.execute('select count(*) from notes where deleted_at is null').fetchone()[0]


def to_trash():
    s3lib.launch()
    tap(r'^Settings$', 'Settings')
    time.sleep(2.5)
    tap(r'Recently deleted', 'Recently deleted')
    time.sleep(3)
    return require(r'Recently deleted', 'Recently Deleted', 10)[0]


def to_notes():
    s3lib.launch()
    tap(r'^Finished books$', 'Finished tab')
    time.sleep(1.5)
    root, _ = require(re.escape(BOOK), BOOK, 15)
    hits = [n for n in find(root, re.escape(BOOK)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(BOOK))[0])
    time.sleep(2.5)
    require(r'Book actions', 'book detail', 15)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    require(r'Notes & quotes', 'the notes list', 10)


def open_first_note():
    require(ROW, 'a note row', 10)
    root = dump()
    for n in phone.nodes(root):
        if n.get('clickable') == 'true' and re.match(CARD, n.get('content-desc') or ''):
            phone.tap_node(n)
            time.sleep(2.5)
            require(r'^Edit note$', 'the editor')
            return
    raise StepFailed('no tappable note card: ' + str(texts(root)[:15]))


# ─── 6.5 ─────────────────────────────────────────────────────────────────────

def trash_names_the_note():
    root = to_trash()
    rows = [(n.get('content-desc') or '') for n in phone.nodes(root)
            if (n.get('content-desc') or '').startswith('Restore')]
    notes = [r for r in rows if r.startswith('Restore Note') or r.startswith('Restore Quote')
             or ' Note' in r or ' Quote' in r]
    notes = [r for r in rows if re.search(r'(Note|Quote)(, p\.\d+)? from ', r)]
    if not notes:
        raise StepFailed(f'no deleted note listed by kind and book: {rows[:8]}')
    phone.screenshot('s5b-trash-note.png')
    for r in notes:
        if BOOK not in r:
            raise StepFailed(f'a deleted note does not name its book: {r}')
    return ' || '.join(n[len('Restore '):][:80] for n in notes[:2])


def restore_from_trash():
    before = live_notes()
    root = to_trash()
    target = [n for n in phone.nodes(root)
              if re.search(r'(Note|Quote)(, p\.\d+)? from ', n.get('content-desc') or '')]
    if not target:
        raise StepFailed('no Restore control for a note')
    phone.tap_node(target[0])
    time.sleep(3)
    after = live_notes()
    if after != before + 1:
        raise StepFailed(f'restore did not bring the note back: {before} -> {after} live')
    return f'{before} live notes -> {after} after Restore'


# ─── 6.4 ─────────────────────────────────────────────────────────────────────

def delete_then_undo():
    to_notes()
    before = len(find(dump(), ROW))
    if before == 0:
        raise StepFailed('no notes to delete')
    open_first_note()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    tap(r'^Delete$', 'confirm Delete')
    time.sleep(1.6)
    root = dump()
    if not find(root, r'^Undo$'):
        raise StepFailed(f'no Undo within 1.6s: {texts(root)[:20]}')
    gone = len(find(root, ROW))
    if gone >= before:
        raise StepFailed(f'the list still shows {gone} rows after deleting {before}')
    tap(r'^Undo$', 'Undo')
    time.sleep(3)
    after = len(find(dump(), ROW))
    if after != before:
        raise StepFailed(
            f'THE LIST DID NOT REDRAW AFTER UNDO: {before} before, {gone} deleted, {after} after')
    live = live_notes()
    return f'{before} rows -> {gone} deleted -> {after} restored; {live} live in the database'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.5 Recently Deleted names the note by kind, page and book', trash_names_the_note),
        ('6.5 and restores it', restore_from_trash),
        ('6.4 Undo restores AND redraws the list', delete_then_undo),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
