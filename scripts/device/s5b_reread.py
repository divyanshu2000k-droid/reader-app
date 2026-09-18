"""
Slice 5b, run sheet items 7 and 9.

7 — the slice's headline, on real screens: a note survives a re-read. Device check 17 holds
this against the database; this is the reader's version of it.

9 — an audiobook is offered no page, because `notes.page` means a page and an audiobook has
none (the one definition, `domain/progressDisplay.ts`).

    python scripts/device/s5b_reread.py
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
AUDIO = 'Northern Orchard'
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'


def open_book(title, tab):
    s3lib.launch()
    tap('^' + tab + ' books$', tab + ' tab')
    time.sleep(1.5)
    root, _ = require(re.escape(title), title, 15)
    hits = [n for n in find(root, re.escape(title)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(title))[0])
    time.sleep(2.5)
    require(r'Book actions', 'book detail', 15)


def to_notes(title, tab):
    open_book(title, tab)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    require(r'Notes & quotes', 'the notes list', 10)


# ─── 7 ───────────────────────────────────────────────────────────────────────

def note_survives_a_reread():
    con = pulldb.pull('rr-before-%d' % int(time.time()))
    rows = con.execute(
        "select n.id, n.read_id, n.page, r.read_number from notes n "
        "join books b on b.id=n.book_id join reads r on r.id=n.read_id "
        "where b.title=? and n.deleted_at is null", (BOOK,)).fetchall()
    if not rows:
        raise StepFailed(f'{BOOK} has no live note with a read to check against')
    note_id, first_read, page, read_number = rows[0]

    open_book(BOOK, 'Finished')
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    require(r'Start a re-read', 'the re-read row')
    tap(r'Start a re-read', 'Start a re-read')
    time.sleep(3.5)
    root, _ = require(r'READ 2|READING', 'the new read on book detail', 12)
    phone.screenshot('s5b-after-reread.png')

    # The notes must still be there, with their page, under the NEW read.
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    root, hit = require(r'Notes and quotes', 'the Notes row after the re-read')
    desc = ' '.join(phone.label(n) for n in hit)
    if 'Nothing saved yet' in desc:
        raise StepFailed('THE NOTES VANISHED WITH THE RE-READ: ' + desc)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    root, _ = require(ROW, 'the notes after the re-read', 10)
    shown = len(find(root, ROW))

    con2 = pulldb.pull('rr-after-%d' % int(time.time()))
    after = con2.execute(
        'select read_id, page from notes where id=?', (note_id,)).fetchone()
    if after is None:
        raise StepFailed('the note is gone from the database after the re-read')
    if after[0] != first_read:
        raise StepFailed(
            f'the note MOVED to another read: {first_read} -> {after[0]}')
    if after[1] != page:
        raise StepFailed(f'the note lost its page: {page} -> {after[1]}')
    reads = con2.execute(
        "select count(*) from reads r join books b on b.id=r.book_id "
        "where b.title=? and r.deleted_at is null", (BOOK,)).fetchone()[0]
    return (f'{shown} notes still listed after starting read {reads}; '
            f'read_id still points at read {read_number}, page still {page}')


# ─── 9 ───────────────────────────────────────────────────────────────────────

def audiobook_has_no_page():
    to_notes(AUDIO, 'Reading')
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(3)
    root, _ = require(r'^New note$', 'the editor')
    fields = [(n.get('content-desc'), n.get('text')) for n in phone.nodes(root)
              if n.get('class') == 'android.widget.EditText']
    if any(d == 'Page' for d, _ in fields):
        raise StepFailed(f'an audiobook was offered a Page field: {fields}')
    if not any(d in ('Your note', 'The quote') for d, _ in fields):
        raise StepFailed(f'no content field on the editor: {fields}')
    phone.screenshot('s5b-audiobook-no-page.png')

    # And a note saved on it carries no page.
    field = [n for n in phone.nodes(root) if n.get('content-desc') == 'Your note']
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', 'An%saudiobook%snote%swith%sno%spage')
    time.sleep(0.8)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)
    root, _ = require(r'^NOTE$', 'the badge with no page', 10)
    if find(root, r'^NOTE · P\.'):
        raise StepFailed('the audiobook note was given a page anyway')
    con = pulldb.pull('audio-%d' % int(time.time()))
    page = con.execute(
        "select n.page from notes n join books b on b.id=n.book_id "
        "where b.title=? and n.deleted_at is null order by n.created_at desc limit 1",
        (AUDIO,)).fetchone()
    if page is None or page[0] is not None:
        raise StepFailed(f'the stored page should be NULL, it is {page}')
    return 'no Page field offered, badge reads "NOTE", stored page is NULL'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('7 a note survives a re-read, on screen and in the database', note_survives_a_reread),
        ('9 an audiobook is offered no page', audiobook_has_no_page),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
