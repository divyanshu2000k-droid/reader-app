"""Slice 5 on the phone, the rest: database checks for the owner's cases, and items 3 to 4.

Titles from s5_phone.py travel through s5_state.json, since each step may run in its own process.
"""
import datetime
import json
import os
import re
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import pulldb
import s3lib
import s5_phone
from phone import StepFailed, dump, find, require, tap
from s5_phone import library_tab, open_actions, rate, rows_titled, step, texts

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, 'out', 's5_state.json')
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


def load_state():
    try:
        with open(STATE, encoding='utf8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_state(update):
    state = load_state()
    state.update(update)
    with open(STATE, 'w', encoding='utf8') as f:
        json.dump(state, f)


def day(ms):
    return None if ms is None else datetime.datetime.fromtimestamp(ms / 1000, IST).strftime('%Y-%m-%d')


def reading_pill_title():
    """A print book on Reading. Audiobooks are skipped: their logger asks for minutes, not pages."""
    phone.wait_for(r'^Log a session for ', 10)
    root = dump()
    rows = {(n.get('content-desc') or '').split(', ')[0]: n.get('content-desc') for n in phone.nodes(root)
            if n.get('clickable') == 'true' and ', ' in (n.get('content-desc') or '')}
    pills = [n.get('content-desc').replace('Log a session for ', '') for n in phone.nodes(root)
             if (n.get('content-desc') or '').startswith('Log a session for ')]
    audio = re.compile(r'(\d+h|\d+m)( \d+m)?$')
    for title in pills:
        if not audio.search(rows.get(title, '')):
            return title
    raise StepFailed(f'no print book on Reading: {pills}')


# ── The owner's cases, then the database ──

def case_1():
    detail = s5_phone.owner_case_1()
    save_state({'title1': s5_phone.state['title1']})
    return detail


def case_2():
    detail = s5_phone.owner_case_2()
    save_state({'title2': s5_phone.state['title2']})
    return detail


def db_case_1():
    title = load_state().get('title1')
    if not title:
        raise StepFailed('case 1 did not run')
    con = pulldb.pull('pulled-s5')
    rows = con.execute(
        'select r.id, r.status, r.rating, r.review, r.finished_at, r.read_number from reads r '
        'join books b on b.id = r.book_id where b.title = ? and b.deleted_at is null '
        'and r.deleted_at is null order by r.read_number desc',
        (title,),
    ).fetchall()
    cur = rows[0]
    queued = con.execute('select count(*) from sync_queue where row_id = ?', (cur[0],)).fetchone()[0]
    today = datetime.datetime.now(IST).strftime('%Y-%m-%d')
    if not (cur[1] == 'finished' and cur[2] == 4.5 and cur[3] == 'Phone check note' and day(cur[4]) == today):
        raise StepFailed(f'current read {cur[1:4]} finished {day(cur[4])}')
    return (f'"{title}": read {cur[5]} {cur[1]}, rating {cur[2]}, note {cur[3]!r}, '
            f'finished_at {day(cur[4])}; {queued} queue rows for the read')


def db_case_2():
    title = load_state().get('title2')
    if not title:
        raise StepFailed('case 2 did not run')
    con = pulldb.pull('pulled-s5')
    rows = con.execute(
        'select r.id, r.read_number, r.status, r.rating, r.finished_at from reads r '
        'join books b on b.id = r.book_id where b.title = ? and b.deleted_at is null '
        'and r.deleted_at is null order by r.read_number',
        (title,),
    ).fetchall()
    if len(rows) != 2:
        raise StepFailed(f'{len(rows)} live reads: {rows}')
    r1, r2 = rows
    years = [datetime.datetime.fromtimestamp(r[4] / 1000, IST).year for r in rows]
    this = datetime.datetime.now(IST).year
    ok = (r1[2] == r2[2] == 'finished' and r1[3] == 3 and r2[3] == 1.5 and r1[0] != r2[0]
          and day(r1[4]) == f'{this - 1}-12-31' and years == [this - 1, this])
    if not ok:
        raise StepFailed(f'reads {[(r[1], r[2], r[3], day(r[4])) for r in rows]}')
    return (f'"{title}": read 1 rating {r1[3]}, finished {day(r1[4])} (counts in {years[0]}); '
            f'read 2 rating {r2[3]}, finished {day(r2[4])} (counts in {years[1]}); two distinct rows')


# ── The rest of the flow ──

def want_book_no_date():
    s3lib.launch()
    library_tab('Want')
    root = dump()
    rows = [n for n in phone.nodes(root)
            if n.get('clickable') == 'true' and ', ' in (n.get('content-desc') or '')
            and not (n.get('content-desc') or '').endswith(' books')]
    if not rows:
        raise StepFailed('no Want book')
    title = rows[0].get('content-desc').split(', ')[0]
    phone.tap_node(rows[0])
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1)
    no_sessions = any(t.startswith('No sessions yet') for t in texts())
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    t = texts()
    asks = 'When did you finish?' in t
    phone.screenshot('s5-06-want-no-date.png')
    tap(r'^Close$', 'close')
    time.sleep(1)
    if not no_sessions:
        raise StepFailed(f'"{title}" has sessions; the rule needs a Want book with none (asks={asks})')
    if not asks:
        raise StepFailed(f'"{title}" with no sessions did not ask: {t[:12]}')
    return f'"{title}" (Want, no sessions): the date row asks "When did you finish?"'


def date_refusal():
    s3lib.launch()
    title = reading_pill_title()
    tap(rf'^Log a session for {re.escape(title)}$', 'Continue')
    require(r'^Save session$', 'logger', 10)
    time.sleep(1)
    start = s3lib.field_value(dump(), 'Was on page')
    phone.adb('shell', 'input', 'text', str(int(start or 0) + 2))
    tap(r'^Save session$', 'save', index=0)
    require(r'^SESSION SAVED$', 'saved', 10)
    time.sleep(1)
    s3lib.hide_keyboard()
    tap(r'^I finished the book$', 'I finished the book')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    tap(r'^Finished today\. Change$', 'date row')
    time.sleep(1.5)
    now = datetime.datetime.now(IST)
    yesterday = now - datetime.timedelta(days=1)
    tomorrow = now + datetime.timedelta(days=1)

    def day_nodes(root, d):
        month = re.escape(d.strftime('%B %Y'))
        return find(root, rf'^0?{d.day} {month}')

    root = dump()
    if yesterday.month != now.month:
        tap(r'^Previous month$', 'previous month')
        time.sleep(0.8)
        root = dump()
    target = day_nodes(root, yesterday)
    future = day_nodes(root, tomorrow)
    future_enabled = [n.get('enabled') for n in future]
    if not target:
        raise StepFailed(f'yesterday not in the dialog: {phone.texts(root)[:30]}')
    phone.tap_node(target[0])
    time.sleep(0.5)
    tap(r'^OK$', 'OK')
    time.sleep(1.2)
    root = dump()
    refusal = [t for t in texts() if t.startswith('Your last session on this read was on')]
    add = find(root, r'^Add to Finished$')
    add_enabled = add[0].get('enabled') if add else None
    phone.screenshot('s5-07-date-refused.png')
    tap(r'^Close$', 'close')
    if phone.wait_for(r'^Discard changes\?$', 4)[1]:
        tap(r'^Discard$', 'discard')
    time.sleep(1)
    if not refusal or add_enabled != 'false':
        raise StepFailed(f'refusal {refusal}, Add enabled {add_enabled}')
    return (f'"{title}": yesterday refused ({refusal[0]!r}); Add to Finished enabled={add_enabled}; '
            f'tomorrow in the dialog enabled={future_enabled or "not in this month view"}')


def already_finished_from_search():
    s3lib.launch()
    tap(r'^Add$', 'Add tab', timeout=15)
    require(r'^Search for a book$', 'add', 15)
    tap(r'^Search for a book$', 'field')
    phone.adb('shell', 'input', 'text', 'fantastic%smr%sfox')
    root, hit = phone.wait_for(r'^Add Fantastic Mr', 30)
    if not hit:
        raise StepFailed(f'no result to add: {phone.texts(root)[:20]}')
    s3lib.hide_keyboard()
    root, hit = phone.wait_for(r'^Add Fantastic Mr', 5)
    chosen = hit[0].get('content-desc')
    phone.tap_node(hit[0])
    tap(r'^I already finished it$', 'already finished')
    require(r'^You finished ', 'finish screen for a finished read', 12)
    time.sleep(1)
    t = texts()
    asks = 'When did you finish?' in t and 'Add date' in t
    phone.screenshot('s5-08-already-finished.png')
    tap(r'^Close$', 'close')
    require(r'^Book actions$', 'detail under it', 10)
    time.sleep(5)
    t = texts()
    about = 'ABOUT THIS BOOK' in t
    sample = any(x.startswith('Read a sample') for x in t)
    phone.screenshot('s5-09-about.png')
    save_state({'added4': chosen})
    if not asks:
        raise StepFailed(f'no date question: {t[:12]}')
    return f'added {chosen!r}; finish screen asks with no date; About card {about}; Read a sample {sample}'


def about_and_sample():
    more = find(dump(), r'^Show all of the description$')
    if more:
        phone.tap_node(more[0])
        time.sleep(0.8)
    expanded = bool(find(dump(), r'^Show less of the description$'))
    sample = find(dump(), r'^Read a sample')
    for _ in range(3):
        if sample:
            break
        phone.adb('shell', 'input', 'swipe', '540', '1700', '540', '800', '400')
        time.sleep(0.6)
        sample = find(dump(), r'^Read a sample')
    opened = None
    if sample:
        phone.tap_node(sample[0])
        time.sleep(5)
        out = phone.adb('shell', 'dumpsys', 'activity', 'activities')
        m = re.search(r'topResumedActivity=ActivityRecord\{\S+ \S+ ([^/ ]+)', out)
        opened = m.group(1) if m else None
        phone.screenshot('s5-10-sample-browser.png')
        phone.adb('shell', 'input', 'keyevent', 'BACK')
        time.sleep(2)
    return f'More: {"expanded" if expanded else "not offered (short)" if not more else "did not expand"}; Read a sample opened {opened!r}'


def forced_failure():
    s3lib.launch()
    tap(r'^Settings$', 'settings')
    require(r'^Finishing a book fails$', 'fault chip', 10)
    time.sleep(1.5)
    tap(r'^Finishing a book fails$', 'arm fault')
    time.sleep(1)
    s3lib.back()
    require(r'^Reading books$', 'library', 10)
    time.sleep(1)
    # Any book on Reading will do: nothing is logged, so an audiobook is fine here.
    root, hit = phone.wait_for(r'^Log a session for ', 10)
    if not hit:
        raise StepFailed('no book on Reading')
    title = hit[0].get('content-desc').replace('Log a session for ', '')
    phone.tap_node(rows_titled(title)[0])
    require(r'^Book actions$', 'detail', 10)
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    rate(3, False)
    tap(r'^Add to Finished$', 'Add to Finished')
    time.sleep(1.5)
    t = texts()
    shown = [x for x in t if 'Could not save this' in x]
    kept = any(x.startswith("That's a wrap on") for x in t) and any(x.startswith('4 out of 5') for x in t)
    phone.screenshot('s5-11-forced-failure.png')
    tap(r'^Close$', 'close')
    if phone.wait_for(r'^Discard changes\?$', 4)[1]:
        tap(r'^Discard$', 'discard')
    time.sleep(1.2)
    status = [x for x in texts() if x.startswith('READING')]
    s3lib.launch()  # a relaunch clears every fault
    if not shown or not kept or not status:
        raise StepFailed(f'error {shown}, screen kept {kept}, status {status}; {t[:14]}')
    return f'"{title}": {shown[0]!r} shown, rating kept on screen; after discarding, still {status[0]}'


STEPS = {
    '1': ('1. finishing moves the book off Currently Reading', case_1),
    '1db': ('1db. case 1 in the pulled database', db_case_1),
    '2': ('2. finish, re-read, finish again, each in its own year', case_2),
    '2db': ('2db. case 2 in the pulled database', db_case_2),
    '3': ('3. Session complete route, close, Start the next one', s5_phone.session_complete_route),
    'want': ('3b. a Want book with no sessions asks for the date', want_book_no_date),
    'refuse': ('3c. a date before the last session is refused', date_refusal),
    'already': ('3d. I already finished it from search', already_finished_from_search),
    'about': ('4. About card, More, Read a sample', about_and_sample),
    'fault': ('3e. a forced failure keeps the screen and the book', forced_failure),
}

if __name__ == '__main__':
    for key in sys.argv[1:]:
        step(*STEPS[key])
    s5_phone.report()
