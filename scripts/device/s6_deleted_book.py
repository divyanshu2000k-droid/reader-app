"""
The open question from `04-SCREENS.md`, now decided: what happens when a book is removed
while its timer is running?

Owner's decision, 2026-09-19: **the timer stops and says so.** The cascade already takes the
session with the book; the timer has to notice, stop, clear its notification, and tell the
reader where their session went.

Before this, the timer kept ticking into a soft-deleted row and Finish failed with an inline
error at the END of a session — the worst possible moment to find out.

    python scripts/device/s6_deleted_book.py
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


def notifications():
    out = phone.adb('shell', 'dumpsys notification --noredact', check=False)
    return [b for b in out.split('NotificationRecord(') if f'pkg={phone.PKG} ' in b]


def start_a_timer():
    phone.adb('shell', 'pm', 'grant', phone.PKG,
              'android.permission.POST_NOTIFICATIONS', check=False)
    s3lib.launch()
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed('no book on Reading — run s6_timer.py first to seed')
    state['title'] = (cards[0].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[0])
    time.sleep(3)
    tap(r'Start timer', 'Start timer')
    time.sleep(5)
    require(r'READING NOW', 'the timer running')
    if not notifications():
        raise StepFailed('no notification, so this check cannot prove it is cleared')
    return f"timer running on {state['title']!r}, notification up"


def remove_the_book_from_elsewhere():
    """Leave the timer screen and remove the book, exactly as a reader would."""
    s3lib.back()
    time.sleep(2)
    require(r'Book actions', 'book detail', 12)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'^Remove$', 'Remove')
    time.sleep(1.5)
    require(r'Remove this book\?', 'the confirm')
    tap(r'^Remove$', 'confirm Remove', index=1)
    time.sleep(4)
    # NO DATABASE PULL HERE. `pulldb.pull()` force-stops the app, which wipes the in-memory
    # message the next step is checking for — the same trap as `s6_timer.py`'s first run, and
    # it is in the scripts README. The database is checked at the very end instead.
    return 'book removed from book detail while its timer ran'


def the_notification_is_gone():
    for _ in range(10):
        if not notifications():
            return 'the timer notification was cleared'
        time.sleep(1)
    raise StepFailed('THE NOTIFICATION SURVIVED the book being removed')


def the_timer_says_so():
    """
    Reopening the timer must explain, not show a dead ring.

    The app must NOT have been restarted between the removal and this step: the message lives
    in the timer service, which is a module, so a fresh process has nothing to say. That is
    the intended behaviour — after a relaunch the session is simply in Recently Deleted like
    anything else — but it means this check only means something in one live process.
    """
    phone.adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
              '-d', 'reader://session/timer', check=False)
    time.sleep(5)
    root = dump()
    said = [t.strip('|') for t in texts(root)
            if 'removed' in t.lower() or 'Recently Deleted' in t]
    phone.screenshot('s6-deleted-book.png')
    if not said:
        raise StepFailed(f'the timer said nothing about the removal: {texts(root)[:18]}')
    return ' · '.join(said)[:150]


def the_database_agrees():
    """Last, because pulling force-stops the app."""
    con = pulldb.pull('del-%d' % int(time.time()))
    live = con.execute(
        'select count(*) from sessions where is_timed=1 and duration_seconds is null '
        'and deleted_at is null').fetchone()[0]
    if live != 0:
        raise StepFailed(f'{live} open timed sessions survived the cascade')
    deleted = con.execute(
        'select count(*) from sessions where is_timed=1 and deleted_at is not null').fetchone()[0]
    return f'0 open timed sessions; {deleted} timed sessions soft-deleted and recoverable'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('A start a timer on a book', start_a_timer),
        ('B remove the book from book detail', remove_the_book_from_elsewhere),
        ('C the notification is cleared', the_notification_is_gone),
        ('D the timer explains where the session went', the_timer_says_so),
        ('E the database agrees', the_database_agrees),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
