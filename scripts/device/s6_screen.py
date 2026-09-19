"""
Run sheet item 6, and audit finding 6: the timer screen at the largest font and 360 dp.

The clock is `font.displayLg` — 68px, the largest type in the app, inside a ring of fixed
size. `rules.maxFontScale` is 2.0, so at the system's largest setting it renders at about
136px. The audit flagged it as the single most likely thing in the app to overflow, and said
it needed a phone. This is the phone.

It checks three things, by BOUNDS rather than by eye:

  - the clock is still on screen (its box does not run past either edge)
  - the clock is not inside the ring's circle by accident of clipping — the text is present
    and readable in the tree, not an empty node
  - Pause and Finish are still reachable, because a clock that pushes the controls off the
    bottom is the same bug wearing a different hat

**It changes the phone's display settings and puts them back in a `finally`** — font scale,
density and night mode are the owner's, and a crashed script must not leave a phone at 200%
font and 482 dpi.

    python scripts/device/s6_screen.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

TARGET_DP = 360
state = {}


def adb(*args):
    return phone.adb(*args, check=False)


def screen_px():
    m = re.search(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))
    return (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)


def bounds(node):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds') or '')
    return tuple(int(m.group(i)) for i in (1, 2, 3, 4)) if m else None


def clock_node(root):
    for n in phone.nodes(root):
        if re.match(r'^\d{1,2}:\d{2}$', (n.get('text') or '').strip()):
            return n
    return None


def restore():
    adb('shell', 'settings', 'put', 'system', 'font_scale', state.get('font', '1.0'))
    adb('shell', 'wm', 'density', 'reset')
    adb('shell', 'cmd', 'uimode', 'night', state.get('night', 'yes'))
    time.sleep(2)


def open_a_timer():
    s3lib.launch(clear_recovery=True)
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
    tap(r'Start timer', 'Start timer')
    time.sleep(5)
    if find(dump(), r'Keep the timer running'):
        tap(r'^Not now$', 'dismiss priming')
        time.sleep(2)
    if not find(dump(), r'READING NOW'):
        raise StepFailed('the timer did not start')


def inspect(label):
    """The measurement, whatever the display settings are."""
    width, height = screen_px()
    root = dump()
    clock = clock_node(root)
    if clock is None:
        raise StepFailed('NO CLOCK ON SCREEN at %s: %s'
                         % (label, [t.strip('|') for t in texts(root)][:14]))
    box = bounds(clock)
    if box is None:
        raise StepFailed('the clock has no bounds')
    left, top, right, bottom = box
    phone.screenshot('s6-screen-%s.png' % label)
    problems = []
    if left < 0 or right > width:
        problems.append('clock runs off the side: [%d..%d] in %dpx' % (left, right, width))
    if bottom > height:
        problems.append('clock runs off the bottom: %d in %dpx' % (bottom, height))
    if right - left <= 0 or bottom - top <= 0:
        problems.append('clock has collapsed to nothing: %s' % (box,))
    for button in ('Pause', 'Finish'):
        hit = find(root, r'^%s$' % button)
        if not hit:
            problems.append('%s is not on screen' % button)
            continue
        bb = bounds(hit[0])
        if bb and (bb[3] > height or bb[1] < 0):
            problems.append('%s is off screen at %s' % (button, bb))
    if problems:
        raise StepFailed('%s: %s' % (label, ' · '.join(problems)))
    return ('clock %r at [%d..%d]x[%d..%d] in %dx%d; Pause and Finish on screen'
            % (clock.get('text'), left, right, top, bottom, width, height))


def finish_if_running():
    """Leave no open session behind between configurations."""
    root = dump()
    if find(root, r'A session was still running'):
        tap(r'Discard it', 'discard')
        time.sleep(3)
        return
    if find(root, r'^Finish$'):
        tap(r'^Finish$', 'Finish')
        time.sleep(5)


def configure(font=None, density=None, night=None):
    """
    Change the display, THEN start a timer — never the other way round.

    `fontScale` and `density` are not in MainActivity's `configChanges`, so changing either
    destroys and recreates the activity. With a timer running that is a cold start: the
    launch gate finds an open session and offers the recovery sheet, and the timer screen the
    check was trying to measure is gone. The first version of this script changed the font
    with a timer running and reported "NO CLOCK ON SCREEN" three times in a row, which was
    true and was not the bug it looked like.
    """
    if font is not None:
        adb('shell', 'settings', 'put', 'system', 'font_scale', font)
    if density is not None:
        adb('shell', 'wm', 'density', 'reset' if density == 'reset' else str(density))
    if night is not None:
        adb('shell', 'cmd', 'uimode', 'night', night)
    time.sleep(4)


def normal_dark():
    state['font'] = (adb('shell', 'settings', 'get', 'system', 'font_scale').strip() or '1.0')
    state['night'] = 'yes' if 'yes' in adb('shell', 'cmd', 'uimode', 'night') else 'no'
    open_a_timer()
    out = inspect('normal-dark')
    finish_if_running()
    return out


def largest_font():
    # 2.0 is where `rules.maxFontScale` caps it, so this is the worst case the app allows.
    configure(font='2.0')
    open_a_timer()
    out = inspect('font-200')
    finish_if_running()
    return out


def largest_font_at_360dp():
    width, _ = screen_px()
    density = round(width * 160 / TARGET_DP)
    state['density'] = density
    configure(density=density)
    open_a_timer()
    out = inspect('font-200-360dp')
    finish_if_running()
    return out + ' · density %d = %ddp wide' % (density, TARGET_DP)


def light_mode():
    configure(font='1.0', density='reset', night='no')
    open_a_timer()
    out = inspect('light')
    finish_if_running()
    return out


if __name__ == '__main__':
    ok = True
    try:
        for name, fn in [
            ('6a the timer at normal size', normal_dark),
            ('6b the largest font (200%)', largest_font),
            ('6c the largest font at 360 dp', largest_font_at_360dp),
            ('6d light mode', light_mode),
        ]:
            ok = step(name, fn) and ok
    finally:
        restore()
        print('    display settings restored: font_scale=%s, density reset, night=%s'
              % (state.get('font', '1.0'), state.get('night', 'yes')))
    s3lib.report()
    sys.exit(0 if ok else 1)
