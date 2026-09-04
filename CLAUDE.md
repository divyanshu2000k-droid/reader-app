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

Add a fifth if the theme counts: `font.family` was declared from the first commit and
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
```

`npm run typecheck` rather than a bare `tsc --noEmit`: the app compiles with `"types": []`
so Node globals are not in scope for code that runs on a phone, and the test files compile
separately under `tsconfig.test.json` where `node:test` and `node:fs` are legitimate. The
bare command only checks half of it.

**A native rebuild is required** after changing `app.config.ts` — the embedded fonts live
there. Metro alone will not pick it up.

Build locally for day to day work. EAS is for release builds only.

## Current state

Slice 0 complete and **verified running on a device**, then reviewed and repaired. The
app launches on the Pixel 7 emulator, renders from theme tokens, opens the database and
reports its schema version. Schema, migrations, the single write path with `sync_queue`,
theme, the ten shared components, path aliases, lint and the `lib/` + `domain/` modules
are all in place. Typecheck and lint clean; 34 tests pass, 27 of them across IST, US
Central and UTC.

**A code review on 2026-09-04 found and fixed twenty issues**, four of them silent data
bugs: `created_at` rewritten on every update, a schema guard vacuous for two of seven
tables, queue rows enqueued for writes that changed nothing, and a restore that would
happily load a backup from a newer schema than the running build. Soft delete now
cascades, the app renders in its actual typeface for the first time, and the lint rule
covers spacing, radii and type sizes rather than colours alone. Full detail in
`DECISIONS.md`, 2026-09-04.

**Outstanding before Slice 1, and both are real:**
- **Re-run the device pass.** Migration `0001` has never been executed on a device, and
  `06-CONVENTIONS.md` forbids shipping a migration that has not run against a seeded
  database. Checks `6b` (restore skips a newer-schema backup) and `7` (cascade cleanup)
  are new and have never run.
- **The third error tier does not exist.** Error boundary, Sentry and a migration retry
  are scheduled into Slice 1 in `docs/05-BUILD-PLAN.md`.

See `docs/05-BUILD-PLAN.md`.

Update this line at the end of every slice.
