"""A finished read changed later; a description cleared in Edit details stays cleared."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import pulldb
import s3lib
from phone import StepFailed, dump, find, require, tap
from s5_phone import open_actions, rate, report, step, texts


def open_by_search(words, title_prefix):
    s3lib.launch()
    tap(r'^Search your library$', 'library search')
    time.sleep(1)
    phone.adb('shell', 'input', 'text', words.replace(' ', '%s'))
    root, hit = phone.wait_for(rf'^{title_prefix}', 8)
    s3lib.hide_keyboard()
    root, hit = phone.wait_for(rf'^{title_prefix}', 4)
    if not hit:
        raise StepFailed(f'{title_prefix} not found: {phone.texts(root)[:15]}')
    phone.tap_node(hit[0])
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1.5)


def read_row(title, number):
    con = pulldb.pull(f'pulled-edit-{int(time.time())}')
    return con.execute(
        'select r.status, r.rating, r.finished_at, r.review from reads r join books b on b.id = r.book_id '
        'where b.title = ? and r.read_number = ? and r.deleted_at is null', (title, number)).fetchone()


def change_finished_read():
    title = 'Slice Five Year 4281'
    before = read_row(title, 2)
    open_by_search('slice five year 4281', 'Slice Five Year 4281')
    open_actions()
    tap(r'^Rating, note and finish date', 'the rating row')
    require(r'^You finished ', 'the finish screen, editing', 10)
    time.sleep(1)
    t = texts()
    save_label = 'Save' in t and 'Start the next one' not in t
    rate(3, False)  # 4 stars
    tap(r'^Save$', 'save')
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1)
    after = read_row(title, 2)
    ok = after[0] == 'finished' and after[1] == 4 and after[2] == before[2] and after[3] == before[3]
    if not (ok and save_label):
        raise StepFailed(f'before {before}, after {after}, Save-only buttons {save_label}')
    return f'rating {before[1]} → {after[1]}; finished_at unchanged; status {after[0]}; the screen offered Save only'


def cleared_description_stays_cleared():
    open_by_search('godaan hindi', 'Godaan \\(Hindi\\)')
    had = 'ABOUT THIS BOOK' in texts()
    open_actions()
    tap(r'^Edit details', 'edit details')
    require(r'^Edit details$', 'form', 10)
    time.sleep(1)
    field = None
    for _ in range(5):
        field = [n for n in phone.nodes(dump()) if n.get('class') == 'android.widget.EditText'
                 and n.get('content-desc') == 'About this book · optional']
        if field:
            break
        s3lib.hide_keyboard()
        phone.adb('shell', 'input', 'swipe', '540', '1000', '540', '450', '400')
        time.sleep(0.7)
    if not field:
        raise StepFailed('no description field')
    phone.tap_node(field[0])
    time.sleep(0.6)
    phone.adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    # One `input keyevent` with many codes: one adb round trip, not a thousand.
    phone.adb('shell', 'input', 'keyevent', *(['67'] * 1000))
    time.sleep(1)
    value = [n.get('text') for n in phone.nodes(dump()) if n.get('content-desc') == 'About this book · optional']
    if not value or value[0] not in ('', None) and len(value[0]) > 0 and not value[0].startswith('Optional'):
        raise StepFailed(f'the field did not clear: {value[0][:60] if value else None!r}')
    s3lib.hide_keyboard()
    save = find(dump(), r'^Save changes$')
    if not save:
        raise StepFailed(f'no Save changes on screen: {texts()[:15]}')
    phone.tap_node(save[0])
    require(r'^Book actions$', 'detail', 10)
    time.sleep(1.5)
    gone = 'ABOUT THIS BOOK' not in texts()
    # Reopen from a fresh launch: the details fetch must not bring it back.
    open_by_search('godaan hindi', 'Godaan \\(Hindi\\)')
    time.sleep(4)
    still_gone = 'ABOUT THIS BOOK' not in texts()
    con = pulldb.pull(f'pulled-edit-{int(time.time())}')
    row = con.execute("select description, details_checked_at is not null from books where title = 'Godaan (Hindi)'").fetchone()
    if not (had and gone and still_gone and row[0] is None):
        raise StepFailed(f'had {had}, gone {gone}, still gone after reopen {still_gone}, db {row}')
    return 'description cleared; About text gone; reopened from a fresh launch and not refetched; column NULL, checked'


if __name__ == '__main__':
    which = sys.argv[1:] or ['rating', 'clear']
    if 'rating' in which:
        step('3g. a finished read changed later: only the rating is written', change_finished_read)
    if 'clear' in which:
        step('4d. a description cleared in Edit details stays cleared', cleared_description_stays_cleared)
    report()
