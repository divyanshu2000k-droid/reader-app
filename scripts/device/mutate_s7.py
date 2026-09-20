"""
Mutation sweep for Slice 7: break each Stats rule on purpose and confirm a test goes red.

Same contract as mutate_s6.py — bytes in, bytes out, md5 verified, non-zero exit if any
mutation survives or stops matching. A SKIP is a FAILURE, not a pass: it means the pattern
has moved and that mutation is now protecting nothing. Two of Slice 6's twenty-two skipped
silently after a refactor and had to be re-pointed.

Every mutation here is a rule someone could plausibly "simplify" away, and several are
mistakes this file has already made once: the bestseller tag that contains the word
"fiction", "Social Science" landing in Science & nature, and a fraction reaching an INTEGER
column.

    python scripts/device/mutate_s7.py
"""

import hashlib
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]

GENRE = 'src/domain/genre.ts'
GENRE_T = 'src/domain/__tests__/genre.test.ts'
GOAL = 'src/domain/goal.ts'
GOAL_T = 'src/domain/__tests__/goal.test.ts'
YEAR = 'src/features/stats/yearSummary.ts'
YEAR_T = 'src/features/stats/__tests__/yearSummary.test.ts'
FILTER = 'src/features/library/genreFilter.ts'
FILTER_T = 'src/features/library/__tests__/genreFilter.test.ts'

MUTATIONS = [
    # ── the genre mapping: the judgement calls that were wrong twice on the first day ──
    ('a catalogue id with = in it is read as a subject',
     GENRE, "  if (trimmed.includes('=')) return []",
     '  if (false) return []', GENRE_T),
    ('shelf furniture is matched as a genre',
     GENRE, '        !NOISE_CONTAINS.some((noise) => part.includes(noise)),',
     '        true,', GENRE_T),
    ("'General' survives a Google hierarchy and becomes a shelf",
     GENRE, '        !NOISE_EXACT.includes(part) &&',
     '        true &&', GENRE_T),
    ('a substring counts as a whole word, so The Warden is a war book',
     GENRE, "  return boundary.test(before ?? ' ') && boundary.test(after ?? ' ')",
     '  return true', GENRE_T),
    ("the reader's chosen genre is ignored in favour of the guess",
     GENRE, '  if (chosen !== null && chosen !== undefined && isGenre(chosen)) return chosen',
     '  if (false) return chosen as Genre', GENRE_T),
    ('an unrecognised stored genre is trusted instead of re-guessed',
     GENRE, '  return (GENRES as readonly string[]).includes(value)',
     '  return typeof value === \'string\'', GENRE_T),
    ("the breakdown's ties are left in whatever order the rows arrived",
     GENRE,
     '    .sort((a, b) => b.books - a.books || GENRES.indexOf(a.genre) - GENRES.indexOf(b.genre))',
     '    .sort((a, b) => b.books - a.books)', GENRE_T),
    ('an empty year divides by zero and draws a NaN-wide bar',
     GENRE, '  if (!Number.isFinite(total) || total <= 0) return 0',
     '  if (false) return 0', GENRE_T),

    # ── the three numbers ──
    ('books are counted from sessions instead of finishes',
     YEAR, '    books: finishedInYear(finished, year),',
     '    books: 0,', YEAR_T),
    ('the year switcher forgets years that only have a finish',
     YEAR, '    if (at !== null) years.add(localYearOf(at))',
     '    if (false) years.add(localYearOf(at))', YEAR_T),
    ('the current year is dropped when nothing happened in it',
     YEAR, '  const years = new Set<number>([thisYear])',
     '  const years = new Set<number>()', YEAR_T),
    ('a year with only a finish is called empty',
     YEAR, '  return summary.books === 0 && summary.pages === 0 && summary.minutes === 0',
     '  return summary.pages === 0 && summary.minutes === 0', YEAR_T),

    # ── the goal ──
    ("an empty goal field is an error rather than 'no goal'",
     GOAL, "  if (text === '') return { ok: true, target: null }",
     "  if (text === '') return { ok: false, reason: 'Required' }", GOAL_T),
    ('zero is accepted as a goal',
     GOAL, "  if (target < 1) return { ok: false, reason: 'At least one book, or leave it empty' }",
     "  if (false) return { ok: false, reason: 'At least one book, or leave it empty' }", GOAL_T),
    ('a fractional goal reaches an INTEGER column',
     GOAL, "  if (!/^\\d+$/.test(text)) return { ok: false, reason: 'Whole books only' }",
     "  if (false) return { ok: false, reason: 'Whole books only' }", GOAL_T),
    ('beating the goal draws the bar past the end of the screen',
     GOAL, '    fraction: Math.max(0, Math.min(1, done / target)),',
     '    fraction: done / target,', GOAL_T),

    # ── the library filter ──
    ('the filter offers every genre, including ones with no books',
     FILTER, '  return GENRES.filter((genre) => present.has(genre))',
     '  return [...GENRES]', FILTER_T),
    ('a stale filter is kept, showing an empty tab for no visible reason',
     FILTER, '  return genre === null || genresPresent(rows).includes(genre)',
     '  return true', FILTER_T),
    ('no filter and a filter matching nothing become the same thing',
     FILTER, '  if (genre === null) return [...rows]',
     '  if (genre === null) return []', FILTER_T),
]


def restore(path, original, label):
    """
    Put a mutated file back, and REFUSE to continue quietly if it cannot be put back.

    Windows file locks are transient — a `tsx` process still holding the file — so retry;
    if it still will not write, say so loudly and name the git command that fixes it, rather
    than exiting with the tree broken. This has happened twice.
    """
    for attempt in range(5):
        try:
            path.write_bytes(original)
            if path.read_bytes() == original:
                return
        except OSError:
            pass
        time.sleep(0.4 * (attempt + 1))
    raise SystemExit(
        f"\n!!! COULD NOT RESTORE {path} after mutation {label!r}.\n"
        f"!!! THE SOURCE IS STILL MUTATED. Run:  git checkout -- {path}\n"
    )


def digest(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def run_suite(suite):
    r = subprocess.run(['npx', 'tsx', '--test', suite], cwd=ROOT,
                       capture_output=True, text=True, shell=True)
    return r.returncode == 0


red, survived = 0, []
for label, rel, find, replace, suite in MUTATIONS:
    path = ROOT / rel
    original = path.read_bytes()
    before = digest(path)
    text = original.decode('utf-8')
    if find not in text:
        print(f'SKIP  {label}\n      (pattern gone from {rel} — re-watch it)')
        survived.append(label)
        continue
    path.write_bytes(text.replace(find, replace, 1).encode('utf-8'))
    try:
        passed = run_suite(suite)
    finally:
        restore(path, original, label)
        assert digest(path) == before, f'{rel} not restored byte for byte'
    if passed:
        print(f'GREEN {label}  <-- not caught')
        survived.append(label)
    else:
        red += 1
        print(f'RED   {label}')

print(f'\n{red}/{len(MUTATIONS)} mutations went red.')
for label in survived:
    print(f'  NOT CAUGHT: {label}')
sys.exit(0 if red == len(MUTATIONS) else 1)
