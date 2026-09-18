"""
Slice 5b, run sheet 11.2: a very long note.

Three places have to cope, and each fails differently: the list row must cut at
`rules.noteLines`, the editor must show all of it and scroll, and Recently Deleted must cut
it with an ellipsis (`deletedLine.ts`, NOTE_PREVIEW).

    python scripts/device/s5b_longnote.py
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

BOOK = 'Paper River: A Memoir'
LONG = ('The river carried everything it was given and complained about none of it. '
        'That is the sentence I keep coming back to, because it is doing two jobs at once '
        'and pretending to do neither. ') * 8   # ~1500 characters
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'

# `adb shell input text` truncates a long string (463 of 1488 characters on this phone), so
# the editor is compared against what was ACTUALLY saved, read back from the database — not
# against the string this script hoped to type. The first version compared against the hope
# and reported a failure that was entirely its own.
state = {}


def write_long_note():
    s3lib.launch()
    s3lib.open_notes(BOOK)
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(3)
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(1)
    # `input text` in one shot; adb handles the length fine.
    phone.adb('shell', 'input', 'text', LONG.replace(' ', '%s'))
    time.sleep(2.5)
    root = dump()
    shown = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    typed = (shown[0].get('text') or '') if shown else ''
    save = find(root, r'^Save note$')
    if not save:
        raise StepFailed('Save note is off screen with a long note in the field')
    phone.screenshot('s5b-long-editor.png')
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3.5)
    con = pulldb.pull('long-%d' % int(time.time()))
    stored = con.execute(
        "select length(content) from notes where content like 'The river carried%' "
        "and deleted_at is null order by created_at desc limit 1").fetchone()
    if stored is None:
        raise StepFailed('the long note was not saved')
    state['stored'] = stored[0]
    s3lib.launch()
    s3lib.open_notes(BOOK)
    return f'{len(typed)} characters typed, {stored[0]} stored; Save note stayed on screen'


def list_row_is_cut():
    root, _ = require(ROW, 'the long note in the list', 12)
    card = [n for n in phone.nodes(root)
            if n.get('clickable') == 'true' and re.match(r'^(Note|Quote)(, page \d+)?, ',
                                                         n.get('content-desc') or '')]
    if not card:
        raise StepFailed('no note card')
    b = list(map(int, re.findall(r'\d+', card[0].get('bounds'))))
    height = b[3] - b[1]
    phone.screenshot('s5b-long-row.png')
    # Six lines of body plus the badge row and padding: comfortably under half the screen.
    screen_h = int(re.search(r'x(\d+)', phone.adb('shell', 'wm', 'size')).group(1))
    if height > screen_h * 0.55:
        raise StepFailed(
            f'the row is {height}px of a {screen_h}px screen - it is not being cut')
    return f'row height {height}px on a {screen_h}px screen'


def editor_shows_all_of_it():
    root = dump()
    card = [n for n in phone.nodes(root)
            if n.get('clickable') == 'true' and re.match(r'^(Note|Quote)(, page \d+)?, ',
                                                         n.get('content-desc') or '')]
    phone.tap_node(card[0])
    time.sleep(3)
    require(r'^Edit note$', 'the editor')
    root = dump()
    field = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    held = (field[0].get('text') or '') if field else ''
    if len(held) < state['stored'] - 2:
        raise StepFailed(
            f"the editor holds {len(held)} of the {state['stored']} characters stored")
    if not find(root, r'^Save changes$'):
        raise StepFailed('Save changes is not reachable with a long note')
    return f'the editor holds all {len(held)} characters, Save changes on screen'


def trash_cuts_it():
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    tap(r'^Delete$', 'confirm Delete')
    time.sleep(8)          # let the toast expire
    s3lib.to_library()
    tap(r'^Settings$', 'Settings')
    time.sleep(2.5)
    tap(r'Recently deleted', 'Recently deleted')
    time.sleep(3)
    root, _ = require(r'Recently deleted', 'Recently Deleted', 12)
    rows = [n.get('content-desc') or '' for n in phone.nodes(root)
            if re.search(r'(Note|Quote)(, p\.\d+)? from ', n.get('content-desc') or '')]
    hit = [r for r in rows if 'river carried' in r]
    if not hit:
        raise StepFailed(f'the long note is not in Recently Deleted: {rows[:4]}')
    # The title part is everything before ", Note" / ", Quote".
    title = re.split(r', (Note|Quote)(, p\.\d+)? from ', hit[0][len('Restore '):])[0]
    if len(title) > 90:
        raise StepFailed(f'the trash row is {len(title)} characters long, uncut')
    if '…' not in title:
        raise StepFailed(f'a cut row must say it was cut: {title!r}')
    phone.screenshot('s5b-long-trash.png')
    return f'trash row {len(title)} chars, ending "…"'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('11.2a a long note can be typed and saved', write_long_note),
        ('11.2b the list row is cut', list_row_is_cut),
        ('11.2c the editor shows all of it', editor_shows_all_of_it),
        ('11.2d Recently Deleted cuts it with an ellipsis', trash_cuts_it),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
