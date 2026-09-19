"""
Item 0b: the notification permission flow, which NO run has ever seen.

Every emulator run was handed the permission with `pm grant`, so the priming sheet, the system
dialog and "Not now" have only ever been read in the source. This drives all three on a phone
whose permission is still `undetermined`.

What it asserts, in the order the reader meets it:

  A. the permission really is undetermined — otherwise nothing below means anything
  B. the timer STARTS FIRST, and the sheet comes after it. The sheet is not a gate: the reader
     tapped Start to start reading, not to answer a question about Android
  C. the SYSTEM dialog has not been spent. Android shows it once ever; the explanation goes in
     front of it so the one shot is not wasted on a reader who does not know what it buys them
  D. "Not now" leaves the timer running and the permission untouched
  E. whether a later timer primes AGAIN - recorded as a number, because the file's own comment
     says "Nagging is how an app earns a permanent denial"
  F. "Allow notifications" reaches the real system dialog, and granting it posts the timer
     notification

    python scripts/device/s6_permission.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

SHEET = r'Keep the timer running'
state = {}


def perm_state():
    out = phone.adb('shell', 'dumpsys package ' + phone.PKG, check=False)
    for line in out.splitlines():
        if 'POST_NOTIFICATIONS' in line and 'granted=' in line:
            return 'granted=true' in line
    return None


def focused_package():
    out = phone.adb('shell', 'dumpsys window', check=False)
    for line in out.splitlines():
        if 'mCurrentFocus' in line:
            m = re.search(r'([a-z][a-z0-9_.]+)/', line)
            return m.group(1) if m else line.strip()
    return None


def notifications():
    out = phone.adb('shell', 'dumpsys notification --noredact', check=False)
    return [b for b in out.split('NotificationRecord(') if 'pkg=' + phone.PKG + ' ' in b]


def open_reading_book(skip=0):
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2.5)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if len(cards) <= skip:
        raise StepFailed('need %d books on Reading, found %d' % (skip + 1, len(cards)))
    state['title'] = (cards[skip].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[skip])
    time.sleep(3)


# -- A --
def the_permission_is_untouched():
    granted = perm_state()
    if granted is not False:
        raise StepFailed(
            'POST_NOTIFICATIONS is not in its fresh state (granted=%r). Only a FRESH INSTALL '
            'restores "undetermined"; pm revoke does not.' % granted)
    return 'POST_NOTIFICATIONS granted=false, never asked'


# -- B and C --
def the_timer_starts_first_and_the_sheet_follows():
    s3lib.launch()
    open_reading_book()
    tap(r'Start timer', 'Start timer')
    time.sleep(4)
    root = dump()
    if not find(root, r'READING NOW'):
        raise StepFailed('the timer did not start: %s'
                         % [t.strip('|') for t in texts(root)][:14])
    for _ in range(12):
        root = dump()
        if find(root, SHEET):
            break
        time.sleep(1)
    else:
        raise StepFailed('the priming sheet never appeared on an undetermined permission')
    focus = focused_package()
    if focus != phone.PKG:
        raise StepFailed('the SYSTEM dialog came up first (%s) - the one shot was spent '
                         'before the reader was told what it buys them' % focus)
    phone.screenshot('s6-priming-sheet.png')
    return 'timer running FIRST, then the sheet; system dialog not yet spent'


def the_sheet_offers_not_now_as_an_equal():
    root = dump()
    allow = find(root, r'^Allow notifications$')
    notnow = find(root, r'^Not now$')
    if not allow or not notnow:
        raise StepFailed('sheet buttons missing: allow=%s notNow=%s'
                         % (bool(allow), bool(notnow)))
    return 'both "Allow notifications" and "Not now" are on the sheet'


# -- D --
def not_now_leaves_the_timer_running():
    tap(r'^Not now$', 'Not now')
    time.sleep(2.5)
    root = dump()
    if find(root, SHEET):
        raise StepFailed('the sheet did not close on "Not now"')
    if not find(root, r'READING NOW'):
        raise StepFailed('"Not now" stopped the timer: %s'
                         % [t.strip('|') for t in texts(root)][:14])
    if perm_state() is not False:
        raise StepFailed('"Not now" changed the permission')
    if notifications():
        raise StepFailed('a notification was posted without the permission')
    return 'timer still running, permission untouched, nothing in the shade'


# -- E --
def a_second_timer_primes_again():
    """
    Not an assertion - a MEASUREMENT, written down whichever way it goes.

    `shouldPrime` asks the system, and "Not now" never reaches the system: the status stays
    `undetermined` and `canAskAgain` stays true. So on this path the sheet is shown again on
    the next NEW timer, and again after that, for a reader who has already declined once.
    """
    tap(r'^Finish$', 'Finish the first timer')
    time.sleep(5)
    if find(dump(), r'Session complete'):
        for label in [r'^Done$', r'^Close$', r'Back to the book']:
            if find(dump(), label):
                tap(label, 'leave Session complete', timeout=6)
                break
        time.sleep(2)
    s3lib.launch()
    open_reading_book(skip=1)
    tap(r'Start timer', 'Start timer')
    time.sleep(6)
    again = bool(find(dump(), SHEET))
    state['primed_again'] = again
    return ('PRIMED AGAIN after "Not now" - the sheet returns on every new timer'
            if again else 'did not prime again after "Not now"')


# -- F --
def allow_reaches_the_real_system_dialog():
    if not find(dump(), SHEET):
        raise StepFailed('no sheet on screen to tap "Allow notifications" on')
    tap(r'^Allow notifications$', 'Allow notifications')
    time.sleep(3)
    focus = focused_package()
    if focus == phone.PKG:
        raise StepFailed('no system dialog appeared - "Allow notifications" reached nothing')
    phone.screenshot('s6-system-permission-dialog.png')
    root = dump()
    choice = find(root, r'^Allow$') or find(root, r'Allow')
    if not choice:
        raise StepFailed('system dialog up (%s) but no Allow button: %s'
                         % (focus, [t.strip('|') for t in texts(root)][:10]))
    phone.tap_node(choice[0])
    time.sleep(4)
    if perm_state() is not True:
        raise StepFailed('Allow was tapped and the permission is still not granted')
    for _ in range(15):
        if notifications():
            return 'system dialog was %s; granted, and the timer notification is up' % focus
        time.sleep(1)
    raise StepFailed('permission granted but NO notification was posted')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('A the permission has never been asked for', the_permission_is_untouched),
        ('B the timer starts first, the sheet follows',
         the_timer_starts_first_and_the_sheet_follows),
        ('C "Not now" is offered as an equal', the_sheet_offers_not_now_as_an_equal),
        ('D "Not now" leaves the timer running', not_now_leaves_the_timer_running),
        ('E does a later timer prime again?', a_second_timer_primes_again),
        ('F Allow reaches the system dialog and grants', allow_reaches_the_real_system_dialog),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
