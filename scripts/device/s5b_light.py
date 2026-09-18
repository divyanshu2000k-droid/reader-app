"""
Slice 5b, run sheet item 11.1: light mode.

Worth doing properly rather than glancing at: the design sheet's own light-mode text colours
failed WCAG AA and the app used them for two slices (CLAUDE.md, item 10). Nothing looked
wrong on a dark-mode phone and nothing measured it.

This screenshots the four surfaces this slice added, in light mode, for the colours to be
read off: the list with a quote row and a note row, the editor, the draft line, and the
Recently Deleted row.

    python scripts/device/s5b_light.py
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
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'


def assert_light():
    out = phone.adb('shell', 'cmd uimode night', check=False).strip()
    if 'no' not in out.lower():
        raise StepFailed(f'the phone is not in light mode: {out!r}')
    return out


def the_list():
    assert_light()
    s3lib.launch()
    s3lib.open_notes(BOOK)
    root, _ = require(ROW, 'notes in the list', 12)
    kinds = sorted({m for t in texts(root) for m in re.findall(r'^(QUOTE|NOTE)', t.strip('|'))})
    phone.screenshot('s5b-light-list.png')
    return f'list screenshotted in light mode; badges present: {kinds}'


def the_editor():
    assert_light()
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(3)
    require(r'^New note$', 'the editor')
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', 'Light%smode%slegibility%scheck')
    time.sleep(1)
    s3lib.hide_keyboard()
    time.sleep(1)
    root = dump()
    draft_line = [t for t in texts(root) if 'draft' in t.lower()]
    phone.screenshot('s5b-light-editor.png')
    if not draft_line:
        raise StepFailed('the draft line is not on screen to be read')
    return f'editor screenshotted; draft line reads {draft_line[0].strip("|")!r}'


def the_quote_row():
    assert_light()
    tap(r'^Quote$', 'the Quote segment')
    time.sleep(1.5)
    phone.screenshot('s5b-light-quote-editor.png')
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)
    require(r'^QUOTE', 'a quote row in light mode', 12)
    phone.screenshot('s5b-light-quote-row.png')
    return 'quote saved and screenshotted in light mode'


def the_trash():
    assert_light()
    s3lib.to_library()
    tap(r'^Settings$', 'Settings')
    time.sleep(2.5)
    tap(r'Recently deleted', 'Recently deleted')
    time.sleep(3)
    require(r'Recently deleted', 'Recently Deleted', 12)
    phone.screenshot('s5b-light-trash.png')
    return 'Recently Deleted screenshotted in light mode'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('11.1a the notes list in light mode', the_list),
        ('11.1b the editor and the draft line', the_editor),
        ('11.1c a quote row', the_quote_row),
        ('11.1d Recently Deleted', the_trash),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
