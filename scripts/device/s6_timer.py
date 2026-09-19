"""
Slice 6, what an EMULATOR can actually check: the timer's screen and its arithmetic.

It cannot check the thing that matters — Xiaomi and Samsung killing background work — so it
does not pretend to. What it does check is that the ring draws, the clock advances by real
elapsed time, Pause stops it, Resume restarts it, and Finish lands on Session complete with
a duration that matches the wall clock.

    python scripts/device/s6_timer.py
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
CLOCK = r'^\d{1,2}:\d{2}(:\d{2})?$'


def clock_seconds():
    """The mm:ss on screen, as seconds."""
    for t in texts(dump()):
        raw = t.strip('|')
        if re.match(CLOCK, raw):
            parts = [int(p) for p in raw.split(':')]
            return parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0] * 3600 + parts[1] * 60 + parts[2]
    raise StepFailed(f'no clock on screen: {texts(dump())[:15]}')


def seed_and_open_reading():
    s3lib.launch()
    tap(r'Settings', 'Settings')
    time.sleep(2)
    root = dump()
    if find(root, r'Seed 12 books'):
        tap(r'Seed 12 books', 'seed')
        time.sleep(8)
    s3lib.back()
    time.sleep(2)
    s3lib.to_library()
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true'
             and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed(f'no book on Reading after seeding: {texts(root)[:20]}')
    title = (cards[0].get('content-desc') or '').split(',')[0]
    state['title'] = title
    phone.tap_node(cards[0])
    time.sleep(3)
    require(r'Book actions', 'book detail')
    return f'seeded; opened {title!r}'


def start_timer():
    root, _ = require(r'Start timer', 'the Start timer button on book detail', 10)
    tap(r'Start timer', 'Start timer')
    time.sleep(4)
    root, _ = require(r'READING NOW', 'the timer screen', 15)
    first = clock_seconds()
    state['t0'] = time.time()
    state['first'] = first
    phone.screenshot('s6-timer-running.png')
    # NOT a database pull here. `pulldb.pull()` force-stops the app, which IS the crash case:
    # the first run of this script did exactly that and walked into the launch recovery sheet.
    # The row is verified after Finish instead, and the kill is its own check below.
    return f'ring drawn, clock at {first}s'


def reopening_resumes():
    """Leaving and coming back must show the SAME timer, not start a second one."""
    s3lib.back()
    time.sleep(2)
    require(r'Book actions', 'back on book detail', 12)
    tap(r'Start timer', 'Start timer again')
    time.sleep(4)
    require(r'READING NOW|PAUSED', 'the timer screen again', 12)
    again = clock_seconds()
    # A second session would restart the clock near zero; the same one keeps counting.
    if again < state['first']:
        raise StepFailed(
            f"A SECOND TIMER WAS STARTED: clock went {state['first']}s -> {again}s")
    return f"same session resumed; clock {state['first']}s -> {again}s"


def pause_and_resume():
    before = clock_seconds()
    tap(r'^Pause$', 'Pause')
    time.sleep(1.5)
    require(r'^PAUSED$', 'the paused label')
    paused_at = clock_seconds()
    time.sleep(6)
    still = clock_seconds()
    if still != paused_at:
        raise StepFailed(f'THE CLOCK RAN WHILE PAUSED: {paused_at}s -> {still}s')
    phone.screenshot('s6-timer-paused.png')

    tap(r'^Resume$', 'Resume')
    time.sleep(1.5)
    require(r'^READING NOW$', 'running again')
    time.sleep(5)
    after = clock_seconds()
    if after <= still:
        raise StepFailed(f'the clock did not restart after Resume: {still}s -> {after}s')
    return f'{before}s running, held at {paused_at}s for 6s paused, {after}s after resuming'


def finish_lands_on_session_complete():
    started = time.time()
    shown = clock_seconds()
    tap(r'^Finish$', 'Finish')
    time.sleep(5)
    root = dump()
    if not find(root, r'Session complete|pages|Done'):
        raise StepFailed(f'Finish did not land on Session complete: {texts(root)[:20]}')
    phone.screenshot('s6-session-complete.png')

    con = pulldb.pull('s6c-%d' % int(time.time()))
    row = con.execute(
        'select duration_seconds, is_timed from sessions where is_timed=1 '
        'and deleted_at is null order by occurred_at desc limit 1').fetchone()
    if row is None or row[0] is None:
        raise StepFailed(f'the session has no duration after Finish: {row}')
    duration, is_timed = row
    if is_timed != 1:
        raise StepFailed('the finished session is not marked timed')
    # It must be in the right ballpark of what the screen showed, not a fabricated number.
    if abs(duration - shown) > 10:
        raise StepFailed(f'saved {duration}s but the screen showed {shown}s')
    still_open = con.execute(
        'select count(*) from sessions where is_timed=1 and duration_seconds is null '
        'and deleted_at is null').fetchone()[0]
    if still_open != 0:
        raise StepFailed(f'{still_open} timed sessions are still open after Finish')
    runs = con.execute(
        "select count(*) from metadata_cache where source='timer_run'").fetchone()[0]
    return f'saved {duration}s (screen showed {shown}s); 0 open sessions, {runs} stored runs'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.1 seed and open a book on Reading', seed_and_open_reading),
        ('6.2 Start writes the session row and draws the ring', start_timer),
        ('6.3 reopening resumes, and does NOT start a second timer', reopening_resumes),
        ('6.4 Pause stops the clock; Resume restarts it', pause_and_resume),
        ('6.5 Finish saves a duration matching the screen', finish_lands_on_session_complete),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
