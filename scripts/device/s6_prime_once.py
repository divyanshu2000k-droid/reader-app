"""
"Not now" is final: the priming sheet does not come back on the next timer.

The other half of `primeDecision.test.ts`. That test proves the rule computes; this proves
the rule is actually WIRED to the stored answer — the distinction that cost this project a
whole heartbeat feature (CLAUDE.md item 20: twelve green unit tests over arithmetic nobody
called).

Measured before the fix, on a phone: declined once, asked again on the very next timer.

TWO HALVES, and the second is the regression:

  1. never asked -> the sheet appears. Needs a phone that has never answered. Skipped, loudly,
     once the answer has been stored, because nothing can un-ask it short of a reinstall.
  2. answered once -> the sheet does NOT appear on a new timer. This one runs every time.

The permission is revoked first so that Android's own answer says "yes, ask them" throughout.
That is the point: after "Not now" the status is `undetermined` and `canAskAgain` is true, so
Android is no help at all and the stored answer is the ONLY thing that can stop the sheet.

    python scripts/device/s6_prime_once.py
"""

import sys
import time

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

PERM = 'android.permission.POST_NOTIFICATIONS'
SHEET = r'Keep the timer running'
state = {}


def stored_answer():
    """The `notify_priming` row, read from a pulled copy. Force-stops the app."""
    con = pulldb.pull('prime-%d' % int(time.time()))
    rows = con.execute(
        "select source_id from metadata_cache where source='notify_priming'").fetchall()
    return [r[0] for r in rows]


def open_reading_book(skip=0):
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2.5)
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if len(cards) <= skip:
        raise StepFailed('need %d books on Reading' % (skip + 1))
    phone.tap_node(cards[skip])
    time.sleep(3)


def start_a_timer(skip=0):
    s3lib.launch(clear_recovery=True)
    open_reading_book(skip)
    tap(r'Start timer', 'Start timer')
    time.sleep(6)


def end_the_timer():
    root = dump()
    if find(root, SHEET):
        tap(r'^Not now$', 'close the sheet')
        time.sleep(2)
    if find(dump(), r'^Finish$'):
        tap(r'^Finish$', 'Finish')
        time.sleep(5)


def android_would_still_ask():
    phone.adb('shell', 'pm', 'revoke', phone.PKG, PERM, check=False)
    time.sleep(2)
    out = phone.adb('shell', 'dumpsys package ' + phone.PKG, check=False)
    line = [l.strip() for l in out.splitlines()
            if 'POST_NOTIFICATIONS' in l and 'granted=' in l]
    if not line or 'granted=true' in line[0]:
        raise StepFailed('could not revoke the permission: %r' % line)
    state['before'] = stored_answer()
    return 'permission revoked; stored answer before this run: %r' % (state['before'],)


def the_first_ask_happens():
    if state['before']:
        state['half_one'] = 'SKIPPED'
        return ('SKIPPED - this phone has already answered (%r). Only a reinstall un-asks it; '
                'half two below is the regression and it still runs.' % state['before'])
    start_a_timer()
    if not find(dump(), SHEET):
        raise StepFailed('a reader who has never been asked was not asked')
    state['half_one'] = 'RAN'
    return 'never asked before, so the sheet appeared'


def not_now_is_stored():
    if state['half_one'] == 'SKIPPED':
        return 'already stored from an earlier run: %r' % (state['before'],)
    tap(r'^Not now$', 'Not now')
    time.sleep(3)
    after = stored_answer()
    if 'asked' not in after:
        raise StepFailed('"Not now" was not remembered: metadata_cache holds %r' % after)
    return '"Not now" stored as notify_priming/asked'


def the_next_timer_does_not_ask_again():
    """The regression. Before the fix, this found the sheet."""
    start_a_timer(skip=1)
    root = dump()
    if find(root, SHEET):
        phone.screenshot('s6-primed-again.png')
        raise StepFailed(
            'THE SHEET CAME BACK on a new timer after the reader declined. Android says '
            '"undetermined / canAskAgain" forever, because it was never told; only the '
            'stored answer can stop this.')
    if not find(root, r'READING NOW'):
        raise StepFailed('the second timer did not start: %s'
                         % [t.strip('|') for t in texts(root)][:14])
    end_the_timer()
    return 'a new timer started with no sheet - declining is final'


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('A Android itself would still ask', android_would_still_ask),
        ('B a reader who has never been asked is asked', the_first_ask_happens),
        ('C "Not now" is remembered', not_now_is_stored),
        ('D the next timer does NOT ask again', the_next_timer_does_not_ask_again),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
