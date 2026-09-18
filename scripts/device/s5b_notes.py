"""
Slice 5b, run sheet items 3 and 4: a note written and kept, a quote, and the filter.

    python scripts/device/s5b_notes.py

Uses "The Long Wolves" (659 pages, current page 369) so the page default is visible.
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts
from s3lib import expect, step

sys.stdout.reconfigure(encoding='utf-8')

BOOK = 'The Long Wolves'
CURRENT_PAGE = '369'
NOTE_TEXT = 'Nine separate stories and I still cannot see how they join up.'
QUOTE_TEXT = 'A good tree is one that grows where it is planted.'


def type_text(s):
    # `input text` takes no spaces; %s is the escape adb uses.
    phone.adb('shell', 'input', 'text', s.replace(' ', '%s').replace("'", ''))
    time.sleep(0.6)


def open_book():
    s3lib.launch()
    tap(r'^Finished books$', 'Finished tab')
    time.sleep(1.5)
    root, _ = require(re.escape(BOOK), f'{BOOK} on the Finished tab', 15)
    hits = [n for n in find(root, re.escape(BOOK)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(BOOK))[0])
    time.sleep(2)
    require(r'Book actions', 'book detail open', 15)
    return 'opened ' + BOOK


def sheet_row_empty():
    tap(r'Book actions', 'Book actions')
    time.sleep(1.5)
    root, hit = require(r'Notes and quotes', 'the Notes row on the actions sheet')
    desc = ' '.join(phone.label(n) for n in hit)
    if 'Nothing saved yet' not in desc:
        raise StepFailed(f'the Notes row should say "Nothing saved yet", it says: {desc}')
    return desc.strip('|')


def open_notes_empty():
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2)
    root, _ = require(r'No notes yet', 'the empty state')
    if not find(root, r'Notes & quotes'):
        raise StepFailed('the header does not say "Notes & quotes"')
    return 'empty state shown'


def page_default():
    tap(r'^Add a note$', 'Add a note', timeout=8)
    time.sleep(2.5)
    root = dump()
    value = s3lib.field_value(root, 'Page')
    if value != CURRENT_PAGE:
        raise StepFailed(f'Page should default to {CURRENT_PAGE}, it is {value!r}')
    return f'Page prefilled {value}'


def keyboard_over_save():
    # Focus the content field and type. The note field is the one labelled "Your note".
    root = dump()
    field = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == 'Your note']
    if not field:
        raise StepFailed('no "Your note" field on screen')
    phone.tap_node(field[0])
    time.sleep(1)
    type_text(NOTE_TEXT)
    if not s3lib.keyboard_up():
        raise StepFailed('the keyboard did not open')
    root = dump()
    save = find(root, r'^Save note$')
    if not save:
        raise StepFailed('Save note is not on screen with the keyboard up')
    top, bottom = map(int, re.findall(r'\d+', save[0].get('bounds'))[1::2])
    ime = phone.adb('shell', 'dumpsys', 'window')
    phone.screenshot('s5b-keyboard-over-save.png')
    return f'Save note at y={top}..{bottom} with the keyboard up'


def save_note():
    tap(r'^Save note$', 'Save note')
    time.sleep(2.5)
    root, _ = require(r'NOTE · P\.' + CURRENT_PAGE, 'the saved note row with its badge')
    if not find(root, r'^1 note$'):
        raise StepFailed(f'the header should say "1 note": {texts(root)[:25]}')
    if not find(root, r'^All 1$'):
        raise StepFailed('the All chip should say "All 1"')
    return 'row NOTE · P.369, header "1 note", chip "All 1"'


def add_quote():
    tap(r'Add a note', 'the + button', timeout=8)
    time.sleep(2.5)
    tap(r'^Quote$', 'the Quote segment')
    time.sleep(1)
    root = dump()
    field = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == 'The quote']
    if not field:
        raise StepFailed('switching to Quote did not relabel the field to "The quote"')
    phone.tap_node(field[0])
    time.sleep(1)
    type_text(QUOTE_TEXT)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(2.5)
    root, _ = require(r'QUOTE · P\.', 'the quote row')
    return 'quote saved'


def counts_are_of_the_book():
    root = dump()
    if not find(root, r'^1 note · 1 quote$'):
        raise StepFailed(f'header should read "1 note · 1 quote": {texts(root)[:25]}')
    for chip in (r'^All 2$', r'^Quotes 1$', r'^Notes 1$'):
        if not find(root, chip):
            raise StepFailed(f'missing chip {chip}')
    return 'header "1 note · 1 quote", chips All 2 / Quotes 1 / Notes 1'


def filter_keeps_the_header():
    tap(r'^Quotes 1$', 'the Quotes chip')
    time.sleep(1.5)
    root = dump()
    if find(root, r'^NOTE · P\.'):
        raise StepFailed('the note is still listed under the Quotes filter')
    if not find(root, r'^QUOTE · P\.'):
        raise StepFailed('the quote is not listed under the Quotes filter')
    if not find(root, r'^1 note · 1 quote$'):
        raise StepFailed('THE HEADER COUNT MOVED WITH THE FILTER - it must be of the book')
    phone.screenshot('s5b-filter-quotes.png')
    tap(r'^Notes 1$', 'the Notes chip')
    time.sleep(1.5)
    root = dump()
    if find(root, r'^QUOTE · P\.'):
        raise StepFailed('the quote is still listed under the Notes filter')
    return 'filter switches the rows and leaves the header count alone'


def sheet_row_counts():
    s3lib.back()
    time.sleep(1.5)
    require(r'Book actions', 'back on book detail', 15)
    tap(r'Book actions', 'Book actions')
    time.sleep(1.5)
    root, hit = require(r'Notes and quotes', 'the Notes row')
    desc = ' '.join(phone.label(n) for n in hit)
    if '1 note · 1 quote' not in desc:
        raise StepFailed(f'the Notes row should carry the counts, it says: {desc}')
    return desc.strip('|')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('3.1 open the book', open_book),
        ('3.1 actions sheet says "Nothing saved yet"', sheet_row_empty),
        ('3.2 the empty state', open_notes_empty),
        ('3.4 the page defaults to where the reader has got to', page_default),
        ('3.5 Save stays above the keyboard', keyboard_over_save),
        ('3.7 the saved note, its badge and the counts', save_note),
        ('4.1 a quote, with the field relabelled', add_quote),
        ('4.3 the counts are of the book', counts_are_of_the_book),
        ('4.4 the filter moves rows, not the header count', filter_keeps_the_header),
        ('3.9 the actions sheet carries the counts', sheet_row_counts),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
