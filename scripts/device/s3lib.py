"""Slice 3 phone helpers: launch, open screens, drive Android's date and time dialogs."""
import re
import subprocess
import time

import phone
from phone import StepFailed, dump, find, require, tap, texts

results = []


def step(name, fn):
    print(f"=== {name}", flush=True)
    try:
        detail = fn()
        results.append((name, 'PASS', detail or ''))
        print(f"  PASS {detail or ''}", flush=True)
        return True
    except StepFailed as e:
        results.append((name, 'FAIL', str(e)))
        print(f"  FAIL: {e}", flush=True)
        phone.screenshot(f"fail-{len(results)}.png")
        return False


def launch(wait=r'^Reading books$'):
    phone.adb('shell', 'am', 'force-stop', phone.PKG)
    subprocess.run(['adb', 'shell', 'monkey', '-p', phone.PKG, '-c', 'android.intent.category.LAUNCHER', '1'], capture_output=True)
    require(wait, 'app launched', 150)
    time.sleep(1.5)


def shown(root, pattern):
    return [phone.label(n) for n in find(root, pattern)]


def expect(pattern, what, timeout=8):
    root, hit = require(pattern, what, timeout)
    return root, hit


def pick_date(day_desc):
    """day_desc like '10 September 2026'. Picker lists days as '10 September 2026' (zero-padded)."""
    d, rest = day_desc.split(' ', 1)
    tap('^' + re.escape(f"{int(d):02d} {rest}") + '$', f'day {day_desc}')
    time.sleep(0.5)
    tap(r'^OK$', 'date OK')
    time.sleep(1.5)


def pick_time(hour, minute, pm):
    require(r'^PM$', 'time dialog', 6)
    tap(rf'^{hour}$', f'hour {hour}')
    time.sleep(0.8)
    tap(rf'^{minute}$', f'minute {minute}')
    time.sleep(0.5)
    tap(r'^PM$' if pm else r'^AM$', 'meridiem')
    time.sleep(0.4)
    tap(r'^OK$', 'time OK')
    time.sleep(1.5)


def when_value(root=None):
    root = root or dump()
    hit = find(root, r'^When, ')
    return phone.label(hit[0]).split('When, ', 1)[1] if hit else None


def keyboard_up():
    return 'mInputShown=true' in phone.adb('shell', 'dumpsys', 'input_method')


def hide_keyboard():
    if keyboard_up():
        phone.adb('shell', 'input', 'keyevent', 'BACK')
        time.sleep(0.8)


def back():
    # Android's first Back only closes the keyboard; that is not the Back being tested.
    hide_keyboard()
    phone.adb('shell', 'input', 'keyevent', 'BACK')
    time.sleep(1.2)


def to_library():
    for _ in range(5):
        root = dump()
        if find(root, r'^Reading books$'):
            return
        if find(root, r'^Discard$'):
            tap(r'^Discard$', 'discard')
            time.sleep(1)
            continue
        back()
    require(r'^Reading books$', 'back at the library')


def report():
    print()
    for name, r, d in results:
        print(f"{r:4}  {name}  {('— ' + d) if d else ''}")


def field_value(root, label):
    """The text of the EditText whose content-desc is `label`."""
    for n in phone.nodes(root):
        if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == label:
            return n.get('text')
    return None

def open_by_search(title):
    """
    Open a book through the Library's own search, rather than scrolling a tab.

    Several runs failed with "<title> not on screen" simply because the book was below the
    fold on a long tab. Search reaches any book in two taps and does not care which tab it
    is on, which also stops a check depending on a book's status staying put.
    """
    to_library()
    tap(r'Search your library', 'the library search button')
    time.sleep(2)
    phone.adb('shell', 'input', 'text', title.replace(' ', '%s')[:40])
    time.sleep(2.5)
    root, hit = require(re.escape(title), f'{title} in the search results', 12)
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and title in (n.get('content-desc') or '')]
    phone.tap_node(cards[0] if cards else hit[0])
    time.sleep(3)
    require(r'Book actions', 'book detail', 15)


def open_notes(title):
    open_by_search(title)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'Notes and quotes', 'Notes and quotes')
    time.sleep(2.5)
    require(r'Notes & quotes', 'the notes list', 12)
