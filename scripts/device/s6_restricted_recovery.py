"""
THE WHOLE RESTRICTED-PHONE STORY, END TO END, on the reader's screen.

This is the case the two-week hard limit exists for, reproduced on stock Android: with
"restrict background usage" set — what a Xiaomi does by default to an app it does not
recognise — Android demotes the foreground service immediately and kills it within about a
minute. Measured on a Nothing Phone 2a, 2026-09-19:

    t=0       service=foreground              notification=True
    restrict  service=running, NOT foreground notification=True
    5m        service=no ServiceRecord        notification=False

The timer stops. Nothing can prevent that; the phone's owner asked for it. What CAN be got
right is what the reader is told afterwards, and before 2026-09-19 it was wrong twice over:

  - the sheet capped them at the heartbeat bound, so five minutes of reading could only be
    saved as one, and
  - it said "It started 1 minute ago", which was false — the session started five minutes ago.

The cap rested on "nobody can have read longer than the elapsed time". True of the wall
clock; **not** true of the heartbeat, which is only how long the APP stayed alive.

So this drives the real screens and asserts what the reader can actually do:

    python scripts/device/s6_restricted_recovery.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

READ_FOR = 150          # long enough that the kill lands well inside the session
state = {}


def adb(*args):
    return phone.adb(*args, check=False)


def restore():
    adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_ANY_IN_BACKGROUND', 'allow')
    adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_IN_BACKGROUND', 'allow')


def service_state():
    out = adb('shell', 'dumpsys activity services ' + phone.PKG)
    if 'ServiceRecord' not in out:
        return 'gone'
    return 'foreground' if 'isForeground=true' in out else 'demoted'


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


def a_timer_runs_then_the_phone_restricts_it():
    restore()
    s3lib.launch(clear_recovery=True)
    open_reading_book()
    tap(r'Start timer', 'Start timer')
    time.sleep(5)
    root = dump()
    if find(root, r'Keep the timer running'):
        tap(r'^Not now$', 'dismiss priming')
        time.sleep(2)
        root = dump()
    if not find(root, r'READING NOW'):
        raise StepFailed('the timer did not start')
    state['started'] = time.time()
    s3lib.back()
    time.sleep(2)
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(2)
    if service_state() != 'foreground':
        raise StepFailed('no foreground service before restricting: %s' % service_state())
    adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_ANY_IN_BACKGROUND', 'ignore')
    return 'timer running, then background usage restricted'


def android_kills_the_service():
    for _ in range(90):
        if service_state() == 'gone':
            state['killed'] = time.time()
            return ('Android killed the service %.0fs into the session'
                    % (state['killed'] - state['started']))
        time.sleep(2)
    raise StepFailed('the service survived background restriction for 180s - if this is a '
                     'real change in Android behaviour it is good news, but the run sheet '
                     'says otherwise and the difference needs explaining')


def the_reader_keeps_reading():
    """The whole point: the session is still going, the app just cannot see it."""
    remaining = READ_FOR - (time.time() - state['started'])
    if remaining > 0:
        time.sleep(remaining)
    state['real_minutes'] = int((time.time() - state['started']) / 60)
    return 'read for %d minutes in total; the app was dead for most of it' % state['real_minutes']


def the_sheet_tells_the_truth():
    restore()
    s3lib.launch(wait=r'A session was still running')
    root = dump()
    said = ' '.join(t.strip('|') for t in texts(root))
    phone.screenshot('s6-restricted-recovery.png')
    state['said'] = said
    m = re.search(r'You started timing it (\S+) ago', said)
    if not m:
        raise StepFailed('the sheet did not say when the session started: %s' % said[:200])
    state['claimed'] = m.group(1)
    # "It started 1 minute ago" for a session that started 2+ minutes ago is the lie.
    minutes = re.match(r'^(\d+)m$', m.group(1))
    if minutes and int(minutes.group(1)) < state['real_minutes']:
        raise StepFailed(
            'the sheet says the session started %s ago, but it started %d minutes ago. That '
            'is the heartbeat bound being reported as the wall clock.'
            % (m.group(1), state['real_minutes']))
    return 'the sheet says it started %s ago, which is true' % m.group(1)


def the_reader_can_record_what_they_read():
    """The measurement that matters: can they type the real number and save it?"""
    root = dump()
    field = find(root, r'Minutes you read')
    if not field:
        raise StepFailed('no minutes field on the sheet')
    target = str(max(2, state['real_minutes']))
    boxes = [n for n in phone.nodes(root)
             if n.get('class') == 'android.widget.EditText']
    if not boxes:
        raise StepFailed('no editable field on the sheet')
    phone.tap_node(boxes[0])
    time.sleep(1)
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    for _ in range(6):
        adb('shell', 'input', 'keyevent', 'KEYCODE_DEL')
    adb('shell', 'input', 'text', target)
    time.sleep(1.5)
    root = dump()
    shown = ' '.join(t.strip('|') for t in texts(root))
    if 'no more than that' in shown:
        raise StepFailed(
            'REFUSED %s minutes: %r. The reader read that long; the app only knows how long '
            'it was alive.' % (target, shown[:200]))
    tap(r'Save this session', 'Save this session')
    time.sleep(5)
    if find(dump(), r'A session was still running'):
        raise StepFailed('the sheet came back after saving')
    return 'saved %s minutes, which is what the reader actually read' % target


if __name__ == '__main__':
    ok = True
    try:
        for name, fn in [
            ('A a timer runs, then the phone restricts it', a_timer_runs_then_the_phone_restricts_it),
            ('B Android kills the service', android_kills_the_service),
            ('C the reader keeps reading anyway', the_reader_keeps_reading),
            ('D the sheet tells the truth about when it started', the_sheet_tells_the_truth),
            ('E the reader can record what they read', the_reader_can_record_what_they_read),
        ]:
            ok = step(name, fn) and ok
    finally:
        restore()
        print('    background restriction removed')
    s3lib.report()
    sys.exit(0 if ok else 1)
