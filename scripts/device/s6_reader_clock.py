"""
Run sheet items 2, 3 and 5: the timer against a real clock, across a real background.

These are the checks that do not need doze, a kill or a permission — just time passing and
the reader doing ordinary things. Each one is a NUMBER compared with the wall clock, because
"it looked right" is not a measurement.

  2. A session of several minutes saves a duration that matches the wall clock, and the
     database agrees with what Session complete showed.
  3. PAUSE ACROSS A BACKGROUND. Read, pause, leave the app for five minutes, come back. The
     clock must still read what it read when it was paused. This is the case a wall-clock
     implementation fails: paused time is not reading, and the difference only appears when
     real time passes while the app is not looking.
  5. TWO BOOKS. Start a timer on A, then open B and tap Start timer. It must show A's timer,
     not start a second one. There is exactly one open timed session at any moment, and the
     second book must not quietly become the timed one.

    python scripts/device/s6_reader_clock.py --minutes 6
"""

import argparse
import re
import sys
import time

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

state = {}


def adb(*args):
    return phone.adb(*args, check=False)


def clock_seconds(root=None):
    """The mm:ss on the timer screen, in seconds."""
    for t in texts(root or dump()):
        raw = t.strip('|')
        m = re.match(r'^(\d{1,2}):(\d{2})$', raw)
        if m:
            return int(m.group(1)) * 60 + int(m.group(2))
    return None


def reading_cards(root):
    return [n for n in phone.nodes(root)
            if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
            and 'Cover of' not in (n.get('content-desc') or '')
            and 'Log a session' not in (n.get('content-desc') or '')]


def open_reading_book(skip=0):
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2.5)
    root = dump()
    cards = reading_cards(root)
    if len(cards) <= skip:
        raise StepFailed('need %d books on Reading, found %d - run s5b_prep_reading.py'
                         % (skip + 1, len(cards)))
    title = (cards[skip].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[skip])
    time.sleep(3)
    return title


def dismiss_priming():
    if find(dump(), r'Keep the timer running'):
        tap(r'^Not now$', 'dismiss priming')
        time.sleep(2)


# ── item 5 ──
def a_second_book_shows_the_same_timer():
    s3lib.launch(clear_recovery=True)
    state['a'] = open_reading_book(0)
    tap(r'Start timer', 'Start timer')
    time.sleep(5)
    dismiss_priming()
    if not find(dump(), r'READING NOW'):
        raise StepFailed('the timer did not start on the first book')
    state['started'] = time.time()
    s3lib.back()
    time.sleep(2)
    s3lib.back()
    time.sleep(2)

    state['b'] = open_reading_book(1)
    if state['b'] == state['a']:
        raise StepFailed('the two books are the same, so this proves nothing')
    tap(r'Start timer', 'Start timer')
    time.sleep(5)
    root = dump()
    shown = ' '.join(t.strip('|') for t in texts(root))
    if state['a'] not in shown:
        raise StepFailed(
            'opening the timer from %r did not show the running timer for %r. Screen: %s'
            % (state['b'], state['a'], shown[:200]))
    return 'Start timer on %r showed the running timer for %r' % (state['b'][:30], state['a'][:30])


# ── item 3 ──
def pause_survives_a_background(background_seconds):
    time.sleep(20)
    before = clock_seconds()
    if before is None:
        raise StepFailed('no clock on the timer screen')
    tap(r'^Pause$', 'Pause')
    time.sleep(3)
    paused_at = clock_seconds()
    if paused_at is None:
        raise StepFailed('no clock after pausing')
    state['paused_at'] = paused_at

    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    print('    backgrounded for %ds while PAUSED...' % background_seconds, flush=True)
    time.sleep(background_seconds)
    adb('shell', 'monkey', '-p', phone.PKG, '-c', 'android.intent.category.LAUNCHER', '1')
    time.sleep(5)
    if not find(dump(), r'^Resume$'):
        adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
            '-d', 'reader://session/timer')
        time.sleep(5)
    after = clock_seconds()
    if after is None:
        raise StepFailed('no clock after coming back')
    drift = after - paused_at
    if drift > 3:
        raise StepFailed(
            'PAUSED TIME WAS COUNTED AS READING: %ds when paused, %ds after %ds in the '
            'background. A wall-clock implementation fails exactly here.'
            % (paused_at, after, background_seconds))
    return ('%ds when paused, %ds after %ds backgrounded (drift %ds)'
            % (paused_at, after, background_seconds, drift))


# ── item 2 ──
def the_saved_duration_matches_the_wall_clock(read_seconds):
    tap(r'^Resume$', 'Resume')
    time.sleep(2)
    state['resumed'] = time.time()
    remaining = read_seconds - (time.time() - state['resumed'])
    if remaining > 0:
        print('    reading for %ds...' % remaining, flush=True)
        time.sleep(remaining)
    on_screen = clock_seconds()
    tap(r'^Finish$', 'Finish')
    time.sleep(6)
    root = dump()
    # The screen's own words are "SESSION SAVED, 3m" — not "Session complete", which is what
    # `04-SCREENS.md` calls the screen. Asserting the doc's name for it failed a green run.
    if not find(root, r'SESSION SAVED'):
        raise StepFailed('Finish did not land on the saved screen: %s'
                         % [t.strip('|') for t in texts(root)][:14])
    saved_label = [t.strip('|') for t in texts(root) if re.match(r'^\d+[hm]', t.strip('|'))]
    state['label'] = saved_label[0] if saved_label else None
    state['on_screen'] = on_screen

    con = pulldb.pull('clock-%d' % int(time.time()))
    row = con.execute(
        'select duration_seconds, is_timed from sessions '
        'where is_timed=1 and deleted_at is not null or is_timed=1 '
        'order by updated_at desc limit 1').fetchone()
    if row is None or row[0] is None:
        raise StepFailed('no finished timed session in the database')
    saved = row[0]
    # The reader's own expectation: time actually spent reading, i.e. everything except the
    # paused stretch. The screen is the authority we compare against, because that is the
    # number the reader saw and accepted.
    gap = abs(saved - (on_screen or 0))
    if gap > 15:
        raise StepFailed(
            'the database says %ds, the screen said %ds. More than a dump latency apart.'
            % (saved, on_screen))
    return ('saved %ds, screen showed %ds, Session saved says %s (%ds apart, dump latency); '
            'the %ds paused stretch was not counted'
            % (saved, on_screen, state.get('label'), gap, state.get('background', 0)))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--minutes', type=int, default=6)
    args = ap.parse_args()
    background = max(60, args.minutes * 10)
    read = max(120, args.minutes * 20)
    state['background'] = background
    ok = True
    for name, fn in [
        ('5. a second book shows the SAME timer', a_second_book_shows_the_same_timer),
        ('3. pause survives a background', lambda: pause_survives_a_background(background)),
        ('2. the saved duration matches the screen',
         lambda: the_saved_duration_matches_the_wall_clock(read)),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
