"""Start the next one, twice: the second request must switch the Library back to Want."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

import phone
import s3lib
from phone import StepFailed, dump, require, tap
from s5_more import reading_pill_title
from s5_phone import library_tab, open_actions, rows_titled, step, report


def want_selected():
    nodes = [n for n in phone.nodes(dump()) if n.get('content-desc') == 'Want books']
    return bool(nodes) and nodes[0].get('selected') == 'true'


def finish_with_next():
    title = reading_pill_title()
    phone.tap_node(rows_titled(title)[0])
    require(r'^Book actions$', 'detail', 10)
    open_actions()
    tap(r'^Move to Finished$', 'Finished chip')
    require(r"^That's a wrap on ", 'finish screen', 10)
    time.sleep(1)
    tap(r'^Start the next one$', 'next one')
    time.sleep(2.5)
    return title


def twice():
    s3lib.launch()
    first = finish_with_next()
    after_first = want_selected()
    library_tab('Reading')
    on_reading = not want_selected()
    second = finish_with_next()
    after_second = want_selected()
    if not (after_first and on_reading and after_second):
        raise StepFailed(f'first Want {after_first}, switched to Reading {on_reading}, second Want {after_second}')
    return f'"{first}" → Want; moved to Reading; "{second}" → Want again'


if __name__ == '__main__':
    step('3f. Start the next one twice, with a tab change between', twice)
    report()
