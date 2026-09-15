"""Read a sample opens the browser; a book from before Slice 5 fills its details on first open."""
import re
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, require, tap
from s5_phone import library_tab, report, rows_titled, step, texts


def open_from_tab(tab, title):
    s3lib.launch()
    library_tab(tab)
    for _ in range(6):
        rows = rows_titled(title)
        if rows:
            phone.tap_node(rows[0])
            break
        phone.adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400')
        time.sleep(0.8)
    else:
        raise StepFailed(f'{title} not on {tab}')
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1)


def top_package():
    out = phone.adb('shell', 'dumpsys', 'activity', 'activities')
    m = re.search(r'topResumedActivity=ActivityRecord\{\S+ \S+ ([^/ ]+)', out)
    return m.group(1) if m else None


def read_a_sample():
    open_from_tab('Want', 'Godaan (Hindi)')
    sample = find(dump(), r'^Read a sample')
    for _ in range(4):
        if sample:
            break
        phone.adb('shell', 'input', 'swipe', '540', '1700', '540', '900', '400')
        time.sleep(0.7)
        sample = find(dump(), r'^Read a sample')
    if not sample:
        raise StepFailed(f'no Read a sample: {texts()[:20]}')
    phone.screenshot('s5-12-about-sample.png')
    phone.tap_node(sample[0])
    time.sleep(6)
    pkg = top_package()
    phone.screenshot('s5-13-sample-browser.png')
    phone.adb('shell', 'input', 'keyevent', 'BACK')
    time.sleep(2)
    back_in_app = top_package()
    if pkg in (None, phone.PKG):
        raise StepFailed(f'the browser did not open: top {pkg}')
    return f'opened {pkg}; Back returned to {back_in_app}'


def fills_on_first_open():
    con = pulldb.pull('pulled-s5')
    before = con.execute("select description, details_checked_at from books where title = 'The Psychology of Money'").fetchone()
    if before is None or before[1] is not None:
        raise StepFailed(f'not a never-fetched book: {before}')
    s3lib.launch()
    tap(r'^Search your library$', 'library search')
    time.sleep(1)
    phone.adb('shell', 'input', 'text', 'psychology%smoney')
    root, hit = phone.wait_for(r'^The Psychology of Money', 8)
    if not hit:
        raise StepFailed(f'not found in library search: {phone.texts(root)[:15]}')
    s3lib.hide_keyboard()
    root, hit = phone.wait_for(r'^The Psychology of Money', 4)
    phone.tap_node(hit[0])
    require(r'^Book actions$', 'detail', 10)
    appeared = None
    for i in range(20):
        if 'ABOUT THIS BOOK' in texts():
            appeared = i * 0.5
            break
        time.sleep(0.5)
    phone.screenshot('s5-14-filled-on-open.png')
    con = pulldb.pull('pulled-s5')
    after = con.execute("select length(description), categories is not null, details_checked_at is not null from books where title = 'The Psychology of Money'").fetchone()
    if not after[2]:
        raise StepFailed(f'not checked after opening: {after}; card appeared {appeared}')
    return f'About card appeared {"after ~%.1f s" % appeared if appeared is not None else "never (no description)"}; stored description {after[0]} chars, categories {bool(after[1])}, checked {bool(after[2])}'


if __name__ == '__main__':
    which = sys.argv[1:] or ['sample', 'fill']
    if 'sample' in which:
        step('4b. Read a sample opens the browser', read_a_sample)
    if 'fill' in which:
        step('4c. a book from Slice 4 fills its details on first open', fills_on_first_open)
    report()
