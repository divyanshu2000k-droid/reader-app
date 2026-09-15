import pathlib, subprocess, sys, os
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[2]
MUTATIONS = [
  ('a finish year bucketed in UTC', 'src/domain/finishes.ts',
   "    if (at !== null && localYearOf(at) === year) count += 1",
   "    if (at !== null && new Date(at).getUTCFullYear() === year) count += 1",
   'src/domain/__tests__/finishes.test.ts', 'America/Chicago'),
  ('a DNF read counts as finished', 'src/domain/finishes.ts',
   "  if (read.status !== 'finished') return null\n", "", 'src/domain/__tests__/finishes.test.ts', None),
  ('a derived finish date is written into finished_at', 'src/features/finish/finishForm.ts',
   "  if (form.dateSource === 'reader' && form.finishedAt !== read.finishedAt) {",
   "  if (form.finishedAt !== read.finishedAt) {", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('an undated finished read defaults to today', 'src/features/finish/finishForm.ts',
   "  return { ...base, finishedAt: null, dateSource: 'unknown' }",
   "  return { ...base, finishedAt: now, dateSource: 'reader' }", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('finishing does not move the read', 'src/features/finish/finishForm.ts',
   "  if (read.status !== 'finished') patch.status = 'finished'\n", "", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('a date before the last session is accepted', 'src/features/finish/finishForm.ts',
   "    } else if (read.lastSessionAt !== null && day < toLocalDay(read.lastSessionAt)) {",
   "    } else if (false) {", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('tapping the shown rating does not clear it', 'src/features/finish/finishForm.ts',
   "  return next === current ? null : next", "  return next", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('the summary counts this read twice', 'src/features/finish/finishForm.ts',
   "    const n = finishedInYear(finished, year, read.readId) + 1",
   "    const n = finishedInYear(finished, year) + 1", 'src/features/finish/__tests__/finishForm.test.ts', None),
  ('an older remembered result is rejected', 'src/features/add/searchMerge.ts',
   "  const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v)",
   "  const optional = (v: unknown, check: (x: unknown) => boolean) => check(v)",
   'src/features/add/__tests__/search.test.ts', None),
  ('the "Also contained in" list is kept', 'src/domain/bookDetails.ts',
   "    if (/^-{3,}$/.test(line)) break\n", "", 'src/domain/__tests__/bookDetails.test.ts', None),
  ('a fetch replaces the reader description', 'src/domain/bookDetails.ts',
   "  if (stored.description === null && fetched.description !== null) {",
   "  if (fetched.description !== null) {", 'src/domain/__tests__/bookDetails.test.ts', None),
  ('a preview link for a book with no pages', 'src/domain/bookDetails.ts',
   "  if (viewability !== 'PARTIAL' && viewability !== 'ALL_PAGES') return null\n", "",
   'src/domain/__tests__/bookDetails.test.ts', None),
  ('a Google search hit drops its description', 'src/features/add/searchSources.ts',
   "      ...parseGoogleVolumeDetails(item),", "      ...NO_DETAILS,", 'src/features/add/__tests__/search.test.ts', None),
  ('migration 0002 invents descriptions', 'src/db/migrations/0002_ambitious_the_liberteens.sql',
   "ALTER TABLE `books` ADD `details_checked_at` integer;",
   "ALTER TABLE `books` ADD `details_checked_at` integer;--> statement-breakpoint\nUPDATE books SET description = 'x';",
   'src/db/__tests__/migrations.test.ts', None),
  ('the description edit is not written', 'src/features/add/bookForm.ts',
   "  if (next.description !== original.description) patch.description = next.description\n", "",
   'src/features/add/__tests__/bookForm.test.ts', None),
]
for name, path, old, new, test, tz in MUTATIONS:
    f = ROOT / path
    original = f.read_bytes()
    try:
        text = original.decode('utf8')
        assert text.count(old) == 1, (name, text.count(old))
        f.write_bytes(text.replace(old, new, 1).encode('utf8'))
        env = dict(os.environ)
        if tz: env['TZ'] = tz
        r = subprocess.run(f'npx tsx --test "{test}"', cwd=ROOT, shell=True, capture_output=True, text=True, encoding='utf8', errors='replace', env=env)
        fails = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith('\u2139 fail')]
        print(f'{name}: {fails[-1] if fails else "NO RESULT"}', flush=True)
    finally:
        f.write_bytes(original)
