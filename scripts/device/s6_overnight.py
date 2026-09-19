"""
The decisive check: does the heartbeat bound actually BEAT the wall clock on a real device?

6.6c passed with the app shut for three seconds, where the heartbeat bound and `now -
occurred_at` give the same answer. That proves the wiring, not the point. This shuts the app
for four minutes on a ~40-second session, so the two answers differ:

    heartbeat bound  -> about 1 minute   (what the reader should be offered)
    wall clock       -> about 5 minutes  (how long the app was shut)

If the sheet offers 5, the heartbeat is being thrown away — which is exactly what the app did
for the first day of Slice 6, silently.

    python scripts/device/s6_overnight.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap, texts

sys.stdout.reconfigure(encoding='utf-8')

SHUT_SECONDS = 240
READ_SECONDS = 45


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
    print('no book on Reading')
    sys.exit(2)
phone.tap_node(cards[0])
time.sleep(3)
tap(r'Start timer', 'Start timer')
time.sleep(4)
require(r'READING NOW', 'the timer running')

print(f'reading for {READ_SECONDS}s (heartbeat every 30s)...', flush=True)
time.sleep(READ_SECONDS)
read_to = clock_on_screen()
print(f'  clock showed {read_to}s')

phone.adb('shell', 'am', 'force-stop', phone.PKG)
killed_at = time.time()
print(f'app killed; leaving it shut for {SHUT_SECONDS}s...', flush=True)
time.sleep(SHUT_SECONDS)

s3lib.launch(wait=r'A session was still running')
root, _ = require(r'A session was still running', 'the recovery sheet', 40)
phone.screenshot('s6-overnight-sheet.png')
field = [n for n in phone.nodes(root) if n.get('class') == 'android.widget.EditText']
offered = (field[0].get('text') or '').strip() if field else ''
body = ' '.join(t.strip('|') for t in texts(root) if 'started timing' in t)

shut_minutes = round((time.time() - killed_at) / 60)
wall_minutes = round((time.time() - (killed_at - read_to)) / 60)

print()
print(f'  session actually read : {read_to}s  (~1 minute)')
print(f'  app was shut for      : {shut_minutes} minutes')
print(f'  wall clock would say  : ~{wall_minutes} minutes')
print(f'  the sheet OFFERED     : {offered!r} minutes')
print(f'  sheet says            : "{body[:80]}"')
print()

# Tidy up so the sandbox does not accumulate open sessions.
if find(dump(), r'Discard it'):
    tap(r'Discard it', 'Discard it')
    time.sleep(3)

if offered == '' or not offered.isdigit():
    print('INCONCLUSIVE: could not read the offered value')
    sys.exit(1)
if int(offered) <= 2:
    print(f'PASS: offered {offered} minute(s), NOT the ~{wall_minutes} of wall clock.')
    print('The heartbeat bound reaches the reader.')
    sys.exit(0)
print(f'FAIL: offered {offered} minutes, which is the wall clock, not the heartbeat.')
sys.exit(1)
