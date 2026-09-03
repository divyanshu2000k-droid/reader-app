# DECISIONS

Running log. Every non-obvious choice, every gap found in the spec, every deviation.

**This is the most valuable file in the repository.** Around 8000 lines an AI assistant
stops being able to hold the whole codebase in context and starts breaking distant things.
This file is how it gets the thread back. Two or three lines per entry is enough. Skipping
it costs far more later than writing it costs now.

---

## Format

```
## YYYY-MM-DD · Short title
**Chose:** what you did
**Over:** what you rejected
**Because:** the reasoning, one or two sentences
**Revisit if:** the condition that would change this
```

Use it for:
- Any library choice not already in `02-ARCHITECTURE.md`
- Any deviation from these specs, with the reason
- Any gap you found in the spec and how you resolved it
- Any workaround, especially native ones, with the thing it works around
- Anything that took more than an hour to figure out

---

## Seed entries

Copy the reasoning from the architecture doc so the log is self contained.

## 2026-09-03 · React Native with Expo over Flutter
**Chose:** React Native with Expo, latest stable SDK, TypeScript
**Over:** Flutter, native Kotlin, any web wrapper
**Because:** all code is AI written, and TypeScript output quality is meaningfully higher
than Dart. Web wrappers produce the exact slowness Hardcover and StoryGraph get reviewed
badly for.
**Revisit if:** hand coding ever becomes the norm, or widget and foreground service work
proves genuinely unworkable in RN.

## 2026-09-03 · SQLite with Drizzle over WatermelonDB
**Chose:** expo-sqlite plus Drizzle ORM
**Over:** WatermelonDB, Realm, AsyncStorage
**Because:** the model is genuinely relational and every meaningful query is a join or an
aggregate. Drizzle gives compile time typed queries, which catches a whole class of error
before it runs.
**Revisit if:** hand rolled sync becomes more painful than adopting Watermelon's model.

## 2026-09-03 · Supabase over Firebase
**Chose:** Supabase, Postgres plus Auth plus RLS
**Over:** Firebase, PocketBase, Turso, no backend
**Because:** same relational shape on both ends, auth included, and RLS means no API layer
to write at all. Free tier pausing is survivable because the app is local first.
**Revisit if:** free tier terms change, or sync needs outgrow last write wins.

## 2026-09-03 · Sessions as the atomic unit
**Chose:** book → read → session, with an editable date on every session
**Over:** book with start and finish dates, as every competitor does
**Because:** four documented competitor bugs are one modelling error. This makes all four
structurally impossible.
**Revisit if:** never. This is the foundation.

---

## Log

<!-- Add entries below, newest first -->

## 2026-09-03 · Slice 0 code review, findings 1 to 7 fixed
Self-review of the Slice 0 foundations before the device pass. Findings 8 and 9
(ProgressBar reduce-motion call, `useTheme` cast) deferred. Fixed with the context still
loaded, because 2 and 3 were a runtime crash and silent data loss rather than things
worth seeing fail.

**1 · The write path is typed by a registry, not by casts.**
**Chose:** `writeRow('sessions', row)` — tables addressed by SQL name through a
`SYNCABLE` registry, with `RowFor<K>` giving the exact insert shape per table.
**Over:** a generic `writeRow(table, meta, values)` that needed four `as never` casts to
compile.
**Because:** those casts were `any` wearing a hat, in the one function the whole sync
design rests on, in a project whose conventions forbid `any`. They are also what let
finding 2 compile. Passing the table by name removes a further error class: the queue's
`table_name` and the row's `id` now come from the same call and cannot disagree.
**One cast remains**, in `tableFor()`, because Drizzle's builder generics do not survive
indexing into a heterogeneous registry — a known query-builder limitation. It is
contained to one helper and the guarantee it erases is restored by `_shapeCheck`, which
fails to compile if any registered table lacks `id`, `updatedAt` or `deletedAt`.

**2 · `book_shelves` gets a UUID id and the full sync columns.**
**Chose:** drop the composite primary key; add `id`, `created_at`, `updated_at`,
`deleted_at`, plus a partial unique index on `(book_id, shelf_id) WHERE deleted_at IS
NULL`.
**Over:** keeping the composite key and excluding the table from the write path.
**Because:** it was registered as syncable while having neither an `id` nor
`deleted_at`, so `writeRow` would have emitted `onConflictDoUpdate` against a
nonexistent column and `softDelete` would have set a column that does not exist. Both
crash on the first shelf assignment in Slice 2. More importantly, a composite key would
have made a shelf assignment the only row in the app that cannot be soft-deleted, and so
the only destructive action with no undo. The partial index buys back exactly what the
composite key was for: one live assignment per pair, re-addable after a soft delete.
Migration regenerated.

**3 · The backup is WAL-safe. Belt and braces.**
**Chose:** `PRAGMA wal_checkpoint(TRUNCATE)` before the copy, **and** copy the `-wal` and
`-shm` sidecars. Prune deletes sidecars with their database; restore clears the live
sidecars before copying and restores the saved ones.
**Because:** `client.ts` sets `journal_mode = WAL`, where committed transactions live in
`reader.db-wal` until a checkpoint. Copying `reader.db` alone yields a backup missing the
reader's most recent sessions — and it looks like success, which is worse than no backup.
This is the one code path whose entire job is never losing data, so it failed at exactly
the moment it mattered. A checkpoint can still be partial if another connection holds a
read lock, hence the sidecars as well. An orphaned `-wal` beside a restored database
would be replayed on next open and could reintroduce the half-migrated state being rolled
back, which is why restore clears them first.

**4 · The colour lint rule now covers `src/ui/**`.**
**Chose:** extend the rule to the shared primitives, add an `rgba()` pattern beside the
hex one, and make `theme.ts` the sole exception. Moved `BookCover`'s six fallback hues to
`theme.coverFallbacks` and `Sheet`'s scrim to `theme.scrim`.
**Because:** the original rule covered only features and routes, leaving the shared
components — the files most likely to define a colour — unchecked. The hole sat exactly
where the violations were. Verified non-vacuous: a probe file with a hex and an rgba
literal in `src/ui/` fails the lint.

**5 · Migrations memoise the promise, not the result.**
**Because:** two components mounting in the same tick both saw `pending`, both called
through, and the app would take two backups and run two concurrent `migrate()` calls
against one database.

**6 · The source guard also covers the raw SQLite handle.**
**Chose:** `client.ts` no longer exports the expo-sqlite handle; the guard fails on
`openDatabaseSync`, `execSync` or `runSync` outside it, and asserts the export has not
returned.
**Because:** `sqliteDb.execSync('INSERT …')` bypasses Drizzle entirely and so slipped
past a guard that only looked for `db.insert(`. Also added a schema-level test asserting
every syncable table has an `id` and `...syncColumns` — the check that would have caught
finding 2 where the mistake is actually made. Verified non-vacuous by removing
`syncColumns` from `goals` and watching it fail.

**7 · The database opens lazily.**
**Chose:** `getDb()` opens on first use rather than at module import.
**Because:** opening at import is synchronous native work on the startup path against a
sub-2-second cold-start budget, and a failure there is an unrecoverable module-load crash
no error boundary can catch.

**Also · `Sheet` honours the motion tokens it claimed to.** It now animates with
`motion.sheetUp.duration` and `motion.scrimFade.duration` via Reanimated, with
`animationType="none"` so the Modal does not run competing timing, and `useReducedMotion`
zeroing both. Previously the comment cited the tokens and the code used the Modal's
default slide. A comment describing behaviour the code lacks is worse than no comment.
**Also · `theme.ts` gained `_lightMatchesDark`,** a structural check that light and dark
carry the same tokens, so a token added to one and forgotten in the other is a compile
error rather than something a cast hides at the call site.

## 2026-09-03 · When exactly a streak breaks
**Chose:** with D as the most recent day having a session, the streak is alive on D and
D+1 and zero from D+2. It breaks at **local midnight beginning D+2**, that is after one
full calendar day with no session. Exactly one grace day, never two. No session yesterday
and none today is broken.
**Over:** breaking at the midnight after D, which is stricter, and over a rolling 48-hour
window, which is fuzzier.
**Because:** breaking at the midnight after D punishes a reader for the hour they open
the app; two grace days stops meaning "consecutive". One grace day is the smallest rule
that is both honest and not a nag.
**Every boundary is a `LocalDay`,** so the midnight is the reader's, derived from
`sessions.local_day`. Never UTC: a reader in IST finishing at 23:00 would otherwise be
credited under the next UTC day, and one in Chicago reading at 19:00 would lose the day
they did read.
**Also fixed:** `lib/dates.addDays` used `Date.setDate`, which is not DST-safe. The
streak walks backwards with it, so an off-by-one there would break streaks twice a year.
Now uses date-fns. Covered by `src/domain/__tests__/streaks.test.ts`, which builds every
day from a real timestamp via `toLocalDay` so the tests fail if the bucketing ever
regresses to UTC.
**Revisit if:** readers report the grace day feels like cheating, which would be a
surprise.

## 2026-09-03 · Slice 0 spec gaps found and resolved
Small decisions made while building, each of which the specs left open. Recorded
together because none needs its own entry.

- **Percent complete returns `null`, not `0`, when the page count is unknown.** Missing
  page counts are the median case. A zeroed progress bar reads as "you have read
  nothing", which is a lie; `null` lets the UI show a raw page number instead.
- **Percent complete clamps to 1.** API page counts are frequently wrong, and a reader
  past the supposed last page should see a full bar, not 108%.
- **A session beyond the book's length is not an error.** `exceedsKnownLength` flags it
  so the UI can offer to correct the *book*. Never block a save on it: the page count is
  usually the thing that is wrong. Resolves an open question in `04-SCREENS.md`.
- **A streak survives today being unread.** It counts back from today *or* yesterday.
  Breaking it at midnight punishes a reader for the hour they opened the app, and this
  app never nags.
- **Lowering a goal below current progress reads as met**, with a `targetBelowProgress`
  flag, not as an error. Resolves an open question in `04-SCREENS.md`.
- **An "open" timer session is `is_timed = 1 AND duration_seconds IS NULL`.** Needed a
  definition now because launch gate 3 queries for it from Slice 1, before the timer
  exists.
- **Cover fallback colours are derived deterministically from the title**, from a muted
  palette that deliberately excludes the accent. A wall of gold covers would fight the
  one colour the design uses to mean "active".
- **`Button` debounces every press at 600ms.** "Double taps are idempotent" is a global
  rule in `04-SCREENS.md`; a double-tapped Save is a duplicate session, so the rule is
  enforced in the component rather than remembered per screen.
- **`SkeletonGate` enforces the 400ms rule structurally.** Anything faster shows no
  loading state at all. Easy to state, easy to forget, so it is a component.

## 2026-09-03 · Slice 0 toolchain deviations from the spec
Three places where reality differed from `02-ARCHITECTURE.md`. None is a product change.

- **ESLint pinned to 9.x.** `eslint-config-expo` is not yet compatible with ESLint 10:
  its bundled `eslint-plugin-react` crashes on the new rule context API. Pinned rather
  than dropping the Expo config, which carries the RN-specific rules.
- **`npm install` needs `--legacy-peer-deps`.** `expo-router` 57 pulls a Radix/`vaul`
  tree with peer ranges that npm 11 refuses. Expo's own installer papers over this;
  plain `npm install` of anything else does not.
- **Reanimated's Babel plugin is now `react-native-worklets/plugin`**, not
  `react-native-reanimated/plugin`. Framework mechanics, so the current toolchain wins
  over the spec, per the skill-precedence rule in `CLAUDE.md`.
- **Sentry is deferred to the end of Slice 0**, because it adds a config plugin and
  therefore needs a prebuild, which needs the Android toolchain. Nothing else depends on
  it. `app.config.ts` already reads the DSN from the environment.

## 2026-09-03 · Agent skills installed
**Chose:** `expo@claude-plugins-official` (25 skills), `building-react-native-apps@callstack-agent-skills`
(carries `react-native-best-practices`), and `supabase@supabase-agent-skills`, which is
first party from the Supabase org and covers RLS and Postgres performance for Slice 8.
**Over:** any Drizzle ORM skill. Everything available is single author third party
(`bobmatnyc`, `giuseppe-trisciuoglio`, `mindrally`, `jezweb`, `lobehub`), none first party,
and none address Drizzle's **Expo SQLite** driver, which is the rough edge
`02-ARCHITECTURE.md` actually warns about. A generic Postgres-flavoured Drizzle skill would
mislead more than help there.
**Note:** the Callstack skill is bundled inside the `building-react-native-apps` plugin, not
published as a plugin of its own. The widely quoted
`install react-native-best-practices@callstack-agent-skills` fails.
**Revisit if:** the Drizzle team publishes a first party skill, or the Expo SQLite driver
gets its own.

## 2026-09-03 · Local builds are primary, EAS is for releases
**Chose:** `npx expo run:android` is the day to day build, free and unlimited. EAS is for
release builds, plus **one development build kept as a fallback** if the local Android
toolchain gives trouble.
**Over:** "Development build via EAS on day one", as Slice 0 in `05-BUILD-PLAN.md` said.
**Because:** this resolves a real contradiction between `CLAUDE.md` and the build plan, in
favour of `CLAUDE.md`. Local builds cost nothing and iterate faster, which matters most in
the slices with the most rebuilds. The EAS fallback exists because the local toolchain is
the one part of this stack that can fail for environmental reasons rather than code
reasons, and being blocked on day one with no escape hatch is the worst version of that.
Both paths produce a **development build**; neither is Expo Go, which cannot load the
native modules this app needs.
**Revisit if:** local builds prove flaky enough that the EAS fallback becomes the habit, at
which point make it the default rather than running two paths.

## 2026-09-03 · Continuous native generation, `android/` is never hand edited
**Chose:** `android/` and `ios/` are generated by `expo prebuild` and are gitignored, which
they already were. Every native change goes through an Expo **config plugin**. No file under
`android/` is ever edited by hand, and none is ever committed.
**Over:** checking in the native folders and patching them directly, which is the path of
least resistance the first time something needs a manifest entry.
**Because:** a hand patched `AndroidManifest.xml` is silently destroyed by the next
`prebuild`, and the failure is invisible until a feature stops working on a fresh clone or
in CI. **This is precisely why the Slice 6 foreground service must be a config plugin**, and
why that slice is the hardest technical item in Phase 1: the difficulty is not the service,
it is expressing it as a plugin. `02-ARCHITECTURE.md` already predicted this.
**Consequence:** if a native change cannot be expressed as a config plugin, that is a signal
to reconsider the feature, not to reach for the manifest.
**Revisit if:** never, while the timer and any future widget are the only native surface.

## 2026-09-03 · Version control is the human's, not the assistant's
**Chose:** the assistant runs no git commands. Not `init`, `add`, `commit`, `branch`, `push`
or `checkout`. The `.git` folder in the working tree was created by the human and is left
alone. When something is worth committing, the assistant says so and stops.
**Over:** the assistant managing branches per slice, as `06-CONVENTIONS.md` describes.
**Because:** standing instruction from the human, who handles version control in a separate
terminal. `06-CONVENTIONS.md`'s git section still describes the intended *shape* of the
history, one slice per branch and why-not-what commit messages. It is now a description of
what the human does, not an instruction to the assistant.
**Revisit if:** the human says otherwise, explicitly.

## 2026-09-03 · `local_day` stored on sessions, the one exception to never storing derivations
**Chose:** a `local_day TEXT NOT NULL` column on `sessions`, `YYYY-MM-DD`, computed from
`occurred_at` in the device timezone at write time, indexed. Every day-bucketed aggregate
groups on it: streaks, daily pace, "today", monthly and yearly chart buckets. Nothing
anywhere uses `date(occurred_at)`.
**Over:** computing the bucket at query time from `occurred_at` plus a UTC offset.
**Because:** `occurred_at` is UTC, so `date(occurred_at)` yields a UTC day. In IST every
session before 05:30 files into the previous day; in US timezones every evening session
files into the next one. That silently breaks streaks, the pace chart and yearly totals at
the boundary, which are the three things the entire product thesis rests on. Passing an
offset into every aggregate is also correct, but it is a rule that must be remembered at a
dozen call sites and the one that forgets fails quietly. A column cannot be forgotten. It is
also directly indexable, which the offset arithmetic is not.
**Contract:** `local_day` is written whenever `occurred_at` is written, and never otherwise.
Insert and any edit of the date recompute it from the new `occurred_at` in the *current*
device timezone, because the reader is picking a day off a calendar and that is the day they
mean. Editing a note or a page count leaves it alone. `lib/dates.ts` owns the computation
and is the only place that performs it.
**Timezone change: existing rows are left exactly as they are.** The session happened on
that day for that reader. A flight to Tokyo must not retroactively move last Tuesday's
reading to Wednesday, and must not break a streak that was genuinely earned. The practical
argument agrees with the principled one: rewriting is a mass update that dirties every
session row and pushes the whole history through the sync queue, which is a large blast
radius for a cosmetic inconsistency nobody asked about. DST is the same rule, no special
case.
**Known open edge, resolved but worth naming:** `reads.finished_at` is a UTC integer with
the same hazard, so "books finished this year" can misfile a New Year's Eve finish. It does
not get a column, because it is a single value per read rather than a bucket key for
grouping. It is converted to a local calendar year through `lib/dates.ts` at the point of
aggregation, exactly as it is at render.
**Revisit if:** readers who travel regularly report that their history reads wrong, at which
point the fix is an explicit "recompute calendar days" action in Settings that they choose,
never an automatic rewrite.

## 2026-09-03 · `sync_queue` from Slice 0, with a no-op drain
**Chose:** the `sync_queue` table, the enqueue, and a drain that does nothing all ship in
Slice 0. Every write in the app enqueues from the first write onward. Slice 8 replaces the
no-op drain body and changes nothing else.
**Over:** building the queue in Slice 8 alongside Supabase, as the build plan implies.
**Because:** Slices 2 through 7 build essentially every write in the app. Retrofitting the
enqueue into a dozen working query functions in week fourteen means the ones you miss are
discovered as a reader's missing data, which is the one unforgivable failure in this
category.
**Enforcement, structurally rather than by discipline:** one `src/db/write.ts` exporting
`writeRow()` and `softDelete()`. They perform the table write and the `sync_queue` append in
a single transaction, both or neither. `queries.ts` files call these and never `db.insert`,
`db.update` or `db.delete` directly. `sync_queue` and `metadata_cache` are local only and
sit on an explicit non-syncing allowlist.
**The test that proves no path bypasses it,** two parts, because neither alone is enough:
1. **Source guard.** A test greps `src/` for `db.insert(`, `db.update(` and `db.delete(`
   outside `src/db/write.ts` and fails on any hit. Mechanical, instant, and catches a bypass
   at the moment it is written rather than at runtime.
2. **Behavioural.** For every syncable table, perform a write through the public query API
   and assert exactly one matching `sync_queue` row by `table_name`, `row_id` and
   `operation`. Then force the enqueue to throw and assert the table row was **not**
   inserted, which is what proves the transaction is genuinely atomic rather than two
   statements that usually both happen to succeed.
**Revisit if:** never. This is cheap now and unaffordable later.

## 2026-09-03 · `updated_at` is stamped by the server, not the client
**Chose:** Postgres stamps `updated_at` on push, via a column default and trigger. The
server value is written back to the local row when the push succeeds. The client's local
`updated_at` is an optimistic placeholder, used only for ordering the outbox, and never
arbitrates a conflict. `last_sync_at` stores a server timestamp taken from the pull
response, never a local clock read.
**Over:** keeping client timestamps and clamping them to a server-provided window.
**Because:** last write wins compares timestamps, so with client clocks a phone whose clock
is a week fast wins every conflict forever, and one a week slow loses every one. Neither
failure is visible to the reader. A clamp needs a server round trip to learn the true time
anyway, so it costs the same and is strictly weaker. A trigger is four lines of SQL, which
is the same "no backend code to write" reasoning that chose RLS.
**The honest cost:** the arbiter becomes server receipt order rather than true edit order.
For one person with two phones, rarely simultaneous, that is "whoever synced last wins",
which is acceptable and safer than trusting a wrong clock.
**Consequence, and it is a rule not a detail:** a pull must **skip any row that has a
pending `sync_queue` entry.** The un-pushed local edit is the newer one and will become
authoritative on the next drain. Without this, a pull clobbers unsynced local work, which is
the never-lose-data directive broken by the sync layer itself.
**Note:** `occurred_at` and `local_day` still come from the device clock, deliberately. They
are user visible and user editable, so a wrong clock produces a wrong date the reader can
see and correct, rather than a silent conflict outcome they cannot.
**Revisit if:** real multi device conflicts appear often enough to want true edit ordering,
at which point the answer is a per-row Lamport counter, not client wall clocks.

## 2026-09-03 · Timer fallback shape, decided before the timer is started
**Chose:** write the whole cut now, not just the two week deadline. If the foreground
service is not working two weeks into Slice 6, the following happens as one commit and the
timer moves to v1.1:
- **Launch gate 3 stays in the sequence** as a live code path. "Open session" is defined as
  `is_timed = 1 AND duration_seconds IS NULL`. With no timer nothing can create one, so the
  gate queries, finds nothing, and passes through invisibly. Keeping it costs nothing and
  lets 1.1 re-enable recovery without touching launch ordering.
- **The Reading screen is not built.** The `Reading*.dc.html` artboards go unused in v1. The
  "Start timer" secondary button does not render on the Library dock or book detail, so the
  single entry point to a session becomes Log session, which already works and is the
  differentiated feature regardless.
- **No notifications at all in v1.** The permission priming step in Journey B and the single
  notification toggle in Settings both come out, and the app requests no notification
  permission. That is a real simplification, not only a loss.
- **Off the store listing:** distinctive feature 6, "Timer controls on the lock screen", and
  the word "timer" from the free tier list in `08-MONETISATION.md`. The six positioning
  sentences in `01-PRODUCT.md` survive untouched; none of them mention the timer, and
  "Forgot to start the timer? Log it in four seconds" is about manual logging and stays.
- **Schema unchanged.** `is_timed` and `duration_seconds` remain, always 0 and NULL. Adding
  the timer in 1.1 needs no migration.
- **Analytics unchanged.** `session_logged.method` simply only ever emits `manual`.
**Over:** deciding any of this in week fifteen, under time pressure, having already sunk two
weeks into the config plugin.
**Because:** the two week rule is right, but "ship without it" is not the clean cut the build
plan implies. Launch gate 3, the States sheet notification and the Settings toggle all hang
off the timer. Naming the fallback now is what makes the deadline honourable later.
**Revisit if:** never, for the deadline itself. Same rule that took widgets off the Plus
list: do not sell a feature that does not exist.

## 2026-09-03 · Doc numbering: there is no `07-`, and it stays that way
**Chose:** leave the `07-` slot vacant, document the vacancy in `00-START-HERE.md`, and add
`PREMORTEM.md` to the reading order table. Corrected `05-BUILD-PLAN.md` from "Eleven slices"
to twelve numbered slices, 0 through 11, plus Slice 5b, thirteen work items in total.
**Over:** renaming `08-MONETISATION.md` to `07-MONETISATION.md`.
**Because:** three files cross reference `08-MONETISATION.md` by name, and renaming buys
nothing but churn and a chance to miss one. A documented gap is not a defect.
**Revisit if:** a genuine seventh document is ever written.
