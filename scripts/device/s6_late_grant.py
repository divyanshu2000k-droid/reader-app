"""
The notification permission arrives AFTER the timer has started. Does the notification appear?

This is the regression check for a bug found on a phone on 2026-09-19, and it is the shape
CLAUDE.md calls a silent pass: nothing threw, nothing logged, and every emulator run passed
because every emulator run was handed the permission with `pm grant` BEFORE the timer started.

The bug: the priming sheet is shown after the timer starts, deliberately — the reader tapped
Start to start reading, not to answer a question about Android. So on a reader's very first
session the notification is posted with no permission, refused, and nothing ever retries it.
`renotify` was called from `adopt`, `pause` and `resume`, and from nothing else. That session
then runs with no notification, which on Android means **no foreground service** — exactly
the thing the permission was asked for. Measured before the fix: permission granted, timer
running, 60 seconds of polling, zero notifications.

The fix is `renotify()` from two places: the priming sheet's answer, and `AppState` going
`active` — which also covers the reader who grants it from Settings mid-session.

`pm revoke` reproduces the denied half faithfully. It cannot restore `undetermined`, so the
priming SHEET itself is only ever seen once per install (`s6_permission.py`); this drives the
same `renotify` through the path that can be repeated.

    python scripts/device/s6_late_grant.py
"""

import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

PERM = 'android.permission.POST_NOTIFICATIONS'


def notifications():
    out = phone.adb('shell', 'dumpsys notification --noredact', check=False)
    return [b for b in out.split('NotificationRecord(') if 'pkg=' + phone.PKG + ' ' in b]


def granted():
    out = phone.adb('shell', 'dumpsys package ' + phone.PKG, check=False)
    for line in out.splitlines():
        if 'POST_NOTIFICATIONS' in line and 'granted=' in line:
            return 'granted=true' in line
    return None


def open_reading_book():
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2.5)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed('no book on Reading - run s5b_prep_reading.py first')
    phone.tap_node(cards[0])
    time.sleep(3)


def a_timer_starts_without_the_permission():
    phone.adb('shell', 'pm', 'revoke', phone.PKG, PERM, check=False)
    time.sleep(2)
    if granted() is not False:
        raise StepFailed('could not revoke POST_NOTIFICATIONS')
    # A leftover open session from an earlier script meets the recovery gate on the way in.
    s3lib.launch(clear_recovery=True)
    open_reading_book()
    tap(r'Start timer', 'Start timer')
    time.sleep(6)
    root = dump()
    if not find(root, r'READING NOW') and not find(root, r'Keep the timer running'):
        raise StepFailed('the timer did not start: %s'
                         % [t.strip('|') for t in texts(root)][:14])
    if notifications():
        raise StepFailed('a notification was posted with the permission REVOKED')
    return 'timer running, permission denied, nothing in the shade - as expected'


def granting_it_late_brings_the_notification():
    """
    The measurement. Before the fix this waited the full 40 seconds and found nothing.

    HOME then relaunch is what a reader does after granting in Settings, and it is what makes
    `AppState` go `active`. The relaunch is a resume, not a cold start: force-stopping here
    would prove nothing, because a cold start calls `adopt`, which always posted anyway.
    """
    phone.adb('shell', 'pm', 'grant', phone.PKG, PERM, check=False)
    time.sleep(1.5)
    if granted() is not True:
        raise StepFailed('could not grant POST_NOTIFICATIONS')
    if notifications():
        raise StepFailed('a notification appeared from the grant alone, before the app ran')
    phone.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME', check=False)
    time.sleep(3)
    phone.adb('shell', 'monkey', '-p', phone.PKG,
              '-c', 'android.intent.category.LAUNCHER', '1', check=False)
    for waited in range(40):
        posted = notifications()
        if posted:
            return 'the notification arrived %ds after returning to the app' % waited
        time.sleep(1)
    raise StepFailed(
        'NO notification 40s after the permission was granted. The timer is running with no '
        'foreground service, which is the bug this check exists for.')


def it_is_the_right_notification():
    import re
    blk = notifications()[0]
    out = {}
    for key in ('channel=', 'flags=', 'actions='):
        m = re.search(re.escape(key) + r'([^\s]*)', blk)
        if m:
            out[key.strip('=')] = m.group(1)
    if out.get('channel') != 'reading-timer':
        raise StepFailed('wrong channel: %r - the silent LOW channel is not being used'
                         % out.get('channel'))
    if 'ONGOING_EVENT' not in (out.get('flags') or ''):
        raise StepFailed('not ONGOING: %r. Android kills a foreground service whose '
                         'notification can be swiped away.' % out.get('flags'))
    return 'channel=%(channel)s flags=%(flags)s actions=%(actions)s' % out


def finish_and_clean_up():
    s3lib.launch(clear_recovery=True)
    phone.adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
              '-d', 'reader://session/timer', check=False)
    time.sleep(5)
    if find(dump(), r'^Finish$'):
        tap(r'^Finish$', 'Finish')
        time.sleep(5)
    for _ in range(12):
        if not notifications():
            return 'session finished and the notification is gone'
        time.sleep(1)
    raise StepFailed('the notification survived the session ending')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('A a timer starts with the permission denied', a_timer_starts_without_the_permission),
        ('B granting it late brings the notification', granting_it_late_brings_the_notification),
        ('C and it is the right notification', it_is_the_right_notification),
        ('D finishing clears it', finish_and_clean_up),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
