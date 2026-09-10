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

**A native rebuild is required** after changing `app.config.ts` — the embedded fonts live
there. Metro alone will not pick it up.

Build locally for day to day work. EAS is for release builds only.

## Current state

**Slice 1 built; three of its four done conditions verified on the emulator, one blocked
by tooling.** Typecheck, lint and Prettier clean; 72 tests pass, including 35 asserting
that the force-update kill switch cannot lock anyone out.

**Verified on device:** launches to the empty Library with the tab bar and a Settings
button; the remote flag shows the update screen, and wins over a pending session
recovery; a corrupted migration shows "Could not open your library" with Try again,
reports the real error, and leaves the database intact; an open timed session shows the
recovery sheet.

**Not verified by me — needs a human at the emulator:** tabs switching, the recovery
sheet's buttons, Settings navigation, and Try again. `adb shell input` taps do not reach
the app on this emulator (the same failure the Slice 0 pass hit), and both `adb
screencap` and the emulator's framebuffer capture return black while the view tree holds
the right content, so no screen has been seen by eye either.

**One open item:** a single native SIGSEGV inside React Native's Fabric renderer on one
cold start, not reproduced in four more. See `DECISIONS.md`, 2026-09-10.

**Needs the owner:** a Sentry DSN and a deployed kill-switch URL, both optional. See
`docs/09-ENVIRONMENT.md`. Gate 3 (restore) is a slot until Slice 8 adds sign-in.
Everything to date is x86_64 emulator only.

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
