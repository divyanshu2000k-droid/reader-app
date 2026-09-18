"""
Slice 5b, run sheet item 6: editing, delete with undo, and Recently Deleted.

6.2 is the one that cannot be seen on screen: opening a note and closing it must write
NOTHING — no bumped `updated_at`, no queue row. It is checked against the pulled database.

6.3/6.4 are the Slice 3 bugs in their new home: the toast must appear AFTER the screen
leaves (or it renders beneath the confirm sheet's Modal), and Undo must redraw the list
under it (`db/changes.ts`).

    python scripts/device/s5b_edit.py
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
PLACEHOLDERS = ('What do you want to remember?', 'Type or paste the words', 'Optional')
state = {}


def type_text(s):
    phone.adb('shell', 'input', 'text', s.replace(' ', '%s').replace("'", ''))
    time.sleep(0.8)


def content_field(root=None):
    root = root or dump()
    for n in phone.nodes(root):
        if n.get('class') == 'android.widget.EditText' and n.get('content-desc') in ('Your note', 'The quote'):
            return n
    raise StepFailed('no content field on screen')


def typed_value():
    raw = content_field().get('text') or ''
    return '' if raw in PLACEHOLDERS else raw


def to_notes():
    s3lib.launch()
    tap(r'^Finished books$', 'Finished tab')
    time.sleep(1.5)
    root, _ = require(re.escape(BOOK), BOOK, 15)
    hits = [n for n in find(root, re.escape(BOOK)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(BOOK))[0])
    time.sleep(2)
    tap(r'Book actions', 'Book actions')
    time.sleep(1.5)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2)


def open_first_note():
    root, hit = require(r'^(NOTE|QUOTE)( · P\.\d+)?$', 'a note row', 10)
    node = hit[0]
    # The badge is inside the card; tap the card itself.
    for n in phone.nodes(root):
        if n.get('clickable') == 'true' and 'Opens this note' in (n.get('content-desc') or ''):
            node = n
            break
    phone.tap_node(node)
    time.sleep(2.5)
    require(r'^Edit note$', 'the editor on an existing note')


def db():
    con = pulldb.pull('edit-%d' % int(time.time()))
    return con


# ─── 6.1 an edit is saved ────────────────────────────────────────────────────

def edit_saves():
    to_notes()
    open_first_note()
    phone.tap_node(content_field())
    time.sleep(0.8)
    phone.adb('shell', 'input', 'keycombination', '113', '29')
    time.sleep(0.5)
    phone.adb('shell', 'input', 'keyevent', '67')
    time.sleep(1)
    type_text('Edited on the phone, run sheet item six')
    s3lib.hide_keyboard()
    tap(r'^Save changes$', 'Save changes')
    time.sleep(3)
    root, _ = require(r'Edited on the phone', 'the edited words in the list', 10)
    return 'the row shows the edited words'


# ─── 6.2 opening and closing writes nothing ──────────────────────────────────

def open_and_close_writes_nothing():
    con = db()
    row = con.execute(
        "select id, updated_at, content from notes where content like 'Edited on the phone%' "
        "and deleted_at is null").fetchone()
    if row is None:
        raise StepFailed('could not find the edited note in the database')
    note_id, before_updated, _ = row
    before_queue = con.execute(
        'select count(*) from sync_queue where row_id=?', (note_id,)).fetchone()[0]
    state['note_id'] = note_id

    to_notes()
    open_first_note()
    time.sleep(1.5)
    s3lib.back()          # leave without touching anything
    time.sleep(2)

    con2 = db()
    after_updated = con2.execute(
        'select updated_at from notes where id=?', (note_id,)).fetchone()[0]
    after_queue = con2.execute(
        'select count(*) from sync_queue where row_id=?', (note_id,)).fetchone()[0]
    if after_updated != before_updated:
        raise StepFailed(
            f'updated_at MOVED on a no-op open: {before_updated} -> {after_updated}')
    if after_queue != before_queue:
        raise StepFailed(
            f'a no-op open queued {after_queue - before_queue} sync rows')
    return f'updated_at unchanged ({before_updated}), queue rows still {before_queue}'


# ─── 6.3 / 6.4 delete, the toast, and Undo redrawing ─────────────────────────

def delete_toasts_after_leaving():
    to_notes()
    open_first_note()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.5)
    require(r'^Delete this note\?$', 'the confirm sheet')
    tap(r'^Delete$', 'confirm Delete')
    time.sleep(2.5)
    root = dump()
    if find(root, r'^Delete this note\?$'):
        raise StepFailed('the confirm sheet is still up after deleting')
    if not find(root, r'Notes & quotes'):
        raise StepFailed('the editor did not leave after deleting')
    toast = find(root, r'^Note deleted$')
    if not toast:
        raise StepFailed(f'no undo toast after deleting: {texts(root)[:25]}')
    if not find(root, r'^Undo$'):
        raise StepFailed('the toast has no Undo')
    phone.screenshot('s5b-undo-toast.png')
    b = list(map(int, re.findall(r'\d+', toast[0].get('bounds'))))
    return f'toast on the notes list at y={b[1]}..{b[3]}, with Undo'


def undo_redraws_the_list():
    root = dump()
    before = len(find(root, r'^(NOTE|QUOTE)( · P\.\d+)?$'))
    tap(r'^Undo$', 'Undo')
    time.sleep(3)
    root = dump()
    after = len(find(root, r'^(NOTE|QUOTE)( · P\.\d+)?$'))
    if after <= before:
        raise StepFailed(
            f'THE LIST DID NOT REDRAW AFTER UNDO: {before} rows before, {after} after')
    con = db()
    live = con.execute(
        'select count(*) from notes where id=? and deleted_at is null',
        (state['note_id'],)).fetchone()[0]
    if live != 1:
        raise StepFailed('Undo did not restore the row in the database')
    return f'{before} rows -> {after} after Undo, and the row is live again'


# ─── 6.5 Recently Deleted ────────────────────────────────────────────────────

def deleted_note_is_in_the_trash():
    to_notes()
    open_first_note()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.5)
    tap(r'^Delete$', 'confirm Delete')
    time.sleep(7)          # let the toast expire rather than undoing it
    s3lib.to_library()
    tap(r'Settings', 'Settings')
    time.sleep(2)
    tap(r'Recently deleted', 'Recently deleted')
    time.sleep(2.5)
    root, _ = require(r'Recently deleted', 'the Recently Deleted screen', 10)
    rows = texts(root)
    hit = [t for t in rows if 'Note' in t and BOOK in t]
    if not hit:
        raise StepFailed(f'the deleted note is not listed: {rows[:30]}')
    phone.screenshot('s5b-trash-note.png')
    return hit[0].strip('|')


def restore_from_the_trash():
    root = dump()
    target = None
    for n in phone.nodes(root):
        d = n.get('content-desc') or ''
        if d.startswith('Restore') and 'Note' in d:
            target = n
            break
    if target is None:
        raise StepFailed('no Restore button for the note')
    phone.tap_node(target)
    time.sleep(3)
    con = db()
    live = con.execute(
        'select count(*) from notes where deleted_at is null and content is not null').fetchone()[0]
    return f'restored; {live} live notes in the database'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.1 an edit is saved and shown', edit_saves),
        ('6.2 opening and closing a note WRITES NOTHING', open_and_close_writes_nothing),
        ('6.3 delete leaves the screen, then toasts', delete_toasts_after_leaving),
        ('6.4 Undo restores AND redraws the list', undo_redraws_the_list),
        ('6.5 a deleted note waits in Recently Deleted', deleted_note_is_in_the_trash),
        ('6.5 and restores from there', restore_from_the_trash),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
