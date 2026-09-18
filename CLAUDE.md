# CLAUDE.md

Read `docs/00-START-HERE.md` before doing anything, then the document relevant to the
current slice.

## What this project is

An Android reading tracker built with Expo and React Native. Local first, offline capable,
Android only for v1. Full context is in `docs/`.

## How to work here

**Think like a software architect, not a code generator.** Before implementing, ask what
the decision costs in month six. Prefer boring, explicit and easy to delete.

**The specs are a floor, not a ceiling.** They are thorough but incomplete. Actively hunt
for what is missing. For every screen ask: what if this fails, what if the data is empty
or enormous or malformed, what if the app is backgrounded here, what on a 360px phone,
what if they tap twice, what offline. When you find a gap, decide sensibly, write it in
`DECISIONS.md`, and continue. Do not stop and wait, and do not silently skip it.

**Write down why.** Every non-obvious decision goes in `DECISIONS.md` in two or three
lines. This is what lets you rebuild context later when the codebase outgrows what you can
hold at once. It is not optional.

**Disagree when you should.** If a spec decision looks wrong, say so with reasoning, note
it in `DECISIONS.md`, then proceed. What you must never do is silently deviate.

## The silent-pass hazard

**Four bugs in this codebase have now had the identical shape: it typechecks, it lints, it
does not throw, and it is wrong.** None was found by writing more code or by reading more
carefully. Each was found only by asserting the specific behaviour the design depends on,
in the direction it depends on it.

The four, as evidence:

1. **The write path was never atomic.** `transaction(async () => …)` typechecks against a
   synchronous dialect and commits before its statements run. Nothing rolled back for all
   of Slice 0.
2. **`restoreNewestBackup` silently did nothing** while reporting success, because
   deleting an open file on Android leaves the connection on the unlinked inode.
3. **The schema guard asserted nothing for two of seven tables.** Its regex could not find
   the end of a nested object, so it read the *next* table's columns and passed.
4. **`writeRow` rewrote `created_at` on every update**, because the caller's values were
   handed to `onConflictDoUpdate` wholesale.
5. **Migration `0001` could never run on a real database.** It passed every local check
   and applied cleanly to a fresh install; against a POPULATED v1 database it failed on
   the first constraint it added, and would have left every existing reader stuck on the
   old schema permanently. A fresh install is not a test of a migration.
6. **A `SELECT` held a read lock that made the next line's WAL checkpoint fail**, so the
   backup failed, so the migration refused to run. Typechecked, linted, threw nothing,
   and bricked upgrades — surfacing to the reader only as "Could not back up your
   library". **The device pass stayed at 14/14 throughout**, because it calls
   `checkpointWal()` in isolation and never executes the failing sequence. A suite of
   green checks over the parts of a startup path says nothing about the path.
7. **The kill switch could not be switched on.** Its URL was read from `expo-constants`,
   which serves the `app.config` embedded in the APK at native build time — not the
   manifest Metro serves. Setting the key and restarting Metro did nothing, silently; the
   manifest looked right and the app logged "no URL configured". Found only by flipping
   the flag and watching a device ignore it. Public keys are now literal
   `process.env.EXPO_PUBLIC_*` reads, inlined at bundle time.

8. **The typeface, the splash and the Sentry plugin were in the config and in no build.**
   `android/` was generated once and never regenerated; `run:android` does not re-run
   prebuild when the config changes. Everything typechecked, the config evaluated
   correctly, the font files existed, and the app rendered in Roboto for a week. Found only
   by looking at a real phone's screen.

9. **The session-recovery sheet saved nine hours of reading for a phone left overnight.**
   It wrote `now - startedAt` as the duration: the time the app was CLOSED, recorded as
   reading, in the core metric, under a title that said "You were reading for 9h". It
   worked exactly as written; the question it answered was the wrong one. The app never
   records a number on the reader's behalf that it does not actually know. It bounds it
   and asks.

10. **The design sheet's own light-mode text colours failed WCAG AA,** and the app used
   them for two slices. The gold on the focused tab label and Undo measured 4.26:1, and the
   placeholder and idle tab labels 2.41:1. Nothing looked wrong on a dark-mode test phone
   and nothing measured it. `contrast.test.ts` now computes every text/background pair in
   both schemes.

11. **Every cold start backed up the whole database, and a full phone was locked out with
   no update pending.** `performMigrations` never asked whether a migration was pending.
   Each launch paid a WAL checkpoint and a synchronous file copy before the splash lifted,
   plus a 3x free-space check that blocked the library. The notice then dropped the
   error's own advice and said "try again", which that reader could do forever.
12. **`runInTransaction` reopened bug #1 in its own replacement.** It took
   `task: () => void`, which TypeScript satisfies with an async function, and the guard
   only looked for drizzle's `.transaction(async`. Now `() => undefined`, pinned by
   `transaction.types.ts`.
13. **`npm test` ran 44 of 106 tests on any non-Windows shell, and passed.** The glob was
   unquoted; `sh` expands `**` one level deep. Every count before 2026-09-10 was a
   Windows-only count.
14. **A recovered session counted nowhere.** The recovery sheet carefully bounded the
   duration, and stats read only positions, so every recovered session was filed as
   `unusable`: real reading, reported as broken data.
15. **`updateRow` could move a session's date without its day**, and `{ note: undefined }`
   queued a sync for an edit that never happened. Latent: no caller had done either yet.
16. **Undo restored the session, and the screen went on showing it deleted.** The database had
   the row back and the restore queued; book detail, focused the whole time, had no reason to
   re-read. Every part worked. Found only by tapping Undo on a phone and looking at the list.
   `write.ts` now signals every committed change (`db/changes.ts`).
17. **Offline search told the reader the book database was broken.** The test said a
   `TypeError` means offline, which is what React Native's old fetch threw, and it passed. The
   fetch Expo installs rejects with a `FetchError` named "Error". In airplane mode every search
   showed "Could not reach the book database" and Try again, instead of the offline banner and
   the books searched before. Found only by turning the network off on a phone and logging the
   real error; the test now uses that exact error.

18b. **The same file did it again, with `letterSpacing`.** `typeStyle` is the only way any
   `<Text>` gets its type, and it read `size`, `weight` and `lineHeight` and silently dropped
   the fourth field. Seven tokens in the scale carry a `letterSpacing`; every display size in
   the app rendered at the typeface's default tracking for eight slices while the scale said
   otherwise. Found in 2026-09-18 only by adding a tracked token and checking whether it
   arrived. `theme.test.ts` now asserts it for every token that carries one, by iterating the
   scale rather than listing names.

19. **A test that would have passed either way.** The rule "an audiobook is offered no page"
   was tested with a fixture whose page was `null` — which produces an empty field with or
   without the rule. Deleting the rule kept the suite green. Found by the mutation sweep, not
   by review, and it sat beside a second one in the same file: a page validator tested only
   with `'p. 212'`, where the strict check and a bare `Number()` happen to agree. `'1e3'` and
   `'212.5'` are where they do not, and one of those writes a fractional page into an INTEGER
   column. **Two of the first twenty-two mutations went green, and both were the test, not the
   code.**

Add another if the theme counts: `font.family` was declared from the first commit and
applied by nothing, so the entire app rendered in the wrong typeface without a single
error anywhere.

**What this costs you, and what to do instead.**

- **"It does not throw" is not "it works."** Neither is a clean typecheck, a clean lint, or
  a passing test you have never seen fail.
- **Write the specified assertion, in the specified direction.** The substitute is always
  easier and is usually testing the easy half. "The transaction aborts when the first
  statement fails" is a different and much weaker claim than "the second statement failing
  rolls the first one back", and only the second one is the guarantee.
- **Watch every new guard fail at least once.** Break the thing it protects, on purpose,
  and confirm it goes red. A guard nobody has watched fail is decoration. When the fix for
  the schema guard landed, all seven tables were gutted in turn and the guard was watched
  to fail fourteen times before it was believed.
- **Be most suspicious where the code is most confident.** All four bugs lived in files
  whose comments explained, correctly and at length, why they were safe.
- **Suspect anything that cannot fail loudly:** a value silently clamped to zero, an error
  swallowed into a default, a sentinel returned through a success branch, a cascade that
  is nobody's job, a token declared and never used.

When you fix something in this shape, add it to the list above. The list is the point.

---

## The reintroduction problem, and the rules that follow from it

**Three bugs came back inside the code that fixed the previous version, within a few lines,
in the same sitting.**

1. **The async transaction, twice.** `db.transaction(async …)` commits before its statements
   run. The fix was `runInTransaction`, typed `task: () => void` — which TypeScript
   satisfies with an async function. The guard written alongside searched for
   `.transaction(async`, the old spelling, so the new one passed everything.
2. **`created_at`.** The fix that made the write path type-safe by passing the caller's
   whole values object to `onConflictDoUpdate` is what began rewriting the creation date on
   every update.
3. **The vacuous guard.** The guard written to catch `book_shelves` shipping without sync
   columns terminated its regex at the wrong brace, read the *next* table, and asserted
   nothing for two of seven tables. It was green from the day it was written.

A fourth has the same shape: fixing the backup's version label introduced the `SELECT` that
held a read lock and broke the next line's checkpoint. Two fixes in a row, same file, the
second breaking the first.

**What they share, and it is not carelessness:**

- **The fix moved the hazard behind a new name, and the guard still named the old one.**
  Every one of those guards is a regex over source text. A regex protects the exact
  spelling that existed when it was written, and a fix is precisely a change of spelling.
- **The original bug had no test that ran against the new code.** The behaviour was
  re-argued in a comment instead of re-asserted.
- **Confidence was highest exactly there.** Each fixed file gained a long, correct
  explanation of why it was now safe. The explanation became the deliverable.

**What would have caught each automatically, with nobody reading the diff:**

| Reintroduction | The automatic catch |
|---|---|
| Async task in `runInTransaction` | A type that cannot express it: `task: () => undefined`, with `@ts-expect-error` assertions in `__tests__/transaction.types.ts`. No textual guard could have; the text was new |
| `created_at` rewritten | A behavioural check against a real database: write, update, assert the creation date is unchanged and `updated_at` moved. That is device check 1c, which did not exist until 2026-09-12 |
| A guard that matches nothing | A **positive control**: the guard is fed a known-bad sample every run and must flag it, plus prose it must not flag. In `no-bypass.test.ts`, `contrast.test.ts` and `test-runner.test.ts` |

### Which of our guards are textual, and therefore only as good as last week's spelling

**Textual** (a regex over source or config text; protects one spelling):
`no-bypass.test.ts` write and raw-handle guards, its transaction guard, its
`client.ts` export check and its schema-shape extractor; the faint-token scan in
`contrast.test.ts`; the ESLint theme rules; `test-runner.test.ts`'s quoting check;
`metro-blocklist.test.ts`. **Every one of these now carries a positive control**, so a
guard that has stopped matching fails instead of passing.

**Structural** (the mistake cannot be written, or the check reads the real artefact):
`RowFor` / `PatchFor` / `DerivedColumn`; `runInTransaction`'s `() => undefined`;
`MoveStatus` (no plain move to Finished, `moveStatus.types.ts`);
`_shapeCheck`; `Palette` with `satisfies`; `UndoAction` returning a `Result`;
`exactOptionalPropertyTypes`; the two tsconfigs; `brand-font.test.ts` and
`native-fonts.test.ts` (they read the evaluated config and the built APK);
`migrationPlan.test.ts`'s journal check (reads the real journal); the contrast ratios; and
every device check, which runs the real write path against a real SQLite file.

**Prefer the structural one. A textual guard is a last resort for things the type system
cannot see**, and it must have a control.

### Standing rules

1. **Every bug that gets fixed gets a check that fails without the fix.** No exceptions.
   "Check" means anything automatic: a node test, a `@ts-expect-error` type assertion, or a
   device check. If a bug was worth finding it is worth a regression test, and that test is
   the only thing that stops it coming back. Where the fix is a native or timing matter that
   no assertion can hold, the check is a **counted measurement** with a number written down,
   never "we looked and it seemed fine".
2. **A type that makes the mistake uncompilable beats a lint rule; a lint rule beats a
   comment.** When you write a comment that says "never do X", ask what type would make X
   not compile. We still have the weaker form in several places, listed in
   `06-CONVENTIONS.md`; each is a candidate, not an accepted state.
3. **A guard counts only once it has been watched failing, and it must be re-watched
   whenever the code it guards is rewritten.** A guard that passes because it no longer
   matches anything is worse than no guard: it spends the attention a real check would have
   earned. Positive controls make this automatic for textual guards.
4. **When you fix something in a file, look for the same class of bug in the rest of that
   file before you leave it.** All three reintroductions were within a few lines of the
   original. Say in the report what you looked at and what you found.

### One review pass per slice

**A slice gets exactly one review pass, and it fixes only what is silent and loses data.**
Everything else — fragility, convention drift, polish, tidiness — gets a `DECISIONS.md`
entry filed against the slice that will need it, and is not fixed now. **There is no second
review round on the same code.**

Slice 1 was reviewed for longer than it took to build, and the app still cannot log a book.
Reviewing is not progress. The rules above exist so that one pass is enough.

---

## Non-negotiable rules

1. **Local first.** Every read comes from SQLite. Every write goes to SQLite first and
   returns immediately. The UI never waits on the network. A loading spinner over the
   user's own data is a bug.
2. **Never lose data.** Soft deletes everywhere. Undo on every destructive action. Backup
   before every migration.
3. **All colours, spacing, radii and type sizes come from `src/ui/theme.ts`.** A hardcoded
   hex in a component is a bug regardless of how small.
4. **All IDs are client generated UUIDs.** Never auto increment.
5. **All timestamps are UTC unix milliseconds**, formatted at render time. All date logic
   lives in `src/lib/dates.ts` and nowhere else imports date-fns.
6. **All SQL lives in `queries.ts` files.** Never inline a query in a component.
7. **Repeated and shared copy lives in `src/lib/strings.ts`** (button labels, errors,
   empty states, confirmations). Screen-specific prose stays inline.
8. **200 lines or one clear responsibility, whichever is larger.** A smell detector, not
   a law. `schema.ts` and `theme.ts` legitimately exceed it.
9. **Features never import from other features.** Only from `ui/`, `db/`, `domain/` and
   `lib/`. Shared business logic goes in `domain/`, not `lib/`.
10. **No `any`.** TypeScript strict, always.
11. **No CSS-only values.** React Native has no `radial-gradient`, no `box-shadow`
    strings, no `calc()`. The theme's `glowSpec` explains the gradient approach.
12. **Docs change in the same task as the code, never afterwards.** A doc describing code
    that no longer exists is a bug of the same severity as a failing test, and in practice
    worse: a failing test announces itself, a stale doc quietly misleads the next session
    into rebuilding the wrong thing. Specifically:

    | You changed | Update, in the same task |
    |---|---|
    | The schema, an index, a column type | `docs/03-DATA-MODEL.md` |
    | A convention, a command, a guard, a lint rule | `docs/06-CONVENTIONS.md` and `CLAUDE.md` |
    | Finished or reshaped a slice | `docs/05-BUILD-PLAN.md` and the **Current state** block below |
    | A screen contract or a global UI rule | `docs/04-SCREENS.md` |
    | A library, or a dependency's role | `docs/02-ARCHITECTURE.md` |
    | Anything non-obvious, ever | `DECISIONS.md`, **as you decide it** |

    `DECISIONS.md` is written as you go, never reconstructed in a sweep at the end. A
    reconstructed entry is missing the alternative you rejected and the reason, which is
    the only part worth keeping.

    **At the end of every task, before reporting it done, state in one line which docs you
    touched and why.** If none, say so explicitly and say why none were affected — "no
    schema, convention or slice boundary moved" is an answer; silence is not.

    One full sweep has already been needed to repair drift accumulated across a single
    slice (`DECISIONS.md`, 2026-09-04). That was the last one.

## Agent skills

Installed and expected to be used:

- **`expo/skills`** for current Expo API patterns, Router conventions, EAS config
- **`react-native-best-practices`** (Callstack) for RN performance, especially list tuning

These carry current framework detail that a static spec cannot. **Where a skill contradicts
`docs/` on framework mechanics, the skill wins** and you note it in `DECISIONS.md`. Where
they touch product decisions, `docs/` wins.

## Commands

```
npx expo run:android      # build and run locally, free and unlimited
npx expo start            # dev server, after a build exists
npx drizzle-kit generate  # create a migration after editing schema.ts
npm run typecheck         # app AND tests: they use separate tsconfigs
npm run lint
npm test                  # node --test, no device needed
npm run test:tz           # the timezone-sensitive suites in UTC, IST and US Central
npm run format:check      # Prettier owns formatting; theme.ts is the one exception

EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --clear   # runs the device pass on launch
adb logcat -d | grep devcheck                      # its results
EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --clear    # a sandbox library; seed it from Settings
```

**Both flags are honoured in development builds only.** A release build opens `reader.db`
whatever was exported when it was built (`src/lib/databaseChoice.ts`). The first version
honoured them everywhere, which could have shipped an app that put readers' books in a file
the next build never opens.

**That flag makes the whole app open `devcheck.db`, not your library**, and the pass
refuses to run without it. The pass is destructive: it seeds, soft-deletes, renames
`sync_queue` and restores backups over the live file. It shared the reader's library until
2026-09-12 and wrote to it twice. Use the phone, not the emulator: see `09-ENVIRONMENT.md`.

`npm run typecheck` rather than a bare `tsc --noEmit`: the app compiles with `"types": []`
so Node globals are not in scope for code that runs on a phone, and the test files compile
separately under `tsconfig.test.json` where `node:test` and `node:fs` are legitimate. The
bare command only checks half of it.

**After changing `app.config.ts` plugins or native config: `npm run prebuild`, THEN
`npx expo run:android`.** A rebuild alone reuses the existing `android/`, which
`run:android` only generates when it is missing. For a week, fonts, the splash config and
the Sentry plugin existed in config and in no build, silently. Metro alone picks up
neither.

Build locally for day to day work. EAS is for release builds only.

## Current state

**Slice 5b is code complete and has not been near a phone.** By the owner's choice, Slice 5's
outstanding checks and all of Slice 5b run in ONE session, from
`docs/device-checks/slice-5b.md`. Nothing in this slice is believed until then.
- **What it does:** a Notes row on the actions sheet carrying the book's counts; the notes list
  with All / Quotes / Notes, the counts of the book and export by share sheet; the editor with
  the quote-or-note toggle, the page defaulting to where the reader has got to, and the draft;
  delete with undo; notes in Recently Deleted.
- **The draft** lives in `metadata_cache`: local only, never synced, never in the list, counting
  toward nothing. There is deliberately no "Discard changes?", because nothing is discarded.
- **Held automatically:** 445 node tests under `cmd` and `sh`, 121 in each of three zones,
  **25 of 25 mutations red** (`scripts/device/mutate_s5b.py`). Typecheck, lint and Prettier
  clean.
- **NOT run:** the device pass. Checks 17 (a note survives a re-read and its read being
  deleted) and 18 (a draft writes no note and no queue row) are written and unwatched — the
  sheet says how to watch each one fail.
- **Two mutations went green on the first sweep, and both were the TEST**, not the code
  (silent-pass item 19). The sweep is the only reason either was found.
- **Also fixed, found while building:** `typeStyle` dropped every token's `letterSpacing`
  (item 18b). This changes the tracking of every heading in the app and wants a look on the
  phone. And the 2026-09-15 "Start the next one" fix now has a test and lives in
  `features/library/tabRequest.ts`.

**Slice 5 is built and verified on the phone.** 21 of 21 phone checks passed on 2026-09-15.
- **The owner's cases:** finishing moves the book off Reading. Finish, re-read and finish again is
  two rows, one counting in 2025 and one in 2026.
- **Device pass:** 5 of 5 clean runs.
- **Not run:** the largest font and 360 dp, on the Slice 11 font pass.
- Results: `docs/device-checks/slice-5.md`.
- **What it does:**
  - **The finish flow:** half-star rating, private note, finish date with Android's date dialog.
    It is the only way a read reaches Finished: the Finished chip, "I finished the book" and "I
    already finished it" all open it. "Start the next one" is there too.
  - **Book detail:** shows the rating, finish date and note. It has an About card with the
    description, More/Less and "Read a sample". A book's description, categories and preview are
    fetched once. Edit details has the description.
- **Migration 0002:** four `books` columns, tested on a populated database, and applied on the
  phone's populated `devcheck.db`.
- **Checks:** typecheck, lint and Prettier are clean. 383 node tests pass under `cmd` and `sh`,
  and 121 in each of three zones. 16 of 16 mutations went red, plus the `MoveStatus` type
  assertion. Device pass RUNTIME 34/34 · COMPILE-TIME 1/1, with checks 15 and 16 watched failing.
  It ran before the 2026-09-15 review fixes, and is re-run first next session.
- **Waiting on the owner** (`DECISIONS.md`, 2026-09-15):
  - Photo covers in Add manually: free or Plus.
  - When to build the barcode scanner. Recommended with photo covers: one camera rebuild.
  - Open Library covers at `-L`.
  - Optionally regenerate the Google key, which was pasted in chat.
- **Phone automation** lives in `scripts/device/` (README), not in a session scratchpad.
- **Open, measured:** 14c and 16 (network) failed in three mutation runs that did not touch them.
  They have passed in 7 of 7 clean runs since. Not explained; the run sheet has the procedure if
  it recurs.

**Slice 4 is built and verified on the phone, online and in airplane mode.**
- **What it does:** search Open Library (and Google Books, once an API key is set) with results
  merged, ranked by the typed words, and remembered; "Which shelf?"; Add manually and Edit
  details as one form; Search your library; the offline banner and remembered results.
- **Covers:** downloaded on add, so they show offline.
- **Checks:** 321 tests pass under `cmd` and `sh`. Device pass RUNTIME 32/32 · COMPILE-TIME 1/1, with check 14
  watched failing two ways.
- **The owner's cases, both passed:** the network killed mid-search showed the banner in 3 s,
  remembered results and Add manually. A searched book showed its real cover and metadata after
  a cold start in airplane mode.
- **Found on the phone and fixed:** offline search showed a broken-database error (item 17
  above).
- **Google Books is on and verified on the phone:** the owner's key is in `.env`, restricted to
  the Books API only. Restricting it to the app would break search until `api.ts` sends the
  Android headers (Slice 11). Tests run on real Google captures; 321 tests pass.

**Next: the batched phone session** — the device pass re-run, Slice 5's two leftovers and all
of Slice 5b (`docs/device-checks/slice-5b.md`). **Then Slice 6, the timer**, which has a hard
two-week limit written down before it starts.

**Slice 3 is built and verified on the phone, except four checks that need the owner to change
phone settings.**
- **What it does:** log a session for any past date and time (Android's pickers), edit and
  delete it from book detail, Session complete with streak and time left, the Continue pill and
  Log pages, sessions in Recently Deleted, a 14-day pace chart on Stats, and the forced-failure
  switch.
- **Checks:** 249 tests pass under `cmd` and `sh`, and 85 in each of three time zones.
  Typecheck, lint and Prettier are clean. Device pass RUNTIME 29/29 · COMPILE-TIME 1/1, with
  check 13 watched failing three ways.
- **The backdated edit holds on the phone, all ten steps:** 11 pm last Tuesday, then 4 am
  Thursday, then today. `local_day` and the pace bars followed each move, and the pulled
  database agreed.
- **Found on the phone and fixed:** Undo did not redraw the screen under it (item 16 above), a
  deprecated picker callback raised LogBox, skeleton rows showed under an error, and last
  year's sessions lacked their year.
- **Owner's settings, 2026-09-14:** light mode, a 320 dp display at 1.3x font, and
  Pacific/Pago_Pago all checked. Library rows and Recently Deleted titles lost their labels and
  were fixed. An 11 pm session, which is the next day in UTC, kept its own `local_day`.
- **Still open:** 200% font. The phone's Display setting tops out at 1.3; Accessibility → Display
  size and text should reach 2.0. 253 tests pass.

**Slice 2 is built and verified on the phone** (Nothing Phone 2a) against a 2000-book sandbox
library: the Library's status tabs, book detail with sessions and earlier reads, the actions
sheet (move, re-read, remove with confirm), the undo toast, and Recently Deleted with restore.
Typecheck, lint, Prettier clean. **185 tests pass under both `cmd` and POSIX `sh`**, 34 in
each of three time zones. Device pass: **RUNTIME 28/28 · COMPILE-TIME 1/1** on `devcheck.db`,
with the library's md5 unchanged.

**Owner-requested review, 2026-09-13, fixed and verified** (details in `DECISIONS.md`):
- **Release builds ignore the sandbox and device-pass flags** (`lib/databaseChoice.ts`).
  The sandbox is now `sandbox.db`.
- **A book is listed once, on its current read** (`db/currentRead.ts`, device check 12,
  watched failing twice). Re-read only after finished or DNF.
- **`Sheet` had stopped opening:** a React render-phase update lost to a skipped no-op
  update. An open sheet now renders from `visible` alone (`ui/sheetMount.ts`).
- **Also:** tabs never show another tab's rows, one query per open, double taps are one
  tap, InlineError contrast, one audiobook definition, a seed that refuses to double.
- **Seen on the phone, light mode:** empty library, empty Recently Deleted and empty DNF;
  seed refusal; double tap; the sheet 10/10; re-read (hero, Earlier reads, one row on
  Reading, database agrees); the not-in-library deep link.
- **Not seen, deferred by the owner and filed:** failure renders, and 200% font, 360 dp
  and dark mode for the new states, are **required before Slice 3 is done**. TalkBack goes
  to Slice 11. See `05-BUILD-PLAN.md`.

**Slice 2, measured:**
- **60fps holds on a release build:** p95 15 ms, and 1 missed deadline in about 5,700
  frames flinging 1,040 rows. 120 Hz does not hold.
- **Tab queries:** 42–251 ms at 2000 books, under the 400 ms skeleton threshold.
- **Slow bulk writes, filed against Slice 9, before import:** a 500-session book deletes in
  701 ms and restores in 1188 ms (debug). The 2000-book seed takes 146.7 s.

**New since Slice 1:**
- `EXPO_PUBLIC_SANDBOX_DB=1` for a seeded library that is not yours, in `sandbox.db`,
  development builds only.
- `writeBatch`.
- Migration `0001` tested against a populated v1 database under node, with a positive
  control.
- Device check 10 holds the SQL progress aggregate equal to `domain/stats.ts`, and was
  watched failing.
- Found on the phone and fixed: tabs kept each other's scroll position, a missing author
  left a blank line, and same-instant sessions listed backwards.

**2026-09-12, the last review of this slice** (one pass per slice from here — see the rule
above):
- **The device pass has its own database.** `EXPO_PUBLIC_DEVICE_PASS=1` opens `devcheck.db`
  and `backups-devcheck/`; without it the pass refuses. Check 0 refuses to vouch for
  anything if it is not on its own file, and was watched failing.
- **The Fabric crash is measured, not argued: 0 in 220 launches** — 100 debug, 100 release,
  and 20 under the suspected trigger (a freshly started Metro each time). Against ~2 in 15
  on 2026-09-10. Not a blocker, not closed: a 0/20 cannot tell "fixed" from "rarer than
  1 in 20", and the code changed in between. `DECISIONS.md` has the numbers and the caveats.
- **The first release build ever produced**: 112 MB universal, 23.3 MB of arm64 native
  libraries, minify and resource shrinking off. The `< 15 MB` budget is now a measured
  problem with a plan, filed against Slice 11. A local release build needs
  `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- **Regression rules adopted**, with the audit of which past bugs still have no automatic
  check. Every textual guard now carries a positive control; three new guards (`config.ts`
  env reads, the `test:tz` list, device check 1c for `created_at`) were each watched failing.

**Review fixes, 2026-09-10 evening, each verified and watched failing:**
- **Backups only when a migration is pending.** A failed migration is verified as rolled
  back, not file-restored. Failure notices carry their own next step, e.g. "free up N MB".
- **`npm test` quotes its glob,** held there by a guard.
- **`runInTransaction` rejects an async task.** The guard covers every way to open a
  transaction.
- **`local_day` is derived by the write path.** `updateRow` takes `PatchFor<K>`, and
  `exactOptionalPropertyTypes` is on.
- **Restore never orphans a row.** Refusals say why. Undo returns a `Result`, and the toast
  reports a failure. The delete-book copy is true.
- **Sessions count by the owner's rule:** timed and recovered sessions count in hours,
  never unusable. `from_position` is the page finished before the session.

**Post-review fixes, 2026-09-10, verified on the phone:**
- **The recovery sheet no longer invents a duration.** A 9h-old session shows an empty
  field and asks. A 41m one pre-fills 41. 600 is refused. 25 saved as 1500 s with one
  upsert. Discard soft-deleted with one delete.
- **`Sheet` now rises above the keyboard.** It was hidden behind it, which the phone
  showed.
- **Try again keeps the notice on screen while it retries.** The retry ran, as a third
  report, and no blank screen appeared. The busy label was too brief to screenshot.
- **Brand identity is one file**, `src/ui/brand.json`: accent, grounds, typeface. Every
  accent variant is derived; the font name is shared with app.config.ts, and a test fails
  if they diverge.
- **Every new guard was watched to fail:** 13 of 13 mutations went red, and a lint probe
  raised all five new rules.

**Seen on the phone, by screenshot and by behaviour:** cold start to the empty Library in
Plus Jakarta Sans; tabs switch; Settings opens and closes; the recovery sheet appears for an
open session, Save writes the duration and queues one upsert, Discard soft-deletes and
queues one delete, and neither brings the sheet back; the live Cloudflare flag is fetched;
a blocking flag shows the update screen and Update now opens the Play Store; a corrupted
migration shows the failure notice, Try again genuinely retries, and the database survives.
(The update screen and failure notice are confirmed by view tree and behaviour; their two
screenshots were corrupted by a PowerShell redirect.)

**Fixed today because the phone showed them:** `android/` was a week stale, so fonts, the
splash config and the Sentry plugin were in no build — now `npm run prebuild` before any
native rebuild after a config change. LogBox's dev-only toast swallowed taps in Modals and
over the tab bar, and a routine warn of mine raised it every launch. Metro crashed when
started during a Gradle build — Gradle output is now blocked from its watcher.

**Open:** the Fabric SIGSEGV (`pullTransaction`, a jump into heap memory), seen twice on two
devices on 2026-09-10 and **not reproduced in 220 measured launches on 2026-09-12**. Watch
it, do not close it: Sentry's native reporting must be on for release builds, and the loops
in `DECISIONS.md` are reusable if it recurs. Log in `docs/crashes/`. Gate 3 (restore) waits for sign-in in Slice 8. Settings holds only the
version and the dev device-pass button.

See `docs/05-BUILD-PLAN.md`.

Update this line at the end of every slice.

## Environment

`docs/09-ENVIRONMENT.md` holds the toolchain setup, the two Metro workarounds that will
otherwise waste an hour each, and **how to run the device pass**. Read it before building
on a new machine or running anything on a device.

Two things from it that bite immediately: **Metro's file watcher does not work here**, so
every source change needs `npx expo start --dev-client --clear` or you are testing stale
code that looks like a pass; and **a dependency named in `app.config.ts` or
`babel.config.js` is used even though nothing imports it** — `src/__tests__/config-deps.test.ts`
guards that.

**Any input in a sheet must be checked on a phone with the keyboard open.** Android does
not resize an edge-to-edge Modal for the keyboard. `Sheet` handles it, but a hand-rolled
`Modal` or a full-screen form does not. This will recur in most of Slices 3, 4, 5 and 5b.
`09-ENVIRONMENT.md` has how to drive and inspect a phone from a script, and how to edit its
database when it has no `sqlite3`.
