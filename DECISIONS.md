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


## 2026-09-03 · Slice 0 runs on a device. Two more missing dependencies found.
**Verified on the Pixel 7 emulator:** the app launches, renders from theme tokens
including the radial glow, opens the database and reports `schema v1`, which is Slice 0's
acceptance criterion. `libexpo-sqlite.so` loads, and `reader.db`, `reader.db-wal` and
`reader.db-shm` all exist in the app's private storage.
**`babel-preset-expo` was missing.** `babel.config.js` named it but it was never a direct
dependency, so Metro's transformer failed to construct and every bundle returned HTTP 500
with a misleading `Cannot read properties of undefined (reading 'transformFile')`. The
real error only surfaced via `npx expo export`, which prints the underlying
`Cannot find module`. Installed as a devDependency.
**Why both this and the MMKV miss happened:** `npm install --legacy-peer-deps` was needed
throughout because of the `expo-router`/`vaul` peer conflict, and it does not enforce peer
dependencies. Anything a config file names must be installed explicitly. **When a bundle
fails with a confusing Metro internal error, run `npx expo export` — it reports the real
cause.**
**Confirms the WAL backup fix was necessary, not theoretical:** `reader.db` is 4 KB while
`reader.db-wal` is 148 KB. A plain file copy of `reader.db` alone would have captured
almost nothing. See the WAL-safe backup entry.

## 2026-09-03 · MMKV deferred to the slice that first needs it
**Chose:** removed `react-native-mmkv` from dependencies. It will be added back, together
with its required peer `react-native-nitro-modules`, in the slice that first stores
something in it — Slice 8 for `last_sync_at`, or Settings, whichever lands first.
**Over:** installing `react-native-nitro-modules` now to satisfy the peer.
**Because:** MMKV v4 requires the Nitro Modules native framework, and the build failed on
exactly that: `Project with path ':react-native-nitro-modules' could not be found`. Nothing
in `src/` imports MMKV yet, so installing it now adds native build surface and a new
failure mode to every build in Slices 0 through 7 in exchange for nothing.
**ADR 006 is unchanged.** MMKV is still the choice for small key-value settings; this only
defers *installing* it until first use.
**Lesson:** the dependency was added in Slice 0 because the architecture doc names it, not
because anything needed it. Install a native dependency in the slice that uses it, not in
the slice that anticipates it.
**Revisit if:** Nitro Modules proves troublesome at Slice 8, in which case
`expo-secure-store` or a small SQLite settings table is the fallback, and `last_sync_at`
deliberately living outside SQLite is the only constraint to preserve.

## 2026-09-03 · CORRECTION to the entry below: AF_UNIX was never broken
**What was actually wrong:** AF_UNIX connect fails **only** when the socket path is the
8.3 short-name form of the temp directory (`C:\Users\DIVYAN~1\AppData\Local\Temp`). Tested
against `C:\afx` and the project directory, connect succeeds. The assistant's shell has
`TEMP` set to the short-name form; a normal user terminal has the long form, where Gradle
starts fine and builds run normally.
**So the machine was healthy the whole time.** The `netsh winsock reset` and reboot were
not needed, and the entry below over-diagnosed a tooling-environment quirk as a
Windows-level fault. `scripts/CheckJavaLoopback.java` inherits the same short `TEMP`, so it
reports FAIL even on a healthy machine — run it with
`java -Djava.io.tmpdir=C:\Temp scripts/CheckJavaLoopback.java` to get a true answer.
**Lesson worth keeping:** a failure reproduced only inside the assistant's own shell is a
claim about that shell until it is reproduced in the user's.

## 2026-09-03 · BLOCKED: Windows AF_UNIX is broken, so no Gradle build can run
**SUPERSEDED — see the correction directly above. The diagnosis in this entry is wrong.**
**Symptom:** every Gradle invocation dies with
`java.io.IOException: Unable to establish loopback connection`, before compiling anything.
**Root cause, traced rather than guessed:** JDK 17+ on Windows builds the NIO Selector's
wakeup pipe on an **AF_UNIX socket pair** (`WEPollSelectorImpl` → `PipeImpl` →
`UnixDomainSockets.connect0`). On this machine AF_UNIX **bind succeeds and connect fails**
with `SocketException: Invalid argument`. Gradle's daemon cannot start without a Selector,
so no build can start.
**What it is NOT,** each ruled out by test rather than assumption: not Gradle, not Expo,
not the project, not the sandbox (fails outside it too), not path length (TEMP is 36
chars, and overriding `java.io.tmpdir` / `jdk.nio.channels.unixdomain.tmpdir` to three
other directories changes nothing), not TCP loopback (plain sockets and NIO-over-TCP both
pass), not a third-party LSP (Winsock catalog is all Microsoft), not antivirus (Defender
only, no java firewall rules), not the JDK version (JBR 21 fails identically), and not
the selector provider (forcing the legacy `WindowsSelectorProvider` fails the same way,
because `PipeImpl` reaches AF_UNIX regardless). The `afunix` kernel driver is RUNNING and
its file is present.
**Diagnostic kept:** `scripts/CheckJavaLoopback.java`, runnable with
`java scripts/CheckJavaLoopback.java`. Prints PASS/FAIL for the five layers in the order
Gradle depends on them. Re-run it to verify any fix.
**Correction to an earlier claim in this session:** the first failure was called a
"first-run transient" on the strength of `gradlew -version` succeeding. That test was
invalid — `-version` never forks a daemon, so it proved nothing. The failure is
deterministic.
**Fix is the human's and needs admin plus a reboot,** so it is not done here:
`netsh winsock reset`, restart, then re-run the diagnostic.
**Fallback if it cannot be fixed:** EAS Build, which compiles in the cloud and does not
touch this machine's Winsock. This is exactly the contingency the build-strategy entry
reserved when it kept "one dev build as a fallback if the local toolchain gives trouble",
and `eas.json` already carries a `development` profile.
**Revisit:** as soon as the diagnostic prints ALL CHECKS PASSED, retry
`npx expo run:android`. Everything else in the toolchain is verified working.

## 2026-09-04 · Prettier owns formatting, with exactly one exemption
**Chose:** keep Prettier, add `.prettierignore` covering `src/ui/theme.ts` and the
generated migrations, format every other file, and add `format:check` so the state is
verifiable rather than aspirational.
**Over:** dropping Prettier and letting ESLint own formatting.
**Because:** `eslint-config-prettier` is already in the chain, and its entire job is
turning ESLint's formatting rules *off*. Dropping Prettier would leave nothing owning
layout until a stylistic plugin was added and configured — a new dependency and a new
config surface to buy back something already installed and working.
**The exemption is `theme.ts`, and it is deliberate.** Its scales are aligned columns:

    heading:     { size: 17, weight: '600', letterSpacing: -0.3, lineHeight: 22 }
    bodyStrong:  { size: 14.5, weight: '600', letterSpacing: -0.15, lineHeight: 20 }

Prettier collapses that to one space after each colon. The alignment is the point: the
file is a design system sheet expressed in code, and reading a scale as a table is how a
wrong value gets spotted. One exemption is a judgement; a second would be a pattern, so
argue for it before adding one.
**What was actually wrong before:** Prettier was installed, a `format` script existed, and
26 files did not pass — including files nobody had touched in weeks. Half-enforced
formatting is worse than either extreme, because every real diff arrives buried in
unrelated reflow.
**Revisit if:** the alignment in `theme.ts` stops being maintained by hand, at which point
the exemption is buying nothing and should go.

## 2026-09-04 · The specs now describe the code that exists
Documentation drift found while checking `docs/` against `src/` after the review. Each of
these was a doc asserting something the code had stopped doing, which is worse than
silence — the specs are the thing a future session trusts when its context is gone.

- **`03-DATA-MODEL.md` still described `book_shelves` with a composite primary key**, four
  months of decisions after it gained a UUID id, the full sync columns and a partial
  unique index. The doc described the exact shape that would have crashed `writeRow` on
  the first shelf assignment. Now documents the real shape *and* why the tidier relational
  answer was rejected.
- **Enum columns were documented as bare `TEXT`.** They carry `.$type<T>()`, which is what
  makes a database row assignable to its domain type without a cast. Added as a table,
  with the reason, because "it is just a string" is how the cast comes back.
- **The backup contract omitted all three device-found facts:** checkpoint the WAL and
  copy the sidecars, close the connection before restoring, clear the live sidecars first.
  The doc said "restore the newest backup"; the code correctly restores the newest backup
  *this build can read*. All four now recorded where the contract lives.
- **`06-CONVENTIONS.md` said "one transaction" without saying how that had been false.**
  Added the `runInTransaction` rule, why an async callback typechecks and silently commits
  early, and what the two source guards catch — plus why the substitute test passed.
- **`05-BUILD-PLAN.md` carried the scale work nowhere.** Slice 2 now owns the 2000-book
  seed, migrations at scale and the 60fps budget as one item, because they are only
  meaningful together. Slice 6 now states plainly that everything before it ran on an
  x86_64 emulator, that arm64 has never been compiled, and that OEM background-killing is
  first exercised there.
- **`04-SCREENS.md` promised an undo toast** without saying toasts queue, and required
  360px width without requiring 200% font scale.
- **`02-ARCHITECTURE.md` had no row for fonts** despite the theme naming a typeface.
- **`CLAUDE.md` said `npx tsc --noEmit`**, which now typechecks only half the tree.

**The pattern worth naming:** every one of these was a doc that was true when written. The
rule in `06-CONVENTIONS.md` — keep `docs/` current in the same commit as the change — is
the cheap version of this sweep, and this sweep is what it costs when the rule slips.

## 2026-09-04 · Slice 0 code review: twenty fixes, four of them silent data bugs

A full review of `src/` by a reader coming to it cold. Everything below was found by
reading against the specs rather than by anything failing — typecheck, lint and all tests
were green throughout. That is the whole point, and it is why the **silent-pass hazard**
now has its own section in `CLAUDE.md`.

### 1 · `writeRow` rewrote `created_at` on every update
**The bug:** `onConflictDoUpdate({ target: t.id, set: row })` was handed the caller's
entire values object, `createdAt` included. Every update therefore reset the row's
creation date to whatever the caller happened to pass. Editing a book's title six months
on silently moved it to today, and a library sorted by date added would quietly be wrong.
**Fix:** `RowFor<K>` now `Omit`s `createdAt`, `updatedAt` and `deletedAt` entirely. The
caller cannot supply them; `writeRow` stamps `createdAt` on insert only and `updatedAt` on
both, and the conflict `set` excludes the identity and the creation date.
**Why omit rather than ignore:** excluding `deletedAt` too means a delete cannot be
performed by passing `deletedAt` to `writeRow`, which would have enqueued an `upsert`
instead of a `delete` and skipped the cascade below.

### 2 · The schema guard asserted nothing for two of the seven tables
**The bug:** `no-bypass.test.ts` extracted a table's column list with a regex terminating
at the first `\n  }`. Tables written as `sqliteTable('x', { … })` — `shelves` and `goals` —
close with `})` at column zero, so the match ran on into the *next* table's body and found
that table's `id` and `...syncColumns`. Gutting `shelves` to a single column left the test
green. This is the guard that exists specifically to catch the `book_shelves` mistake.
**Fix:** brace matching instead of a regex — a regex cannot find the end of a nested
object — plus a second test asserting the extractor stops at the table it was asked for.
**Proven, not assumed:** each of the seven tables was gutted in turn, twice — once with no
`id` and once with no `...syncColumns` — and the guard was watched to fail all fourteen
times, then to pass again on the restored file.

### 3 · `softDelete` and `restoreRow` enqueued for writes that changed nothing
**The bug:** `UPDATE … WHERE id = ?` against a missing or already-deleted row succeeds
with zero rows changed, and the queue row was written regardless. Sync-queue replay
idempotency is on the must-test list in `06-CONVENTIONS.md`, and this is the case that
breaks its assumption.
**Fix:** the predicates gained `isNull(deletedAt)` / `isNotNull(deletedAt)`, which is what
makes `changes` trustworthy — zero now means "nothing to do" precisely — and both
functions return without enqueueing.

### 4 · `restoreNewestBackup` ignored the schema version in its own filename
**The bug:** backups are named `reader-<schemaVersion>-<unixMs>.db` and were selected
purely by timestamp. After a rollback to an older build — a halted staged release, a
reinstalled older APK — the newest backup on disk is from a schema this binary has never
seen. Restoring it hands the app a database with columns it cannot read, which is a worse
state than the failed migration being rolled back, in the exact situation where the reader
is already having a bad day.
**Fix:** `restoreNewestBackup(currentSchemaVersion)` takes the newest backup whose version
is `<= current`, and reports "No backup this version can read" when only newer ones exist.
`listBackups` now parses the name with a strict pattern and ignores anything that does not
match, rather than guessing an age from `split('-').pop()`.
**Also killed the sentinel.** `backupBeforeMigration` returned `ok({ name: 'none', uri: '' })`
on a fresh install and `restoreNewestBackup` had a matching `!uri` check — a second
outcome smuggled through the success branch, which every caller has to know about and one
will eventually forget. It now returns a `BackupOutcome` union of `made | skipped`; the
compiler found all four call sites.
**New device check 6b** asserts the direction that matters: given a compatible backup AND
a more recent incompatible one, the compatible one is restored.

### 5 · Soft delete now cascades. A deleted book stops counting.
**Chose:** soft-deleting a book soft-deletes its reads, their sessions, its notes and its
shelf assignments, in the same transaction, each with its own queue row. Restore reverses
exactly that set.
**Over:** leaving children live and filtering on the parent's `deleted_at` in every query.
**Because:** a book with `deleted_at` set and live sessions keeps contributing to every
statistic. The reader's yearly pages include a book that is no longer in their library and
no screen can explain the discrepancy — and a total that cannot be reconciled poisons
trust in every other total. "Remember to filter the parent" across a dozen `queries.ts`
files is the same losing strategy as "remember to enqueue", which is why `write.ts` exists
at all.
**How restore knows what to undo:** every row in one cascade carries the same
`deleted_at`, and restore clears only children matching the parent's exact timestamp. A
session deleted separately last week has a different one and stays deleted — undoing
"remove this book" must not resurrect something the reader meant to throw away. No new
column needed.
**Cost, accepted:** deleting a book with 500 sessions writes 500 queue rows. Correct —
each genuinely has to reach the server — and it is one transaction, so it stays one atomic
undoable action. A batch delete should raise one toast, not five hundred.
**Written into `docs/03-DATA-MODEL.md`** as its own section.

### 6 · Enum columns carry their unions; the hand-written duplicates are gone
**The bug:** `sessions.format` was a bare `text()` inferring as `string`, while
`ProgressSession.format` was `SessionFormat`. A row read from the database was therefore
*not assignable* to the domain type it describes, and the first `queries.ts` in Slice 2
would have needed a cast — under slice pressure, that is what it would have got.
**Fix:** `.$type<SessionFormat>()` and friends on `format`, `status`, `source`, `type` and
`sync_queue.operation`. The unions moved to the top of `schema.ts` as the single source
and the parallel re-declaration at the bottom is deleted. `06-CONVENTIONS.md` forbids
hand-written duplicates of schema types; that is exactly what they were.

### 7 · The Toast is a queue, not a slot
**The bug:** `present` replaced the visible toast wholesale. Deleting two sessions in
quick succession — the most ordinary interaction in a list — discarded the first delete's
undo before the reader could reach it. No warning, no trace, row already gone. Rule 2 says
undo on every destructive action, and the one component responsible was dropping them.
**Fix:** a FIFO queue; each toast gets its own full `rules.toastMs` window, keyed by id so
it never inherits the remainder of the previous one's timer.
**Deliberately not capped**, because dropping on overflow reintroduces the bug. A screen
deleting many rows should raise ONE toast whose undo reverses the batch; that is the
caller's job and it is written down in the file.

### 8 · The app now renders in Plus Jakarta Sans, for the first time
**The bug:** `font.family` has been in `theme.ts` since the first commit, `expo-font` was
never installed, and no component ever set `fontFamily`. Every string in the app rendered
in Roboto while the design system claimed otherwise, and nothing looked broken enough to
notice.
**Chose:** `expo-font`'s config plugin with `android.fonts[].fontDefinitions`, embedding
five weights at build time.
**Over:** `useFonts()` at runtime.
**Because:** the cold-start budget is under two seconds and a runtime load means either a
blocked splash or a visible reflow when the real face arrives. The `fontDefinitions` form
generates an Android XML font family, so one `fontFamily` plus a `fontWeight` resolves to
the right file — the plain `fonts: [...]` array does NOT do weight mapping on Android and
every weight would have silently rendered as whichever file loaded first.
**Applied through `typeStyle(font.token)`,** the only place `font.family` is set, and a
lint rule now bans bare `fontSize` / `fontWeight` / `fontFamily` in components. A
hand-written text style is how the family gets forgotten again.
**Requires a native rebuild** (`npx expo run:android`); it will not appear over Metro
alone.

### 9 · The lint rule covers spacing, radii and type sizes, not just colours
**The bug:** `CLAUDE.md` rule 3 names colours, spacing, radii *and* type sizes; the rule
checked colours. The other three drifted freely, and the shared primitives were the worst
offenders — a pill height of `34`, four inline radii, a dozen bare paddings, and four
components inventing font sizes as `font.body.size + 0.5`: a size that does not exist,
written so it reads as though it does.
**Fix:** bare numbers are banned on every spacing, radius and type property (zero is
allowed — it means "none", not a chosen value), and token-against-literal arithmetic is
banned outright. Every value it caught was named in `theme.ts`: `font.button`,
`font.buttonSmall`, `font.chip`, `font.input`, sixteen new `space` entries, four `radius`,
`size.pill`, `size.grabber`, `size.fieldMultiline`, and a `shadow` group.
**Deliberately allows `insets.bottom + space.bottomSafe`:** adding a runtime value the
theme cannot know to a token is the correct way to use one. Only literals are the hazard.
**Verified non-vacuous** against a probe file: four violations caught, and zero,
`flex: 1`, `borderWidth: 1`, `opacity` and `'100%'` correctly ignored.

### 10 · 200% font scale: the primitives were the thing breaking it
**The bug:** `rules.maxFontScale = 2.0` was declared and enforced nowhere, while `Button`,
`Chip`, `Field` and `Segmented` combined fixed heights with `numberOfLines={1}`. Every
label clipped at large font scale — the accessibility failure `06-CONVENTIONS.md` singles
out by name, baked into the shared components before a single screen existed.
**Fix:** `maxFontSizeMultiplier={rules.maxFontScale}` on every `Text` and `TextInput`;
fixed heights became `minHeight` with vertical padding, so controls grow instead of
clipping; single-line labels became two.
**Added to Slice 11 and to the pre-submit checklist**, because only real screens prove it.

### 11 · The domain surfaces bad data instead of swallowing it
**`sessionAmount` returned 0 for a backwards session.** A session typed as page 120 to 40
contributed nothing to any total, with no error, no flag and no way for the reader to find
the row responsible — their pages number was simply wrong and unexplainable. It now
returns `null`, `isBackwards()` names the case, and `ReadingTotals` carries an `unusable`
count so a total that excludes rows can say so. Silently discarding a row the reader
deliberately created is the worst of the three options.
**`currentPosition` returned 0 when it meant "nothing says".** For a read with only
audiobook sessions it reported page 0, so book detail would confidently print "page 0 of
502" for a book the reader was ten hours into. Now `number | null`, matching
`percentComplete` right beside it, which had this right all along.
**`dailyTotals` now delegates to `totals`** rather than re-implementing the sum, so the
unusable rule cannot be right in one function and wrong in the other.

### 12 · Smaller, but each one real
- **Missing indexes.** `reads.status` (the library list filters on it first), a partial
  unique on `(book_id, read_number)`, and `idx_books_title` / `idx_books_isbn` made partial
  on `deleted_at IS NULL` — they were the only non-partial indexes in the schema, so the
  index the library scans carried every book ever deleted. Migration `0001`.
- **`"types": ["node"]` was global,** putting `Buffer`, `__dirname` and `node:fs` in scope
  for app code: typechecks, lints, crashes on the device. Now `"types": []` with a separate
  `tsconfig.test.json` for the test files, and `npm run typecheck` runs both. Verified:
  those three are now compile errors in `src/lib/`. `process.env` remains legal because
  Expo itself declares it for `EXPO_PUBLIC_*`, which is correct.
- **`ScreenGlow` used a fixed SVG gradient id.** SVG ids are document-global, so two
  `Screen`s mounted at once — which happens the moment a sheet hosts one — collide and one
  wins for both. Now per-instance via `useId()`, stripped to word characters.
- **`test:tz` did not run `streaks.test.ts`,** the one suite where the timezone genuinely
  changes the answer, holding the DST case and every "11pm on the 31st" boundary. It ran
  only in whatever zone the machine happened to be in. Now a readable
  `scripts/test-tz.js`; 27 tests in each of UTC, IST and US Central.
- **`app.config.ts` hardcoded `#0B0A08`** for the adaptive icon, a copy of
  `theme.dark.ground` outside the lint rule's reach. It imports the token now.
- **Two stale doc pointers fixed.** `no-bypass.test.ts` referenced a
  `sync-queue.device.test.ts` that does not and cannot exist — Metro excludes `__tests__/`
  from resolution — and `DECISIONS.md` claimed `theme.ts` gained a `_lightMatchesDark`
  symbol that was never written. Both corrected in place, the latter with a visible
  correction note rather than a rewrite: this file is how context gets rebuilt, so a false
  claim in it is worse than a missing one.
- **`index.tsx` recomputed the device-pass tally** instead of calling `summarise`, leaving
  `summarise` dead and the runtime/compile-time split implemented twice — the exact drift
  back to one inflated number that the split exists to prevent.
- **The device pass left its seed behind.** Cleanup matched only `Devcheck%`, so every run
  left `The Overstory`, its read and its three sessions, and the next run's seed added
  three more. A device pass that grows the database it is checking produces counts that
  stop meaning anything. It now removes the seeded book too and asserts no orphaned reads
  or sessions survive — which doubles as the cascade's behavioural test.

**Deferred deliberately, all recorded where they will be seen:**
- Error boundary, Sentry and migration retry → **Slice 1**, written into
  `docs/05-BUILD-PLAN.md` with its own "done when". `runMigrations()` memoises its promise
  for the process lifetime, so today a failed migration cannot be retried without killing
  the app.
- `Sheet`'s scrim runs `withTiming` on an already-animated value, so reduce-motion only
  half applies → **Slice 11** polish. Cosmetic.
- 2000-book scale and FlashList tuning → **Slice 2**, unchanged from the earlier entry.

**NOT YET RUN ON A DEVICE.** Migration `0001` has never executed against a real database,
and `06-CONVENTIONS.md` forbids shipping a migration that has not run against a seeded one.
Device checks `6b` and `7` are new. The next device pass is a gate on Slice 1, not a
formality.

<!-- Add entries below, newest first -->

## 2026-09-03 · THE WRITE PATH WAS NEVER ATOMIC. Caught by the real atomicity test.
**The bug:** `writeRow`, `softDelete` and `restoreRow` all used
`getDb().transaction(async (tx) => …)`. Drizzle's expo-sqlite driver is a **synchronous**
dialect, so `transaction()` is typed to take a sync callback. An `async` callback
typechecks — the return type is just `Promise<T>` — but the transaction **commits the
instant the callback returns its promise**, before any awaited statement has executed.
Every statement then ran outside the transaction and nothing rolled back.
**Impact:** the single most important guarantee in the data layer was false for the whole
of Slice 0. A failing enqueue left the table row behind: a row that exists locally and
never reaches the server. Silent, invisible, and only discovered on a new phone months
later — the exact failure `write.ts` exists to prevent.
**Why nothing else caught it:** it typechecks, it lints, it never throws, and both the
source guard and the FK-violation check pass. The FK check proves the transaction *aborts*
correctly when the first statement fails, which is a different and much weaker claim than
the second statement failing and rolling the first back.
**Fix:** `runInTransaction()` in `client.ts` wraps expo-sqlite's `withTransactionSync`,
and all three write functions now run their two statements synchronously inside it. The
public API stays async, so no caller changed.
**Guard added:** a source test fails on any `.transaction(async` anywhere in `src/`.
**The lesson, and it is the important one:** the substitute test the assistant wrote
instead of the specified one passed, and the specified one failed. "Close enough" test
coverage is how a false guarantee survives. When a test is specified in a particular
direction, write that direction.

## 2026-09-03 · Device pass counts are reported runtime and compile-time separately
**Chose:** `RUNTIME n/n · COMPILE-TIME n/n`, never a single combined figure.
**Because:** one check ("local-only tables are not writable") asserts a property the type
system guarantees and executes nothing. Counting it as a runtime pass inflated the number
to 13/13 when only 12 things actually ran. These counts have to stay trustworthy for
eleven more slices, and an inflated number is worse than a smaller honest one.
**Current:** RUNTIME 13/13 · COMPILE-TIME 1/1.

## 2026-09-03 · Known deferrals from the Slice 0 device pass
Recorded so they are not rediscovered as surprises later. None is a defect; each is work
that belongs to a slice that has the right context for it.

**1 · 2000-book scale is Slice 2's job, with FlashList.**
Nothing so far exercises a large library. Three separate requirements depend on it and all
land together in Slice 2: the 60fps scroll budget in `06-CONVENTIONS.md`, the
"migrations tested against a 2000 book seeded database" rule in `03-DATA-MODEL.md`, and
FlashList tuning. Testing scale before the list exists would measure nothing useful.
**Do in Slice 2:** extend the seed to generate 2000 books with realistic session counts,
and re-run both the migration and the device pass against it.

**2 · Real-device and OEM testing is Slice 6's job.**
Everything to date ran on an x86_64 emulator. The emulator cannot reproduce the thing that
actually matters — Xiaomi and Samsung killing background work — which is the single
highest-risk item in Phase 1 and the reason the timer has a two-week hard limit. An
arm64-v8a build has also never been compiled; only x86_64 has.
**Do in Slice 6:** first build to a physical phone, and the foreground-service testing that
`05-BUILD-PLAN.md` already requires.

**3 · `closeDatabase()` has no concurrency protection, and that is fine for now.**
`restoreNewestBackup` closes the connection while any in-flight `writeRow` still holds the
old handle. There is no lock. It is safe today only because the sole caller is
`migrate.ts` at startup, before any feature code runs.
**Revisit if** a restore ever becomes reachable from the UI — a "restore from backup"
button in Settings would make this a real race. At that point the answer is a module-level
mutex around the write path, not a retry.

**Also outstanding from Slice 0 itself:** Sentry, which needs a DSN, and verifying the
dev-only device-check trigger is absent from the release bundle (already a Slice 11
checklist item).

## 2026-09-03 · Device pass: 13/13, after one real bug it caught
Run on the Pixel 7 emulator via a `__DEV__`-only button. Full log in the session; summary
below.

**THE BUG IT CAUGHT — `restoreNewestBackup` silently did nothing while reporting success.**
Check 6 failed on the first run: after a restore, a row written *after* the backup was
still visible. On Android, deleting an open file does not affect the already-open file
descriptor — SQLite stays attached to the now-unlinked inode, so copying a backup into
that path has no effect on the running app, and subsequent writes go to the orphaned inode
and are lost at exit. `migrate.ts` calls this on a failed migration and then tells the
reader "Your library was restored from a backup taken moments ago", which would have been
a **lie**, in the one code path whose entire job is not losing data.
**Fix:** `client.ts` gained `closeDatabase()`, and `restoreNewestBackup` closes the
connection before swapping files. The next `getDb()` reopens from disk. Check 6 passes.
**This is the single most valuable thing the device pass produced.** It typechecked, it
lint-passed, it did not throw, and it was wrong. "Does not throw" is not "works".

**Assumptions in `backup.ts` verified against reality rather than assumed:**
- `Paths.availableDiskSpace` exists and returns a real number (4.5 GB). It is not null or
  undefined, so the 3x free-space guard actually guards something.
- The database really is at `.../files/SQLite/reader.db`, the path the code assumed.
- `File.copy` on the `-wal` and `-shm` sidecars works; the backup carries them.
- `checkpointWal()` genuinely drains the log: **wal 263712B -> 0B**, main unchanged. This
  is the WAL fix demonstrated, not argued: a bare copy of `reader.db` would have missed
  263 KB of committed data.
- `pruneBackups` keeps exactly three and leaves no orphaned sidecars (8 -> 3).

**Also verified:** every write leaves exactly one queue row; soft delete keeps the row and
enqueues a `delete`; restore clears `deleted_at`; a foreign-key violation rolls back both
the row and the queue entry, which is the atomicity proof; the seed leaves `started_at`
NULL and every `local_day` consistent with its `occurred_at`, with mixed pages/minutes on
one read.

**The dev trigger cannot ship.** `src/db/devchecks.ts` is reached only via `require()`
inside `if (__DEV__)`, which Metro drops from a production bundle. Not trusted — a Slice 11
checklist item verifies it by grepping the real release bundle for `DEVICE PASS START`.

## 2026-09-03 · Two Metro behaviours that cost an hour, worth knowing
**Metro's file watcher does not work on this machine.** Every source edit required a full
`expo start --clear` restart; without it Metro serves a stale bundle indefinitely and the
app shows old code with no error. Verify a change is actually live by grepping the served
bundle, e.g.
`curl -s "http://127.0.0.1:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true" | grep -c "some new string"`.
**Metro does not resolve `@/` path aliases inside `require()`,** only inside static
`import`. An aliased `require` typechecks cleanly and fails at runtime with
`Cannot find module`. Use a relative path in a dynamic require.
**Metro excludes `__tests__/` directories from module resolution.** The device checks
originally lived in `src/db/__tests__/deviceChecks.ts` and simply were not bundled — the
module silently did not exist. Moved to `src/db/devchecks.ts`. The no-bypass source guard
still passes on it, because it only uses `writeRow`/`softDelete` and `select`.

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
**Also · `theme.ts` enforces that light and dark carry the same tokens,** so a token
added to one and forgotten in the other is a compile error rather than something a cast
hides at the call site.

> **Corrected 2026-09-04.** This entry originally said `theme.ts` gained a
> `_lightMatchesDark` structural check. There is no such symbol and there never was: the
> guarantee is delivered by an explicit `Palette` interface plus `satisfies Palette` on
> each scheme, which is strictly better because it fails at the palette rather than at a
> call site. Left visible rather than rewritten, because this file is how context gets
> rebuilt and a claim about a symbol that does not exist sends the next reader hunting
> for it.

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
