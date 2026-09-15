"""Slice 5 on the phone: the owner's two cases first, then the rest. Sandbox library."""
import re
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import s3lib
from phone import StepFailed, dump, find, require, tap

results = []


def step(name, fn):
    print(f'\n== {name}', flush=True)
    try:
        detail = fn()
        results.append((name, 'PASS', detail))
        print(f'  PASS: {detail}', flush=True)
    except Exception as e:  # noqa: BLE001
        results.append((name, 'FAIL', str(e)))
        print(f'  FAIL: {e}', flush=True)
        phone.screenshot(f's5-fail-{len(results)}.png')


def texts():
    return [t.strip('|') for t in phone.texts(dump()) if t.strip('|')]


def bounds(n):
    return list(map(int, re.findall(r'\d+', n.get('bounds'))))


def rate(star_index, left_half):
    """Tap the left or right half of star 0..4 inside the rating control."""
    root = dump()
    # TalkBack's adjustable control reads "Rating, 4.5 out of 5"; uiautomator lists its five tap
    # targets beside it, so they are found by lying inside its bounds.
    rating = [n for n in phone.nodes(root) if (n.get('content-desc') or '').startswith('Rating, ')]
    if not rating:
        raise StepFailed('no rating control')
    a, b, c, d = bounds(rating[0])
    targets = sorted(
        [n for n in phone.nodes(root) if n.get('clickable') == 'true'
         and bounds(n)[1] >= b and bounds(n)[3] <= d + 2 and bounds(n)[0] >= a - 2 and bounds(n)[2] <= c + 2],
        key=lambda n: bounds(n)[0],
    )
    if len(targets) == 5:
        x0, y0, x1, y1 = bounds(targets[star_index])
    else:
        raise StepFailed(f'{len(targets)} star targets found')
    x = x0 + (x1 - x0) * (0.25 if left_half else 0.75)
    phone.adb('shell', 'input', 'tap', str(int(x)), str((y0 + y1) // 2))
    time.sleep(0.6)


def open_actions():
    tap(r'^Book actions$', 'actions')
    time.sleep(1.2)


def library_tab(name):
    tap(rf'^{name} books$', f'{name} tab')
    time.sleep(1.5)


def rows_titled(title):
    root = dump()
    return [n for n in phone.nodes(root) if (n.get('content-desc') or '').startswith(title + ',')]


# ── 1. Finishing moves the book off Currently Reading ──
state = {}


def owner_case_1():
    s3lib.launch()
    root = dump()
    pills = [n.get('content-desc') for n in phone.nodes(root) if (n.get('content-desc') or '').startswith('Log a session for ')]
    if not pills:
        raise StepFailed('no book on Reading')
    title = pills[0].replace('Log a session for ', '')
    state['title1'] = title
    phone.tap_node(rows_titled(title)[0])
    require(r'^Book actions$', 'detail', 10)
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    phone.screenshot('s5-01-finish.png')
    summary = [t for t in texts() if 'book this year' in t]
    rate(4, True)
    shown = [t for t in texts() if 'out of 5' in t]
    field = [n for n in phone.nodes(dump()) if n.get('class') == 'android.widget.EditText']
    phone.tap_node(field[0])
    time.sleep(0.8)
    phone.adb('shell', 'input', 'text', 'Phone%scheck%snote')
    time.sleep(1)
    kb = s3lib.keyboard_up()
    root = dump()
    add = find(root, r'^Add to Finished$')
    add_bottom = bounds(add[0])[3] if add else None
    phone.screenshot('s5-02-note-keyboard.png')
    s3lib.hide_keyboard()
    tap(r'^Add to Finished$', 'Add to Finished')
    require(r'^Book actions$', 'back on detail', 10)
    time.sleep(1)
    phone.screenshot('s5-03-detail-finished.png')
    t = texts()
    ok = any(x.startswith('Finished ') for x in t) and 'Rated 4.5 out of 5' in t and 'Phone check note' in t
    s3lib.back()
    require(r'^Reading books$', 'library', 10)
    time.sleep(1)
    on_reading = len(rows_titled(title))
    library_tab('Finished')
    on_finished = len(rows_titled(title))
    library_tab('Reading')
    if not ok or on_reading != 0 or on_finished != 1 or not kb or add_bottom is None:
        raise StepFailed(f'detail ok {ok}, reading {on_reading}, finished {on_finished}, keyboard {kb}, add {add_bottom}; {t[:14]}')
    return f'"{title}": {summary[:1]}, {shown[:1]}; keyboard up with Add to Finished at y={add_bottom}; detail shows 4.5, Finished today, note; Reading 0, Finished {on_finished}'


# ── 2. Finish, re-read, finish again: two reads, each in its own year ──

def manual_book(title):
    tap(r'^Add$', 'Add tab', timeout=15)
    require(r'^Search for a book$', 'add', 15)
    s3lib.hide_keyboard()
    for _ in range(3):
        phone.adb('shell', 'input', 'swipe', '540', '1500', '540', '500', '400')
        time.sleep(0.5)
    tap(r'^Add manually$', 'Add manually', index=0)
    require(r'^Add it yourself$', 'form', 10)
    time.sleep(1)
    field = [n for n in phone.nodes(dump()) if n.get('class') == 'android.widget.EditText' and n.get('content-desc') == 'Title']
    phone.tap_node(field[0])
    time.sleep(0.5)
    phone.adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    for _ in range(30):
        phone.adb('shell', 'input', 'keyevent', 'KEYCODE_DEL')
    phone.adb('shell', 'input', 'text', title.replace(' ', '%s'))
    time.sleep(0.6)
    s3lib.hide_keyboard()
    tap(r'^Add to library$', 'Add to library')
    require(r'^Book actions$', 'new book detail', 10)
    time.sleep(1)


def pick_last_new_years_eve():
    this_year = time.localtime().tm_year
    last = this_year - 1
    root, hit = phone.wait_for(rf'^{this_year}$', 8)
    if not hit:
        raise StepFailed(f'date dialog year header not found: {phone.texts(root)[:20]}')
    phone.tap_node(hit[0])
    time.sleep(1)
    tap(rf'^{last}$', f'year {last}')
    time.sleep(1)
    for _ in range(12):
        root = dump()
        if find(root, rf'31 December {last}'):
            break
        tap(r'^Next month$', 'next month')
        time.sleep(0.6)
    tap(rf'31 December {last}', 'NYE')
    time.sleep(0.5)
    tap(r'^OK$', 'OK')
    time.sleep(1.2)
    return last


def owner_case_2():
    s3lib.launch()
    title = f'Slice Five Year {int(time.time()) % 10000}'
    state['title2'] = title
    manual_book(title)
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    tap(r'^Finished today\. Change$', 'date row')
    last = pick_last_new_years_eve()
    summary1 = [t for t in texts() if 'book of' in t]
    phone.screenshot('s5-04-last-year.png')
    rate(2, False)  # 3 stars
    tap(r'^Add to Finished$', 'Add to Finished')
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1)
    hero1 = [t for t in texts() if t.startswith('Finished ')]

    open_actions()
    tap(r'^Start a re-read', 're-read')
    time.sleep(2)
    badge = [t for t in texts() if 'READ 2' in t]
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen 2', 10)
    time.sleep(1)
    summary2 = [t for t in texts() if 'book this year' in t]
    rate(1, True)  # 1.5 stars
    tap(r'^Add to Finished$', 'Add to Finished 2')
    require(r'^Book actions$', 'detail 2', 10)
    time.sleep(1.5)
    for _ in range(3):
        phone.adb('shell', 'input', 'swipe', '540', '1700', '540', '600', '400')
        time.sleep(0.5)
    phone.screenshot('s5-05-two-reads.png')
    t = texts()
    earlier = [x for x in t if x.startswith('Read 1 ·')]
    if not summary1 or f'of {last}' not in summary1[0] or not summary2 or not badge or not earlier:
        raise StepFailed(f'summary1 {summary1}, summary2 {summary2}, badge {badge}, earlier {earlier}, hero1 {hero1}')
    return f'"{title}": read 1 {summary1[0]!r}, hero {hero1}; re-read badge {badge}; read 2 {summary2[0]!r}; earlier {earlier}'


# ── 3. Session complete, "I finished the book", then close ──

def session_complete_route():
    s3lib.launch()
    root = dump()
    pills = [n.get('content-desc') for n in phone.nodes(root) if (n.get('content-desc') or '').startswith('Log a session for ')]
    title = pills[0].replace('Log a session for ', '')
    tap(rf'^Log a session for {re.escape(title)}$', 'Continue')
    require(r'^Save session$', 'logger', 10)
    time.sleep(1)
    start = s3lib.field_value(dump(), 'Was on page')
    phone.adb('shell', 'input', 'text', str(int(start or 0) + 4))
    time.sleep(0.5)
    tap(r'^Save session$', 'save', index=0)
    require(r'^SESSION SAVED$', 'saved', 10)
    time.sleep(1)
    s3lib.hide_keyboard()
    tap(r'^I finished the book$', 'I finished the book')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    tap(r'^Close$', 'close')
    time.sleep(1.5)
    # Started from the Library's Continue pill, so Close returns there, with the book still on Reading.
    require(r'^Reading books$', 'back where the reader started', 8)
    still_reading = bool(find(dump(), rf'^Log a session for {re.escape(title)}$'))
    if not still_reading:
        raise StepFailed(f'after close the book is not on Reading; {texts()[:12]}')
    status = ['still on Reading']
    # And Start the next one: finish it for real and land on Want.
    phone.tap_node(rows_titled(title)[0])
    require(r'^Book actions$', 'detail', 10)
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen again', 10)
    time.sleep(1)
    rate(3, False)
    tap(r'^Close$', 'close with a rating')
    asked = bool(phone.wait_for(r'^Discard changes\?$', 5)[1])
    if asked:
        tap(r'^Keep editing$', 'keep')
        time.sleep(1)
    tap(r'^Start the next one$', 'next one')
    time.sleep(2.5)
    root = dump()
    want = [n for n in phone.nodes(root) if n.get('content-desc') == 'Want books']
    selected = want and want[0].get('selected') == 'true'
    return f'"{title}": close left it on Reading ({status[0]}); close with a rating asked: {asked}; Start the next one → Want selected: {selected}'


def report():
    print()
    for name, r, d in results:
        print(f'{r:4}  {name}  — {d}')


if __name__ == '__main__':
    which = sys.argv[1:] or ['1', '2', '3']
    if '1' in which:
        step('1. finishing moves the book off Currently Reading', owner_case_1)
    if '2' in which:
        step('2. finish, re-read, finish again, each in its own year', owner_case_2)
    if '3' in which:
        step('3. Session complete route, close, Start the next one', session_complete_route)
    report()
