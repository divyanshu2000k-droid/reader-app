"""
Slice 5b, run sheet item 8: export.

The share sheet is a SYSTEM screen, so the foreground guard would refuse to dump it — and
should. This check confirms the chooser opened by reading the foreground package, then takes
a screenshot for the subject and preview to be read off. Nothing dumps the chooser's tree.

    python scripts/device/s5b_export.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

BOOK = 'The Long Wolves'
EMPTY_BOOK = 'Piranesi'
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'


def to_notes(title):
    # Search, not the tab: both books used here sit below the fold on a long Finished tab.
    s3lib.launch()
    s3lib.open_notes(title)


def add_quote(text):
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(3)
    tap(r'^Quote$', 'the Quote segment')
    time.sleep(1.2)
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == 'The quote']
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', text.replace(' ', '%s'))
    time.sleep(0.8)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)


def chooser_opened(shot):
    """True once a system chooser is in front. Screenshots it; never dumps it."""
    for _ in range(12):
        top = phone.foreground()
        if top and top != phone.PKG:
            time.sleep(1.0)
            phone.screenshot(shot)
            return top
        time.sleep(0.5)
    return None


def dismiss_chooser():
    phone.adb('shell', 'input', 'keyevent', 'BACK')
    time.sleep(2)


def export_all():
    to_notes(BOOK)
    if not find(dump(), r'^QUOTE'):
        add_quote('A good tree is one that grows where it is planted.')
    root = dump()
    rows = len(find(root, ROW))
    tap(r'^Export these notes$', 'Export these notes')
    top = chooser_opened('s5b-export-all.png')
    if top is None:
        raise StepFailed('no share sheet opened')
    dismiss_chooser()
    require(r'Notes & quotes', 'back on the notes list after dismissing', 12)
    return f'{rows} rows exported; chooser {top} opened and dismissed'


def export_filtered():
    tap(r'^Quotes 1$', 'the Quotes chip')
    time.sleep(2)
    root = dump()
    if not find(root, r'^QUOTE'):
        raise StepFailed('the Quotes filter shows no quote')
    tap(r'^Export these notes$', 'Export these notes')
    top = chooser_opened('s5b-export-quotes.png')
    if top is None:
        raise StepFailed('no share sheet opened for the filtered export')
    dismiss_chooser()
    return f'filtered export opened {top}'


def no_notes_no_export():
    to_notes(EMPTY_BOOK)
    root, _ = require(r'No notes yet', f'{EMPTY_BOOK} has no notes', 12)
    if find(root, r'^Export these notes$'):
        raise StepFailed('a book with no notes offers an export')
    return 'no Export button under the empty state'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('8.1 Export opens Android’s share sheet', export_all),
        ('8.3 exporting under a filter', export_filtered),
        ('8.4 a book with no notes offers no export', no_notes_no_export),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
