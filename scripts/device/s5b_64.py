"""
Slice 5b, 6.4: delete a note, Undo, and confirm the list under it redraws.

The Slice 3 bug in its new home: the database had the row back and the screen went on showing
it deleted, because the focused screen had no reason to re-read (`db/changes.ts`).

Timing note: each `dump()` now costs ~2s of adb plus the foreground guard's own round trip,
against a 5s toast. So Undo is tapped from the SAME dump that finds it, never after another.

    python scripts/device/s5b_64.py
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


def to_notes():
    s3lib.launch()
    tap(r'^Finished books$', 'Finished tab')
    time.sleep(1.5)
    root, _ = require(re.escape(BOOK), BOOK, 15)
    hits = [n for n in find(root, re.escape(BOOK)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(BOOK))[0])
    time.sleep(2.5)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    require(r'Notes & quotes', 'the notes list', 10)


def add_note(text):
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(2.5)
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', text.replace(' ', '%s'))
    time.sleep(0.8)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)


def live_notes():
    con = pulldb.pull('u-%d' % int(time.time()))
    return con.execute('select count(*) from notes where deleted_at is null').fetchone()[0]


def delete_then_undo():
    to_notes()
    # Two notes, so the list still renders after one is deleted AND the count is visible.
    while len(find(dump(), ROW)) < 2:
        add_note('Undo check note %d' % len(find(dump(), ROW)))
        to_notes() if False else None
    before = len(find(dump(), ROW))

    root = dump()
    card = [n for n in phone.nodes(root)
            if n.get('clickable') == 'true' and re.match(CARD, n.get('content-desc') or '')]
    phone.tap_node(card[0])
    time.sleep(2.5)
    require(r'^Edit note$', 'the editor')
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    t0 = time.time()
    tap(r'^Delete$', 'confirm Delete')

    # Poll, and tap Undo from the very dump that finds it.
    for _ in range(8):
        root = dump()
        undo = find(root, r'^Undo$')
        if undo:
            gone = len(find(root, ROW))
            phone.screenshot('s5b-undo-toast.png')
            phone.tap_node(undo[0])
            found_at = round(time.time() - t0, 1)
            break
        time.sleep(0.3)
    else:
        raise StepFailed('no undo toast within %.1fs' % (time.time() - t0))

    time.sleep(3)
    after = len(find(dump(), ROW))
    if after != before:
        raise StepFailed(
            f'THE LIST DID NOT REDRAW AFTER UNDO: {before} before, {gone} deleted, {after} after')
    live = live_notes()
    return (f'{before} rows -> {gone} deleted -> {after} after Undo (toast at t={found_at}s); '
            f'{live} live notes in the database')


if __name__ == '__main__':
    ok = step('6.4 Undo restores AND redraws the list', delete_then_undo)
    s3lib.report()
    sys.exit(0 if ok else 1)
