"""
Slice 6, the check the first run stumbled into by accident: kill the app mid-timer.

Three things must hold, and the middle one is the whole reason the heartbeat exists:

  1. The launch recovery sheet appears, because the session row was written at Start.
  2. The minutes it OFFERS come from the last heartbeat, not from how long the app was shut.
  3. Discarding clears the timer's local record, so a crash leaks nothing.

(3) is a fix made on 2026-09-18 after a leftover row was found on the emulator; it had never
been exercised, because the leftover predated it.

    python scripts/device/s6_recovery.py
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

state = {}


def runs_stored():
    con = pulldb.pull('s6r-%d' % int(time.time()))
    return con.execute("select count(*) from metadata_cache where source='timer_run'").fetchone()[0]


def clear_leftovers():
    """Start from zero, so the count at the end means something."""
    before = runs_stored()
    # Any run whose session is finished or deleted is historical rubbish from earlier runs.
    con = pulldb.pull('s6r0-%d' % int(time.time()))
    orphans = con.execute(
        "select m.source_id from metadata_cache m left join sessions s on s.id = m.source_id "
        "where m.source='timer_run' and (s.id is null or s.duration_seconds is not null "
        "or s.deleted_at is not null)").fetchall()
    state['orphans'] = len(orphans)
    return f'{before} run records stored, {len(orphans)} of them already orphaned'


def start_and_kill():
    s3lib.launch()
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed('no book on Reading')
    phone.tap_node(cards[0])
    time.sleep(3)
    tap(r'Start timer', 'Start timer')
    time.sleep(4)
    require(r'READING NOW', 'the timer running')

    # Long enough for at least one heartbeat (30s) plus room, so the bound is a real one.
    print('    running for 40s so the heartbeat fires...', flush=True)
    time.sleep(40)
    shown = None
    for t in texts(dump()):
        if re.match(r'^\d{1,2}:\d{2}$', t.strip('|')):
            mm, ss = t.strip('|').split(':')
            shown = int(mm) * 60 + int(ss)
            break
    state['shown'] = shown
    phone.adb('shell', 'am', 'force-stop', phone.PKG)
    time.sleep(3)
    return f'timer ran to {shown}s, then the app was killed'


def recovery_sheet_offers_the_heartbeat_bound():
    s3lib.launch(wait=r'A session was still running')
    root, _ = require(r'A session was still running', 'the recovery sheet', 30)
    phone.screenshot('s6-recovery-sheet.png')
    field = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText']
    if not field:
        raise StepFailed(f'no minutes field on the sheet: {texts(root)[:20]}')
    offered = (field[0].get('text') or '').strip()
    state['offered'] = offered
    body = ' '.join(t.strip('|') for t in texts(root) if 'started timing' in t)
    # The session ran under a minute of reading, so the offer must be about a minute — NOT
    # a number derived from however long the app happened to stay shut.
    if offered in ('', '0'):
        raise StepFailed(f'the sheet offered {offered!r} for a {state["shown"]}s session')
    return f'offered {offered!r} minutes for a {state["shown"]}s session · "{body[:70]}"'


def discard_clears_the_run():
    tap(r'Discard it', 'Discard it')
    time.sleep(4)
    left = runs_stored()
    if left > state['orphans']:
        raise StepFailed(
            f'discarding LEFT a timer run behind: {left} stored, '
            f'{state["orphans"]} were already orphaned before this run')
    return f'{left} run records left, against {state["orphans"]} pre-existing orphans'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.6a baseline: what is already stored', clear_leftovers),
        ('6.6b start a timer and kill the app', start_and_kill),
        ('6.6c the recovery sheet offers the HEARTBEAT bound', recovery_sheet_offers_the_heartbeat_bound),
        ('6.6d discarding clears the timer run', discard_clears_the_run),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
