"""
Slice 6: does the timer actually post its notification, with Pause and Finish?

What an emulator CAN show: the notification is posted on the right channel, declares two
actions, changes when the timer is paused, and is cleared when the session ends. The button
LABELS are not in `dumpsys` — Android does not print them — so the shade is screenshotted and
read by eye, which is the only honest way to check them.

What no emulator can show: whether the foreground service survives MIUI. Still open.

    python scripts/device/s6_notification.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, require, tap
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

state = {}


def notifications():
    """
    OUR posted notifications only.

    Blocks whose `pkg=` is ours. The first version kept any block merely CONTAINING the
    package name, which swept in the emulator's own "Navigate using your keyboard" notice and
    made every assertion read the wrong text.
    """
    out = phone.adb('shell', 'dumpsys notification --noredact', check=False)
    return [b for b in out.split('NotificationRecord(') if f'pkg={phone.PKG} ' in b]


def field(pattern, default=None):
    joined = '\n'.join(notifications())
    m = re.search(pattern, joined)
    return m.group(1) if m else default


def notification_text():
    joined = '\n'.join(notifications())
    bits = re.findall(r'android\.(title|text)=String \(([^)]*)\)', joined)
    return ' | '.join(f'{k}={v.strip()}' for k, v in bits)[:200]


def open_timer():
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
    require(r'READING NOW|PAUSED', 'the timer screen')


def grant_and_start():
    # The permission dialog is not what is under test here; grant it directly.
    phone.adb('shell', 'pm', 'grant', phone.PKG,
              'android.permission.POST_NOTIFICATIONS', check=False)
    open_timer()
    return f"timer started on {state['title']!r}"


def posted_on_its_own_channel():
    for _ in range(10):
        if notifications():
            break
        time.sleep(1)
    if not notifications():
        raise StepFailed('NO NOTIFICATION POSTED — the foreground service has nothing to show')
    text = notification_text()
    if 'Reading' not in text:
        raise StepFailed(f'the notification does not say Reading: {text}')
    ch = field(r'channel=(\S+)')
    # It sat on `expo_notifications_fallback_notification_channel` at importance 4 until
    # 2026-09-18: the channel was created and never named on the trigger, so a notification
    # meant to be silent was filed where it could pop a heads-up.
    if ch is None or 'fallback' in ch or 'reading-timer' not in ch:
        raise StepFailed(f'wrong channel: {ch}')
    count = int(field(r'actions=(\d+)', '0'))
    if count != 2:
        raise StepFailed(f'{count} actions declared, expected 2')
    flags = field(r'flags=(\S+)', '')
    if 'ONGOING_EVENT' not in flags:
        raise StepFailed(f'not an ongoing notification, so it can be swiped away: {flags}')
    return f'{text} · channel={ch} · actions={count} · flags={flags}'


def the_shade_shows_the_buttons():
    """
    The labels, by eye. Android does not print action titles in dumpsys, so asserting them
    from there is impossible; the first version of this check "read" them and was really
    reading the literal word "String" out of `title=String (...)`.
    """
    phone.adb('shell', 'cmd', 'statusbar', 'expand-notifications', check=False)
    time.sleep(3)
    phone.screenshot('s6-notification-shade.png')
    phone.adb('shell', 'cmd', 'statusbar', 'collapse', check=False)
    time.sleep(2)
    return 'shade captured to out/s6-notification-shade.png — the buttons are read off it'


def it_changes_when_paused():
    require(r'^Pause$', 'the Pause button on the timer screen', 12)
    tap(r'^Pause$', 'Pause')
    time.sleep(4)
    text = notification_text()
    if 'aused' not in text:
        raise StepFailed(f'the notification still says running after Pause: {text}')
    count = int(field(r'actions=(\d+)', '0'))
    if count != 2:
        raise StepFailed(f'{count} actions while paused, expected 2 (Resume and Finish)')
    return f'{text} · actions={count}'


def it_goes_away_on_finish():
    require(r'^Resume$', 'the Resume button', 12)
    tap(r'^Resume$', 'Resume')
    time.sleep(3)
    require(r'^Finish$', 'the Finish button', 12)
    tap(r'^Finish$', 'Finish')
    time.sleep(7)
    for _ in range(10):
        if not notifications():
            return 'notification cleared when the session ended'
        time.sleep(1)
    raise StepFailed(f'THE NOTIFICATION SURVIVED THE SESSION: {notification_text()}')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('6.7a start a timer with notifications granted', grant_and_start),
        ('6.7b posted, on its own channel, with 2 actions', posted_on_its_own_channel),
        ('6.7c the shade, for the button labels', the_shade_shows_the_buttons),
        ('6.7d it changes when paused', it_changes_when_paused),
        ('6.7e it goes away when the session ends', it_goes_away_on_finish),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
