"""Screenshots of the finish screen and the About card, for a theme or font-size pass."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
from phone import StepFailed, dump, find, tap, require
from s5_edit import open_by_search
from s5_phone import open_actions, report, step, texts

label = sys.argv[1]


def bounds(n):
    import re
    return list(map(int, re.findall(r'\d+', n.get('bounds'))))


def look():
    open_by_search('psychology money', 'The Psychology of Money')
    for _ in range(3):
        if find(dump(), r'^ABOUT THIS BOOK$'):
            break
        phone.adb('shell', 'input', 'swipe', '540', '1600', '540', '900', '400')
        time.sleep(0.6)
    phone.screenshot(f's5-{label}-about.png')
    open_actions()
    tap(r'^Rating, note and finish date', 'the finish screen')
    require(r'^You finished ', 'finish screen', 10)
    time.sleep(1.2)
    root = dump()
    phone.screenshot(f's5-{label}-finish-top.png')
    stars = [n for n in phone.nodes(root) if (n.get('content-desc') or '').startswith('Rating, ')]
    one_row = None
    if stars:
        a, b, c, d = bounds(stars[0])
        one_row = (d - b) < 400
    # Scroll to the footer and the date row.
    phone.adb('shell', 'input', 'swipe', '540', '1500', '540', '500', '400')
    time.sleep(0.8)
    phone.screenshot(f's5-{label}-finish-bottom.png')
    t = texts()
    save = 'Save' in t
    date_row = any(x.startswith('Finished ') or x == 'When did you finish?' for x in t)
    tap(r'^Close$', 'close')
    time.sleep(1)
    return f'screenshots s5-{label}-*.png; stars on one row {one_row}; Save visible {save}; date row visible {date_row}'


if __name__ == '__main__':
    step(f'5. {label}: finish screen and About card', look)
    report()
