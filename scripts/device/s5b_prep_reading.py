"""
Put two books on Reading, so item 1 can finish one, move tabs, and finish another —
all in ONE app session.

That matters: the bug 1.4 tests only appears when the SAME Library screen receives the same
`tab` parameter twice. A relaunch between the two requests resets the screen and the second
request stops being a repeat, so the check would pass against the broken code too.

    python scripts/device/s5b_prep_reading.py
"""

import re
import sys
import time

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, require, tap, texts

sys.stdout.reconfigure(encoding='utf-8')

WANT = ['Idgah', 'Godaan Test']  # visible without scrolling; Winter Letters is below the fold


def move_to_reading(title):
    s3lib.launch()
    tap(r'^Want books$', 'Want tab')
    time.sleep(2)
    root, _ = require(re.escape(title), title, 15)
    hits = [n for n in find(root, re.escape(title)) if n.get('clickable') == 'true']
    phone.tap_node(hits[0] if hits else find(root, re.escape(title))[0])
    time.sleep(3)
    require(r'Book actions', 'book detail', 15)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'^Reading$', 'the Reading chip')
    time.sleep(3)
    print(f'  moved {title} to Reading')


for t in WANT:
    move_to_reading(t)

con = pulldb.pull('prep-%d' % int(time.time()))
rows = con.execute(
    "select b.title from books b join reads r on r.book_id=b.id "
    "where r.status='reading' and r.deleted_at is null and b.deleted_at is null").fetchall()
print('on Reading:', [r[0] for r in rows])
sys.exit(0 if len(rows) >= 2 else 1)
