"""
Item 3.5, measured rather than asserted: is "Save note" ABOVE the keyboard, or merely in
the view tree behind it?

uiautomator reports a node's bounds whether or not something is drawn over it, so "Save note
is in the dump" is not the claim. The claim is that its bottom edge sits above the IME's top
edge. This prints both numbers.

    python scripts/device/s5b_keyboard.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import dump, find, require, tap

sys.stdout.reconfigure(encoding='utf-8')

BOOK = 'The Long Wolves'


def ime_top():
    """The y of the top of the input-method window, or None when it is not showing."""
    out = phone.adb('shell', 'dumpsys', 'window', 'windows')
    block = None
    for chunk in out.split('Window #'):
        if 'InputMethod' in chunk and 'mIsImWindow=true' in chunk or 'InputMethod' in chunk:
            m = re.search(r'frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]', chunk)
            if m:
                block = m
    return int(block.group(2)) if block else None


def screen_height():
    out = phone.adb('shell', 'wm', 'size')
    return int(re.search(r'(\d+)x(\d+)', out).group(2))


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
tap(r'Add a note', 'Add a note')
time.sleep(2.5)

root = dump()
field = [n for n in phone.nodes(root)
         if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == 'Your note']
phone.tap_node(field[0])
time.sleep(1.2)

# Type well past one line, which is the case the run sheet calls out: a multiline editor
# that can scroll past its own visible height.
long_note = ('Nine separate stories and I still cannot see how they join up. '
             'It feels deliberate. I think the trees are the connective tissue rather '
             'than the people, and the book keeps saying so without ever saying it. ') * 3
phone.adb('shell', 'input', 'text', long_note.replace(' ', '%s').replace("'", ''))
time.sleep(1.5)

print('keyboard showing:', s3lib.keyboard_up())
h = screen_height()
top = ime_top()
root = dump()
save = find(root, r'^Save note$')
if not save:
    print('FAIL: Save note not in the tree at all')
    sys.exit(1)
b = list(map(int, re.findall(r'\d+', save[0].get('bounds'))))
print(f'screen height:      {h}')
print(f'Save note bounds:   [{b[0]},{b[1]}][{b[2]},{b[3]}]  (bottom y={b[3]})')
print(f'keyboard top y:     {top}')
phone.screenshot('s5b-keyboard-measured.png')

if top is None:
    print('INCONCLUSIVE: could not read the IME frame')
    sys.exit(1)
if b[3] <= top:
    print(f'PASS: Save note ends {top - b[3]}px above the keyboard')
    sys.exit(0)
print(f'FAIL: Save note is {b[3] - top}px BEHIND the keyboard')
sys.exit(1)
