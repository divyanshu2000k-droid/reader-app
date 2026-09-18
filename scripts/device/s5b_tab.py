"""
Run sheet item 1 — Slice 5's debt: "Start the next one", TWICE.

The 2026-09-15 review fixed this in one line and shipped it with no test; it now has one
(`features/library/tabRequest.ts`). This is the phone half.

The bug: the request was the `tab` route parameter alone, so a second "Start the next one"
after the reader had moved to another tab carried the identical parameter, compared equal to
the one already honoured, and changed nothing — the reader asked for Want to read and stayed
on Finished.

    python scripts/device/s5b_tab.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')


def selected_tab():
    for n in phone.nodes(dump()):
        if n.get('selected') == 'true' and (n.get('content-desc') or '').endswith('books'):
            return (n.get('content-desc') or '').replace(' books', '')
    return None


def finish_a_book_on_reading():
    """Open the first book on Reading and run the finish flow up to the buttons."""
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and re.search(r', ', n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed(f'no book on Reading: {texts(root)[:20]}')
    title = (cards[0].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[0])
    time.sleep(3)
    require(r'Book actions', 'book detail', 15)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'^Finished$', 'the Finished chip')
    time.sleep(3.5)
    require(r'Start the next one', 'the finish screen', 15)
    return title


def start_the_next_one():
    tap(r'Start the next one', 'Start the next one')
    time.sleep(4)
    require(r'^Reading books$', 'back at the Library', 15)
    return selected_tab()


def first_request():
    s3lib.launch()
    title = finish_a_book_on_reading()
    tab = start_the_next_one()
    if tab != 'Want':
        raise StepFailed(f'the Library opened on {tab!r}, expected Want')
    phone.screenshot('s5b-tab-first.png')
    return f'finished {title!r}; the Library opened on Want'


def move_away_then_request_again():
    tap(r'^Finished books$', 'the Finished tab')
    time.sleep(2)
    if selected_tab() != 'Finished':
        raise StepFailed('could not move to the Finished tab')
    title = finish_a_book_on_reading()
    tab = start_the_next_one()
    if tab != 'Want':
        raise StepFailed(
            f'THE SECOND "Start the next one" LEFT THE LIBRARY ON {tab!r} - '
            'the repeat request was ignored')
    phone.screenshot('s5b-tab-second.png')
    return f'finished {title!r}; the Library opened on Want the SECOND time too'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('1.1 "Start the next one" opens Want to read', first_request),
        ('1.4 and does so AGAIN after moving to another tab', move_away_then_request_again),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
