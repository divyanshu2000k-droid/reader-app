"""
IS THERE ACTUALLY A FOREGROUND SERVICE? The check that was missing for the whole of Slice 6.

Slice 6 believed it had one for a day. `plugins/withReadingService.js` declared a `<service>`
naming `expo.modules.notifications.service.NotificationForegroundService`, a class that does
not exist in `expo-notifications` and appears nowhere in `node_modules`. The manifest merged,
the build succeeded, and nothing ever started it. `s6_notification.py` passed 5/5 throughout,
because an ongoing notification looks exactly the same whether or not a service is behind it.

What the phone said on 2026-09-19, before the fix:

    $ adb shell dumpsys activity services com.example.reader
    ACTIVITY MANAGER SERVICES (dumpsys activity services)
      (nothing)

    Proc # 4: cch  b/ /LAST  com.example.reader   <- CACHED
    /proc/<pid>/oom_score_adj = 900               <- first to be killed

So this check asks Android, not the app, and it asks three independent ways. Any one of them
alone can be misread; together they are the difference between "protected" and "has not been
reclaimed yet".

    python scripts/device/s6_foreground_service.py
"""

import re
import sys
import time

import phone
import s3lib
from phone import StepFailed, dump, find, tap, texts
from s3lib import step

sys.stdout.reconfigure(encoding='utf-8')

SERVICE = 'expo.modules.readingservice.ReadingService'

# A foreground service sits near 0. Cached processes are 900+; a plain background process is
# a few hundred. 200 is comfortably below anything that is not genuinely foreground.
MAX_FOREGROUND_ADJ = 200

state = {}


def adb(*args):
    return phone.adb(*args, check=False)


def pid():
    return adb('shell', 'pidof ' + phone.PKG).strip().split(' ')[0]


def services_dump():
    return adb('shell', 'dumpsys activity services ' + phone.PKG)


def oom_adj():
    p = pid()
    if not p:
        return None
    raw = adb('shell', 'cat /proc/%s/oom_score_adj' % p).strip()
    try:
        return int(raw)
    except ValueError:
        return None


def proc_line():
    out = adb('shell', 'dumpsys activity processes')
    for line in out.splitlines():
        if 'com.example.reader/' in line and 'Proc #' in line:
            return line.strip()
    return None


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


def no_service_before_a_timer():
    s3lib.launch(clear_recovery=True)
    if SERVICE in services_dump():
        raise StepFailed('the service was already running before any timer started')
    return 'no reading service before a timer, as it should be'


def starting_a_timer_starts_the_service():
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
    for _ in range(15):
        out = services_dump()
        if SERVICE in out:
            state['dump'] = out
            return 'ServiceRecord for %s exists' % SERVICE.rsplit('.', 1)[1]
        time.sleep(1)
    raise StepFailed(
        'NO SERVICE after starting a timer. `dumpsys activity services` says:\n%s\n'
        'This is the bug the whole check exists for: a manifest entry is not a service.'
        % services_dump()[:400])


def android_calls_it_foreground():
    out = state.get('dump') or services_dump()
    if 'isForeground=true' not in out:
        excerpt = '\n'.join(l for l in out.splitlines() if 'Foreground' in l or 'ServiceRecord' in l)
        raise StepFailed('the service is running but NOT foreground:\n%s' % excerpt[:400])
    types = re.search(r'foregroundServiceType=(\S+)', out)
    return 'isForeground=true%s' % (
        ', type=%s' % types.group(1) if types else '')


def the_process_is_not_killable():
    """
    The measurement that would have caught the original bug on its own.

    **The app is sent HOME first, and that is the whole point.** A process that is on screen
    reports `oom_score_adj` 0 and `fg / TOP` whether or not a service exists — so measuring
    it while the timer screen is in front is a check that passes either way, which is the
    exact shape of every bug in the CLAUDE.md hazard list. The question is what the priority
    is when the reader is NOT looking, because that is when Android goes looking for memory.

    Before the fix, backgrounded: `cch b/ /LAST (previous-expired)`, adj 900.
    """
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(4)
    adj = oom_adj()
    line = proc_line()
    if line and ('TOP' in line or 'top-activity' in line):
        raise StepFailed(
            'the app is still in the foreground (%r), so this measurement means nothing. '
            'HOME did not take.' % line)
    state['adj'] = adj
    if adj is None:
        raise StepFailed('could not read oom_score_adj - is the process alive?')
    if adj > MAX_FOREGROUND_ADJ:
        raise StepFailed(
            'oom_score_adj=%d, which is not a foreground process. 900 is cached, and cached '
            'is the first thing Android kills. Proc line: %r' % (adj, line))
    if line and ('cch' in line or 'cached' in line.lower()):
        raise StepFailed('Android still lists the process as CACHED: %r' % line)
    return 'oom_score_adj=%d (was 900 before the fix) · %s' % (adj, line or 'no proc line')


def finishing_stops_the_service():
    # Check D left the app on the launcher on purpose. Come back the way a reader would,
    # by resuming rather than relaunching, so the running timer is the same one.
    adb('shell', 'monkey', '-p', phone.PKG,
        '-c', 'android.intent.category.LAUNCHER', '1')
    time.sleep(4)
    if not find(dump(), r'^Finish$'):
        adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
            '-d', 'reader://session/timer')
        time.sleep(4)
    if find(dump(), r'^Finish$'):
        tap(r'^Finish$', 'Finish')
        time.sleep(5)
    for _ in range(15):
        if SERVICE not in services_dump():
            return 'the service stopped with the session'
        time.sleep(1)
    raise StepFailed(
        'THE SERVICE OUTLIVED THE SESSION. A foreground service nobody stops is a permanent '
        'notification and a battery complaint.')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('A no service before a timer', no_service_before_a_timer),
        ('B starting a timer starts the service', starting_a_timer_starts_the_service),
        ('C Android calls it foreground', android_calls_it_foreground),
        ('D the process is no longer killable-first', the_process_is_not_killable),
        ('E finishing stops the service', finishing_stops_the_service),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
