"""
DOES THE HEARTBEAT KEEP BEATING WITH THE SCREEN OFF? Measured from logcat, not from the DB.

The 20-minute locked run on 2026-09-19 said the service and the notification survived deep
doze for the full twenty minutes — and that `lastBeatAt` was frozen 12 seconds in. The
database cannot tell you WHEN it stopped, because a value written and then never updated
looks identical to a value written on purpose, and reading the database means force-stopping
the app, which ends the thing being measured.

So this watches `[dev] timer heartbeat` in logcat, which costs the app nothing and does not
touch it. Every beat is a line with a timestamp. Counting them against the wall clock says
exactly where they stop.

The hypothesis being tested: **React Native's JS timers are driven by frame callbacks, and
with the screen off there are no frames.** A foreground service keeps the PROCESS alive; it
does not make `setInterval` fire. If that is right, the beats stop within a second or two of
the screen going off, and resume when it comes back on.

Why it matters, and it is not the obvious reason. A frozen heartbeat does not lose the
reader's data: the session row is already written, and elapsed time is derived from
timestamps. It corrupts the RECOVERY BOUND. `recoveryBoundAt` is `min(lastBeatAt, now)`, so
a heartbeat frozen at 12 seconds offers a reader who read for twenty minutes **12 seconds**.
That is the mirror image of silent-pass item 9 — the same refusal to invent a number, erring
so far the other way that it throws the reader's evening away.

    python scripts/device/s6_heartbeat_doze.py --minutes 6
"""

import argparse
import re
import subprocess
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, tap, texts

sys.stdout.reconfigure(encoding='utf-8')

BEAT = re.compile(r'(\d\d:\d\d:\d\d)\.\d+.*timer heartbeat.*elapsed=(\d+)')


def adb(*args):
    return phone.adb(*args, check=False)


def beats():
    """Every heartbeat logcat has seen, as (clock, elapsed-seconds) pairs."""
    out = subprocess.run(['adb', 'logcat', '-d', '-v', 'time'], capture_output=True,
                         text=True, encoding='utf8', errors='replace').stdout
    return [(m.group(1), int(m.group(2))) for m in BEAT.finditer(out)]


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


def restore_phone():
    adb('shell', 'dumpsys', 'deviceidle', 'unforce')
    adb('shell', 'dumpsys', 'battery', 'reset')


def main(minutes):
    adb('logcat', '-c')
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
        raise StepFailed('the timer did not start: %s'
                         % [t.strip('|') for t in texts(root)][:14])

    # ── A: screen ON, app in front. The control. ──
    print('=== A screen on, app in front (the control)')
    time.sleep(75)
    on_front = len(beats())
    print('    %d beats in 75s' % on_front)

    # ── B: screen ON, app backgrounded ──
    print('=== B screen on, app backgrounded')
    before = len(beats())
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(75)
    on_back = len(beats()) - before
    print('    %d beats in 75s' % on_back)

    # ── C: screen OFF, deep doze ──
    print('=== C screen off, unplugged, deep doze')
    before = len(beats())
    off_at = time.time()
    adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
    time.sleep(2)
    adb('shell', 'dumpsys', 'battery', 'unplug')
    adb('shell', 'dumpsys', 'deviceidle', 'force-idle')
    time.sleep(minutes * 60)
    during = beats()[before:] if len(beats()) >= before else []
    print('    %d beats in %d minutes with the screen off' % (len(during), minutes))
    if during:
        print('    first %s, last %s' % (during[0][0], during[-1][0]))
    seen = beats()
    last_before_off = seen[before - 1] if 0 < before <= len(seen) else None

    # ── C2: the NATIVE beat, which is the one that carries the recovery bound ──
    native = adb('shell', 'run-as', phone.PKG, 'cat',
                 'shared_prefs/reading-service.xml')
    m = re.search(r'name="last_beat" value="(\d+)"', native)
    if m:
        age = time.time() - int(m.group(1)) / 1000.0
        print('=== C2 native heartbeat is %.0fs old (expect < 60)' % age)
        native_age = age
    else:
        print('=== C2 NO NATIVE HEARTBEAT in shared_prefs')
        native_age = None

    # ── D: does it resume when the screen comes back? ──
    restore_phone()
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    before_wake = len(beats())
    time.sleep(70)
    after_wake = len(beats()) - before_wake
    print('=== D screen back on: %d beats in 70s' % after_wake)

    expected = int(minutes * 60 / 30)
    print()
    print('    ── RESULT ──')
    print('    screen on, in front      : %d beats / 75s (expect ~2)' % on_front)
    print('    screen on, backgrounded  : %d beats / 75s (expect ~2)' % on_back)
    print('    SCREEN OFF, deep doze    : %d beats / %ds (expect ~%d)'
          % (len(during), minutes * 60, expected))
    print('    screen back on           : %d beats / 70s (expect ~2)' % after_wake)
    if native_age is not None:
        print('    NATIVE beat age at the end of doze: %.0fs (expect < 60)' % native_age)
    else:
        print('    NATIVE beat: ABSENT')
    if last_before_off:
        print('    last beat before the screen went off: %s' % (last_before_off,))
    verdict = ('THE HEARTBEAT STOPS WITH THE SCREEN'
               if len(during) <= 1 < expected else 'the heartbeat survives the screen going off')
    print('    VERDICT: %s' % verdict)
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--minutes', type=int, default=6)
    args = ap.parse_args()
    try:
        code = main(args.minutes)
    finally:
        restore_phone()
        adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
        print('    phone restored: battery reset, doze unforced')
    sys.exit(code)
