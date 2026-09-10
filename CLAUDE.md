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
```

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

**Slice 1 is verified on a physical phone** (Nothing Phone 2a, Android 16, arm64 — the first
arm64 build, earlier than Slice 6 planned). Typecheck, lint, Prettier clean. **129 tests
pass under both `cmd` and POSIX `sh`**; every count before 2026-09-10 was Windows-only (see
item 13). Device pass on the phone: **RUNTIME 23/23 · COMPILE-TIME 1/1**.

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

**Open:** a native SIGSEGV in React Native's Fabric renderer (`pullTransaction`, a jump
into heap memory), now seen **twice, on two devices**, both on the first cold start after
the bundle's source changed. A release-build run alone will not settle it. The plan is a
100-launch loop per build type, before Slice 2 dogfooding (`DECISIONS.md`, log in
`docs/crashes/`). The fragile-list triage from the 2026-09-10 review is pending the
owner's call. Gate 3 (restore) waits for sign-in in Slice 8. Settings holds only the
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
