"""
AUDIT: does the heartbeat keep beating once the reader LEAVES the timer screen?

`useTimer` owns the tick, the heartbeat, the notification refresh and the notification's
action listener — and it lives in `TimerScreen`. Navigating back unmounts the screen, so on
the face of it every one of those stops, while the session stays open.

If that is true it matters a lot: the whole point of a foreground service is to keep working
when the app is NOT in front, and the reader's most likely next action after starting a timer
is to leave the screen and put the phone down.

The experiment, which does not rely on reading the code:

  1. Start a timer, and leave the timer screen immediately.
  2. Wait well past the 30s heartbeat interval.
  3. Force-stop (the crash case) and reopen.
  4. Read the minutes the recovery sheet offers.

If the heartbeat kept beating, the bound is the moment of the KILL, so the offer is close to
the full elapsed time. If it stopped at the screen, the bound is the moment we LEFT, so the
offer is much smaller.

    python scripts/device/s6_audit_background.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts

sys.stdout.reconfigure(encoding='utf-8')

AWAY_SECONDS = 150          # well past two heartbeat intervals


def clock_on_screen():
    for t in texts(dump()):
        raw = t.strip('|')
        if re.match(r'^\d{1,2}:\d{2}$', raw):
            mm, ss = raw.split(':')
            return int(mm) * 60 + int(ss)
    return None


s3lib.launch()
tap(r'^Reading books$', 'Reading tab')
time.sleep(2)
root = dump()
cards = [n for n in phone.nodes(root)
         if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
         and 'Cover of' not in (n.get('content-desc') or '')
         and 'Log a session' not in (n.get('content-desc') or '')]
if not cards:
    print('no book on Reading — run s6_timer.py first')
    sys.exit(2)
phone.tap_node(cards[0])
time.sleep(3)
tap(r'Start timer', 'Start timer')
time.sleep(5)
require(r'READING NOW', 'the timer running')
print('timer started')

# Leave the timer screen at once — back to book detail, then to the library.
s3lib.back()
time.sleep(2)
s3lib.to_library()
print(f'left the timer screen; waiting {AWAY_SECONDS}s on the library...')
time.sleep(AWAY_SECONDS)

phone.adb('shell', 'am', 'force-stop', phone.PKG)
time.sleep(3)

s3lib.launch(wait=r'A session was still running')
root, _ = require(r'A session was still running', 'the recovery sheet', 40)
field = [n for n in phone.nodes(root) if n.get('class') == 'android.widget.EditText']
offered = (field[0].get('text') or '').strip() if field else ''
body = ' '.join(t.strip('|') for t in texts(root) if 'started timing' in t)
phone.screenshot('s6-audit-background.png')

elapsed_minutes = round((AWAY_SECONDS + 10) / 60)
print()
print(f'  time the session was actually open : ~{elapsed_minutes} minutes')
print(f'  the sheet OFFERED                  : {offered!r} minutes')
print(f'  sheet says                         : "{body[:90]}"')
print()

if find(dump(), r'Discard it'):
    tap(r'Discard it', 'Discard it')
    time.sleep(3)

if not offered.isdigit():
    print('INCONCLUSIVE: could not read the offer')
    sys.exit(1)
if int(offered) >= elapsed_minutes - 1:
    print('HEARTBEAT KEPT BEATING off-screen: the bound tracks the kill, not the exit.')
    sys.exit(0)
print('HEARTBEAT STOPPED when the timer screen was left.')
print(f'The bound froze near the exit ({offered} min) instead of the kill (~{elapsed_minutes} min).')
print('Everything useTimer owns — tick, heartbeat, notification refresh, notification')
print('actions — dies with the screen. See the audit entry in DECISIONS.md.')
sys.exit(1)
