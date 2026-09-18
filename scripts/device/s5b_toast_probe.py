"""
Is the undo toast absent after deleting the LAST note, or did the script simply miss it?

6.3 passed with 2 notes on the book (the list still rendered afterwards). 6.4 failed with 1
note, where deleting empties the list and the screen swaps to the EmptyState. That is a real
difference, so this polls from the instant of the delete rather than sampling once.

    python scripts/device/s5b_toast_probe.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts

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


to_notes()
rows = len(find(dump(), ROW))
if rows == 0:
    # Make one, so this tests the LAST-note case specifically.
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(2.5)
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', 'Toast%sprobe%snote')
    time.sleep(0.8)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)
    rows = len(find(dump(), ROW))
print(f'notes on the book before deleting: {rows}')

root = dump()
card = [n for n in phone.nodes(root)
        if n.get('clickable') == 'true' and re.match(CARD, n.get('content-desc') or '')]
if not card:
    print('no note card to delete')
    sys.exit(2)
phone.tap_node(card[0])
time.sleep(2.5)
require(r'^Edit note$', 'the editor')
tap(r'^Delete this note$', 'Delete this note')
time.sleep(1.2)

t0 = time.time()
tap(r'^Delete$', 'confirm Delete')

seen = []
for i in range(16):
    root = dump()
    t = round(time.time() - t0, 1)
    undo = bool(find(root, r'^Undo$'))
    toast = bool(find(root, r'^Note deleted$'))
    screen = ('editor' if find(root, r'^Edit note$')
              else 'confirm' if find(root, r'^Delete this note\?$')
              else 'list' if find(root, r'Notes & quotes') else '?')
    seen.append((t, screen, toast, undo))
    print(f'  t={t:>4}s  screen={screen:<8} toast={toast}  undo={undo}')
    if undo:
        phone.screenshot('s5b-toast-last-note.png')
        print('\nTOAST FOUND — the earlier failure was sampling, not the app')
        sys.exit(0)
    time.sleep(0.4)

print('\nNO TOAST in ~%.1fs of polling after the delete.' % (time.time() - t0))
print('Screens seen:', [s for _, s, _, _ in seen])
sys.exit(1)
