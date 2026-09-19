"""
ITEM 1. The phone locked, in a pocket, for twenty minutes. The highest-value hour in Slice 6.

`05-BUILD-PLAN.md` calls background survival "the single highest-risk item in Phase 1 and the
entire reason the timer has a two-week hard limit". An emulator cannot answer it. This can.

    python scripts/device/s6_pocket.py --minutes 20 --mode locked
    python scripts/device/s6_pocket.py --minutes 10 --mode swiped
    python scripts/device/s6_pocket.py --minutes 10 --mode restricted

─── WHAT IT MEASURES, AND WHY THE OBVIOUS MEASUREMENT IS WORTHLESS ────────────

Reading the clock after twenty minutes proves nothing. Elapsed time is DERIVED from
timestamps and never counted, so the clock is right even if every part of the timer died the
instant the screen went off. That is the design working, and it is exactly why a passing look
at the screen means nothing here.

What can actually die is everything that MAINTAINS a running session:

  - the heartbeat, which bounds what a crash can cost the reader
  - the notification, whose disappearance is Android killing the foreground service
  - the notification's Pause and Finish buttons

So the measurement is `lastBeatAt` from the stored run, read out of the database at the end
and compared with the wall clock. If the heartbeat beat all the way through, it is within one
interval of now. If Android froze the process at lock time, it is pinned near the start, and
the size of the gap says exactly when the phone stopped letting the app run.

─── THE TIMER SCREEN IS LEFT ON PURPOSE ───────────────────────────────────────

Before the fix in `docs/10-AUDIT-2026-09-18.md`, the runtime lived in the timer SCREEN, so
merely navigating away stopped all three. Reading a book with a timer running is precisely
leaving that screen, so this starts the timer and then leaves it, which is what a reader does.

─── THE PHONE IS TOLD IT IS UNPLUGGED ─────────────────────────────────────────

Android does not doze while charging, and the phone is on USB for adb. `dumpsys battery
unplug` makes it believe otherwise, and `deviceidle force-idle` puts it straight into deep
doze instead of waiting out the usual half hour. Both are undone at the end, and the script
restores them even when it fails. Without this, a "pass" would only prove the timer survives
on a charger, which is not where reading happens.

This is the FLOOR, not the ceiling: a Nothing Phone 2a is near-stock AOSP. MIUI, One UI and
ColorOS are all more aggressive, and a pass here does not speak for them.
"""

import argparse
import json
import re
import sys
import time

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, tap, texts

sys.stdout.reconfigure(encoding='utf-8')

HEARTBEAT_MS = 30_000
samples = []


def adb(*args):
    return phone.adb(*args, check=False)


def notification_block():
    out = adb('shell', 'dumpsys notification --noredact')
    blocks = [b for b in out.split('NotificationRecord(') if 'pkg=' + phone.PKG + ' ' in b]
    return blocks[0] if blocks else None


def service_alive():
    """Is a foreground service actually registered for the package?"""
    out = adb('shell', 'dumpsys activity services ' + phone.PKG)
    if 'ServiceRecord' not in out:
        return False, 'no ServiceRecord'
    fg = 'isForeground=true' in out
    return fg, ('foreground' if fg else 'running, NOT foreground')


def process_alive():
    out = adb('shell', 'pidof ' + phone.PKG)
    return out.strip() != ''


def sample(label):
    fg, detail = service_alive()
    note = notification_block()
    row = {
        'at': label,
        'process': process_alive(),
        'service': detail,
        'notification': note is not None,
    }
    samples.append(row)
    print('    %-8s process=%-5s service=%-22s notification=%s'
          % (label, row['process'], detail, row['notification']), flush=True)
    return row


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
    title = (cards[0].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[0])
    time.sleep(3)
    return title


def swipe_from_recents():
    """
    Swiping the app off Recents, which is a different thing from a force-stop.

    `stopWithTask="false"` on the service is the claim that this does not end the timer.
    Nothing has ever tested it.
    """
    adb('shell', 'input', 'keyevent', 'KEYCODE_APP_SWITCH')
    time.sleep(2.5)
    size = adb('shell', 'wm', 'size')
    m = re.search(r'(\d+)x(\d+)', size)
    w, h = (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)
    # One card, centre screen, flung upward off the top.
    adb('shell', 'input', 'swipe', str(w // 2), str(int(h * 0.45)),
        str(w // 2), str(int(h * 0.05)), '300')
    time.sleep(2)
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(1)


def native_beat_age():
    """
    How stale the NATIVE heartbeat is, in seconds, or None if there is none.

    This is the beat that carries the recovery bound. The one stored in the run is written by
    a JavaScript `setInterval`, and React Native's timers need frames: measured on this phone,
    2 beats in 75s with the app in front and **0** in the next 75 backgrounded. The service
    beats on its own `HandlerThread`, which does not care about frames or about doze.
    """
    xml = adb('shell', 'run-as', phone.PKG, 'cat', 'shared_prefs/reading-service.xml')
    m = re.search(r'name="last_beat" value="(\d+)"', xml)
    return None if m is None else time.time() - int(m.group(1)) / 1000.0


def cpu_jiffies():
    """
    Total CPU the process has used, in jiffies (utime + stime from /proc/<pid>/stat).

    Item 7 asks what an hour of timer costs the battery. `batterystats --reset` would give a
    tidier answer and would also wipe the owner's battery history, which is theirs. CPU time
    is a direct measure of what the timer actually does — a 30-second heartbeat is 120 tiny
    writes an hour — and needs nothing reset.
    """
    p = adb('shell', 'pidof', phone.PKG).strip().split(' ')[0]
    if not p:
        return None
    fields = adb('shell', 'cat', '/proc/%s/stat' % p).split()
    if len(fields) < 15:
        return None
    try:
        return int(fields[13]) + int(fields[14])
    except ValueError:
        return None


def restore_phone():
    adb('shell', 'dumpsys', 'deviceidle', 'unforce')
    adb('shell', 'dumpsys', 'battery', 'reset')
    adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_ANY_IN_BACKGROUND', 'allow')
    adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_IN_BACKGROUND', 'allow')


def main(minutes, mode, lock=True):
    started_wall = time.time()
    print('=== item 1 · %d minutes · mode=%s' % (minutes, mode))

    # ── start a timer, then LEAVE the screen, which is what a reader does ──
    s3lib.launch(clear_recovery=True)
    title = open_reading_book()
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
    print('    timer running on %r' % title)
    s3lib.back()
    time.sleep(2)
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(2)
    print('    left the timer screen and the app')
    state_cpu = cpu_jiffies()
    sample('t=0')

    if mode == 'swiped':
        swipe_from_recents()
        print('    swiped the app off Recents')
        sample('swiped')
    if mode == 'restricted':
        adb('shell', 'cmd', 'appops', 'set', phone.PKG, 'RUN_ANY_IN_BACKGROUND', 'ignore')
        print('    background restricted (what a Xiaomi does to an app it does not know)')
        sample('restrict')

    # ── screen off, and the phone told it is on battery, so doze can engage ──
    #
    # `--no-lock` exists because this phone has a PIN: a run that sleeps the screen ends at
    # the lock screen, and nothing afterwards can drive the app until a person unlocks it. For
    # the `swiped` and `restricted` modes doze is not the variable under test — whether a
    # Recents swipe or a background restriction stops the SERVICE is — so they are run with
    # the screen on, and the run sheet says so rather than implying they met doze.
    if lock:
        adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
        time.sleep(2)
        adb('shell', 'dumpsys', 'battery', 'unplug')
        time.sleep(2)
        adb('shell', 'dumpsys', 'deviceidle', 'force-idle')
        print('    screen off, unplugged, forced into deep doze')
    else:
        print('    screen left ON (--no-lock): doze is not the variable in this mode')

    deadline = started_wall + minutes * 60
    marks = max(1, minutes // 5)
    while time.time() < deadline:
        time.sleep(min(300, max(30, (deadline - time.time()) / marks)))
        sample('%dm' % round((time.time() - started_wall) / 60))

    idle = adb('shell', 'dumpsys', 'deviceidle', 'get', 'deep').strip()
    print('    doze state at the end: %s' % idle)
    restore_phone()
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    time.sleep(2)

    # ── the measurement: how far did the heartbeat actually get? ──
    elapsed_wall = time.time() - started_wall
    con = pulldb.pull('pocket-%d' % int(started_wall))
    rows = con.execute(
        "select source_id, payload from metadata_cache where source='timer_run'").fetchall()
    if not rows:
        raise StepFailed('no timer_run row - the session is not recoverable at all')
    run = json.loads(rows[-1][1])
    last_beat = run.get('lastBeatAt')
    # `occurred_at`, not `started_at`: `started_at` is on READS (the date the reader began
    # the book), and a session's own start is `occurred_at`. Getting this wrong cost a
    # 20-minute run its final number, with every sample already collected.
    session = con.execute(
        'select occurred_at, duration_seconds, deleted_at from sessions where id=?',
        (rows[-1][0],)).fetchone()
    if session is None:
        raise StepFailed('the timer_run points at a session row that is not there')
    started_at = session[0]
    now_ms = time.time() * 1000

    print()
    print('    RESULT · mode=%s · %.1f minutes of wall clock' % (mode, elapsed_wall / 60))
    if last_beat is None:
        print('    lastBeatAt is NULL - the heartbeat never beat once')
        reach = 0.0
    else:
        reach = (last_beat - started_at) / 1000.0
        behind = (now_ms - last_beat) / 1000.0
        print('    heartbeat reached %.1f min after the start, %.0f s behind now'
              % (reach / 60, behind))
        print('    (within %ds of now means it beat the whole way; near 0 means it froze '
              'when the screen went off)' % (HEARTBEAT_MS / 1000 * 2))
    end_cpu = cpu_jiffies()
    if state_cpu is not None and end_cpu is not None and end_cpu >= state_cpu:
        # 100 jiffies per second on Android.
        seconds = (end_cpu - state_cpu) / 100.0
        print('    CPU used while backgrounded: %.1fs over %.1f min (%.2f%% of one core)'
              % (seconds, elapsed_wall / 60, 100.0 * seconds / max(1.0, elapsed_wall)))
    age = native_beat_age()
    if age is None:
        print('    NATIVE heartbeat: ABSENT - the service never wrote one')
    else:
        print('    NATIVE heartbeat %.0fs old at the end (expect < %d)'
              % (age, HEARTBEAT_MS / 1000 * 2))
    kept = [s for s in samples if s['notification']]
    print('    notification present in %d of %d samples; process alive in %d'
          % (len(kept), len(samples), len([s for s in samples if s['process']])))
    # The verdict rests on the NATIVE beat and the service, not on the JavaScript beat: the
    # JavaScript one is known not to run in the background and is kept only as a fallback for
    # a build without the native module.
    survived = (age is not None
                and age < HEARTBEAT_MS / 1000 * 3
                and samples[-1]['notification']
                and samples[-1]['service'] == 'foreground')
    print('    VERDICT: %s' % ('SURVIVED' if survived else 'DID NOT SURVIVE'))
    return 0 if survived else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--minutes', type=int, default=20)
    ap.add_argument('--mode', choices=['locked', 'swiped', 'restricted'], default='locked')
    ap.add_argument('--no-lock', dest='lock', action='store_false',
                    help='leave the screen on: no doze, and the run does not end at a PIN')
    args = ap.parse_args()
    try:
        code = main(args.minutes, args.mode, args.lock)
    finally:
        # The phone must not be left believing it is unplugged, dozing, or restricted,
        # whatever happened above. It is the owner's phone.
        restore_phone()
        adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
        print('    phone restored: battery reset, doze unforced, background allowed')
    sys.exit(code)
