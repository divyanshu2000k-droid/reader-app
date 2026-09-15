"""Slice 5 offline: stored descriptions show; a book added offline fills its details once online."""
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, require, tap
from s5_edit import open_by_search
from s5_phone import report, step, texts

STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 's5_state.json')


def description_offline():
    open_by_search('psychology money', 'The Psychology of Money')
    time.sleep(1)
    t = texts()
    about = 'ABOUT THIS BOOK' in t and any(x.startswith('Timeless lessons on wealth') for x in t)
    phone.screenshot('s5-16-offline-about.png')
    if not about:
        raise StepFailed(f'no stored description offline: {t[:16]}')
    return 'The Psychology of Money shows its stored description with the network off'


def add_offline():
    s3lib.launch()
    tap(r'^Add$', 'Add tab', timeout=15)
    require(r'^Search for a book$', 'add', 15)
    tap(r'^Search for a book$', 'field')
    phone.adb('shell', 'input', 'text', 'idgah')
    root, hit = phone.wait_for(r'^Add Idgah', 20)
    banner = [x for x in phone.texts(root) if 'Search needs a connection' in x or 'searched for before' in x]
    if not hit:
        raise StepFailed(f'no remembered Idgah: {phone.texts(root)[:20]}')
    s3lib.hide_keyboard()
    root, hit = phone.wait_for(r'^Add Idgah', 4)
    phone.tap_node(hit[0])
    tap(r'^Add to Want to read', 'want')
    require(r'^Book actions$', 'detail', 12)
    time.sleep(4)
    t = texts()
    no_card = 'ABOUT THIS BOOK' not in t
    phone.screenshot('s5-17-offline-added.png')
    con = pulldb.pull(f'pulled-off-{int(time.time())}')
    row = con.execute("select description, details_checked_at from books where title = 'Idgah' and deleted_at is null").fetchone()
    if row is None or row[1] is not None or not no_card:
        raise StepFailed(f'db {row}, About card absent {no_card}')
    with open(STATE, 'r+', encoding='utf8') as f:
        state = json.load(f)
        state['offline_added'] = 'Idgah'
        f.seek(0)
        json.dump(state, f)
        f.truncate()
    return f'offline banner {banner[:1]}; Idgah added from remembered results; no About card; details never fetched (checked_at NULL)'


def fills_back_online():
    open_by_search('idgah', 'Idgah')
    appeared = None
    for i in range(30):
        if 'ABOUT THIS BOOK' in texts():
            appeared = i * 0.5
            break
        time.sleep(0.5)
    phone.screenshot('s5-18-online-filled.png')
    con = pulldb.pull(f'pulled-on-{int(time.time())}')
    row = con.execute("select length(description), details_checked_at is not null from books where title = 'Idgah' and deleted_at is null").fetchone()
    if not row or not row[1] or not row[0] or appeared is None:
        raise StepFailed(f'db {row}, card appeared {appeared}')
    return f'back online, the About card appeared after ~{appeared:.1f} s; {row[0]} characters stored, checked'


if __name__ == '__main__':
    which = sys.argv[1:]
    if 'offline' in which:
        step('4e. offline: a stored description still shows', description_offline)
        step('4f. offline: a book added from remembered results has no card and breaks nothing', add_offline)
    if 'online' in which:
        step('4g. back online: that book fills its details on open', fills_back_online)
    report()
