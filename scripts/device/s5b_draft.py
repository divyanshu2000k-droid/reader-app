"""
Slice 5b, run sheet item 5: THE DRAFT. The slice's done-when.

"Backing out of a half written note does not lose it" (05-BUILD-PLAN). Every step here is a
way that promise can fail quietly, including 5.7 — the after-save flush, which was a bug
before it was written (`draftAction`).

    python scripts/device/s5b_draft.py
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
OTHER = 'Idgah'  # on the Want tab and above the fold; Winter Letters needs a scroll
HALF = 'Half a thought that was never'


def type_text(s):
    phone.adb('shell', 'input', 'text', s.replace(' ', '%s').replace("'", ''))
    time.sleep(0.8)


def open_book(title, tab):
    s3lib.launch()
    tap('^' + tab + ' books$', tab + ' tab')
    time.sleep(1.5)
    root, _ = require(re.escape(title), title, 15)
    hits = [n for n in find(root, re.escape(title)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(title))[0])
    time.sleep(2)
    require(r'Book actions', 'book detail', 15)


def to_notes(title, tab='Finished'):
    open_book(title, tab)
    tap(r'Book actions', 'Book actions')
    time.sleep(1.5)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2)


def new_note():
    root = dump()
    if find(root, r'^Add a note$'):
        tap(r'^Add a note$', 'Add a note')
    else:
        tap(r'Add a note', 'the + button')
    time.sleep(2.5)
    require(r'^New note$', 'the editor')


def content_field(root=None):
    root = root or dump()
    for n in phone.nodes(root):
        if n.get('class') == 'android.widget.EditText' and n.get('content-desc') in ('Your note', 'The quote'):
            return n
    raise StepFailed('no content field on screen')


# uiautomator reports an empty EditText's text as its PLACEHOLDER, so reading the node
# blind counts "What do you want to remember?" as 404 characters of draft. The first run of
# 5.5 failed on exactly that: the field HAD cleared.
PLACEHOLDERS = ('What do you want to remember?', 'Type or paste the words', 'Optional')


def typed_value():
    raw = content_field().get('text') or ''
    return '' if raw in PLACEHOLDERS else raw


def type_into_content(text):
    phone.tap_node(content_field())
    time.sleep(1)
    type_text(text)


# ─── 5.1 / 5.2 / 5.3 ─────────────────────────────────────────────────────────

def back_out_keeps_it():
    to_notes(BOOK)
    new_note()
    type_into_content(HALF)
    if HALF.split()[0] not in typed_value():
        raise StepFailed(f'what was typed is not in the field: {typed_value()!r}')
    s3lib.back()
    time.sleep(2)
    root = dump()
    if find(root, r'Discard'):
        raise StepFailed('a "Discard changes?" sheet appeared - nothing is discarded here')
    return 'left the editor with no discard prompt'


def draft_comes_back():
    root = dump()
    if not find(root, r'Notes & quotes'):
        require(r'Notes & quotes', 'back on the notes list', 10)
    new_note()
    value = typed_value()
    if HALF.split()[0] not in value:
        raise StepFailed(f'THE HALF-WRITTEN NOTE WAS LOST. The field holds {value!r}')
    root = dump()
    if not find(root, r'[Pp]icked up where you left off'):
        raise StepFailed('the draft came back but the screen does not say so')
    phone.screenshot('s5b-draft-restored.png')
    return f'restored {len(value)} characters, and the screen says it did'


# ─── 5.4 the app killed mid-note ─────────────────────────────────────────────

def survives_a_kill():
    # Already in the editor holding the restored draft. Add to it, wait past the debounce,
    # then kill the process outright.
    phone.tap_node(content_field())
    time.sleep(0.8)
    type_text(' plus more after the kill')
    time.sleep(2.5)
    phone.adb('shell', 'am', 'force-stop', phone.PKG)
    time.sleep(2)
    to_notes(BOOK)
    new_note()
    value = typed_value()
    if 'kill' not in value:
        raise StepFailed(f'THE DRAFT DID NOT SURVIVE THE APP BEING KILLED: {value!r}')
    return f'{len(value)} characters survived a force-stop'


# ─── 5.5 a reverted draft leaves nothing ─────────────────────────────────────

def reverting_clears_it():
    # Clear the field completely, leave, come back: no restore, empty field.
    phone.tap_node(content_field())
    time.sleep(0.8)
    phone.adb('shell', 'input', 'keycombination', '113', '29')
    time.sleep(0.5)
    phone.adb('shell', 'input', 'keyevent', '67')
    time.sleep(1.5)
    if typed_value().strip():
        raise StepFailed(f'the field did not clear: {typed_value()!r}')
    s3lib.back()
    time.sleep(2)
    new_note()
    root = dump()
    value = typed_value()
    if value.strip():
        raise StepFailed(f'an emptied draft came back holding {value!r}')
    if find(root, r'[Pp]icked up where you left off'):
        raise StepFailed('an emptied draft was offered as a restore')
    return 'emptying the field left no draft'


# ─── 5.6 two books do not share a draft ──────────────────────────────────────

def drafts_are_per_book():
    type_into_content('Draft belonging to the first book')
    time.sleep(1)
    s3lib.back()
    time.sleep(1.5)
    to_notes(OTHER, tab='Want')
    new_note()
    value = typed_value()
    if value.strip():
        raise StepFailed(f"the OTHER book's editor opened holding {value!r}")
    return f'{OTHER} opened empty while {BOOK} holds a draft'


# ─── 5.7 the after-save flush ────────────────────────────────────────────────

def saved_note_does_not_return_as_a_draft():
    type_into_content('A note that is saved and must not come back as a draft')
    time.sleep(1)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)
    require(r'NOTE', 'the saved note in the list', 10)
    new_note()
    value = typed_value()
    if value.strip():
        raise StepFailed(
            f'THE AFTER-SAVE FLUSH PUT THE SAVED NOTE BACK AS A DRAFT: {value!r}')
    root = dump()
    if find(root, r'[Pp]icked up where you left off'):
        raise StepFailed('the editor offered a restore of the note just saved')
    return 'the editor opened empty after saving'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('5.1/5.2 backing out, with no discard prompt', back_out_keeps_it),
        ('5.3 the half-written note comes back, and says so', draft_comes_back),
        ('5.4 THE DRAFT SURVIVES THE APP BEING KILLED', survives_a_kill),
        ('5.5 emptying the field leaves no draft', reverting_clears_it),
        ('5.6 a second book has its own draft', drafts_are_per_book),
        ('5.7 a SAVED note does not come back as a draft', saved_note_does_not_return_as_a_draft),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
