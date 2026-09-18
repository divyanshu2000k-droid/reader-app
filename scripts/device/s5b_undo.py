"""
Slice 5b, run sheet 6.4 and 6.5, retried.

6.4's first run failed on MY timing, not the app's: the undo toast lives for
`rules.toastMs` = 5000 ms, and the script spent that long taking a screenshot and parsing
bounds before reaching for Undo. Here the tap happens first and the evidence is gathered
afterwards.

    python scripts/device/s5b_undo.py
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
    require(r'Notes and quotes', 'the actions sheet', 10)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    require(r'Notes & quotes', 'the notes list', 10)


def open_first_note():
    root, _ = require(ROW, 'a note row', 10)
    # The card's content-desc is `noteAnnouncement` + the note's words. The accessibility
    # HINT ("Opens this note to edit it") is not exposed by uiautomator, and selecting on it
    # found nothing.
    node = None
    for n in phone.nodes(root):
        if n.get('clickable') == 'true' and re.match(r'^(Note|Quote)(, page \d+)?, ',
                                                     n.get('content-desc') or ''):
            node = n
            break
    if node is None:
        raise StepFailed('no tappable note card: ' + str(texts(root)[:15]))
    phone.tap_node(node)
    time.sleep(2.5)
    require(r'^Edit note$', 'the editor')


def count_rows():
    return len(find(dump(), ROW))


def delete_then_undo():
    to_notes()
    before = count_rows()
    open_first_note()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    tap(r'^Delete$', 'confirm Delete')
    # Straight for Undo. Nothing else happens in between: the toast has 5 seconds.
    time.sleep(1.6)
    root = dump()
    if not find(root, r'^Undo$'):
        raise StepFailed(f'no Undo within 1.6s of deleting: {texts(root)[:20]}')
    gone = len(find(root, ROW))
    tap(r'^Undo$', 'Undo')
    time.sleep(3)
    root = dump()
    after = len(find(root, ROW))
    if after != before:
        raise StepFailed(
            f'THE LIST DID NOT REDRAW AFTER UNDO: {before} before, {gone} while deleted, {after} after')
    con = pulldb.pull('undo-%d' % int(time.time()))
    live = con.execute('select count(*) from notes where deleted_at is null').fetchone()[0]
    if live != after:
        raise StepFailed(f'the screen shows {after} rows, the database has {live} live notes')
    return f'{before} rows -> {gone} deleted -> {after} after Undo; database agrees ({live})'


def trash_lists_and_restores():
    to_notes()
    before = count_rows()
    open_first_note()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    tap(r'^Delete$', 'confirm Delete')
    time.sleep(8)          # let the toast expire instead of undoing it
    s3lib.to_library()
    tap(r'Settings', 'Settings')
    time.sleep(2.5)
    tap(r'Recently deleted', 'Recently deleted')
    time.sleep(3)
    root, _ = require(r'Recently deleted', 'Recently Deleted', 10)
    listed = [t for t in texts(root) if 'Restore' in t and 'Note' in t]
    if not listed:
        raise StepFailed(f'the deleted note is not listed: {texts(root)[:30]}')
    phone.screenshot('s5b-trash-note.png')
    detail = listed[0]

    target = [n for n in phone.nodes(root)
              if (n.get('content-desc') or '').startswith('Restore') and 'Note' in (n.get('content-desc') or '')]
    phone.tap_node(target[0])
    time.sleep(3)
    con = pulldb.pull('trash-%d' % int(time.time()))
    live = con.execute('select count(*) from notes where deleted_at is null').fetchone()[0]
    if live != before:
        raise StepFailed(f'after restore the database has {live} live notes, expected {before}')
    return f'listed as "{detail.strip("|")[:90]}" and restored ({live} live)'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.4 Undo restores AND redraws the list', delete_then_undo),
        ('6.5 Recently Deleted lists the note, and restores it', trash_lists_and_restores),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
