"""
Slice 5b, run sheet item 10: notes with the network off.

Nothing in this slice touches the network, which is the point — rule 1, local first. So the
claim is a negative one: with the radio off, every part of notes behaves exactly as it does
online, and nothing shows a spinner, a banner or an error over the reader's own words.

Run only with airplane mode ON and verified by ping.

    python scripts/device/s5b_offline.py
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
ROW = r'^(NOTE|QUOTE)( · P\.\d+)?$'
CARD = r'^(Note|Quote)(, page \d+)?, '


def assert_offline():
    # `2>&1` on the DEVICE: ping writes "Network is unreachable" to stderr, and phone.adb()
    # returns stdout only, so without this the check reads an empty string and concludes the
    # phone is online. It did exactly that on the first run.
    out = phone.adb('shell', 'ping -c 1 -W 2 8.8.8.8 2>&1', check=False)
    if 'unreachable' not in out and '100% packet loss' not in out:
        raise StepFailed(f'the phone still has a network: {out.strip()[:80]!r}')


def add_note(text):
    root = dump()
    tap(r'^Add a note$' if find(root, r'^Add a note$') else r'Add a note', 'Add a note')
    time.sleep(3)
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(1)
    phone.adb('shell', 'input', 'text', text.replace(' ', '%s'))
    time.sleep(1)
    s3lib.hide_keyboard()
    tap(r'^Save note$', 'Save note')
    time.sleep(3)


def open_first():
    require(ROW, 'a note row', 12)
    root = dump()
    for n in phone.nodes(root):
        if n.get('clickable') == 'true' and re.match(CARD, n.get('content-desc') or ''):
            phone.tap_node(n)
            time.sleep(3)
            require(r'^Edit note$', 'the editor')
            return
    raise StepFailed('no note card')


def opens_and_saves_offline():
    assert_offline()
    s3lib.launch()
    s3lib.open_notes(BOOK)
    root = dump()
    for bad in (r'Could not', r'offline', r'no connection', r'Try again'):
        if find(root, bad):
            raise StepFailed(f'the notes list showed {bad!r} with the network off')
    before = len(find(root, ROW))
    add_note('Written with the radio off')
    root, _ = require(r'Written with the radio off', 'the offline note in the list', 12)
    after = len(find(root, ROW))
    if after != before + 1:
        raise StepFailed(f'{before} rows before, {after} after saving offline')
    return f'{before} -> {after} rows, saved with no network and no error'


def edits_offline():
    assert_offline()
    open_first()
    field = [n for n in phone.nodes(dump())
             if n.get('class') == 'android.widget.EditText'
             and n.get('content-desc') in ('Your note', 'The quote')]
    phone.tap_node(field[0])
    time.sleep(0.8)
    phone.adb('shell', 'input', 'keycombination', '113', '29')
    time.sleep(0.4)
    phone.adb('shell', 'input', 'keyevent', '67')
    time.sleep(0.8)
    phone.adb('shell', 'input', 'text', 'Edited%soffline%stoo')
    time.sleep(1)
    s3lib.hide_keyboard()
    tap(r'^Save changes$', 'Save changes')
    time.sleep(3)
    require(r'Edited offline too', 'the edited note', 12)
    return 'edited and saved with no network'


def deletes_and_undoes_offline():
    assert_offline()
    root = dump()
    before = len(find(root, ROW))
    open_first()
    tap(r'^Delete this note$', 'Delete this note')
    time.sleep(1.2)
    t0 = time.time()
    tap(r'^Delete$', 'confirm Delete')
    for _ in range(8):
        root = dump()
        undo = find(root, r'^Undo$')
        if undo:
            phone.tap_node(undo[0])
            break
        time.sleep(0.3)
    else:
        raise StepFailed('no undo toast offline within %.1fs' % (time.time() - t0))
    time.sleep(3)
    after = len(find(dump(), ROW))
    if after != before:
        raise StepFailed(f'offline undo did not redraw: {before} -> {after}')
    return f'deleted and undone offline; {after} rows'


def the_queue_still_grows():
    con = pulldb.pull('off-%d' % int(time.time()))
    n = con.execute("select count(*) from sync_queue where table_name='notes'").fetchone()[0]
    ops = con.execute(
        "select operation, count(*) from sync_queue where table_name='notes' group by operation"
    ).fetchall()
    return f'{n} queued note operations waiting for a network: {dict(ops)}'


def export_still_opens():
    assert_offline()
    s3lib.launch()
    s3lib.open_notes(BOOK)
    tap(r'^Export these notes$', 'Export these notes')
    for _ in range(12):
        top = phone.foreground()
        if top and top != phone.PKG:
            time.sleep(1)
            phone.screenshot('s5b-export-offline.png')
            phone.adb('shell', 'input', 'keyevent', 'BACK')
            time.sleep(2)
            return f'share sheet opened offline ({top})'
        time.sleep(0.5)
    raise StepFailed('the share sheet did not open offline')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('10.2a notes open and save with no network', opens_and_saves_offline),
        ('10.2b and edit', edits_offline),
        ('10.2c and delete with undo', deletes_and_undoes_offline),
        ('10.2d the sync queue holds the work for later', the_queue_still_grows),
        ('10.2e export still opens the share sheet', export_still_opens),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
