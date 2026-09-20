"""
Slice 7 on the phone: the three numbers, the year switcher, the genre breakdown, the goal,
the Library's genre filter, and the genre picker in Edit details.

Everything here is a NUMBER read off the screen and compared with the database, not a look.
The one that matters most is D: the books figure above the breakdown and the bars beneath it
come from one load of two tables precisely so they cannot disagree, and this is what checks
that they do not.

    python scripts/device/s7_stats.py
"""

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


def screen_words(root=None):
    return [t.strip('|') for t in texts(root or dump()) if t.strip('|')]


def open_stats():
    tap(r'^Stats$', 'Stats tab')
    time.sleep(3)


def a_goal_can_be_set():
    """Settings writes `goals`, which nothing in the app could do before Slice 7."""
    s3lib.launch(clear_recovery=True)
    tap(r'^Settings$', 'Settings')
    time.sleep(2.5)
    root = dump()
    label = [w for w in screen_words(root) if 'Books to read in' in w]
    if not label:
        raise StepFailed('no goal field in Settings: %s' % screen_words(root)[:14])
    state['goal_label'] = label[0]
    boxes = [n for n in phone.nodes(root) if n.get('class') == 'android.widget.EditText']
    if not boxes:
        raise StepFailed('the goal field is not editable')
    phone.tap_node(boxes[0])
    time.sleep(1)
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    for _ in range(6):
        adb('shell', 'input', 'keyevent', 'KEYCODE_DEL')
    adb('shell', 'input', 'text', '12')
    time.sleep(1)
    s3lib.hide_keyboard()
    time.sleep(2)
    tap(r'^Done$', 'leave Settings')
    time.sleep(2)
    return 'set a goal of 12 in %r' % state['goal_label']


def the_goal_reached_the_database():
    con = pulldb.pull('s7-goal-%d' % int(time.time()))
    rows = con.execute(
        'select year, target_books from goals where deleted_at is null order by year'
    ).fetchall()
    if len(rows) != 1 or rows[0][1] != 12:
        raise StepFailed('expected exactly one live goal of 12, got %r' % (rows,))
    # The index added in 0003. One live goal per year, enforced by the database.
    dupes = con.execute(
        'select year, count(*) from goals where deleted_at is null group by year having count(*) > 1'
    ).fetchall()
    if dupes:
        raise StepFailed('more than one live goal for a year: %r' % (dupes,))
    state['year'] = rows[0][0]
    queued = con.execute("select count(*) from sync_queue where table_name='goals'").fetchone()[0]
    if queued == 0:
        raise StepFailed('the goal was written without queueing a sync row')
    return 'one live goal: %d books for %d; %d sync row(s)' % (rows[0][1], rows[0][0], queued)


def changing_it_does_not_make_a_second():
    """A blind insert works on a fresh install and throws the second time. This is that time."""
    s3lib.launch(clear_recovery=True)
    tap(r'^Settings$', 'Settings')
    time.sleep(2.5)
    boxes = [n for n in phone.nodes(dump()) if n.get('class') == 'android.widget.EditText']
    phone.tap_node(boxes[0])
    time.sleep(1)
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    for _ in range(6):
        adb('shell', 'input', 'keyevent', 'KEYCODE_DEL')
    adb('shell', 'input', 'text', '30')
    time.sleep(1)
    s3lib.hide_keyboard()
    time.sleep(2)
    root = dump()
    if any('no more than' in w or 'Whole books' in w for w in screen_words(root)):
        raise StepFailed('30 was refused: %s' % screen_words(root)[:10])
    tap(r'^Done$', 'leave Settings')
    time.sleep(2)
    con = pulldb.pull('s7-goal2-%d' % int(time.time()))
    live = con.execute(
        'select target_books from goals where deleted_at is null').fetchall()
    total = con.execute('select count(*) from goals').fetchone()[0]
    if len(live) != 1 or live[0][0] != 30:
        raise StepFailed('expected one live goal of 30, got %r (rows total %d)' % (live, total))
    return 'goal changed to 30 in place; %d goal row(s) in total, 1 live' % total


def stats_shows_three_numbers_and_the_goal():
    s3lib.launch(clear_recovery=True)
    open_stats()
    words = screen_words()
    state['stats_words'] = words
    for needed in ('books', 'pages', 'hours'):
        if not any(w == needed or w == needed[:-1] for w in words):
            raise StepFailed('no %r number on Stats: %s' % (needed, words[:22]))
    goal_line = [w for w in words if re.match(r'^\d+ of \d+ books?', w)]
    if not goal_line:
        raise StepFailed('the goal bar is not on Stats: %s' % words[:22])
    state['goal_line'] = goal_line[0]
    phone.screenshot('s7-stats.png')
    return 'three numbers present; goal reads %r' % goal_line[0]


def the_books_number_matches_the_breakdown():
    """
    The check the whole screen is built around.

    The books figure and the genre bars are computed from ONE load of two tables. If they
    ever disagree the reader is right to trust neither, so this reads both off the screen
    and adds the bars up.
    """
    root = dump()
    words = screen_words(root)
    # "N books in YYYY" or "No books finished in YYYY", above the breakdown.
    heading = [w for w in words if re.match(r'^(\d+ books? in \d{4}|No books finished in \d{4})$', w)]
    if not heading:
        raise StepFailed('no breakdown heading: %s' % words[:24])
    state['breakdown_heading'] = heading[0]
    claimed = 0 if heading[0].startswith('No books') else int(heading[0].split(' ')[0])

    # Each bar is an accessible row labelled "<Genre>, N books".
    bars = []
    for node in phone.nodes(root):
        desc = node.get('content-desc') or ''
        m = re.match(r'^(.+), (\d+) books?$', desc)
        if m and m.group(1) != 'Goal':
            bars.append((m.group(1), int(m.group(2))))
    state['bars'] = bars
    if claimed > 0 and not bars:
        raise StepFailed('%d books claimed but no genre bars drawn' % claimed)
    total = sum(n for _, n in bars)
    if total != claimed:
        raise StepFailed(
            'THE HEADING AND THE BARS DISAGREE: heading says %d, bars add to %d (%r)'
            % (claimed, total, bars))
    return '%r; bars %r add to %d' % (heading[0], bars, total)


def the_year_switcher_changes_the_numbers():
    root = dump()
    years = sorted(
        {int(w) for w in screen_words(root) if re.match(r'^(19|20)\d{2}$', w)},
        reverse=True,
    )
    if len(years) < 2:
        state['years'] = years
        return 'only %r to show, so no switcher — correct, not skipped' % (years,)
    before = state.get('breakdown_heading')
    tap(r'^%d$' % years[1], 'switch to %d' % years[1])
    time.sleep(2.5)
    after = [w for w in screen_words() if re.match(r'^(\d+ books? in \d{4}|No books finished in \d{4})$', w)]
    if not after:
        raise StepFailed('the breakdown heading vanished after switching year')
    if str(years[1]) not in after[0]:
        raise StepFailed('switching to %d still shows %r' % (years[1], after[0]))
    tap(r'^%d$' % years[0], 'back to %d' % years[0])
    time.sleep(2)
    return 'years %r; %r became %r' % (years, before, after[0])


def the_library_filters_by_genre():
    tap(r'^Library$', 'Library tab')
    time.sleep(2.5)
    tap(r'^Reading books$', 'Reading tab')
    time.sleep(2.5)
    root = dump()
    words = screen_words(root)
    if 'All' not in words:
        state['filter'] = 'absent'
        return ('no filter row: this shelf has one genre or fewer, which is when it is '
                'deliberately hidden (%s)' % words[:12])
    # A Chip is a Pressable, so its label can arrive as `text` OR as `content-desc`
    # depending on how the tree is flattened. Looking only at `android.widget.Button.text`
    # found nothing while the chips were plainly on screen.
    labels = {(n.get('text') or '').strip() for n in phone.nodes(root)}
    labels |= {(n.get('content-desc') or '').strip() for n in phone.nodes(root)}
    genre = next((g for g in GENRE_WORDS if g in labels), None)
    if genre is None:
        raise StepFailed('a filter row with no genre chip: %s' % words[:16])
    before = len([n for n in phone.nodes(root)
                  if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
                  and 'Cover of' not in (n.get('content-desc') or '')])
    tap(r'^%s$' % re.escape(genre), 'filter by %s' % genre)
    time.sleep(2.5)
    root = dump()
    after_words = screen_words(root)
    after = len([n for n in phone.nodes(root)
                 if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
                 and 'Cover of' not in (n.get('content-desc') or '')])
    empty = any('No %s books here' % genre in w for w in after_words)
    if after > before:
        raise StepFailed('filtering by %s showed MORE rows (%d -> %d)' % (genre, before, after))
    tap(r'^All$', 'clear the filter')
    time.sleep(2)
    return 'filtered by %r: %d rows -> %d%s' % (
        genre, before, after, ' (empty-genre state shown)' if empty else '')


GENRE_WORDS = {
    'Fantasy', 'Science fiction', 'Mystery & crime', 'Romance', 'Horror', 'Historical',
    'Poetry', 'Children & YA', 'Fiction', 'Biography & memoir', 'History',
    'Science & nature', 'Society & politics', 'Business & money', 'Mind & self', 'Other',
}


def the_reader_can_correct_a_genre():
    """`books.genre` is the only column Slice 7 adds that the reader writes."""
    root = dump()
    cards = [n for n in phone.nodes(root)
             if n.get('clickable') == 'true' and ',' in (n.get('content-desc') or '')
             and 'Cover of' not in (n.get('content-desc') or '')
             and 'Log a session' not in (n.get('content-desc') or '')]
    if not cards:
        raise StepFailed('no book to open')
    state['title'] = (cards[0].get('content-desc') or '').split(',')[0]
    phone.tap_node(cards[0])
    time.sleep(3)
    tap(r'Book actions', 'Book actions')
    time.sleep(2)
    tap(r'Edit details', 'Edit details')
    time.sleep(3)
    # Scroll to the genre block.
    for _ in range(8):
        if find(dump(), r'^Work it out$'):
            break
        adb('shell', 'input', 'swipe', '540', '1600', '540', '900', '250')
        time.sleep(0.8)
    root = dump()
    if not find(root, r'^Work it out$'):
        raise StepFailed('no genre picker in Edit details: %s' % screen_words(root)[:18])
    hint = [w for w in screen_words(root) if 'counts as' in w]
    tap(r'^Poetry$', 'choose Poetry')
    time.sleep(1.5)
    tap(r'^Save$|^Save changes$', 'save')
    time.sleep(4)
    con = pulldb.pull('s7-genre-%d' % int(time.time()))
    row = con.execute(
        'select genre from books where title = ? and deleted_at is null', (state['title'],)
    ).fetchone()
    if row is None or row[0] != 'Poetry':
        raise StepFailed('books.genre is %r for %r, expected Poetry' % (row, state['title']))
    return 'set %r to Poetry%s' % (
        state['title'][:28], '; picker hinted %r' % hint[0][:40] if hint else '')


if __name__ == '__main__':
    ok = True
    for name, fn in [
        ('7a a goal can be set in Settings', a_goal_can_be_set),
        ('7b the goal reached the database, once', the_goal_reached_the_database),
        ('7c changing it does not make a second', changing_it_does_not_make_a_second),
        ('7d Stats shows three numbers and the goal', stats_shows_three_numbers_and_the_goal),
        ('7e the books number matches the breakdown', the_books_number_matches_the_breakdown),
        ('7f the year switcher changes the numbers', the_year_switcher_changes_the_numbers),
        ('7g the Library filters by genre', the_library_filters_by_genre),
        ('7h the reader can correct a genre', the_reader_can_correct_a_genre),
    ]:
        ok = step(name, fn) and ok
    s3lib.report()
    sys.exit(0 if ok else 1)
