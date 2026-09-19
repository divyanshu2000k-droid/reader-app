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

## 2026-09-04 · `expo-system-ui` is load-bearing despite nothing importing it. Do not remove it.
**The trap:** no file in `src/` imports `expo-system-ui`. It looks exactly like an unused
dependency, and the obvious tidy-up is to delete it.
**What it actually does:** it is what makes `userInterfaceStyle: 'automatic'` in
`app.config.ts` work. Without it that setting is silently ignored, the system colour
scheme never reaches the app, `useColors()` is stuck on one palette, and **light mode
stops existing**. Expo's prebuild warns about this once —
`userInterfaceStyle: Install expo-system-ui in your project to enable this feature` — and
then never again.
**Why it matters more than a missing dependency usually does:** both themes are a
free-tier promise in `08-MONETISATION.md` and a store-listing claim. Removing this package
breaks a shipped promise, and it breaks it **silently**: no typecheck failure, no lint
failure, no test failure, and the app still launches and looks fine in whichever theme the
emulator happens to be in.
**Rule:** treat a dependency named in `app.config.ts` or `babel.config.js` as used, even
when nothing imports it. This is the third instance of the same class of miss in Slice 0,
after `babel-preset-expo` and `react-native-worklets`, all three caused by
`npm install --legacy-peer-deps` not enforcing peers.
**Revisit if:** never, while `userInterfaceStyle` is `automatic`.

## 2026-09-04 · The debug APK is ~80 MB and that is not a problem
**Observed:** `app-debug.apk` is 79.9 MB. The budget in `06-CONVENTIONS.md` is `< 15 MB`,
so this reads as a fivefold overrun at a glance, and it prompted exactly that alarm once
already.
**Why it is expected:** a debug build carries an unminified JS bundle plus source maps,
the dev client and Hermes debugger, and every ABI, with no R8 shrinking and no resource
stripping. A release build minifies, shrinks, and splits per architecture so a user
downloads one ABI.
**The budget is a RELEASE budget.** Measure it at Slice 11 against a real release build,
not before. Judging a debug APK against it produces false alarm at best and pointless
optimisation at worst.
**Separately, and also mistaken for the app:** the ~1 GB that appears during the first
build is the **Android NDK** (`27.1.12297006`) installing into the SDK folder. It is a
build tool, not part of the app.

## 2026-09-04 · Environment and procedure now live in `docs/09-ENVIRONMENT.md`
**Chose:** a ninth document holding the toolchain setup, the Metro workarounds, and the
device-pass procedure.
**Over:** leaving them in `DECISIONS.md`, or nowhere.
**Because:** an audit of this session against the docs found every *decision* recorded and
every *procedure* missing. Nothing captured the JDK version and path, `ANDROID_HOME`, the
AVD name, that `cmdline-tools` has to be bootstrapped from a zip because `sdkmanager`
cannot install itself, or how to actually run the device pass — several hours of work,
recoverable only from a shell history that will not survive.
**The distinction worth keeping:** `DECISIONS.md` records *why* and must stay readable in
one sitting. `09-ENVIRONMENT.md` records *how*, is a recipe rather than an argument, and
may grow long without cost. A decision that also needs a recipe gets an entry in both.
**Revisit if:** the environment stops being a single Windows machine, at which point most
of that file becomes CI configuration instead.

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

## 2026-09-04 · Self-review of the review: four fixes in the never-lose-data path, three deferrals

A code review of the fixes made earlier the same day. Three of the seven findings were in
`backup.ts` and `client.ts` — the two files edited most, with the longest explanatory
comments, under the most confidence. Same pattern as every previous entry.

### Fixed now

**1 · Restore no longer deletes the live database before the replacement exists.**
It deleted `reader.db` and then copied the backup over it. A copy that throws — a full
disk, which is exactly the situation people restore in — left the reader with **no
database at all**, in the function whose only job is not losing data. It now copies to
`reader.db.restoring` first; the live files are only touched once a complete copy is on
disk beside them, and everything after that is delete-and-rename, which cannot run out of
space halfway. Staging deliberately lives outside `backups/` so `listBackups` never sees a
half-written file that looks like a backup.

**2 · A failed WAL checkpoint is a logged warning, not an aborted backup.**
`checkpointWal()` sat inside the fatal path, so any transient lock failed the backup, which
blocked the migration, which meant the app could never upgrade. The sidecars are copied
*precisely* so a partial checkpoint survives — the design was always "belt AND braces" and
the code made the belt mandatory, throwing away the fallback that existed for this. This is
why bug 3 that morning was catastrophic rather than a log line.

**3 · `appliedMigrationCount` no longer reports 0 for every failure.**
`catch { return 0 }` labels a full database as the oldest possible schema, so its backup is
named `reader-0-*.db` and every future build considers it safe to restore. That is the
identical bug this function was written to fix — reintroduced one function away, in the
same session, having just documented why it was dangerous. Only `no such table` means a
fresh install now; everything else throws, and `performMigrations` fails closed with a real
message rather than letting the promise reject and leaving the app on "opening database"
forever.

**4 · `softDelete` and `restoreRow` report whether anything changed.**
`Result<void>` made "deleted" and "there was nothing to delete" identical, so a caller
would show "Session deleted · Undo" for a delete that never happened. They now return
`Result<WriteOutcome>` with `changed`. Rule 2 promises an undo for every destructive
action, not a toast for every call. The device pass asserts both directions: a live row
reports `changed`, and restoring a live row or deleting a missing one reports no change and
leaves the sync queue untouched.

**Also, while in there:** `copy()` and `move()` return promises that this code never
awaited, so the assertions that followed were racing them. Switched to `copySync` /
`moveSync`, which is what the surrounding synchronous logic already assumed.

### Deferred, deliberately

**`writeRow` has no partial update → Slice 2, with the first edit screen.**
`RowFor<K>` requires every non-null column and the conflict `set` writes everything passed,
so changing a title means reconstructing the whole row, and omitting an optional field
nulls it. The fix is an `updateRow(table, id, patch)` that touches only supplied columns.
Deferred because the right shape is decided by the first real caller, and inventing it now
means designing against an imagined one. **Slice 2 must not work around this with
read-modify-write in a `queries.ts` file** — that reintroduces the lost-update race the
single write path exists to prevent.
**Revisit trigger:** the first edit screen.

**The cascade's cost is unmeasured → measure it in Slice 2 before deciding.**
`runInTransaction` is synchronous, so deleting a book with 500 sessions runs roughly a
thousand statements plus a SELECT per level on the JS thread. Against "tap to saved under
100ms" and 60fps scrolling that is a plausible jank source — but it is a guess, and the
2000-book seed lands in Slice 2 anyway. **Measure a 500-session delete there before
changing anything.** Optimising on suspicion would trade the cascade's per-row queue
entries, which sync genuinely needs, for a number nobody has looked at.
**Revisit trigger:** the Slice 2 scale pass.

**`cascadeRestore` keys on exact `deleted_at` equality → accepted, revisit if it fires.**
Two cascades within the same millisecond would cross-restore each other's children. Real,
and vanishingly rare: it needs two soft deletes of different parents in the same tick, which
the UI has no path to produce. The alternatives — a cascade id column, or a delete-batch
table — add a column and a concept to every syncable table to fix something no user can
currently trigger.
**Revisit if:** a bulk-delete path is ever added (Recently Deleted "empty all", an import
rollback), which would produce exactly that pattern.

## 2026-09-04 · The device pass caught three upgrade-breaking bugs. A fresh install tests nothing.

Migration `0001` had never run on a device. Run it did — first against a **populated v1
database**, seeded to look like real data plus the shapes that matter. Three separate
bugs, none of which a fresh install would ever have shown, and all three passed typecheck,
lint, 34 unit tests and Prettier.

### 1 · `0001` could never have run on a real reader's database
**Symptom:** `UNIQUE constraint failed: reads.book_id, reads.read_number`.
**Why:** the migration adds `UNIQUE (book_id, read_number) WHERE deleted_at IS NULL`. v1
enforced nothing, so two live reads of one book could both be numbered 1 — and real
databases will hold that, because nothing ever stopped it.
**Why it is not merely "fails safe":** failing closed protected the data, and the data was
byte-identical afterwards — verified by fingerprint, not assumed. But the app then stays
on the old schema **forever**, retrying the same doomed migration on every launch, with no
path out except reinstalling and losing the library. A permanently stuck app is not an
acceptable resting state for a never-lose-data product.
**Fix:** `0001` now renumbers duplicate live reads in creation order *before* creating the
index, and enqueues the repaired rows for sync first, while they are still identifiable —
the repair is what erases the evidence of which rows needed repairing. Verified on device:
`rd-b2` went 1 → 2, the untouched book kept its numbering, and the soft-deleted duplicate
was correctly left alone because the index is partial.
**Rule, now in `03-DATA-MODEL.md`:** a migration that adds a constraint must repair the
data violating it, in the same migration.
**The file was hand-edited after generation,** which our own convention permits only
because it has never shipped.

### 2 · Backups were stamped with the version they were migrating TO
**Symptom:** after the failed upgrade the backups directory held `reader-2-*.db` files
whose contents were v1.
**Why:** `backupBeforeMigration(SCHEMA_VERSION)` — the target version, not the version of
the data being copied.
**Why it matters:** the fix made hours earlier — never restore a backup from a newer
schema than the running build — reads its answer from exactly that number. Mislabelled, it
makes a v1 build refuse a backup it could read perfectly, and makes the filename describe
an intention rather than a fact. The guard was built on a value that was wrong.
**Fix:** `appliedMigrationCount()` in `client.ts`, so the name describes the contents.

### 3 · A `SELECT` locked the database and broke the backup
**Symptom, seen by the reader:** "Could not back up your library before updating", and a
migration that would never run.
**Cause:** the fix for bug 2. Reading the applied-migration count through drizzle's
`.get()` left a read transaction open, and the very next step is
`PRAGMA wal_checkpoint(TRUNCATE)`, which cannot truncate the WAL while a reader holds a
lock: `NativeDatabase.execSync … database table is locked`.
**Fix:** `appliedMigrationCount()` uses expo-sqlite's `getAllSync`, which runs the
statement to completion and finalizes it.
**Worth keeping:** I introduced this bug while fixing another, and it was invisible to
every local check. Two fixes in a row landed in the same file and the second broke the
first — the device is the only thing that noticed.
**Also fixed, and it is why this was diagnosable at all:** the backup-failure branch
discarded `error.cause` entirely. It now logs it. Until Sentry lands that `console.error`
is the only place the reason exists, and without it the failure is just a sentence on a
screen.

### What passed
RUNTIME 14/14 · COMPILE-TIME 1/1, including the two checks written yesterday and never
run: **6b** (restore skips a newer-schema backup: restored v2, skipped v3) and **7**
(cleanup leaves no orphaned reads or sessions). The WAL fix demonstrated again — `wal
321392B → 0B` across a checkpoint, main file unchanged. The soft-delete cascade verified
in the database rather than asserted: book, read and all three sessions carry one
identical `deleted_at`, which is the cascade signature.

Every row of the populated database survived every step: 4 books, 7 reads, 7 sessions,
shelf, assignment and note, before and after.

### Two things that are NOT app bugs, recorded so they are not re-diagnosed
- **`adb shell input tap` does not reach the JS handler**, with or without window focus,
  with `tap`, `touchscreen tap` or a zero-length `swipe`. ANR dialogs appeared twice with
  reason "Input dispatching timed out (Application does not have a focused window)" — but
  thread dumps taken at the time show **both the main thread and `mqt_v_js` idle in their
  loopers**, so there is no evidence of an app-level hang, and the pass itself ran to
  completion in ~40s. Treated as emulator/dev-client input friction, not an app defect.
  If it turns out to be one, the evidence is here.
- **The mitigation is `EXPO_PUBLIC_DEVICE_PASS=1`**, which runs the pass on mount. Better
  than a tap anyway: a check suite that can only be started by a finger cannot be run from
  a script, and Slice 2 has to re-run this against 2000 books.

### The lesson, which is the same one as last time
A fresh install is not a test of a migration. It has no rows to violate a new constraint,
nothing to lose, and nothing to restore. `06-CONVENTIONS.md` already said "never commit a
migration you have not run against a seeded database"; the rule was right and had simply
never been executed. It now says how, step by step.

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

## 2026-09-19 · FILED, not fixed: changing the system font size restarts the app
**Found by** the item 6 script, which changed `font_scale` with a timer running and reported
"NO CLOCK ON SCREEN" three times. The message was true and the diagnosis was not: the app had
restarted.

`MainActivity`'s `configChanges` lists
`keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize|assetsPaths`
— and **not `fontScale` or `density`**. So changing either destroys and recreates the
activity, the JavaScript process goes with it, and on the way back the launch gate finds an
open timed session and offers the recovery sheet. A reader who adjusts their text size mid
session loses the running timer and is asked to confirm a duration.

**Chose:** file it against Slice 11, the font pass, and do not change it today.
**Over:** adding `fontScale|density` to `configChanges` now.
**Because:** it is not a timer bug — it is app-wide, and it has been true since Slice 0. The
damage is bounded and honest: the session row is already written, the native heartbeat
carries the bound, and the reader is asked rather than told. Adding to `configChanges` means
React Native handles the change itself instead of restarting, which needs its own pass over
every screen that reads dimensions, and that is the font pass's job. Doing it at the end of a
long session, after the slice is otherwise green, is how the reintroductions in this file
happened.
**How rare is it:** a reader changes their system font size perhaps once. The same restart
also happens on a foldable's hinge and on an external display, neither of which is a v1
target.
**Revisit if:** Slice 11, or sooner if anything else turns out to trigger a density change.

## 2026-09-19 · TWO HEARTBEATS, because the JavaScript one never ran when it mattered
**Found by** instrumenting the heartbeat and reading logcat, after the 20-minute locked run
reported the service surviving and `lastBeatAt` frozen 12 seconds in.

    screen on, app in front       2 beats / 75s    <- correct
    screen on, app BACKGROUNDED   0 beats / 75s
    screen off, deep doze         0 beats / 6 min

React Native's timers are driven by frame callbacks, and a backgrounded app draws no frames.
**So the heartbeat — whose only purpose is bounding a kill that happens while the app is in
the background — had never once run in the background.** The foreground service keeps the
PROCESS alive; it does not make `setInterval` fire. Twelve node tests covered the arithmetic
and passed, which is silent-pass item 20 repeating one level down: the fix for "nobody calls
it" was a call that only ran where it was not needed.

**Chose:** the service beats on its own `HandlerThread` and writes the timestamp to
SharedPreferences; `recoveryBoundAt` takes the LATER of that and the stored one.
**Over:** `AlarmManager`/`WorkManager`, which are exactly what Doze defers; and dropping the
JavaScript beat entirely, which is kept as the fallback for a build without the module.
**Because:** a `HandlerThread` is an ordinary thread with its own looper — nothing to do with
frames — and Doze does not suspend a running foreground service's threads. Re-measured: the
native beat was **12 seconds old after six minutes of forced deep doze**.
**Revisit if:** the module is ever absent on a platform that still needs recovery.

## 2026-09-19 · The reader may record more than the app was alive for
**Found by** the `restricted` pocket run — "restrict background usage", which is what a
Xiaomi does by default to an app it does not recognise. Android demoted the foreground
service immediately and killed it **67 seconds** into the session.

That part cannot be prevented; the phone's owner asked for it. What was wrong was everything
afterwards. `recoveryPolicy.ts` capped the reader at `maxMinutes`, derived from the heartbeat
bound — so five minutes of reading could only be saved as one — and the sheet told them "It
started 1 minute ago", which was false.

**The invariant had been silently broken by Slice 6.** The cap rests on the sentence at the
top of that file: "nobody can have read longer than it". That is true of `now - occurredAt`,
which is wall clock and a real physical limit. It is **not** true of the heartbeat, which is
only how long the APP stayed alive. Changing the bound from one to the other in Slice 6
invalidated the rule the cap depends on, and nothing noticed because on a healthy phone the
two numbers are the same.

**Chose:** two numbers. `maxMinutes` is the wall clock since the session started — the only
genuine upper bound — and `suggestedMinutes` is the heartbeat bound, pre-filled. A third
piece of copy is used when they differ, saying the phone stopped the timer rather than
claiming "this is the most it could have been".
**Over:** letting the reader type anything (the session cannot have been longer than it has
existed), and keeping the tight cap (which loses real reading on exactly the phones this
slice is worried about).
**Because:** **the app is the authority on how long it was running; the reader is the
authority on how long they read.** The original rule — never write a number the reader has
not seen and accepted — is untouched. What changes is that the app no longer forbids them
from stating the truth.
**Checked by** six cases in `recoveryPolicy.test.ts`, watched failing with `maxMinutes` put
back on the heartbeat, and end to end on the phone by
`scripts/device/s6_restricted_recovery.py`: service killed at 67s, read for 2 minutes, sheet
said "2m ago", 2 minutes saved.
**Revisit if:** readers start logging implausible durations, which would mean the wall-clock
cap is too loose in practice.

## 2026-09-19 · The foreground service is a LOCAL EXPO MODULE, and it owns the notification
**Chose:** `modules/reading-service` — a Kotlin `Service` plus a ~90-line TypeScript wrapper,
autolinked from `modules/`, no new third-party dependency. Owner's call, asked and answered.
**Over:**
- **`@notifee/react-native`**, which has mature Android foreground-service support. Faster to
  land and less native code to own, but a large dependency for one capability, and it takes
  over notification handling from `expo-notifications` wholesale.
- **Invoking the two-week cut** from 2026-09-03. It is day 2 of 14; cutting on day 2 because
  the first phone run found a bug would be cutting out of surprise, not out of time.
- **Shipping the ongoing notification alone** and accepting a cached process. Tempting because
  the NUMBERS are safe either way — elapsed time is derived from timestamps, so a kill costs
  the running timer and not the reading — but that is an argument for the timer degrading
  gracefully, not for it being unprotected.
**Because:** a config plugin can only declare, and declaring is exactly what failed. A local
module lives outside `android/`, so `prebuild --clean` cannot wipe it; it is autolinked with
no third-party code; and it is boring and easy to delete, which is the standing test in
CLAUDE.md. Slice 6 rejected native code as "a native class to maintain, in a project whose
owner does not maintain native classes" — the actual alternative turned out to be not having
the feature and not knowing.

**The service owns the notification, and that is forced, not chosen.** `startForeground`
requires the service to hand Android its own notification, so a second one posted from
JavaScript would put two entries in the reader's shade. `ui/timerNotification.ts` is now a
wrapper, `ui/timerNotice.ts` holds the copy and the button identifiers as pure code, and the
buttons are native `PendingIntent`s — which they had to become anyway, because they must work
when no JavaScript is running.

**`expo-notifications` stays, for one thing only:** asking for `POST_NOTIFICATIONS`. Worth
keeping rather than hand-rolling a permission request, and the three hard-won notes about its
behaviour stay in `02-ARCHITECTURE.md` for whatever sends the next notification.

**`START_NOT_STICKY`, deliberately.** A service Android restarts by itself has no JavaScript
state behind it, so it would either show a frozen notification or invent a duration — and
inventing a duration on the reader's behalf is silent-pass item 9. The launch recovery gate
is the designed way back, and it bounds the session by the heartbeat instead of guessing.
**Revisit if:** iOS is ever in scope, where none of this transfers; or if Play review pushes
back on the `specialUse` justification, which is carried in the module's own manifest.

## 2026-09-19 · THE FOREGROUND SERVICE DOES NOT EXIST. It is a manifest entry pointing at nothing.
**Found by** item 1 of the Slice 6 run sheet, the twenty minutes with the phone locked, on
the first real-hardware run of the slice.

**The evidence, in the order it arrived:**
- `dumpsys activity services com.example.reader` → `(nothing)`. No service is running.
- `dumpsys activity processes` → `Proc # 4: cch b/ /LAST (previous-expired)`, and
  `/proc/<pid>/oom_score_adj` = **900**. That is a CACHED process: the first thing Android
  kills under memory pressure. A real foreground service sits at `fg` with an adj near 0.
- `expo.modules.notifications.service.NotificationForegroundService`, the class named in our
  manifest, **does not exist**. `expo-notifications@57.0.20` ships
  `NotificationsService.kt`, `ExpoFirebaseMessagingService.kt` and
  `NotificationForwarderActivity.kt` in that package, and nothing else. The string appears
  nowhere in `node_modules`.

**So the comment in `plugins/withReadingService.js` — "the class itself comes from the
library" — is false, and was never checked.** Nothing starts the service, and if anything
tried, Android would throw `ClassNotFoundException`. Declaring a `<service>` for a class that
is absent is silent: the manifest merges, the build succeeds, the app runs.

**What was actually built** is an ongoing notification with two working buttons. That is
worth having and it is not a foreground service. It confers no process priority at all. The
timer currently survives backgrounding only because Android has not yet needed the memory —
which is exactly the condition an emulator, and an idle test phone, always satisfy.

**This is silent-pass item 8 again** (the typeface, the splash and the Sentry plugin were in
the config and in no build) with a sharper edge: that one was config that did not reach the
build, this is config that reached the build and points at nothing. And it is why the run
sheet's item 1 was written as the highest-value hour in the slice. It earned that.

**Not decided here.** The options are a local Expo module wrapping a real Kotlin
`Service` (no new dependency, ~60 lines, survives `prebuild --clean` because local modules
live outside `android/`), a third-party module that provides one, or invoking the two-week
cut from 2026-09-03 — which is day 2 of 14, far too early. Written up for the owner rather
than chosen, because it is a dependency-and-scope decision, not a bug fix.

## 2026-09-19 · THE PHONE FOUND THREE BUGS IN THE PERMISSION FLOW, and the first is the worst
**Chose:** fix all three, and add the checks that fail without each fix.

The run sheet's item 0b said the priming sheet and the system dialog "have never been seen" —
every emulator run was handed `POST_NOTIFICATIONS` with `pm grant` before the timer started.
Driving it once on a real phone, on a fresh install, produced three failures.

**1. The notification never appeared at all, for the first session a reader ever times.**
The priming sheet is shown AFTER the timer starts, deliberately: the reader tapped Start to
start reading, not to answer a question about Android. So the first `showTimerNotification`
always runs with no permission and is refused. `renotify` was called from `adopt`, `pause`
and `resume` and from nowhere else, so **nothing ever retried it**. Measured: permission
granted, timer running, 60 seconds of polling, zero notifications. On Android that means no
foreground service — the exact thing the permission was asked for — for the whole of that
session, and nothing threw or logged.
**Fixed** by calling `renotify()` when the priming sheet is answered, and when `AppState`
goes `active`, which also covers a reader who grants it from Settings mid-session.
**Checked by** `scripts/device/s6_late_grant.py`, watched failing on the phone (step B waits
the full 40 seconds and finds nothing) and passing after (0 seconds).

**2. The `AppState` listener was still in the screen — audit finding 1, in the one listener
its own fix left behind.** The rewrite moved the tick, the heartbeat, the notification and
its action listener into `timerService.ts`, and left `useTimer` owning the `AppState`
subscription that beats just before the app is backgrounded. `useTimer` lives in the timer
screen, so that final beat only happened for a reader who was still LOOKING at the timer when
they backgrounded the app — and reading with a timer running is precisely leaving that
screen. The service's own 30-second tick hid it: only the last beat before a kill was lost.
**Fixed** by moving it into the service, registered on adopt and removed on release.
**Checked by** `src/features/timer/__tests__/runtime-not-in-components.test.ts`, which
asserts that nothing in `features/timer` except `timerService.ts` owns a `setInterval`, a
`setTimeout`, an `AppState` listener or a notification-response listener. Textual, so it
carries a positive control fed the exact code that shipped both versions of this bug. Watched
failing with the listener put back.

**3. "Not now" was not remembered, so the sheet came back on the very next timer.**
Measured on the phone: declined once, asked again immediately. The cause is a wrong question
rather than a typo. `shouldPrime` asked ANDROID whether Android would still prompt — but
"Not now" is deliberately never passed to Android, so the status stays `undetermined` and
`canAskAgain` stays true, and Android's honest answer is yes, forever. **Android cannot
remember an answer it was never given.** The file's own comment says "Nagging is how an app
earns a permanent denial", and the code nagged.
**Chose:** asked once, ever. The answer is stored in `metadata_cache` under a new
`notify_priming` key, local-only like every other row there, and dismissing the sheet counts
as declining.
**Over:** asking again after the reader had actually met a recovery sheet — better targeted,
and still nagging — and asking again after N days, which is nagging on a timer.
**Because:** the sheet's copy already says exactly what declining costs (more recovery
sheets, never a lost number), and Android's Settings is the way back. A reader who has said
no once has answered the question.
**Checked by** `primeDecision.test.ts` for the rule and `scripts/device/s6_prime_once.py` for
the wiring — both halves, because a unit test proves a function computes and never proves
anyone calls it (CLAUDE.md item 20, which cost this project the entire heartbeat feature).
**Revisit if:** readers report losing sessions and declining turns out to be the cause; the
place to re-offer would be the recovery sheet itself, which is where the cost is felt.

**What these three have in common, and it is the reason item 0b existed:** every one of them
is invisible to a test that grants the permission up front, which is every automated run this
slice has ever had. The emulator was not wrong; it was never asked the question.

## 2026-09-19 · A guard for the permission dialog, without weakening the one that matters
**Chose:** add `phone.dump_permission_dialog()`, which dumps ONLY
`com.google.android.permissioncontroller`, and leave `require_our_app()` exactly as strict.
**Over:** relaxing `require_our_app` to allow system packages.
**Because:** `require_our_app` exists because a run on 2026-09-18 continued while the owner
was in WhatsApp and put a private conversation into the session log. It refused the
permission dialog too, correctly — but that dialog is raised BY our app, shows our app's name
and two buttons, and is a ONE-SHOT: spend it and it never appears again short of a reinstall,
so it has to be driven rather than skipped. A separate function with a two-entry allowlist
gives that one case away and nothing else.
**Revisit if:** anything else ever wants to be added to `PERMISSION_UI`. The answer is
probably no.

## 2026-09-19 · Three owner decisions on the timer, asked and answered
**1 · An OPEN timed session is never pushed.** Sync rule 5 in `03-DATA-MODEL.md`, and rule 3
in `drainSyncQueue`'s contract: the push skips a `sessions` row with `is_timed = 1` and
`duration_seconds IS NULL`. That row is a timer running on THIS phone; pushing it would give
another device a session it reads as "still running", and its owner a recovery sheet for a
timer they are not holding. It goes up the moment it has a duration — the moment it stops
being device state and becomes a session.
**Over:** not enqueueing at Start, which makes the timer a special case in a write path whose
whole value is that there are no special cases. **Over:** syncing them with per-device origin
tracking, which does not exist and would put transient state on the server.
**Decided before sync was built**, so Slice 8 cannot discover it the hard way.

**2 · A book removed while its timer runs: the timer stops and says so.** Built and verified.
- The cascade already takes the session with the book. What was missing was the timer
  NOTICING: it went on ticking into a soft-deleted row, and `finishTimer` was refused by the
  parent guard — so the reader met an inline error at the END of a session, which is the worst
  possible moment to learn it was never going to be saved.
- `timerService` now subscribes to `db/changes.ts` and checks `isSessionLive` on every
  committed write. Gone means: stop, clear the notification, and remember why.
- The reader is told **"That book was removed. Your session went to Recently Deleted with
  <title>. Restore the book and the session comes back with it."** Which is true: restoring
  the book restores the session.
- **Over:** refusing to remove a book being timed, which adds a rule discovered at the worst
  moment. **Over:** silently finishing the session first, which writes a duration the reader
  never confirmed — the exact failure of silent-pass item 9.
- **Verified on the emulator, 5/5** (`scripts/device/s6_deleted_book.py`): notification
  cleared, message shown, database agrees with 0 open timed sessions.
- **Known and accepted:** the message lives in the service, so a process restart between the
  removal and reopening the timer shows the ordinary empty state instead. The session is in
  Recently Deleted either way.

**3 · The notification stays LOW-importance: silent and collapsed.** Pause needs one expand.
**Over:** raising it so the buttons show immediately, which lets Android pop a heads-up banner
over the page the reader is on — for a timer whose whole purpose is not to interrupt reading.
Revisit on the phone if the extra swipe annoys; it is a one-line change.

**A trap that cost two runs, already in the README and walked into anyway:** `pulldb.pull()`
force-stops the app, which wipes anything held in a module — including the message this check
was written to find. Check the database at the END, never mid-scenario.

## 2026-09-19 · Audit findings 4, 5 and 7 fixed
Three that needed no decision from the owner, done together.

**7 · zustand removed.** Named in `02-ARCHITECTURE.md`'s tech table since Slice 0 and imported
by nothing, six slices later. The app has reached the timer with React state, module
singletons and `db/changes.ts` and has never wanted a store. **Same rule as MMKV**
(`DECISIONS.md`, 2026-09-03): install a dependency in the slice that uses it, not the slice
that anticipates it. The architecture doc now describes what is actually there, and says to
re-add it the day something needs it. Lockfile diff: one package removed, nothing else moved.

**4 · `metadata_cache` now has a sweep.** `sweepLocalRecords` in `write.ts`, run once at
launch after migrations, behind everything that matters.
- **It is deliberately conservative.** A record goes only when its subject cannot come back: a
  run whose session is finished, deleted or absent; a draft whose note or book is gone. **A
  draft for a LIVE book is never touched however old it is** — a half-written note is the
  reader's, and "they have not come back to it" is not a reason to throw their words away.
- **It gates nothing.** A failure is a dev log; tidying up must not be able to stop the app
  opening.
- **`no-bypass.test.ts` caught the first version**, which put a `db.delete` in
  `localRecords.ts`. The guard was right: `write.ts` is the only file that writes, which is
  exactly why `saveLocalRecord` and the search cache already live there. `localRecords.ts` is
  keys only.

**5 · Device checks 19 and 20**, the first that touch a timed session at all — 36 checks had
none, while the timer writes through the same path as everything else.
- **19** holds the open/closed shape the launch recovery gate depends on: `is_timed = 1` with
  no duration while running, a duration once finished, `local_day` derived, and — the part
  worth having — **two heartbeats queue zero extra sync rows**.
- **20** holds the sweep in both directions, and the KEEP direction is the one that matters.
- **Both watched failing, 4 of 4** (`scripts/device/devpass_s6_mutations.py`), including
  "THE SWEEP TOOK A LIVE BOOK'S DRAFT".

**Device pass now RUNTIME 37/38.** The one failure is `14c`, the cover download, which needs a
working network and is running on an emulator; it has a documented history of failing exactly
this way. Not investigated further here because the phone will settle it.

**A trap worth writing down:** `devpass.sh` starts its Metro on 8082 and relies on
`adb reverse`, but a dev client launched by `expo run:android` remembers the LAN URL
(`192.168.x.x:8081`) and bypasses the reverse entirely — so the pass silently ran the ORDINARY
bundle and logged no devcheck lines at all. Start the device-pass Metro on **8081** after
killing whatever is there.

## 2026-09-18 · FIXED audit finding 1: the timer's runtime moved out of its screen
**Before:** a session open ~3 minutes offered **1** minute — the heartbeat froze the moment the
reader left the timer screen. **After:** the same experiment offers **2** minutes, and the
residue is the 30-second heartbeat granularity plus minute flooring, not a freeze.
(`scripts/device/s6_audit_background.py`, which is the check that found it.)

**Chose:** a module-level singleton, `features/timer/timerService.ts`, owning the run, the
tick, the heartbeat, the notification and its action listener. `useTimer` became a
`useSyncExternalStore` view that owns nothing, so unmounting the screen costs nothing.
Subscribe/notify follows `db/changes.ts`, which solved the same shape of problem for the
library.
**Over:** a React context provider at app level, which would have kept the runtime inside the
render tree — the thing that caused the bug.
**Over:** zustand, which is in `package.json` and used nowhere. Adding a state library for one
singleton is a dependency the project would then owe an explanation for. **Filed separately:
zustand is an unused dependency and should be removed or used.**

**`resumeFromDisk` is deliberately NOT called at launch.** On a cold start an open session
means the process died, which is the launch recovery gate's job. Resuming there as well would
put a running timer behind a sheet asking whether to keep it — two answers to one question.
While the process lives, the module still holds the run however long the app is backgrounded,
so nothing needs resuming.

**The rewrite introduced a regression, and the emulator check caught it.** The ticker called
`emit()` without replacing the snapshot object, and `useSyncExternalStore` compares snapshots
with `Object.is` and skips the re-render when they match. The timer ran while the screen
froze: **46 seconds saved against 30 shown**. The tick now produces a new snapshot object
every second, which is exactly what "a second has passed" means when the elapsed time is
derived at render.

**All four emulator suites pass after the rewrite:** `s6_timer` 5/5, `s6_notification` 5/5,
`s6_recovery` 4/4, and `s6_audit_background` now reporting that the heartbeat tracks the kill
rather than the exit.

## 2026-09-18 · The MIUI risk cannot be tested here, and the mitigation is already built
The build plan says to test the timer on Xiaomi and Samsung, "where the feature will break".
**The owner's phone is a Nothing Phone 2a**, and Nothing OS is near-stock AOSP — one of the
LEAST aggressive skins for background killing. Testing on it will give an optimistic result,
and that is worth saying rather than quietly reporting a pass.

**Why this is an acceptable v1 position:** the elapsed time is derived from timestamps, so the
worst an aggressive OEM can do is kill the service. The reader then gets the recovery sheet
with a heartbeat-bounded number and confirms it. **No wrong data, only friction** — which is
precisely why deriving rather than counting was worth the extra design.

**What to do instead of pretending:** validate on Xiaomi, Samsung or OnePlus through beta
testers before launch, and treat the run sheet's item 1 on the Nothing Phone as a floor — if
it fails there, it fails everywhere.

## 2026-09-18 · INCIDENT: a mutation script died mid-run and LEFT THE MUTATION IN THE SOURCE
`mutate_s5b.py` crashed with `OSError: [Errno 22] Invalid argument` while writing
`noteForm.ts` back — a transient Windows lock, almost certainly the `tsx` child still holding
the file. The `finally` block's restore was the thing that threw, so the file stayed mutated:
`parsePage`'s digits-only guard was left as a bare `Number(trimmed)`.

**It was caught immediately** because the next `npm test` went 477/478 with a failure naming
`'1e3'`. Restored with `git checkout --`, verified 478/478.

**This is the second time**: the scripts README already carried "a mutation script crashed
mid-run and left a mutation in the source" from 2026-09-14, about a Windows encoding crash.
The note existed; the protection did not.

**Fixed structurally, in both sweeps:** a shared `restore()` that retries five times with
backoff (Windows locks are transient) and, if it still cannot write, **exits non-zero naming
the exact `git checkout --` command** rather than letting the run finish over a broken tree.
A restore that fails is now impossible to miss.

**The wider lesson, which is this log's usual one:** the `finally` block was the safety
mechanism, and nobody had asked what happens when the safety mechanism itself fails. Both
sweeps re-run clean afterwards: 15/15 and 25/25 red.

## 2026-09-18 · AUDIT of slices 5, 5b and 6. One architectural defect, two boundary fixes.
Full write-up in `docs/10-AUDIT-2026-09-18.md`. The headline and the decisions:

**THE TIMER'S RUNTIME LIVES IN ITS SCREEN, and stops when the reader leaves it.** Measured,
not inferred (`scripts/device/s6_audit_background.py`): a session open ~3 minutes offered 1
minute, because the heartbeat froze at the moment the screen was left. `useTimer` owns the
tick, the heartbeat, the notification refresh and the notification's action listener, and it
unmounts with `TimerScreen`.

**Why nothing caught it:** every automated check drives the timer FROM the timer screen and
never leaves. The arithmetic is genuinely right, so 478 tests, 15/15 mutations and six
emulator scripts pass while the feature does not work the way it exists to work. This is
silent-pass item 20's shape once more — correct, and not connected.

**Decided:** fix it by hoisting the runtime above the screen (app-level owner; the screen
becomes a view that sends intents), and do it BEFORE the phone session — run-sheet item 1
would otherwise fail for this reason and teach us nothing about MIUI.

**Two boundary violations were introduced and fixed during the audit**, both from the same
pressure — a second feature needing what a first feature owned:
- `domain/timerState.ts` and `domain/timerRun.ts` (were in `features/timer`). **That
  misplacement is why the heartbeat was never wired:** `features/launch` was forbidden from
  calling it, so the missing call was structural, not forgetful.
- `ui/timerNotification.ts` (was in `features/timer`), so the launch recovery gate can take a
  crashed timer's notification down. `ui/datePicker.ts` is the precedent.

**In this codebase a missing call is often a misplaced module.** When something cannot be
wired, check whether the architecture forbids it before assuming somebody forgot.

**Also fixed in the audit:** the timer and the launch gate disagreed about WHICH open session
is "the" one — the timer took the newest, the gate the oldest. Two open sessions can only
exist through a bug, but then the timer would resume one while the sheet asked about the
other. Both now take the oldest, with the coupling written down at both sites.

**Premortem, ordered by damage** (detail in the audit): the timer shipping as a stopwatch you
must watch; an open timed session syncing to another device in Slice 8; a book deleted while
its timer runs, still undecided; no purge for `metadata_cache`; the device pass covering no
timed sessions; the 68px clock unseen at 200% font; the APK budget.

**Documentation:** four gaps found and filled — Journey E had no "as built" block, the data
model did not mention `timer_run`, the architecture doc listed `expo-notifications` as planned
rather than installed-with-constraints, and the `react-dom` override was unrecorded.

## 2026-09-18 · The notification: three bugs, none of which threw, all found by looking
The foreground service, the notification and permission priming all landed once the dependency
was unblocked. Three defects sat between "written" and "working", and every one of them was
silent — no crash, no log, no failing test.

**1. The notification was never presented.** `expo-notifications` suppresses presentation
while the app is in the FOREGROUND unless `setNotificationHandler` opts in. A timer screen is
by definition in the foreground when a timer starts, so the notification was posted, accepted,
and never shown: `dumpsys notification` had no record for the package at all. Fixed with a
handler set at module scope, which also opts OUT of a banner — a banner every time the reader
pauses is an interruption in the middle of reading.

**2. It was on the wrong channel.** A LOW-importance silent channel was created and never
used: `channelId` lives on the TRIGGER, not on the content, and `trigger: null` has nowhere to
put it. Android filed it under `expo_notifications_fallback_notification_channel` at
importance 4 — a channel that can pop a heads-up. The fix is `trigger: { channelId }`, a
`ChannelAwareTriggerInput`, which delivers immediately exactly like `null` does but names the
channel. Confirmed by `dumpsys` (`channel=reading-timer`) and by the shade putting it under
**Silent**.

**3. It came back after the session ended.** `finish()` cleared the notification and then
updated `run`, which fired the effect that posts it — after the clear. The session ended and a
paused timer stayed in the shade, which on a real device is a foreground service with nothing
to do. Fixed with an `ended` ref checked by the notification effect, the tick and the
heartbeat. **The check that caught it read `title=Paused | ... paused at 00:32` after Finish**,
with a clock that had moved — proving Resume and Finish both landed and the notification had
simply been re-posted.

**What this run of checks is worth, and what it is not.** Five emulator checks now hold the
notification: posted, on its own channel, ONGOING and SILENT, two actions, changing on pause,
cleared on finish. The button LABELS are not in `dumpsys` — Android does not print them — so
they are read off a screenshot of the expanded shade, which showed `Pause` and `Finish` under
a "Reader · Reading · Late Garden in Translation · 00:00 so far". An assertion that claimed to
read them from `dumpsys` was really reading the literal word "String" out of
`title=String (...)`, and passed.

**Filed, not fixed:** the notification is COLLAPSED by default, so Pause needs an expand
first. That is ordinary Android behaviour for a LOW-importance channel and the trade is
deliberate — a higher importance would pop a heads-up mid-paragraph — but it is one more
gesture than the artboard implies. Worth a look on the phone before deciding.

## 2026-09-18 · react-dom was a minor ahead of what SDK 57 pins, which blocked expo-notifications
`npx expo install expo-notifications` failed on a peer conflict. Traced rather than forced:

- Expo SDK 57 pins **react 19.2.3 and react-dom 19.2.3** (`bundledNativeModules.json`).
- The tree actually held **react-dom 19.3.0**, which demands `react ^19.3.0`.
- `react-dom` is not in `package.json` at all — it arrived transitively through
  `expo-router` → `@expo/metro-runtime`, `@expo/ui` and `@radix-ui/*`, and npm resolved it one
  minor ahead of the SDK's own pin.

**Chose:** `"overrides": { "react-dom": "19.2.3" }`, which corrects the drift to the version
the SDK specifies.
**Over:** `--legacy-peer-deps`, which papers over a conflict instead of removing it, and which
would have left the tree in a state nobody could reason about later.
**Why it is safe here:** this is an Android-only app; `react-dom` never enters the bundle.
**The lockfile diff was read before it was kept**, and it is small: react-dom 19.3.0 → 19.2.3,
expo-notifications and its two deps added, one nested `scheduler` removed, and one unintended
change — **expo-constants 57.0.17 → 57.0.19**, a patch within SDK 57, recorded here so it is
not a mystery later.

## 2026-09-18 · THE HEARTBEAT WAS WRITTEN AND READ BY NOBODY. Silent-pass item 20.
Slice 6 added a heartbeat every 30 seconds so a crashed timed session could be bounded by the
last moment the app was known alive, instead of by how long the app was shut. `timerRun.ts`
was written, tested with twelve assertions including the overnight case, and all of them
passed.

**And the recovery sheet never called any of it.** `SessionRecoverySheet` still computed
`(now() - session.occurredAt) / 1000`, exactly as it had since Slice 1. A session killed at
23:00 and reopened at 08:00 was still being offered nine hours. The heartbeat was a local
write with no reader.

**Nothing failed.** Typecheck clean, lint clean, 476 tests green, the emulator check green —
because the emulator killed and relaunched the app three seconds apart, where the heartbeat
bound and the wall clock give the same answer. **The passing check was measuring nothing.**

**Found by asking what would distinguish the two**, and then building the case where they
differ: `s6_overnight.py` reads for 53 seconds, force-stops, waits four minutes, and reopens.
Wall clock says ~5 minutes; the sheet now offers 1.

**Fixed:**
- `timerState.ts` and `timerRun.ts` moved from `features/timer` to `domain/`, because two
  features need them and features may not import from one another. That the modules were in
  the wrong place is why the wiring was missing: `features/launch` could not have called them.
- `getOpenSession` now returns `boundedSeconds`, computed from the stored run.
- The sheet consumes it and computes nothing.
- A node test asserts the JOIN, not just the arithmetic: given a heartbeat, the number handed
  to the sheet is the heartbeat's and NOT the wall clock's, and the two produce different
  offers (22 minutes offered versus a blank field).

**The lesson, which is the one this log keeps relearning:** a unit test proves a function
computes. It does not prove anyone calls it. Both halves were green while the feature did
nothing.

## 2026-09-18 · Slice 6: the timer, decided as built
**The elapsed time is DERIVED from timestamps and never counted.** A session is a list of
segments with start and end instants; elapsed is their sum plus the open one up to now.
**Over:** a `setInterval` incrementing a counter, which is the obvious implementation and is
wrong: Android suspends the JS thread when the screen goes off, so the counter would
under-count exactly the reading it exists to measure, silently. The tick that exists only
redraws; a missed tick costs a frame, never a second.

**Every span is clamped at zero.** A device clock can move backwards — a manual change, an
NTP correction, a dual SIM handing over — and `now - startedAt` can be negative. A negative
duration is a number nobody can explain, and it would reach the reader's yearly totals.

**A running timer lives in `metadata_cache`, not in `sessions`.** The session ROW is written
at Start, so a crash cannot lose the fact that reading happened. The segments and heartbeat
are device state. **The decisive reason is the queue:** a heartbeat every 30 seconds through
`write.ts` would append a `sync_queue` row every 30 seconds — 120 rows an hour describing a
timer nobody else will ever see, with a drain spending the reader's battery pushing them.
Same precedent as Slice 5b's note drafts.

**Storage keys moved to `db/localRecords.ts`.** `features/launch` has to clear a crashed
timer's record without importing `features/timer`. Until that move, recovery saved or
discarded a session and **left its run row behind forever** — found on the emulator by a check
that counted rows after Finish and got 1 instead of 0.

**`saveDraft`/`clearDraft` renamed to `saveLocalRecord`/`clearLocalRecord`.** They were always
generic; the name stopped being true the moment the timer became the second caller.

**The ring is a one-hour sweep that fills and HOLDS.** **Over:** progress toward a goal, which
would mean inventing a target session length and letting the app tell the reader how long to
read. **Over:** wrapping past an hour, which looks exactly like a timer that restarted.

**Finish routes to Session complete** (Slice 3) rather than asking for the end page itself.
The timer knows the duration; it does not know the page, and Session complete already owns
that question, its stepper, the streak and the date.

**Two of fifteen mutations survived the first sweep, and both were the TEST** — the same
finding as Slice 5b, so it is now a pattern rather than an incident. A `lastBeatAt: null`
fixture could not distinguish the guard from its fallback (`now - null` is enormous either
way), and a malformed payload was being rejected by a later check than the one under test.

## 2026-09-18 · No foreground service yet, and why that is recorded rather than hidden
**The timer does not survive backgrounding today.** `expo-notifications` would not install:
a pre-existing peer conflict in the npm tree (`react-dom@19.3.0` wants react `^19.3`, the
project pins `react@19.2.3`) that has nothing to do with the timer. Its service class is the
only sane one to declare, and declaring a `<service>` whose class is absent is a
manifest-merger failure or a runtime crash.

**Chose:** ship the permissions without the service, and write down precisely what is missing.
**Over:** `npm install --legacy-peer-deps` unsupervised, minutes before a build, in a session
where the phone was unavailable to verify the result. A destabilised dependency tree is worse
than a deferred notification.
**Over:** leaving `expo-notifications` in `package.json` uninstalled, which the failed install
did leave behind and which was reverted. A manifest listing a dependency that is not in
`node_modules` is a landmine for the next session.

**What this costs, stated plainly:** the numbers stay right whatever Android does, because
they are derived. What the reader loses is the timer continuing to exist — a kill sends them
to the recovery sheet instead. That is a working degraded mode and it is close to the shape
the two-week cut already describes.

**The two-week clock starts now**, 2026-09-18. The cut is already decided and written
(`DECISIONS.md`, 2026-09-03): if the foreground service is not solid by 2026-10-02, ship
without it.

## 2026-09-18 · The Gradle build works on Windows only with a non-8.3 TEMP
`npx expo run:android` failed with `java.io.IOException: Unable to establish loopback
connection`. That is the AF_UNIX problem already in this log (2026-09-03): the socket path is
the 8.3 short-name form of the temp directory, `C:\Users\DIVYAN~1\AppData\Local\Temp`, and
connect fails there.

**The fix, and it is a one-liner:** `TEMP="C:\\gtmp" TMP="C:\\gtmp" npx expo run:android`.
Build succeeded in 5m 30s. Recorded in `09-ENVIRONMENT.md` because it will cost the next
session an hour otherwise, exactly as it did on 2026-09-03.

## 2026-09-18 · The camera is free, all three of its uses (owner's decision)
**Photographing a cover, scanning a barcode, and snapping a page into a note are all FREE.**
Asked on 2026-09-18 and answered the same day, so the question is closed before the feature is
built rather than after.

**Why it had to be answered now even though the build moved to last:** Slice 10 writes the
paywall copy. A feature that is Plus must be listed there; one that is free must not be. The
decision travels with Slice 10, the build travels with Slice 11.

**What `08-MONETISATION.md`'s "Custom shelf colours and covers" actually means:** restyling a
cover the reader already has. Not photographing one. The earlier reading — that a photo cover
was the Plus item — was recorded as probably wrong on 2026-09-15 and is now confirmed wrong.

**The rule that makes this irreversible:** the free list never shrinks. Moving the camera
behind Plus later is precisely the move `01-PRODUCT.md` documents readers being angry about,
so settling it early is worth more than the option value of deciding later.

## 2026-09-18 · Every camera feature moves to the last slice; three decisions do not move with them
**Owner's decision:** photo covers and the barcode scanner are deferred to the end — Slice 11
or post-launch. They share a camera module, a native rebuild and a permission, so they travel
together.

**There is a THIRD camera feature, already deferred without anyone deciding to:** "Snap a
page" / "Scan the page" in the notes screens (`Notes.dc.html`, `NoteEditor.dc.html`). Slice 5b
shipped without it, and `notes.image_path` is now a column that nothing writes and nothing
reads. That is the mild form of the hazard this log exists for. It is either built with the
other two or explicitly marked reserved; it must not sit unexplained.

**Checked: what breaks by moving them past everything.** Slices 6 (timer), 7 (stats, genres)
and 9 (import) touch none of it. Three things do, and none of them is the build:

1. **Slice 8 must decide what happens to file-shaped data on another device, and it is already
   wrong today.** `books.cover_local_path` is a SYNCABLE column holding a path that means
   nothing on any other phone. For a downloaded cover that is merely wasteful — the other
   device re-fetches from `cover_url`. **A photo cover has no URL, and neither does a scanned
   page.** Restoring on a new phone would leave a book pointing at a file that does not exist,
   with nothing to recover it from. `03-DATA-MODEL.md`'s seven sync rules say nothing about
   files at all. Slice 8 has to answer this whether or not the camera ever ships, and it will
   answer it wrong if it does not know photo covers are coming.
2. **Slice 10 needs the free-or-Plus answer, not the feature.** The paywall copy is written
   there. If photo covers are Plus and ship after launch, the paywall either lists something
   that does not exist or omits something that will.
3. **The camera permission then lands closest to release**, the worst slot for the riskiest
   native change, in a project that has already lost a week to native config that reached no
   build (`android/` stale, 2026-09-10).

**Chose:** defer the build, and pull the three decisions forward to the slices that need them.
**Over:** deferring the decisions with the work, which is what "move it to the end" would mean
if taken literally.
**Revisit if:** the Slice 8 answer turns out to be "images sync through Supabase Storage",
which is large enough that knowing it early changes the shape of that slice.

## 2026-09-18 · Slice 5b and Slice 5's leftovers, verified on the phone
**39 screen checks passed, plus RUNTIME 36/36 · COMPILE-TIME 1/1 on the device pass.** Full
results in `docs/device-checks/slice-5b.md`. Slice 5's two open items are closed: the device
pass re-ran after the 2026-09-15 review fixes, and "Start the next one" was honoured twice in
one app session.

**The draft holds, which was the slice's done-when.** Backing out kept 62 characters and said
so; `am force-stop` mid-note kept 87; a saved note did not come back as a draft. That last one
is the bug `draftAction` was written against before it could happen.

**Light mode passed, and was READ rather than captured.** `s5b_light.py` refuses to run
unless `cmd uimode night` reports the phone is really in light mode, but a script can only
prove it took a screenshot — so the four were looked at. The accent QUOTE badge and the muted
NOTE badge both hold on white; the quote body in near-black and the note body in dark grey
stay distinguishable without dark mode's contrast; the focused field, the draft line and Save
note are all legible. This mattered: the design sheet's own light-mode colours failed WCAG AA
and shipped for two slices because nothing looked at them (item 10).

**The library was untouched, measured at both ends.** `reader.db` md5
`1623cf85872260684723c84a1636ab7a` and wal `6ab7bff24d26b872974e4739ede746cd` before the
session and byte-identical after, both still matching 2026-09-14.

**No bug in the app was found in 43 checks**, which is worth stating plainly rather than
celebrating. Slices 3, 4 and 5 each found real bugs on the phone. Two readings are available
and only time separates them: the pure modules and 25 node mutations genuinely did the work
up front, or these checks are shaped like the code rather than like a reader. The one finding
that did come out of looking at a screen — the book title and draft line scrolling out of view
behind a long note — came from a screenshot, not from an assertion, which is mild evidence for
the second reading.

**Every failure this session was the script's.** Seven kinds, each now written down in the run
sheet because they will recur: a placeholder read as content, a book below the fold, a toast
sampled after its 5 s life, `ping` writing to stderr where `phone.adb()` reads only stdout, a
regex group that did not exist, an assertion against what the script hoped to type rather than
what `adb input text` actually delivered (it truncates), and a card selected by an
accessibility HINT that uiautomator does not expose.

## 2026-09-18 · A script must not read a screen that is not ours
**What happened:** a run continued while the owner was in WhatsApp, and `uiautomator dump`
captured a private conversation into the session log. The phone is the owner's; the app under
test is a guest on it.

**Chose:** `phone.require_our_app()`, called by every `dump()`. It reads the foreground package
and refuses unless it is ours, looking twice 1.5 s apart so a launch's transient launcher is
not mistaken for somebody's screen.
**Over:** remembering to check, which is the strategy that failed.
**Watched firing:** against a deliberately wrong package, and then twice in the wild — it
caught Instagram and the camera on later runs and stopped both.
**Cost, and it is real:** an extra `adb` round trip before every dump. That pushed the first
post-delete sample past the undo toast's 5 s life and made check 6.4 fail twice before the
cause was understood. Tap a toast's action from the same dump that finds it.

**Also added:** `wait_free.sh`, which waits for the phone to be free rather than competing for
the foreground, and `s3lib.open_by_search()`, which reaches a book through the Library's own
search instead of scrolling a tab — three runs failed only because a book was below the fold.

## 2026-09-18 · An unexplained soft delete, recorded rather than waved away
A note was soft-deleted at 15:43:33 IST with its own `sync_queue` delete row, during a window
when the phone was in the owner's hands with the app in the foreground. **No script reached a
delete in that window** — all three had aborted earlier, at a selector, at a foreign screen,
and at a precondition.

**Most likely the owner tapping around**, and the app behaved correctly throughout: the delete
went through `softDelete` and queued exactly one row, which is what a delete from the UI does.
Written down anyway, because "a row vanished and nobody knows why" is the shape this project
takes seriously. If a note ever disappears WITHOUT a queue row, this entry is the precedent:
that would be a different and much worse thing.

## 2026-09-18 · `typeStyle` dropped every token's letterSpacing, for eight slices
Found while adding a tracked-out token for the notes badge: `typeStyle` takes `size`, `weight`
and `lineHeight` and returns them, and seven tokens in the scale carry a `letterSpacing` it
never read. Every display size in the app — hero, displayLg, display, title, heading,
bodyStrong, notice — has rendered at Plus Jakarta Sans's default tracking since the first
commit, while the scale said otherwise.

**This is item 18's shape exactly**, and item 18 is in `CLAUDE.md`: `font.family` was declared
in this file from the first commit and applied by nothing, so the whole app rendered in Roboto
for a week. A token nothing reads cannot fail loudly. It can only be wrong quietly.

**Chose:** fix it now, one line, with a test.
**Over:** filing it as Slice 11 polish. It is a one-line fix in the file I was already editing,
and rule 4 ("look for the same class of bug in the rest of that file") is what found it. Eight
slices of a design token being decoration is long enough.
**The test iterates the scale rather than listing names**, so a token added later is covered by
construction — the failure mode of a list is that it stops covering things. Watched failing
twice, before and after the test was rewritten for the type checker.
**For the phone:** this changes the metrics of every heading in the app, subtly. Nothing can
break, but it should be LOOKED at — added to the batched pass. If the owner dislikes it, the
honest fix is to remove the values from the scale, not to go back to ignoring them.

## 2026-09-18 · Slice 5b: notes and quotes, decided as built
**A draft lives in `metadata_cache`, not in `notes` and not in MMKV.**
- **Over:** writing the real `notes` row on every keystroke. That would put an abandoned
  thought in the reader's list, in `sync_queue`, and from Slice 8 on their other phone.
- **Over:** installing MMKV, which is still deferred to the slice that first needs it
  (2026-09-03) and brings Nitro Modules and a native rebuild with it.
- **Because:** `metadata_cache` is already local-only by construction — it is absent from
  `SYNCABLE`, so writing to it through the sync path is a compile error. No new storage, no new
  dependency, no migration. `source` is `note_draft`; `source_id` is `new:<book>` or
  `edit:<note>`, so a new note drafts per book and an edit per note.
- **Held by:** device check 18 (no queue row, no note), and node tests for the encoding.

**There is no "Discard changes?" on the note editor, unlike the session logger.**
- **Because:** that question exists where leaving loses what you typed. Here the draft keeps
  it. The first version of the screen had both, and its confirm sheet read "Discard changes? …
  Your draft is kept", which is a warning that argues against itself. A question whose answer
  does not matter is worse than no question.
- **Revisit if:** drafts ever become unreliable, in which case the guard comes back and the
  draft is what needs fixing.

**The after-save flush was a bug before it was written.** The draft writer flushes on unmount,
which is the whole point — backing out is the case it exists for. But the editor saves, clears
the draft and leaves, and the unmount that follows would flush the saved words straight back
under `new:<book id>`, so the next "Add a note" for that book would open holding the previous
note. `draftAction` returns `'none'` once the phase is `finished`, the rule is pure and tested,
and the mutation that removes it goes red. Phone check 5.7 is the reader's version of it.

**An audiobook is offered no page.** `notes.page` means a page, and an audiobook has none by
the one definition (`domain/progressDisplay.ts`). **Over:** labelling the field "Minute" and
storing minutes in a column named `page`, which is the silent-wrongness this project exists not
to produce; and **over** a `position_minutes` column, which is a migration this slice was not
asked for. **Filed:** a note on an audiobook has no position until such a column exists.
**Note the near miss:** the first test for this used a fixture with `currentPage: null`, which
passes whether or not the rule is there. The mutation sweep caught it, not review.

**A quote is not italic, although `Notes.dc.html` is.** Only the five upright weights are
embedded (`src/ui/brand.json`); the italic files exist in the package and are not in the build.
`fontStyle: 'italic'` on a custom Android family with no italic file renders upright with no
error — the same silent shape as the app spending a week in Roboto. A quote is set apart by the
accent badge, the larger size and the brighter ink instead. **Revisit if** the owner wants
italic: it is five more files in `brand.json` and a native rebuild, for one row's styling.

**Export is plain text through Android's own share sheet.** **Over:** `expo-sharing` and a
written file, which is a new dependency and a native rebuild. **Over:** silently truncating a
large export — a payload past Android's transaction limit now fails out loud with its own
message, because half an export that looks complete is the worse failure. It exports what is on
screen, with the filter named in the subject, so the text is self-describing once it leaves.

**Delete is in the editor, not the list.** The undo toast still renders beneath a Modal (filed
from Slice 3), so deleting from a list would raise an invisible Undo. The editor already has
the pattern that works: ask once, leave, then toast.

**Notes joined Recently Deleted in this slice**, which `04-SCREENS.md` and `trash/queries.ts`
both said they would. Found while updating the docs: the editor's own "not here any more" copy
already promised "anything deleted waits in Recently Deleted for 30 days", which would have
been false for notes. A row is named by its opening words, kind, page and book — a quote's first
words alone cannot tell two quotes from the same book apart. `deletedLine.ts` is pure and tested.

**Counts:** 445 node tests under `cmd` and `sh`, 121 in each of three zones, 25 of 25 mutations
red. Typecheck, lint and Prettier clean. **Not run: the device pass**, which needs the phone.

## 2026-09-18 · The "Start the next one" tab fix now has a check, and lives in a pure module
The 2026-09-15 review fixed it in one line inside `LibraryScreen` and recorded "not a data bug,
has no test". Standing rule 1 has no exception for cheap fixes, and three bugs in this log came
back inside their own fixes, so the reconciliation moved to `features/library/tabRequest.ts` and
is asserted in both directions.

**Chose:** a pure `readTabRequest(params, seenKey, tabs)` returning `{ key, tab }`, with the
screen holding `key` in state.
**Over:** testing it through the component, which would need a renderer this project does not
have, or leaving it to the phone check alone.
**Because:** the two guarantees run opposite ways and only one of them is the bug that happened:
a NEW request must switch the tab even when it names the tab a previous request named, and a
re-render with no new request must leave the reader on the chip they tapped. A test of either
alone passes over the other.
**Watched failing, twice:** with `at` dropped from the key (the pre-fix spelling) the repeat
request goes red; with the `seenKey` comparison removed, the re-render test goes red. 388 node
tests pass.

**Also:** an unknown `tab` value is ignored rather than trusted, because the parameter reaches
this screen from a deep link, which is outside input. That was already true and is now asserted.

**Still owed:** the phone step, in the batched Slice 5 + 5b pass. It is one tap sequence —
finish a book, Start the next one, tap Finished, finish another, Start the next one.

## 2026-09-15 · Open owner decisions, and answers given in conversation (Slices 4–5)
Written so a new session knows what was asked, what was answered and what still waits. Nothing here
is built unless it says so.

**Waiting on the owner:**
1. **Photo covers in Add manually / Edit details.**
   - **The conflict:** ManualEntry.dc.html offers "Snap the front cover, or pick a colour". Slice 4
     built the colour only and cited 08-MONETISATION's Plus item "Custom shelf colours and covers".
   - **Recommendation given:** that reading was probably wrong. A book added by hand has no cover
     at all, the design puts the photo in the free flow, and the Plus item more likely means
     restyling any book's cover.
   - **Cost:** a camera/photo-picker module (`expo-image-picker`), a native rebuild
     (`npm run prebuild`, then `run:android`), and a camera permission.
   - **Unanswered.** If yes, update 08-MONETISATION in the same task.
2. **Barcode scanning, and when.** 05-BUILD-PLAN has it as the first item after launch. Recommended:
   build it together with photo covers, since both need the camera, one native rebuild and one
   permission. A scan gives the ISBN, then title, author, pages and cover. **Unanswered.**
3. **Open Library cover size.** Covers are downloaded at `-M` (about 180 px wide), which is soft on
   book detail's large cover. Offered: download `-L`, a one-line change with larger files.
   **Unanswered.**
4. **The Google Books API key was pasted into the chat.** It is restricted to the Books API, so the
   worst case is quota. Regenerating it and updating `.env` was offered as optional. **Unanswered.**

**Decided in conversation:**
- **No cover lookup by ISBN for books added by hand.**
  - **Why:** the ISBN only comes from the reader typing it, so most manual books have none.
  - **Why again:** a book Open Library could not find by title rarely has a cover there by ISBN.
  - **Over:** a cover lookup by title alone, which would sometimes show the wrong book's cover,
    and that is worse than a colour.
  - **Instead:** the scanner and photo covers above.
- **Descriptions, categories, a genre filter, genre stats and "Read a sample"** were the owner's
  additions:
  - **Slice 5:** descriptions, categories, the summary and the browser link. Built.
  - **Slice 7:** genre stats and the Library genre filter.
  - **Slice 11:** the Embedded Viewer inside the app.
  - **Ratings from Google** were rejected: 1–4 of 20 volumes had one, from 1–2 ratings.
- **Google quota:** planned, not built (the 2026-09-14 quota entry). Handle a used-up quota quietly
  and ask Google for more, both before launch; route search through a server only if the numbers
  demand it.

**Questions answered, recorded as facts:**
- **No Elasticsearch, and no server.**
  - **Library search** matches in TypeScript over local SQLite.
  - **Book search** calls Google Books and Open Library straight from the phone, both at once, after
    a 300 ms pause in typing and from 2 characters.
  - **Results** show as each source answers. One book from both is merged with Google's edition
    first. Every result is remembered for offline.
- **Open Library covers are free and used.** A result shows its cover when the work has one
  (`cover_i`), and adding downloads it for offline. Many older, Indian and self-published works have
  none, so they show the colour.

**Small UI items noticed and filed (Slice 11 polish), none a data risk:**
- **Log pages** on book detail is a full-width 56 dp primary button where BookDetail.dc.html shows
  a compact one.
- **Cover colour swatches** in Add manually wrap onto two lines on the phone.

## 2026-09-15 · Slice 5 verified on the phone
**All 21 checks run passed** (`docs/device-checks/slice-5.md`, results). The owner's two cases held on
real screens and in the pulled database:
- **Case 1:** finishing moved the book off Reading onto Finished, once.
- **Case 2:** a book finished on 31 Dec 2025, re-read and finished today is two `reads` rows, rated
  3 and 1.5. Each counts in its own year.

**The open question from 2026-09-14 is measured, not closed.** The device pass passed 5 of 5
consecutive clean runs (7 of 7 with yesterday's). 14c and 16 passed each time. Their three failures
came only during mutation runs, have not recurred, and are not explained. The procedure to tell a
real interference from the network stays in the run sheet.

**Not run, by the owner's choice:** the largest font and 360 dp. Both go into the Slice 11 font pass,
which already covers every screen built after Slice 3.

**Filed against Slice 11 polish** (found on the phone, no data at risk):
- **The description field** in Edit details grows to the whole screen's height for a long
  description.
- **Finish date wording:** book detail says "Finished 15 Sep 2026" where the finish screen says
  "Finished today".

**Also corrected:** the Session complete comment and the run sheet said closing the finish screen lands
on book detail. It returns to where the session was started, which is the Library when that was its
Continue pill. The behaviour was right; the words were not.

## 2026-09-15 · Slice 5 review pass: two silent bugs, fixed after the phone was disconnected
The one review pass (CLAUDE.md), looking only for what is silent and wrong in the reader's data.

**Moving a Want to read book with no sessions to Finished defaulted to today.**
- **Why that is wrong:** that move is almost always "I read this before I used the app", and today
  put a book read years ago into this year's count. It is the same shape as silent-pass item 9: a
  number recorded on the reader's behalf that they never gave.
- **Fixed:** the date starts empty and is asked for, like "I already finished it". A Reading book
  (even with no sessions yet) and any read with sessions still default to today.
- **Held by:** a test, watched failing.

**A second "Start the next one" could leave the Library on the wrong tab.**
- **What happened:** the request was a `tab` route parameter. After the reader moved to another
  tab, the same parameter arrived again and changed nothing.
- **Fixed:** the request carries a timestamp, so each one is new.
- **Not a data bug:** fixed because it is one line, and has no test. Checked on the phone
  tomorrow.

**Counts after these fixes:**
- 383 node tests under `cmd` and `sh`; 121 in each of three zones.
- 16 of 16 mutations red.
- Typecheck, lint and Prettier clean.
- **Not re-run:** the device pass, because the phone was disconnected. Both fixes are outside the
  device checks' paths, but the rule is to re-run after any change, so it runs first tomorrow.

## 2026-09-14 · Slice 5: descriptions, categories and "Read a sample", decided as built
**Four columns on `books`, in migration 0002:** `description`, `categories` (JSON array of the
source's raw strings), `preview_url` and `details_checked_at`.
- **Tested against a populated database:** 2000 books, with a control showing the fingerprint
  notices one changed book. It also ran on the phone's populated `devcheck.db`.
- **Why `details_checked_at`:** "fill only what is empty" cannot tell a description never fetched
  from one the reader deleted. The mark makes each book's fetch happen once, ever.
- **Over:** refetching whenever a column is empty, which would bring back a description the reader
  cleared on the next launch.
- **Known edge, accepted:** a reader who clears the description of a book whose fetch has not
  happened yet (added offline from Open Library) gets it back once when the fetch runs.

**Where details come from.**
- **Google:** from the search result itself when added (the search carries description, categories
  and viewability), so no extra request against the shared quota.
- **Open Library:** the search has no description, so the work (`/works/<id>.json`) is fetched in
  the background after adding.
- **Books added before this slice:** fetched when their detail is first opened online, like cover
  retries (`db/bookDetails.ts`).
- **Google without a key:** waits, rather than being marked checked with nothing.

**Descriptions are cleaned to plain paragraphs** (`domain/bookDetails.ts`, tested on captures).
- **Google volume descriptions are HTML** with entity-encoded text and a publisher's
  `<b>______</b>` rule.
- **Open Library's are Markdown**: bold wrapping italics, reference links, and a `----------`
  rule before an "Also contained in" list of links. The list is cut.
- **Length:** capped at 4000 characters at a word boundary.
- **Over:** rendering HTML or Markdown on book detail, which needs a renderer for a nicety and
  makes the reader's own edits a different kind of text.

**The preview link is built from the volume id** (`books.google.com/books?id=…&printsec=frontcover`),
never Google's `previewLink`. Google's carries the reader's search words (`dq=`) and a country
domain. It is set only for PARTIAL or ALL_PAGES viewability: 5 and 8 of 20 in the captures.

**Results remembered before Slice 5 still read back offline.** The three new fields are optional
in `parseRememberedResult`; only a present value of the wrong type rejects a payload.
**Over:** requiring them, which would have silently emptied every reader's offline search on
upgrade. A test uses a Slice 4 payload, and was watched failing.

**Categories are not shown yet.** Raw strings like "nyt:combined-print-and-e-book-fiction" are not
for readers. Slice 7 maps them to genres. Edit details lets the reader change the description;
genre editing comes with Slice 7.

**Also found while building:** 05-BUILD-PLAN said the actions sheet "links to notes from Slice 2".
It does not, and never did; rows appear with the slice that owns them. Slice 5b stays unbuilt, as
the owner asked.

**Where Slice 5 stands at the end of 2026-09-14: code complete, phone checks not done.** The owner
disconnected the phone.
- **Checks:** typecheck, lint and Prettier are clean. 381 node tests pass, and 119 under each of
  UTC, IST and US Central. 15 of 15 node mutations went red, and the `MoveStatus` type assertion
  was watched failing.
- **Device pass on the phone before it was disconnected:** RUNTIME 34/34 · COMPILE-TIME 1/1,
  twice (the second run from a fresh Metro). Check 15 failed as intended under two mutations
  (finish without the move; a re-read inheriting a rating). Check 16 failed under one (a fetch
  replacing the reader's description). Sources were restored and checksummed after each.
- **Open, not explained:** in those three mutation runs, the network-dependent checks **14c or 16
  also failed, although their code was not mutated**. 14c: no local cover within 10 s. 16: nothing
  written. Both passed in both clean runs. It could be a slow network at that moment, or the new
  background details fetch competing with the cover download in 14c. It is not dismissed:
  tomorrow's first job is to count clean passes (`docs/device-checks/slice-5.md`).
- **None of the phone-only checks has been run:** the owner's two cases on real screens, the
  keyboard over the note, and the date dialog.

## 2026-09-14 · Slice 5: the finish flow, decided as built
**Finished is reached only through the finish flow.**
- **What that covers:** the actions sheet's Finished chip, "I finished the book" on Session
  complete, and "I already finished it" when adding (search and manual). Every one opens
  `features/finish`, which writes status, rating, note and date as ONE update of the read.
- **What it replaced:** the status-only moves of Slices 3 and 4.
- **Held structurally:** `setReadStatus` takes `MoveStatus` (`ReadStatus` without `finished`), so
  a plain move to Finished does not compile.
- **Over:** keeping the chip as a plain move beside the flow, which leaves finished books with
  no date and no rating prompt.
- **The owner's named case:** a book finished here always leaves Currently Reading, because the
  move and the finish are the same write.

**The finish date and the override rule.** `finished_at` null means "derive it from the last
session", and a computed value is never written (03-DATA-MODEL).
- **Finishing now:** the date starts at today and is stored when the reader saves. It is their
  answer to "when did you finish?", not a cache of the sessions.
- **A read already finished without a date:** shows its last session's date as derived, and
  saving without touching it writes nothing.
- **Finished with no sessions and no date** ("I already finished it"): no date is shown and none
  invented. It counts as finished and in no year. **Over:** defaulting to today, which would put
  every book from years ago into this year's count.
- **Refused:** a date after today, or before the read's last session or stored start.

**Which year a finish counts in is decided in TypeScript, in the device's zone**
(`domain/finishes.ts`), from `db/finishedReads.ts`. SQLite's `localtime` is not reliably the
device zone on Android. Every read counts, so a book finished in 2025 and re-read to the end in
2026 is one book in each year. Tested under UTC, IST and US Central with an 11 pm New Year's Eve
finish.

**One rule for a finish date.** Book detail's earlier reads and library search each spelled
`finishedAt ?? lastSessionAt` inline, and the earlier-reads copy also showed a date for a DNF
read. Both now call `effectiveFinishedAt`.

**Rating:** tap the left or right half of a star. Tapping the rating shown clears it, because a
rating is optional and nothing else returns it to none. Each star is a 44 dp target. TalkBack
hears one adjustable "Rating" control that steps in halves.

**"Start the next one"** saves the same way, then opens the Library on Want to read, through a
`tab` route parameter. **Over:** the Add tab, since the next book is usually already on Want to
read.

**Closing without saving changes nothing.** It asks first only if a rating, note or date was
changed. The book stays on its shelf, and a book added as "I already finished it" stays
finished without a date.

**A finished read can be changed later** from the actions sheet: "Rating, note and finish date"
opens the same screen, with Save. Earlier reads are not editable yet. Filed against Slice 11
polish.

**Also:** a `finishSave` forced failure; the date dialog is now `ui/datePicker.ts`, shared with
the session logger; the unused `image` icon from Slice 4 became `calendar`.

## 2026-09-14 · Descriptions, genres and "Read a sample": planned by the owner
**The owner's decision, after seeing what Google actually returns.** Book metadata richer than
title and author feeds three later features, so it is captured from Slice 5, not when each
feature is built. Every book added before then would otherwise need a backfill.

**What the real responses hold** (20 volumes each for "piranesi clarke" and "godaan"):
- **Description:** 6 and 11 of 20. It is optional: a book without one shows nothing.
- **Categories:** 15 and 20 of 20.
- **Average rating:** 1 and 4 of 20, from 1 or 2 ratings each. **Rejected:** noise presented as
  a verdict.
- **Readable preview:** sample pages 5 and 8; the whole book 11 and 0, and all 11 were
  out-of-copyright catalogues; nothing 4 and 12.

**Slice 5 (planned):**
- **Store `books.description` and `books.categories`**, in a migration, tested against a
  populated database like `0001`. Both are reader-editable like every metadata field.
- **Short summary on book detail:** a few lines, expandable. Nothing at all when there is none.
- **"Read a sample" as a link to Google's preview page**, opened in the browser. Shown only when
  Google says pages are viewable (`accessInfo.viewability` is PARTIAL or ALL_PAGES). A link to
  a page with nothing to read is a broken promise.
- **Open Library:** its search gives `subject` (messy, hundreds per work) and no description;
  that needs one request to the work (`/works/<id>.json`). Decide in the slice whether that
  request is worth it or whether Google alone supplies descriptions.
- **Books already in the library:** fill description and categories when their detail is next
  opened online, once per launch, the way covers are retried. Never overwrite a reader's edit.

**Slice 7 (planned): genre breakdown and a genre filter on the Library.** Slice 7 already listed
a genre breakdown, and nothing supplied genres; this is where they come from.
- **Raw categories are not genres.** Google's are like "Fiction / Fantasy / General", and Open
  Library's subjects run from "Fiction" to "Accessible book". A pure, tested function maps them
  to a short genre list.
- **The reader can set or correct a genre in Edit details.** A manual book has none otherwise.
- **Both stay free** (08-MONETISATION: a reader's own genres are never sold).

**Slice 11 (planned): the Embedded Viewer API, read the sample inside the app.**
- **Why it waits:** it is a JavaScript API for web pages, so it needs a WebView, a native module
  and a rebuild. It needs the network, in an app that otherwise works fully offline. And most
  books have nothing to show (12 of 20 for "godaan").
- **Until then:** Slice 5's browser link.
- **Before launch:** read Google's Books API terms and Branding Guidelines, which may require
  attribution wherever Google's data is shown. That would affect book detail's layout.

## 2026-09-14 · Google Books quota is shared by every reader: filed against launch
**Raised by the owner.** The key is in the app, so its daily quota (about 1,000 requests by
default; see the project's Quotas page) is shared by every install. It is not per reader.
- **How fast it goes:** a search is one Google request after a 300 ms pause in typing. Finding
  and adding a book is typically 2 to 5 requests. A few hundred readers adding books on one day
  would use it up, well before the app is popular.
- **What happens today when it runs out:** Google returns 429, which the app treats as
  "unavailable". Search still works from Open Library, but every search that day shows "Google
  Books did not answer". No data is lost and nothing crashes. It is a degraded, noisy search.
- **Already in the app's favour:** no automatic retries (`retry: 0`), a repeated term is served
  from memory for the session, and 2 characters minimum.

**Filed against Slice 11 (before launch), in this order:**
1. **Quota exhausted is its own state, not an error.** On a 429 carrying Google's quota reason,
   stop asking Google until the quota resets (midnight Pacific), and say nothing: Open Library
   alone is a normal search. A pure function with a test on a captured 429, like the offline
   classifier.
2. **Ask Google for a higher quota** from the Books API Quotas page, with the expected numbers.
3. **Measure requests per added book** from real use once there is any, instead of this estimate.

**Filed against Slice 8 (the backend exists then), only if the numbers say so:** send searches
through a Supabase Edge Function. The key leaves the APK, it can be rotated without an app update,
and popular searches are shared across readers. Before building it, read Google's terms on caching
API results; a shared cache may not be allowed. Not now: it puts a server between the reader and
search, and there is no traffic to justify one.

## 2026-09-14 · Google Books switched on: real responses, and a key restriction that would have broken it
**The owner created a key; it is in `.env` (gitignored), and Google Books is verified on the phone.**
- **On the phone (sandbox):** "godaan" showed "Searching Google Books and Open Library" and settled
  in 5.7 s. Google's editions came first, with covers, publishers and page counts, and Devanagari
  titles were intact.
- **Adding a Google result:** "Godaan (Hindi)" was added to Want to read. The pulled database had
  `source` `google`, ISBN-13 and ISBN-10, the publisher, 2018 and 414 pages. The cover was saved to
  the phone as an 11,791 B file, so Google's http-to-https cover link downloads.

**Real responses captured, replacing guesses** (`google-real-*.json`, trimmed to the fields the
parser reads, and labelled as captures).
- **What the tests now assert:** all 20 volumes are read. Also: an OTHER identifier ("STANFORD:…")
  is no ISBN; a missing imageLinks, missing identifiers, pageCount 0 and missing authors are
  absent, not values. One book from both real sources is one result.
- **Retired:** the hand-written empty response; the real one has the same shape. The hand-written
  Piranesi fixture stays, relabelled, only for shapes the captures lack (ISBN-10 only).
- **Watched failing:** no https upgrade on the cover (2 failures), and skipping volumes without
  authors (5). 321 of 321 clean.

**The key is restricted to the Books API only, NOT to the Android app. Correcting what Slice 4
wrote.**
- **What Slice 4 wrote:** restrict the key to the app's package and signing certificate.
- **Why that breaks search:** with that restriction Google only accepts requests carrying
  `X-Android-Package` and `X-Android-Cert` headers. Google's own Android client libraries send
  them; the app's plain `fetch` does not, so every Google search would be refused.
- **Why it would have been silent:** a refused request is "unavailable", and Open Library still
  answers. Search would have looked fine, with a "Google Books did not answer" line nobody reads
  as a broken key.
- **Why the package restriction is not possible yet anyway:** the package is still the placeholder
  `com.example.reader`.
- **Filed against Slice 11 (release):** once the real package id and upload certificate exist,
  send both headers from `features/add/api.ts`, restrict the key to them, and check on a release
  build that Google still answers.
- **Until then the risk is quota, not data:** the key is in the bundle and could be copied, but it
  can only spend this project's Books API quota.

**Seen in real results, filed and not fixed (one review pass; this is ranking polish):** for
"godaan", Premchand's plain "Godaan" ranked 7th. "Godaan: Screenplays by Gulzar" and an Indonesian
title containing the word ranked above it. Every result matching all typed words has the same
score, so the order is the order the sources returned. A title that IS the typed words should
rank first. Filed against the next time search is touched.

## 2026-09-14 · Tab screens padded twice for the navigation bar
**Found on the phone, pointed out by the owner** ("the footer space is increased"). `TabBar`
pads itself by the system inset, and `Screen` also padded every screen by that inset plus 22 dp,
tab screens included. **Library, Add and Stats each lost about 75 dp** to an empty band above
the tab bar, with the Library's rows cut off above it. Present since Slice 1; nothing measured
it.
- **Chose:** `Screen` takes `above="tabBar"` on the three tab screens, which drops the bottom
  padding. Every other screen keeps it: the logger and forms have no tab bar, and their Save
  must clear the navigation bar. The Library list gained a section gap after its last row.
- **Measured on the phone:** the Library and Add lists ended at y=1996 px and now end at 2117,
  meeting the tab bar. The logger's Save still ends at 2230, above the navigation bar at 2349.
- **Held by:** `ui/__tests__/screenInsets.test.ts`. It reads the `(tabs)` routes, follows each
  to its feature screen, requires `above="tabBar"` there and forbids it everywhere else. It
  carries a control, and went red with Stats padding again.

## 2026-09-14 · Slice 4: adding books, decisions as they were made, and what the phone found
**State: built and verified on the phone** (Nothing Phone 2a, sandbox library), online and in
airplane mode, including the two cases the owner named:
- the network killed mid-search, with Add manually still working;
- a searched book still fully usable offline, cover and metadata, after a cold start.

Phone checks and results are in `docs/device-checks/slice-4.md`.

**Found on the phone: offline search said the database was broken.**
- **What the screen showed:** in airplane mode every search displayed "Could not reach the book
  database" and Try again, not the offline banner and the books searched before.
- **Why the tests missed it:** `searchStatus.test.ts` passed. It asserted that a `TypeError`
  means offline, which is what React Native's old fetch threw.
- **What the phone actually threw:** a logged probe showed Expo's fetch rejects with a
  `FetchError`, name "Error", message `fetch failed: java.net.UnknownHostException: Unable to
  resolve host "openlibrary.org": No address associated with hostname`.
- **Fixed:** `failureKind` now reads what happened: no DNS, no route or no connection is
  offline; a bad status or a timeout is unavailable.
- **Held by:** a test using that exact message and error shape. It was watched failing with the
  fix removed.
- **Re-verified on the phone** from a fresh launch and with the network killed mid-search: the
  banner in 3 s, remembered results, no error card.
- Added to the silent-bug list in `CLAUDE.md` (item 17).

**Google Books needs an API key; without one it is not asked.**
- **What happened:** unkeyed requests were refused outright on 2026-09-14 (HTTP 429, quota
  limit 0).
- **Chose:** `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY`, read in `config.ts`. Unset, search uses Open
  Library alone and says "Searching Open Library".
- **Over:** asking Google anyway, which would fail on every keystroke and show "Google Books did
  not answer" on every search.
- **The owner's action:** create a key (Google Cloud, Books API). The Google parser was tested
  against a fixture HAND-WRITTEN from the documented schema. **Superseded the same day:** the key
  exists, real responses are captured, and the key is restricted to the Books API only, not the
  app (see "Google Books switched on" above).

**Open Library returns works, not editions, and fuzzy matches.**
- **An Open Library hit carries no ISBN and no publisher of its own.** Its ISBNs (every
  edition's) are kept for merging and for recognising a book already in the library. Storing
  one would invent which edition the reader holds. Page count is the median across editions,
  kept because the reader can edit it.
- **"piranesi clarke" returned Gibbon and Dickens.** Results matching none of the typed words
  are dropped, and those matching every word rank first, for both sources (`searchMerge.ts`).
  A mutation found the Google half untested; the test was added and watched failing.
- Merged by ISBN, then by title and first author, with Google first (ADR 005).

**A result already in the library opens that book** (by any ISBN, then title and author)
instead of adding a second copy, which would split its sessions across two books. Another
edition of the same work counts as the same book.

**Every result is remembered in `metadata_cache`, and offline search reads it.**
- **Where it is written:** `cacheSearchResults` lives in `write.ts`, the only file allowed to
  write. It is local only: no queue row, no change signal. Device check 14b holds that.
- **Offline:** the Add screen shows books searched before, and says so.

**A book and its first read are written together: `writeTogether`.**
- **The risk:** two calls could leave a book with no read, which no list shows and no screen
  opens.
- **Held by:** device check 14a, where a colliding read rolls back the new book too. Watched
  failing: with one transaction per row, "the new book survived its failed read".

**Covers are downloaded to the app's documents on add** (`db/coverFiles.ts`).
- Best effort and never blocking.
- Retried when the book is next opened online, at most once per launch.
- **On the phone:** a 16.7 KB local file was recorded. After a cold start in airplane mode, with
  React Native's memory cache gone, the real cover showed from that file.
- **Held by:** device check 14c. Watched failing with the path never recorded.
- **Noted:** the device pass's own test covers land in the same `covers/` folder, named by book
  id. Harmless, and cleaned up with the purge in Slice 8.

**Search your library matches in TypeScript, not SQL `LIKE`.**
- **Why:** SQLite's LIKE ignores case only for ASCII and never ignores accents.
- **On the phone:** "toibin" found Tóibín and highlighted it.
- **Shared rule:** both searches use `domain/searchText.ts`, one rule in one place.
- **Every word must match, as a prefix.** Seen on the phone: "offline" did not find
  "ovOffline", correctly.

**Manual entry and Edit details are one full-screen form** (`BookFormScreen.tsx`).
- **Required:** only the title.
- **Length:** pages for print, minutes for an audiobook, never both.
- **ISBN:** must pass its checksum.
- **Cover:** a colour, not a photo. Photo covers are Plus's "custom covers" (08-MONETISATION).
- **Keyboard, seen on the phone:** with the keyboard up on the last field, "Add to library"
  stays on screen above it.

**"I already finished it" moves the book to Finished, status only**, as Slice 3's "I finished
the book" does. The finish flow with rating and date is Slice 5's.

**Not built, deliberately:**
- **The barcode button:** no scanner this slice, and a button that does nothing is worse than
  none.
- **"More editions":** each result is already an edition or a work, and grouping needs data
  neither API returns reliably.
- **The logging FAB:** the Add tab stays Add a book (Slice 3's revisit, closed).

**Forced failures gained two:** a search server error, which shows the error card and not the
offline banner (seen on the phone), and a failed add or edit, which keeps the form and title and
asks before discarding (seen).

**Watched failing, node:** 10 of 10 mutations went red after the added test:
1. Non-matching results kept.
2. An Open Library publisher.
3. Library match without ISBN.
4. A bad ISBN checksum.
5. An edit rewriting the page count.
6. The phone's offline error as unavailable.
7. Library search needing one word.
8. A corrupt remembered result accepted.
9. `writeTogether` without the change signal.
10. The narrow-row pill rule.

Clean: 313 of 313.

**Watched failing, device:** 14a and 14c as above, each 31/32. Clean 32/32 before and after,
with sources byte-identical and `reader.db` md5 unchanged throughout.

**My script errors, discarded, not counted:**
- **An accidental save:** a swipe started over the Save button with the keyboard up and saved a
  half-filled "Godaan". The app saved exactly what was entered.
- **An uncleared title:** too few backspaces left the prefilled title in place.
- **A mid-animation tap:** a fault chip was tapped during Settings' opening animation.

Each was re-run with the step checking its state.

## 2026-09-14 · Slice 3 on the phone, part two: layout, light mode and a timezone
**The owner changed the settings.** The phone reports:
- **Font scale 1.3.** That is the largest the phone's Display setting reached, so **200% is
  still not tested**.
- **Display density 542**, which is about 320 dp wide, narrower than the 360 dp target.
- **Light mode.**
- **Zone Pacific/Pago_Pago (UTC−11)**, not Chicago. It is further behind UTC and a harder case.

**Layout, every Slice 2 and 3 screen, screenshotted.** Wraps rather than clips: the actions
sheet's four chips, quick add (Finished on a second line), Session complete's tiles, and book
detail's badges. Save stays above the keyboard. The status tabs scroll sideways, as designed.
**Two failures found and fixed:**
1. **Library rows lost their label.** The Continue pill beside the text left "The Long ..."
   and "Sally Roo...".
   - **Fixed:** the pill moves below the progress line when the window's width divided by the
     font scale is under 360 dp (`features/library/rowLayout.ts`, 4 tests, watched failing).
     Re-shot: whole titles and authors.
   - **Over** a smaller pill, which would still truncate at 1.3x.
2. **Recently Deleted titles cut at two lines** ("Northern Machine i..."). Now three.

**Timezone, Pago Pago:**
- **The UTC-boundary case:** a session logged for 11:00 pm yesterday is 10:00 UTC today, and
  its `local_day` is 2026-09-12, yesterday.
- **4:00 am today** is 2026-09-13.
- **The pace bars stood on Sat 12 and Sun 13.**
- **A session written in IST kept its `local_day` 2026-09-14** (03-DATA-MODEL, rule 3).
- `reader.db` and its WAL had unchanged md5s.

**Filed against Slice 7, not fixed:** after a zone change, a row can say "Today" (from
`occurred_at` in the new zone) while its bar is on another day (its stored `local_day`). Both
follow the documented rules. They disagree only for a traveller, and Stats is where to decide
which one a row shows.

**Still open:** 200% font. The phone's Display → Font size tops out at 1.3. Try Accessibility →
Display size and text, which reaches 2.0 on Android 14+. Setting it back to the owner's zone is
the owner's.

## 2026-09-14 · Slice 3 on the phone: the backdated edit holds; four bugs found and fixed
**Setup:** Nothing Phone 2a, Android 16, Asia/Calcutta, dark mode. New debug APK installed over
the old one (`adb install -r`). Sandbox library. `reader.db` and `reader.db-wal` md5 identical
before and after (`1623cf85…`, `6ab7bff2…`).

**The backdated session, then edited: all ten steps pass.**
- **Logging:** Continue opened the logger with "Now on page" focused and Save above the
  keyboard. Typing 309 from 281 showed 28 pages. The date dialog took Tue 8 Sep and the time
  dialog 11:00 pm, and When read "Tue 8 Sep, 11:00 pm".
- **Session complete:** 28 pages, Page 281 → 309, 47%, 350 pages left.
- **Book detail:** the row read "8 Sep, 11:00 pm", above the August sessions.
- **Pulled database, after the save:** `occurred_at` 2026-09-08 23:00 IST and `local_day`
  2026-09-08, with exactly one upsert queued.
- **Edited to Thu 10 Sep, 4:00 am:** `local_day` 2026-09-10 and `occurred_at` 04:00 IST.
  Positions and `created_at` were unchanged, and two upserts were queued. Stats showed one bar,
  "Thu 10 Sep, 28 pages", and nothing on Tuesday or Wednesday.
- **Moved to today:** both the list and the bars followed.
- **Session complete's streak followed a date change before Done:** 1, then 0 once the new
  session moved to last Tuesday.
- **Future times:** 11:00 pm today was refused ("That has not happened yet") with Save disabled.
  15 Sep was disabled in the date dialog, and cancelling the dialog changed nothing.

**The rest of the loop, passed:**
- **Taps:** Continue, type, Save is two taps.
- **Quick add:** +25 from a typed 340 gave 365, and Finished gave 659.
- **Warnings that still save:** past the page count, and an overlap naming "Today, 12:05 am".
- **Refused:** an end equal to the start, and "2.5".
- **Formats:** Pages → Minutes restarts at minute 0 and back at page 329. An audiobook opens in
  minutes with "Finished, minute 900"; in Pages it has no Finished.
- **Want → Reading:** logging on a Want book moved it to Reading, listed once.
- **Session complete:** the stepper stopped one page after the start. Close with a change asked,
  and said the session stays saved. The note saved on Done. I finished the book moved the read
  to Finished and is absent on a finished read.
- **Unsaved input:** Back asked, Keep editing kept 340, and Discard left. Back after a save did
  not ask.
- **Delete and restore:**
  - The undo toast appeared on book detail with the confirm sheet gone.
  - Recently deleted named the session by pages, book and date.
  - Restore worked.
- **Double taps:** Continue, Save and a session row each acted once.
- **A removed book:** both session routes, opened by deep link, said the session is not here,
  and Go back returned.
- **Forced failures, all four:**
  - The Library error with Try again, never an empty-library claim.
  - Book detail's error, not the not-in-library screen.
  - Move and remove each kept the sheet open with the reason.
  - A failed save kept 345 and the logger, still asked on Back, and wrote no row.
- **Dark mode:** screenshots of the logger (keyboard up and down), Session complete, book
  detail, Recently deleted, Stats pages and time. All readable.

**Found on the phone, each fixed and re-verified there:**
1. **Undo restored the session and the screen never showed it.**
   - **What happened:** the database had the row live with a restore upsert queued, but book
     detail still listed it as gone. The screen was focused throughout, so its reload-on-return
     had nothing to react to. The Library under "Book removed" had the same shape.
   - **Fixed:** `db/changes.ts`. `write.ts` signals after every committed change, and
     `useReloadOnChange` reloads a focused screen at once and an unfocused one on its return.
     It replaces `useOnRefocus` on book detail and the Library, which also ends the
     query-twice-on-return.
   - **Re-verified:** Undo on book detail and on the Library each redraw in place.
   - **Held by:**
     - `changes.test.ts`, with a control over every public write function.
     - Device check 13, which now asserts a restore signals exactly one change.
     - Watched failing: three node mutations and one device mutation.
2. **The picker's `onChange` is deprecated in v9, and its warning raised LogBox's toast**, which
   swallows taps (2026-09-10). Now `onValueChange` and `onDismiss`, and the warning is gone.
3. **Skeleton rows shimmered under "Could not open your library" forever**, as if still loading.
   Seen only because of the forced failure. Now they show only while loading without an error.
   The other gated screens were checked and already correct.
4. **Sessions from last year read "23 Aug"**, as if this year. Session rows now use
   `formatWhen`, which is tested with a year, and read "Sat 23 Aug 2025, 1:40 am".

**Device pass:** RUNTIME 29/29 · COMPILE-TIME 1/1. Check 13 went red under each of three
mutations, each 28/29 with only check 13 failing:
- **Want → Reading skipped:** "did not move it to Reading".
- **An edit that writes nothing:** "the date edit did not save".
- **A silent restore:** "the restore signalled 0 changes".

The sources were compared byte for byte after restoring. The clean run came before the
mutations, on identical sources.

**My script errors, discarded, not counted:**
- **Three failures were the Back key:** Android's first Back closes the keyboard, which the
  logger opens with. The rerun hides it first.
- **The Minutes toggle was tapped while behind the keyboard.**
- **The first Undo tap landed after the toast's 5 seconds:** each view-tree dump takes about
  2 s. The rerun taps from a screenshot at 1 s.

**NOT done, because each needs the phone's settings changed by the owner:**
- **200% font:** the phone is at 1.0.
- **A 360 dp display size:** the phone is at ~462 dp with a density override of 375.
- **Light mode for the Slice 3 screens.**
- **A US timezone.**

Slice 3 is not done until these are seen. They are items 4 and 5 of
`docs/device-checks/slice-3.md`.

## 2026-09-13 · Slice 3: the core loop, decisions as they were made
**State: built, tested under node, NOT yet verified on the phone.** The checks the phone must
pass before this slice is done are in `docs/device-checks/slice-3.md`, with the backdated
edit first, because that case is the product thesis (05-BUILD-PLAN).

**The logger is a full screen, as designed, and the keyboard question is settled without a
new library.**
- **Chose:** `Session.dc.html` draws a full screen, so the logger is a route
  (`app/session/log.tsx`), not a sheet. It measures how much of itself the keyboard covers
  (`ui/keyboardOverlap.ts`) and pads its footer by exactly that, so Save rides above the
  keyboard whether or not Android resized the window.
- **Over:** `react-native-keyboard-controller`, which the 2026-09-10 entry said might earn its
  place "if Slice 3's logger puts several fields in a sheet". It does not put them in a sheet.
  **Over** padding by the keyboard's height, which doubles the gap on a window Android does
  resize.
- **Revisit if:** the phone shows the footer covered or floating at 200% font with the
  keyboard up. The measurement is a guess about an edge-to-edge activity until then.

**Android's own date and time pickers** (`@react-native-community/datetimepicker`, the
version Expo 57 resolves).
- **Chose:** the native dialogs, date then time, as promises (`features/session/pickWhen.ts`).
  They are accessible, localised, and familiar, and the date field is the most important
  control in the app.
- **Over:** a JavaScript calendar, which would be a hand-built accessibility surface on the
  one screen TalkBack must be able to complete (06-CONVENTIONS).
- **Cost:** a native module, so a native rebuild before the phone checks. Its config plugin
  only themes the dialog colours and is **not** added, so no prebuild is needed. Revisit the
  plugin if the dialogs look wrong in either theme.

**What the logger allows, refuses and only points out** (`features/session/sessionForm.ts`,
25 tests):
- **Any past day, never the future.** A session dated later than now plus one minute is
  refused with a reason. **Over** allowing it: a future-dated session would count towards a
  streak day that has not happened. The picker cannot pick a future date, but it can pick a
  later time today, hence the check.
- **The end must be after the start.** Backwards and zero-length sessions are refused on the
  field. **Over** accepting them and marking them "needs fixing" as imported rows are: the
  logger is where the typo happens, so it is where to catch it.
- **Past the book's length saves, and says the page count may be wrong.** Page counts from
  APIs are the usual culprit (`exceedsKnownLength`).
- **Overlapping another session saves, and names that session.** Totals are sums of spans,
  so a backfill over pages already logged counts them twice. The reader may mean it (a
  re-read chapter), so it is not refused. They cannot find the double count later unless
  told now. Touching boundaries (184 → 212 then 212 → 240) is not an overlap.
- **An edit writes only what changed.** An unchanged date is never re-sent, so its
  `local_day` is never recomputed in a new timezone (03-DATA-MODEL, rule 3). An edit that
  changes nothing writes and queues nothing.
- **A new session opens with "Now on page" focused**, so Continue, type, Save is the two-tap
  budget.

**Logging on a Want book moves it to Reading.** A reader logging pages has started. The move
is a second write after the session, not in its transaction (no public write runs inside
another's), so if only the move fails the session is still saved. **Over** leaving it on Want,
which hides the book being read from the Reading tab.

**Session complete edits are written on Done, and every number follows the edit first.**
- The stepper and Change edit the screen. Done saves the patch and the quick note. Leaving
  with changes asks, and says the session itself stays saved.
- **The streak is computed from the other sessions' days plus the day being chosen**
  (`getReadingDays(except)`). Moving tonight's session to last Tuesday drops today from the
  streak before Done is tapped. **Over** showing the saved streak until Done, a number the
  screen would then contradict.
- **Time left comes only from the reader's own timed page sessions**, or an audiobook's
  remaining minutes. With no timer data it shows pages left. **Over** an average reading
  speed: a number about somebody else.
- **"I finished the book" moves the read to Finished, status only.** The finish flow with a
  rating and date is Slice 5. Writing `finished_at` here would store a date the reader did not
  choose.
- **The stepper is not press-guarded.** Five quick taps mean five pages, and each tap only
  edits the screen.

**A minimal daily pace chart ships in Slice 3, because its "done when" asks for one.**
- **Chose:** the Stats tab shows the last 14 days by `local_day`, pages or time (never
  summed), a bar for every day (`features/stats/paceChart.ts`). The sessions are counted in
  TypeScript by `contribution()`.
- **Over:** waiting for Slice 7, which would leave "a correct daily pace chart" unverifiable
  until then. **Over** a SQL sum, which would be a third copy of the counting rule.
- Slice 7 builds the rest of Stats around it.

**Unsaved input is guarded by route, not by button.** `ui/useUnsavedGuard.ts` holds any
removal of the screen (header back, Android back, `router.back()`) while a form is dirty, via
React Navigation's `usePreventRemove`, imported from expo-router's build as `TabBar` already
does. A screen that saves calls `leave()` first, or it would ask whether to discard what it
just saved.

**The toast-under-a-Modal problem is avoided, not fixed.** Slice 3 had to be the first slice
with sheets that delete. It is not: deleting a session asks in `ui/ConfirmSheet.tsx`, then
leaves the screen, then raises the toast on book detail. **Still open, refiled to Slice 5b:**
a toast raised while a sheet stays open (a note deleted from inside a sheet) is still drawn
beneath it.

**Recently Deleted lists sessions deleted on their own.** A session deleted with its book is
not listed separately: restoring the book brings it back, and `restoreRow` would refuse it
under a deleted book anyway. `sessionLine` moved from the book feature to `domain/` so both
screens describe a session the same way (features may not import each other).

**The deferred Slice 2 failure switch is built** (`lib/faults.ts`): library list, book detail,
actions sheet action, session save. `setFault` refuses unless passed `true`, and its callers
pass `__DEV__` literally, which a test with a control holds. **Over** reading `__DEV__` inside
the module, which node could not load to test. Seeing each failure render is on the phone
checklist.

**Device check 13 imports the session, stats and trash features.** It is the first check that
does. The device pass exists to run the real path, and Slice 3's path starts in the feature:
form → row → write → edit patch → streak days → pace query → trash → restore, plus a forced
failure that must write nothing. **Revisit if** a feature module starts importing the device
pass back.

**Not built, deliberately, each filed:**
- **A FAB for logging.** The raised tab is Add a book (Slice 4). Logging opens from the
  Library's Continue pill and from book detail's Log pages. Revisit with Slice 4's Add screen.
- **The recovery sheet asking where the reader got to.** A recovered session (a duration, no
  positions) can now be edited from book detail to add them, which is what the 04-SCREENS
  note promised the logger would allow. A direct prompt belongs to Slice 6's timer finish.
- **The goal's query and its surface.** `goalProgress` is tested in `domain/streaks.ts`. Its
  first surface is Settings' yearly goal and Stats (Slice 7), with the `goals` unique index
  that slice already owns.

**Watched failing, node:** 7 mutations, each red:
1. Future dates allowed.
2. An edit always re-sends the date.
3. Backwards sessions allowed.
4. The streak counts the saved day, not the chosen one.
5. The pace window skips empty days.
6. A picked date keeps the picker's time of day.
7. A release build can arm a fault.

Restored: 244/244.

## 2026-09-13 · Slice 2: the Library and book detail, decisions as they were made

**A sandbox database, separate from the device pass.**
- **Chose:** `EXPO_PUBLIC_SANDBOX_DB=1` opens `devcheck.db`, like the device pass does, but
  without auto-running the pass. `usesSandboxDatabase` in `lib/config.ts` is true under
  either flag. The 2000-book seed refuses without it.
- **Over:** seeding the reader's library, which is what "test on the phone" used to mean and
  exactly what the owner's library suffered from twice.
- **Because:** screens need thousands of rows to develop against, and the rule since
  2026-09-12 is that nothing mass-writes a real library.

**`writeBatch`, and one implementation of an upsert.**
- **Chose:** `writeBatch(table, rows)` writes N rows and N queue entries in one transaction,
  all or none. `writeRow` and `writeBatch` both call a private `upsertOne`, which derives
  `local_day`, writes, checks parents and enqueues.
- **Over:** a second copy of that logic in the batch function.
- **Because:** two copies is how a rule holds in one entry point and not the other, which is
  this codebase's most expensive recurring bug.
- **Measured, and a warning for Slice 9:** the seed wrote 2000 books, 2126 reads and 11,132
  sessions **in 146.7 s on the phone**. The time goes to drizzle building a statement per
  row plus a parent-check SELECT per row, not to SQLite. A 2000-book Goodreads import on this
  path would take minutes. **Filed against Slice 9:** prepared statements reused across the
  batch, and a set-based parent check, before import is built. Not optimised now: the only
  caller is a dev seed.

**The Library shows what works, and nothing that goes nowhere.**
- **Chose:** status chips (Reading, Want, Finished, DNF), then book rows with cover, title,
  author and progress. The whole row opens book detail.
- **Over:** building the rest of `Main.dc.html` now. The Continue pill opens the session
  logger (Slice 3). Discover and search belong to adding a book (Slice 4). The dock's
  button starts the timer (Slice 6). The stats strip is Stats' numbers (Slice 7).
- **Because:** a control that goes nowhere is worse than a control that arrives with its
  destination. Each is filed in `05-BUILD-PLAN.md` against its slice.
- **The chips are `reads.status`, not the `shelves` table.** Free-form shelf filtering arrives
  with the slice that first creates shelves.

**Progress is aggregated in SQL, once, and held equal to the domain rule by a device check.**
- **Chose:** `db/progressAggregates.ts`, shared by the Library and book detail, grouped by
  read in the same statement that reads the books.
- **Over:** a per-row query (2000 queries), or loading every session to call
  `contribution()` in TypeScript.
- **Because:** the rule now exists twice, in SQL and in `domain/stats.ts`, and that is a
  known hazard here. **Device check 10** samples 60 real reads, plus one read built from
  backwards, half-filled, recovered and timed-audiobook sessions, and asserts pages,
  minutes, unusable and both positions agree.
- **Measured on the phone, 2000 books:** Reading 221 ms cold, then 42–74 ms. Want 138 ms.
  Finished (about 1,040 books) 251 ms. DNF 43 ms. All under the 400 ms threshold, so no
  skeleton flashes. **Revisit if** a tab passes 400 ms: paginate that one query.

**What progress says lives in `domain/progressDisplay.ts`,** not in the Library feature.
Book detail needs the same rules, and features may not import from one another. Tested:
no page count means no bar and never 0%; an audiobook shows time; an unstarted book says
nothing.

**Book detail and its actions sheet.**
- **One FlashList for the whole screen**, with the hero and progress as its header and
  earlier reads as its footer. A read can hold hundreds of sessions, and a ScrollView
  mounts every one.
- **Moving to Finished writes only the status, never `finished_at`.** Null means "derive
  from the sessions", and a computed value there cannot later be told apart from a date the
  reader chose (03-DATA-MODEL). The finish flow, with its date and rating, is Slice 5.
- **Remove asks once, in the sheet, then soft-deletes, leaves the screen, and raises the
  undo toast.** A book takes its sessions and notes with it, which is large enough to
  confirm even with an undo. The toast rises only if `changed`: a book removed from
  somewhere else gets no Undo for a delete this screen did not do.
- **The session rows have no edit pencil yet** (Slice 3). A row that counts for nothing says
  so. A timed session with broken positions says "only its time counts": its duration is
  still counted, so "not counted" would be false.
- **Ratings are drawn with a clip ID per instance.** SVG ids are document-global, which is
  the bug `ScreenGlow` shipped with. Book detail shows several ratings at once.

**Found on the phone, each fixed and re-verified there:**
- **Switching tabs kept the previous tab's scroll offset.** After scrolling Finished, the
  Reading tab opened hundreds of rows down, with its first row clipped under the chips. That
  is also why a scripted tap on "the first row" silently missed and every later step of that
  run meant nothing; the run was discarded, not counted. Fix: `key={status}` on the list,
  one list per tab. Verified: after five flings on Finished, Reading reopens at its first
  book.
- **A book with no author left a blank line** where the byline would be. An empty `<Text>`
  still takes a line's height. The byline now renders only when there is something in it.
- **Rows touched.** FlashList has no `gap`, so the list uses an `ItemSeparatorComponent`.
- **Sessions sharing one timestamp listed in arbitrary order**, showing 57 → 76 above
  76 → 95. The seed stacked sessions by clamping a day counter at zero; the seed now spaces
  them strictly. The query also tie-breaks on position, because two real sessions logged in
  the same minute are ordinary.

**Verified end to end on the phone** (2000 books in the sandbox; every step checks its
precondition and stops if it fails): open a book; the actions sheet; move to DNF, after
which the hero badge says DNF; remove with confirm; back on the Library with the undo toast;
Undo brings the book back on the DNF tab; remove again, then find it in Recently deleted,
Restore, and see "Book restored". No crashes. The library's md5 was unchanged throughout.

**Device checks 10 and 11, RUNTIME 27/27:**
- **Check 10** found 61 reads agreeing between the SQL aggregate and `contribution()`,
  including a read built from 7 awkward sessions. **Watched failing:** with
  the aggregate made to ignore durations, the pass went 26/27 with check 10 red; restored, 27/27.
- **Check 11: deleting a book with 500 sessions takes 701 ms, and restoring it 1188 ms**, on
  the JS thread, in a debug build. The cascade is correct at that size (500 delete queue rows,
  all 500 back). But against "tap to saved under 100 ms" it is a visible freeze for a book
  with a long history. **Filed against Slice 9**, together with the seed's slowness: both are
  per-row statement building. The fix is set-based `UPDATE … WHERE read_id IN (…)` plus one
  `INSERT … SELECT` into `sync_queue`. It must keep per-row queue entries and the exact
  timestamp that restore keys on, so check 9a must pass unchanged afterwards. Not fixed now:
  a typical book has tens of sessions, which is tens of milliseconds, and nothing loses data.

**60fps, measured on a release build rather than argued.** The build was a local release with
the sandbox flag, on the 2000-book library: three runs of 12 flings each through the
Finished tab.
- **Missed frame deadlines:** 1, 0 and 0 in 1,890, 1,908 and 1,944 frames.
- **p50** 8–10 ms, **p90** 13–14 ms, **p95** 15 ms, **p99** 17–18 ms.
- **The budget in 06-CONVENTIONS is 60fps, and it holds.** The panel runs at 120 Hz, where
  28–43% of frames exceed 8.3 ms ("Janky frames (legacy)" in gfxinfo). No FlashList tuning
  was done beyond stable `renderItem` and `keyExtractor` and memoised rows, because none was
  needed at 60fps.
- **A debug build is not evidence either way:** its p90 was 40 ms. **Revisit if** a 120 Hz
  target is ever adopted, or a row gains an image that loads.

**Migration `0001` against a populated v1 database now runs under node**
(`src/db/__tests__/migrations.test.ts`). It uses 2000 books, duplicate live read numbers, a
soft-deleted duplicate, sessions, shelves, notes and a queue.
- **Asserted:** the renumbering is in creation order, and every other table's rows hash the
  same before and after. The soft-deleted duplicate is untouched, the repaired reads are
  enqueued, and the indexes exist.
- **Positive control:** the migration drizzle-kit actually generated, without the repair,
  must fail on the same fixture.
- **Watched failing** against three broken versions of `0001`: no renumber, reverse order,
  and no enqueue. The real file was restored and its md5 matched.
- This closes the regression audit's highest-value gap. **Still not covered by it:** the
  startup sequence around a migration, which needs expo-sqlite and stays device-only.

**The cover fallback, filed by the 2026-09-12 review.** A cover whose local file is gone, or
whose URL fails offline, now falls back to the URL and then to the initial, instead of
leaving a blank box. The chain is `ui/coverSource.ts`, with tests. The `onError` wiring
itself is untested until a real cover exists (Slice 4).

**`books.cover_color` is a reader-chosen override, never a stored derivation.** Null means
derive it from the title at render. That is the `started_at` rule, chosen over dropping a
column that ships in `0000`, which would cost a migration for nothing.

**The one review pass for this slice, 2026-09-13: no silent data loss found.** Walked
`writeBatch`, the re-read race (the unique index catches it), remove/undo/restore, the
missing-route path, and the aggregate against `contribution()` (check 10). Filed, not fixed:
the 500-session cascade time and seed time (Slice 9); the toast under a sheet (Slice 3,
unchanged); the Finished tab's 251 ms query (revisit past 400 ms); and stray
`"/../features/…"` entries in Expo Router's generated route types, which are harmless noise
from type generation.

**The faint-token guard now allows an SVG `fill={…}` or `stroke={…}`.** The empty half of a
rating star is decoration drawn in `textGhost`, and a React Native `<Text>` takes no `fill`.
Two new controls: a `fill={c.textGhost}` path must pass, and a real text colour on a line
that merely contains the word "fill" must still fail. **Watched failing both ways:** with
the exemption removed, the Stars component and the control went red. With an exemption
broad enough to swallow any "fill", only the new control caught it.

## 2026-09-13 · The owner-requested review of Slice 2, and what it found that the slice review did not
**Context:** the owner asked for a senior-engineer review of Slice 2 covering shortcuts,
documentation, and the paths that are not the happy one. It came after this slice's own
review pass, which reported "no silent data loss found". **That was wrong in one place.** A
re-read book was listed twice, and the Finished-tab scroll measurement above ran over a list
padded by about 140 duplicate rows. All findings were fixed on the owner's instruction
("do them all").

**Fixed, each with a check that was watched failing:**
- **The sandbox and device-pass flags were honoured in release builds.** A release built with
  either flag exported would have put readers' books in a file the next build never opens.
  Now `lib/databaseChoice.ts`: a release build opens `reader.db`, always. Tested, including
  the wiring in `config.ts` and `client.ts`, with a control. The sandbox moved to its own
  `sandbox.db`, so device passes stop filling it with soft-deleted rows.
- **A re-read book appeared on two tabs.** Each read was filtered by its own status. Now
  every list filters with `db/currentRead.ts` (the live read with the highest number).
  **Re-read could also start while the book was still being read,** creating two reads in
  progress. `domain/reads.ts` allows it only after finished or DNF. The sheet hides it and
  `startReread` refuses it. Device check 12 holds the listing.
- **A tab switch drew the previous tab's rows** under the new chip for up to 251 ms
  (`features/library/tabData.ts`).
- **Every screen open ran its query twice,** because `useFocusEffect` also fires on mount
  (`ui/useOnRefocus.ts`).
- **A double tap on a Library row opened book detail twice.** Only `Button` debounced.
  `ui/pressGuard.ts` is now the one rule, used by `Button`, header buttons and rows.
- **InlineError's safe line measured 4.03:1 in light mode.** It now uses `textSecondary`, and
  the pair is in the contrast test.
- **"Audiobook" had three definitions.** It now has one, `isAudiobook` in
  `domain/progressDisplay.ts`.
- **Seeding twice doubled the sandbox,** and the seed used random UUIDs. It now refuses a
  sandbox with live books and derives ids from its seed. A 12-book, no-DNF seed gives the
  empty-tab state.
- **Watched failing, node:** 8 mutations went red, one per fix above except the seed. They
  were: release opens a sandbox; config passes `true`; re-read allowed while reading; a tab
  shows another tab's rows; double taps accepted; the pending rule off by one; audiobook
  defined by length alone; the inline error pair measured with the old token.
- **Watched failing, device:** check 12 went red under `max`→`min` ("the listed read is not
  the newest"). It went red again with deleted reads counted ("the older read did not become
  current"). Both runs were 27/28; restored, 28/28.

**Found while verifying the fixes on the phone: Book actions never opened.** Nothing threw,
Back worked, and it typechecked. Logging showed `mounted` going true, then false again with
`visible` still true.
- **Cause, from the logs, not argued:**
  - `Sheet` derived `mounted` during render. A closed sheet's first exit animation finished
    on mount and called `setMounted(false)` on a value already false. React bailed out of
    that render but kept the update queued at default priority.
  - The tap rendered at sync priority and skipped that update, so the hook's base state
    stayed false.
  - React does not carry a render-phase update (`setMounted(true)`) into base state while
    an update is skipped. The deferred render replayed from false.
  - `prevVisible`, with nothing skipped, kept its new value, exactly as logged.
- **Why the Slice 2 run did not see it:** probably the double query. A second load
  re-rendered the screen and flushed the queued no-op before any tap. Removing it left the
  update waiting. Not proven.
- **Chose:** an open sheet renders from `visible` alone. The lagging state (`exiting`) only
  extends rendering through the exit. A closed-on-mount sheet runs no exit animation. The
  exit's completion checks the current visibility (`ui/sheetMount.ts`).
- **Over:** only guarding the completion callback. That was tried first, and the sheet still
  did not open on the phone, because the bad update was the no-op itself, not a late one.
- **Because:** losing `exiting` can now only cut an exit animation short. It can never keep
  a sheet shut.
- **Held by:** `sheetMount.test.ts`, 7 tests, including a wiring check with a control. It
  went red under 3 mutations: render from exit state only, exit ignores a reopen, and the
  original `Sheet.tsx`.
- **Not held by any automatic check:** the React behaviour itself, since no renderer is
  installed for node. The phone run below is the evidence.
- **Reopening during the exit cannot be done by touch.** The closing Modal's scrim covers the
  screen, so a tap there closes it. A scripted attempt proved only that, and it was
  discarded, not counted.

**Verified on the phone, sandbox.db, light mode** (every step checks its precondition):
- **Empty states:** an empty library, an empty Recently Deleted, and an empty DNF tab
  ("Nothing abandoned").
- **Seeding:** the 12-book seed, and a second seed refused.
- **Double tap:** a double tap on a row opens detail once.
- **Actions sheet:** a book being read has no re-read row. Across 10 open/close cycles,
  alternating Back and scrim, it opened 10/10 and closed 10/10.
- **Re-read of a finished book:** the hero says READING · READ 2 and Earlier reads lists
  read 1. The book is gone from Finished and appears once on Reading. The pulled database
  agrees: reads (1 finished, 2 reading), and 0 books listed more than once.
- **Removed book:** a removed book's deep link shows "This book is not in your library", and
  Back to the library returns.
- **Device pass on devcheck.db:** RUNTIME 28/28, COMPILE-TIME 1/1. `reader.db` md5 unchanged
  throughout.

**Corrections to earlier claims:**
- **The release scroll measurement's Finished tab held about 140 duplicate rows.** The
  timings stand as a measurement of that list. A sandbox release build is now impossible by
  design; measuring scroll again needs a bench variant with its own package id (Slice 11).
- **"The seed is deterministic" was too strong.** Ids, titles and shapes repeat. Dates sit
  at the same distances from the day it runs.
- **expo-sqlite bundles SQLite 3.50.3, not 3.49.1.** Both `vendor/sqlite3/sqlite3.h` and
  check 0 on the phone say so. Node's is 3.51.3, so a migration using syntax newer than 3.50
  still passes under node and fails on phones. It is run on the device before it ships.

**Still unexercised, and why:**
- **The sheet's and the Library's failure renders** need fault injection that does not exist.
- **200% font scale, a 360 dp display, TalkBack, and dark mode for the new states** need
  the phone's system settings, which the owner changes, not the assistant.

### Device checks deferred from Slice 2
- **Chose:** the owner deferred the unexercised checks above, filed where they are due:
  - **Before Slice 3 is done:** a dev-only switch to force failures, and one combined
    200% font, 360 dp and dark-mode pass over the Slice 2 and 3 screens.
  - **Slice 11:** a TalkBack pass over every screen.
- **Over:** running them now, before Slice 3.
- **Because:** none can lose data, which is the one-review-pass rule's bar. Slice 3 adds
  the riskiest layout (a form in a sheet with the keyboard up) and the first write failure
  a reader can hit, so one pass then covers both slices, where a pass now would be repeated
  anyway.
- **Revisit if:** a reader reports a layout or accessibility break on a Slice 2 screen
  before Slice 3 ships.
- **Recorded, not fixed:** the contrast `SPECIAL` list is not wired to the components
  (06-CONVENTIONS).

## 2026-09-12 · The first release build: 112 MB universal, and the APK budget needs revisiting
**Measured, not guessed**, from the first release build this project has ever produced
(built locally to measure the crash rate, not to ship):
- **112 MB universal APK**, carrying four ABIs.
- Native libraries per ABI, uncompressed: **arm64-v8a 23.3 MB**, armeabi-v7a 16.1 MB,
  x86 24.5 MB, x86_64 23.9 MB.
- **Minification and resource shrinking are both OFF**: `android/app/build.gradle` reads
  `android.enableProguardInReleaseBuilds` and `android.enableShrinkResourcesInReleaseBuilds`,
  and Expo defaults both to false.
**What this means for the `< 15 MB` download budget in `06-CONVENTIONS.md`:** a Play
download is one ABI from an AAB, so the right comparison is roughly 23 MB of native
libraries **before** any JS, fonts or resources. The budget is already exceeded by the
native floor of React Native with Hermes, Reanimated, SVG, SQLite and screens.
**Not acting on it now**, deliberately: this is Slice 11 work and it has three levers to
try before the number means anything — R8 with resource shrinking, an AAB rather than a
universal APK, and dropping the x86 ABIs, which Play does not serve to phones. **What
changes today is that the budget is a measured number with a plan, not an aspiration.**
**Revisit at Slice 11**, with those three levers applied, and set the budget to what the
platform actually allows rather than to what was hoped for.

## 2026-09-12 · Regression audit: every bug in this log, and whether a check would catch it again
Rule 1 says every fixed bug gets a check that fails without the fix. This is the audit of
what we actually have, as of today. It is the backlog for that rule, not a claim of
coverage.

**Covered, automatically** (a node test, a type assertion, or a device check):
async transaction (types + guard + controls + device 2a/2b) · `runInTransaction` accepting
async (`transaction.types.ts`) · `created_at` rewritten (device 1c, added today) · vacuous
schema guard (extractor test + shape control) · restore silently doing nothing (device 6) ·
restoring a newer-schema backup (6b) · no-op delete/restore enqueueing (1b) · the
soft-delete cascade (7, 9a) · restore orphaning a row, refusals, the unique clash (9a–9e) ·
`local_day` derivation and the `undefined` patch (8a–8d + types) · the recovery sheet
inventing a duration (`recoveryPolicy.test.ts`) · gate order and the blanked retry
(`gateOrder.test.ts`) · the kill switch locking readers out (`forceUpdatePolicy.test.ts`) ·
**public keys read through `expo-constants`** (`config.test.ts`, added today) · light-mode
contrast (`contrast.test.ts` + control) · the toast dropping an undo, and a silent undo
failure (`toastQueue.test.ts`) · backwards and half-filled sessions, the recovered session,
the position off-by-one (`stats.test.ts`) · streak boundaries and DST (`streaks.test.ts`,
now with a guard that it stays in the `test:tz` list) · the font never reaching the build
(`brand-font` + `native-fonts`) · the Metro block list · the `npm test` glob (+ control) ·
the every-launch backup (`migrationPlan.test.ts`) · out-of-order journal timestamps · Node
globals in app code (the two tsconfigs) · dependencies named only in config
(`config-deps.test.ts`) · the accent derivation (`theme.test.ts`) · the device pass running
on the reader's library (device check 0, added today).

**NOT covered. No automatic check would catch these again:**

| Bug | What is there instead | What would cover it |
|---|---|---|
| **Migration `0001` could not run on a populated v1 database** | a hand-run procedure in `09-ENVIRONMENT.md` | a node harness: apply `0000`, seed the violating shape, apply `0001`, assert the repair. `node:sqlite` is built in on Node 24 and the migrations are plain SQL, so this is buildable **without a device**. The highest-value gap here |
| **A `SELECT` holding a lock so the next line's checkpoint failed** (bricked upgrades) | the "relaunch after touching `client.ts`/`backup.ts`/`migrate.ts`" rule | the same harness, run as a sequence rather than as parts. The device pass calls `checkpointWal()` in isolation and passed 14/14 while upgrades were broken |
| **The splash config and the Sentry plugin never reaching a build** | nothing. The font half is covered | extend `native-fonts.test.ts` to assert the splash resources and `sentry.properties` exist in `android/` |
| **The backup named with the target version, not the data's** | device 5e asserts the name matches the argument | a test on `migrate.ts`'s choice of argument, which needs that decision extracted as a pure function |
| **`migrate.ts` actually consulting the plan** | device evidence, once | the same extraction: a pure `decideBackup(plan)` |
| **`ScreenGlow`'s gradient id colliding between two mounted screens** | nothing | a render test, which this project deliberately does not do. Accept, or make the id structural |
| **A sheet's input hidden behind the keyboard** | a doc rule and a device check by hand | nothing automatic. It needs the phone |
| **The Fabric SIGSEGV** | a counted loop, 0/100 on debug today | measurement only, by nature |

**Filed against Slice 2**: the migration harness and the sequence test, because Slice 2
already owns the 2000-book seed and migrations at scale.

## 2026-09-12 · The device pass runs on its own database
**The problem:** the pass wrote to the reader's real library. It seeds, soft-deletes,
renames `sync_queue`, restores backups over the live file and leaves rows and queue entries
behind. It touched the owner's library twice: once leaving two orphaned sessions from a
deliberately broken run, and then the repair of those orphans deleted a live WAL holding
2.3 MB of committed data. Slice 2 is when that library stops being disposable.
**Chose:** `EXPO_PUBLIC_DEVICE_PASS=1` makes the WHOLE APP open `devcheck.db` from launch —
gates, migrations, write path and checks — with its own `backups-devcheck/` directory. The
Settings button refuses to run without the flag and says why, and Settings shows which
database the build is on.
**Over:** switching the handle to a second database once the app is running. That mutates
global state under live queries, which is the class of bug this codebase keeps paying for.
Deciding once, before anything opens, cannot half-apply.
**Over, also:** a throwaway in-memory database. The pass's value is that it exercises the
real modules — migrations, WAL checkpoints, backups, the FK cascade — against a real file.
Only the file changes.
**Found while verifying, which is the point of verifying:** with a shared `backups/`
directory the pass's prune ranged over the library's backups, and its orphaned-sidecar
check counted `reader-*.db-wal` as orphans. Separate directories. The library keeps the
original path, so its existing backups are still found.
**Verified on the phone:** `devcheck.db` created, `reader.db` unchanged by md5 and mtime,
RUNTIME 24/24.

## 2026-09-12 · Standing rules after three bugs came back inside their own fixes
**The pattern**, in full in `CLAUDE.md`: each reintroduction was in the code written to fix
the original, within a few lines, in the same sitting. Each fix moved the hazard behind a
new name while the guard still named the old one — and every one of those guards was a
regex over source text, which protects exactly the spelling that existed when it was
written. Each original bug had no check that ran against the new code, and each fixed file
had gained a long, correct comment explaining why it was now safe.
**Adopted, with one amendment I would argue for:**
1. Every fixed bug gets a check that fails without the fix. **Amendment: "check" includes a
   type assertion and a device check, and where nothing can assert it — a native crash, a
   timing race — it is a counted measurement with the number written down.** Otherwise the
   rule quietly becomes "node test or nothing", and the bugs that hurt most here are the
   ones node cannot see.
2. A type beats a lint rule beats a comment. The places we still have the weaker form are
   listed in `06-CONVENTIONS.md` as candidates.
3. A guard counts only once watched failing, and is re-watched when the code it guards is
   rewritten. **Made automatic for textual guards by positive controls**: each is fed a
   known-bad sample every run, and prose it must not flag.
4. After fixing a bug, look for the same class in the rest of that file, and say what you
   found.
**Plus, and this is the one that saves the most time:** one review pass per slice, fixing
only what is silent and loses data. Everything else gets an entry filed against the slice
that needs it. Slice 1's review took longer than Slice 1.
**New checks this adds:** device check 1c (`created_at` survives an update — the
regression test bug #4 never had), positive controls in `no-bypass.test.ts`,
`contrast.test.ts` and `test-runner.test.ts`.

## 2026-09-10 · INCIDENT: I deleted the phone's live WAL. Recovered, verified, and the recipe now stops.
**What happened:** repairing two Devcheck orphans that a deliberate mutant run had left on
the phone, I followed the pull, edit and push recipe. The `adb push` failed: with
`MSYS_NO_PATHCONV=1`, `adb.exe` was handed a Git-Bash path it could not read. The script had
no `set -e`, so it carried on and removed the live `reader.db-wal` (2.3 MB of committed,
un-checkpointed data) and `-shm`. The phone was left with a main file missing that data.
**Why nothing was lost:** step 2 had pulled all three files before any change, and the app
was force-stopped. The repaired file, WAL folded in plus the two fixes, was pushed again
with a Windows path.
**Verified, not assumed:**
- The file was pulled back and compared with the untouched snapshot (opened in a copy):
  `integrity_check` ok, every table's total equal (87 books, 50 reads, 60 sessions, 505
  queue rows, 2 migrations).
- The only difference is the two intended sessions going live → deleted.
- One app launch in the window (23:51:21) came from another app's uid, not from these
  commands. It never reached JS and never opened the database: no `-wal` was created.
**The rule this adds**, now in `09-ENVIRONMENT.md`: the push steps run as one script with
`set -e`, the live WAL is deleted only after the copy succeeds, and `adb push` gets a
Windows path.
**The lesson, which is the project's usual one:** a recipe written for a human, who stops
when a step fails, was run by a script that did not.

## 2026-09-10 · Restore never orphans a row, undo reports failure, the delete copy is true
**The bugs:**
- The cascade kept "no live row under a deleted parent" on the way down only. Delete a book,
  then its shelf, then restore the book, and you got a live assignment to a deleted shelf.
- Restoring a session on its own brought it back live under a deleted read.
- `writeRow` and `updateRow` would attach or move rows onto deleted parents.
- The toast's undo was `() => void`, so a restore that failed vanished with the toast.
- The delete-book confirmation promised "Your sessions are kept", which the cascade makes
  false.
**Chose:**
- **A `PARENTS` registry in `write.ts`.** `writeRow`, `updateRow` and `restoreRow` check it
  inside their transaction and roll back on a deleted parent. `cascadeRestore` skips a
  child whose other parent is still deleted, leaving its subtree deleted too.
- **Refusals name the fix.** "Restore the read first", and a unique-index collision says
  "clashes with something added since". The collision is found by reading drizzle's
  wrapped cause chain.
- **`showUndo` takes `() => Promise<Result>`.** The toast stays up while the undo runs, and a
  failure replaces it in place. Pure rules in `toastQueue.ts`, 7 tests.
- The copy says the sessions and notes go with the book, stop counting, and come back on
  restore.
**Over:**
- Auto-restoring the parent chain when a child is restored. That silently brings back more
  than the reader asked for.
- A cascade id column instead of the timestamp match. Still unneeded: 9a found no
  collision.
**Accepted, stated:** book deleted, then shelf deleted, then book restored, then shelf
restored leaves the assignment deleted, because neither restore owns it any more. That is
lossy in one rare order and never orphaned. **Revisit if** Recently Deleted makes that
order common.
**Proven on the phone:**
- Clean: RUNTIME 23/23.
- Both guards disabled: 9b, 9c and 9d went red as predicted. The cleanup check 7 also went
  red on the orphans the mutant left, and 9e stayed green, since the clash is caught by
  SQLite's index, not the guard. The orphans were Devcheck rows, repaired afterwards by the
  host-side recipe in `09-ENVIRONMENT.md`.
**Not yet exercised:** no screen calls `showUndo` until Slice 2. Its rules are unit-tested;
the component wiring is typechecked only.

## 2026-09-10 · `local_day` is derived by the write path; a patch cannot carry `undefined`
**The bugs, both latent:** `updateRow` accepted a new `occurredAt` without a `localDay`, so a
session could be filed under its old day in every day-bucketed statistic. And
`updateRow(t, id, { note: undefined })` passed the empty-patch check, ran
`SET updated_at = ?` alone (drizzle drops `undefined` keys), reported `changed: true` and
queued a sync for an edit that did not happen.
**Chose:**
- `RowFor<'sessions'>` omits `localDay`, and the write path derives it. On insert it is
  `toLocalDay(occurredAt)`. On an update or upsert it is a SQL
  `CASE WHEN "occurred_at" = ? THEN "local_day" ELSE ? END`, which keeps the stored day
  when the instant is unchanged. That is the contract's third rule: a session re-saved from
  a phone now in Tokyo must not move days.
- `updateRow` counts only defined values.
- `PatchFor<K>` strips `undefined` from each column.
- `exactOptionalPropertyTypes` is on.
**What the compiler needed:** the flag alone did not reject `{ note: undefined }`, because
drizzle's insert types spell `| undefined` into every optional column. The flag plus the
stripped patch type does. Turning the flag on cost four one-word prop widenings.
**Over:** keeping `localDay` caller-supplied and asserting it matched. That is a check every
future caller must pass rather than a mistake no caller can make.
**Proven:**
- Compile time: three mutants (allow `localDay` in `RowFor`, plain `Partial<>`, flag off)
  each turned `write.types.ts` red.
- On the phone, device checks 8a–8d. A planted "other timezone" day survived a note edit, a
  same-instant `updateRow` and a same-instant upsert. A moved instant moved it through both
  write paths. An all-`undefined` patch (built with `Reflect.set`, as an untyped caller
  would) changed nothing and queued nothing. RUNTIME 18/18.

## 2026-09-10 · How a session counts, and what `from_position` means (owner's decision)
**Decided by the owner:** hours and pages stay separate and never combine. A timed session
records minutes and counts towards hours read. A page-based session records positions and
counts towards pages read. A recovered session has a duration and no positions, so it counts
fully in hours, not at all in pages, and **never** lands in `unusable`: a real person really
did read for that time.
**`from_position` is the last page finished before the session.** Reading pages 1 to 10 is
stored `0 → 10`, ten pages. The arithmetic (`to − from`) was already right for that
reading. `03-DATA-MODEL.md` said "page started at", which implies `1 → 10` and nine pages.
The doc was the bug, and it now says boundaries.
**Implemented:** `contribution()` in `domain/stats.ts` holds the table now in 03-DATA-MODEL.
`ProgressSession` gained `durationSeconds`. Two cases the decision implies, settled here:
- A **timed audiobook** counts its duration, not its minute span as well, so time is never
  counted twice. At 1.5x the span is the book's minutes, not the reader's.
- `unusable` now means "has something the reader can fix": positions given but not
  countable, or no measure at all. A timed session with broken positions still counts its
  duration AND is flagged, because both are true.
**Before this:** `sessionAmount` was the only measure, so every recovered session, which
the recovery sheet had just carefully bounded, counted nowhere and was flagged as broken.
**Proven:** four mutants each turned `stats.test.ts` red, and restoring made it green again.
- Ignoring durations, the old behaviour: 4 failures, including the recovered session.
- A timed audiobook counting duration plus span: 1.
- A recovered session flagged unusable: 2.
- `to − from + 1`: 8, including the 0 → 10 test.
**Revisit if:** the Slice 7 Stats screen needs "hours listened" separately from "hours
read". The Utility design sheet says "hours listened", which undercounts paper read with the
timer. Noted for the design revision.

## 2026-09-10 · `runInTransaction` rejects an async task; the guard covers every way in
**The bug:** the wrapper written to close bug #1 was typed `task: () => void`, and TypeScript
lets any function satisfy `() => void`, async included. `withTransactionSync` calls `task()`
and commits without looking at the result, so `runInTransaction(async () => …)` typechecked
and rolled nothing back. The source guard only looked for drizzle's `.transaction(async`.
**Chose:** `task: () => undefined`. `Promise<void>` is not `undefined`, so a promise-returning
task is a compile error. A task with no `return`, or a bare `return;`, still satisfies it
(TypeScript 5.1+). The guard now fails on `runInTransaction(async`, on any drizzle
`.transaction(`, and on expo-sqlite's `with…Transaction…` outside `client.ts`. It strips
comments first: its first run failed on `client.ts` prose that names the bug.
**Over:** a conditional type such as `T extends PromiseLike ? never : T`, which cannot infer
`T` through the conditional and ends up accepting everything.
**Proven:** `__tests__/transaction.types.ts` holds three `@ts-expect-error` lines. Reverting
the signature to `() => void` turned all three into errors. Probe files with an async task,
a sync drizzle `.transaction()` and a `withTransactionAsync` each turned the guard red.
**Not covered, stated rather than hidden:** a promise started INSIDE a sync task
(`void writeRow(…)`) runs after the commit. Catching it needs type-aware lint
(`no-floating-promises`), which this project does not run.
**Revisit if:** type-aware ESLint is adopted for another reason.

## 2026-09-10 · `npm test` quotes its glob. Every earlier count was Windows-only.
**The bug:** the glob was unquoted, so `sh` expanded it. On macOS, Linux or any CI, `**`
without `globstar` means one directory. It ran 44 of 106 tests, reported as a clean pass;
`src/__tests__/` and `src/features/launch/__tests__/` never ran. Windows was green only
because `cmd` passes the literal to Node's own glob.
**Chose:** double quotes, and a guard, `src/lib/__tests__/test-runner.test.ts`. It fails if
the glob is unquoted, and it fails if any `*.test.ts` on disk is not matched by the pattern
Node receives. Double rather than single quotes, because `cmd` would pass single quotes
through literally.
**Where the guard lives matters.** It first sat in `src/__tests__/`, exactly the directory the
bug skips, so under `sh` it would never have run. It sits one level down so even the broken
pattern reaches it.
**Verified:** 114/114 under `cmd`, and 114/114 with npm's script shell forced to POSIX `sh`
(Git's, on this Windows machine: no WSL, Docker or Linux host is available). With the glob
unquoted, the guard failed under both shells; under `sh` only 51 tests ran, and the guard
was among them.
**Revisit when:** CI exists. Run the suite there on Linux once; that is the real check.

## 2026-09-10 · A backup only when a migration is pending; a failed migration is verified, not restored
**The bug:** `performMigrations` backed up on every launch. Every cold start paid a WAL
checkpoint and a synchronous copy of the whole database on the JS thread before the splash
lifted. It also ran the 3x free-space check, so a reader on a nearly full phone was locked
out of their library with no update to apply. The emulator held three `reader-2-*` backups
from consecutive launches that had nothing to migrate. The failure screen then dropped the
error's `safe` line ("free up some space") and said "this usually clears on a second try",
which that reader could tap forever without success.
**Chose:**
- **Pending is decided by drizzle's own rule.** Drizzle applies journal entries whose `when`
  is later than the newest `created_at` in `__drizzle_migrations`, not by count
  (`migrationPlan.ts`, pure, tested). No backup when nothing is pending, and none on a fresh
  install, which has no data to protect. `migrate()` still runs every launch as the
  authority, and afterwards the applied count is checked against the plan. A mismatch is
  reported.
- **A test that journal timestamps strictly increase.** Drizzle skips an out-of-order
  migration forever on existing installs while a fresh install applies it.
- **No file restore after a failed migration.** Drizzle runs all pending migrations in ONE
  transaction and rolls back on failure (`sqlite-core/dialect.js`), and SQLite DDL is
  transactional. Closing, deleting and moving files added the only step in the module that
  could leave no database at all. The count is now re-read, and if it is unchanged the files
  are left alone. Only if that check fails or cannot be made is the backup just taken put
  back (`restoreBackup`, that specific file).
- **The failure's own `message` and `safe` reach the screen.** The space error says how many
  MB to free. The fixed body is now a fallback for failures that carry no `safe` line.
- Two fragile spots were in the lines being rewritten and are fixed with it: the backup
  preflight now returns its failure instead of throwing, and `runMigrations` never rejects.
  Pruning sits outside the migration's `try`, so a listing error cannot become a "failed"
  migration.
**Over:** keeping the restore "to be safe". It was redundant with drizzle's rollback and was
the riskiest code on the startup path.
**Verified on the emulator:**
- Nothing pending: no new backup.
- 0001's row deleted, so drizzle re-runs it and fails: a `reader-1` backup was taken, the
  count stayed at 1, and `sync_queue` stayed at 57 (0001's own insert was rolled back). The
  inode was unchanged (no file surgery), and the screen showed "The update was undone…".
- A real v1 shape: 0001 applied, count 1 → 2, the partial indexes are present, and prune
  kept three backups.
- Free-space factor forced to 10⁶: the notice named the MB to free, no backup was attempted,
  and the migration did not run.
**Consequence for every future migration:** `PRAGMA foreign_keys=OFF`, which drizzle-kit emits
around a table rebuild, is a no-op inside that transaction. Recorded in 03-DATA-MODEL.
**Revisit if:** drizzle's migrator stops running a batch in one transaction. Re-read
`dialect.js` on every drizzle-orm upgrade.

## 2026-09-10 · CORRECTION to the product research: there is no Android whitespace
**The error:** `01-PRODUCT.md` (Positioning) and `02-ARCHITECTURE.md` (constraint 3) claimed
Android-first was a structural advantage because the best competitors are iOS only, and
that the best-designed apps were "invisible to 72% of the world's phones". That is false.
On the Play Store, as checked by the project owner on 2026-09-10:
- Bookmory has over 1M installs, rated 4.8.
- Bookly (listed in the doc as iOS only) has over 500k.
- StoryGraph, Fable, Book Towers, Bookshelf, Yuuna, Leero and Seekquel are all on Android.

**What the research does and does not support, recorded so it is not re-derived wrongly:**
- **The nine complaints are real and sourced.** But a complaint comes from a retained user.
  It is evidence of a retention problem for *that* app, not evidence of unmet demand for
  this one.
- **Data integrity is a retention feature, not an acquisition feature.** Never losing
  sessions, editable dates and safe import keep readers who have already chosen the app.
  They win no one.
- **The only differentiator with genuine demand evidence is format-aware counting for
  audiobooks,** because it is the top-voted item on StoryGraph's public roadmap, not a
  review complaint. It is also on the best-known competitor's own roadmap, so the window
  closes when they ship it.
- **The Slice 3 gate is therefore the real decision point for the project, not a
  formality.** Nothing before it tests whether readers will switch.

**Changed:**
- `01-PRODUCT.md`: Positioning, the store-listing claim that "no competitor can currently
  write" those sentences (never verified on Android), finding 5, and a new section, "What
  the research shows, and what it does not".
- `02-ARCHITECTURE.md`: constraint 3.
- `05-BUILD-PLAN.md`: the gate now says why it matters. **I added one gate step:** record
  each reader's current app and include audiobook listeners. The owner may strike it.

**Android-only for v1 stands, as a scope decision.** One platform is what a solo
part-time developer can build and support. That was always the real reason, and it does
not depend on a market gap.
**Revisit if:** the gate passes. Re-check the competitor list then, before writing a store
listing.

## 2026-09-10 · CORRECTION to the design sheet: five light-mode colours failed WCAG AA
**Chose:** darken each by the least that clears the threshold, keeping hue and saturation.
Every ratio is computed by `contrastRatio()` in `src/ui/color.ts` (WCAG 2.x relative
luminance), with translucent surfaces composited over the ground first.

| Token (light) | Sheet value | Worst real pair, before | New value | After |
|---|---|---|---|---|
| `accentInk` | `#A4681A` | 3.89:1 on the pill background; 4.26:1 on ground | `#965F18` (offset l −23.5 → −26.6) | 4.51:1 pill; 4.94:1 ground; 5.32:1 white |
| `textMuted` | `#7D7462` | 4.28:1 on ground | `#79705F` (l −1.4) | 4.54:1 |
| `success` | `#3D8B5E` | 3.86:1 on ground | `#377E55` (l −3.6) | 4.55:1 |
| `textFaint` | `#A8A08E` | 2.41:1, used as text | `#988E79` (l −7.3), **non-text only** | 3.01:1, meets 3:1 for icons |
| `textGhost` | `#C5BDA9` | 1.74:1, used as a Notice footer's text | unchanged, **decoration only** | n/a |

**What the owner asked for:** `accentInk` darkened until it clears 4.5:1 on the light
background while staying recognisably the same gold. That's 3.1 lightness points, same hue
offset. It was measured against the pill button's background as well as the ground, because
the pill draws `accentInk` on `accentSurface`. Also asked for: a test that fails on any
text pair below 4.5:1.

**What the test then found**, and why each was fixed rather than exempted. The owner asked
for every text pair to be covered, so exempting any would have made the test lie.
- `textMuted` and `success` were darkened by the minimum.
- `textFaint` could not become a 4.5:1 text colour without collapsing into `textMuted`. So
  it became icon-only: the placeholder and the idle tab label moved to `textMuted`, and the
  idle tab icon keeps `textFaint` at 3:1. Idle and raised tab labels now differ by weight
  alone.
- The Notice footer moved from `textGhost` to `textMuted`.

**Dark mode passed everywhere** and is unchanged.

**Guard:** `src/ui/__tests__/contrast.test.ts`.
- Every text token on ground, surface and raised surface.
- Six component-specific pairs.
- `textFaint` at 3:1.
- A source scan that fails if `textFaint` or `textGhost` is used anywhere except an
  `<Icon>`, `backgroundColor` or `borderColor`.

**Design sheets:** the three changed hexes were replaced in `design/*.dc.html`. The sheets
still draw some placeholder and idle-tab text in the faint colour, which the code no longer
does. That is noted for the next design revision (`05-BUILD-PLAN.md`, Slice 11).
**Revisit if:** a component draws text on a new background. Add the pair to the test's
`SPECIAL` list, or it is unguarded.

## 2026-09-10 · `09-ENVIRONMENT.md` said taps never reach JS; on the phone they do
The Slice 0 note said `adb shell input tap` does not reach the JS handler. Slice 1 drove
Save, Discard, Try again and text fields by `input tap` on the phone, confirmed in the
database, once no LogBox toast was showing. The toast may have been the Slice 0 cause as
well; that was never re-tested on the emulator. The doc now says so rather than stating
either as fact. It also gained what Slice 1 learned about driving a phone from a script and
editing its database without `sqlite3`, which until now lived only in one conversation.

## 2026-09-10 · `Sheet` lifts itself above the keyboard
**Found on the phone** while retesting the recovery sheet: the keyboard covered the minutes
field, its error line and Save. The reader typed blind and could not reach the button.
**Cause:** the Modal is `statusBarTranslucent` and the app is edge-to-edge, so Android does
not resize the dialog window for the IME. The UI dump confirmed there was no resize at all;
the only movement was the error line growing the content.
**Chose:** `Sheet` listens to `Keyboard` show/hide and offsets its absolute `bottom` by the
keyboard's height. While the keyboard is up it also drops the navigation-bar inset from its
padding, since the keyboard covers that bar.
**Over:**
- Dropping `statusBarTranslucent`, which would bring back a scrim that stops at the
  status bar.
- Reanimated's `useAnimatedKeyboard`, which watches the activity window, not the Modal's
  dialog window.
- Adding react-native-keyboard-controller. That is a new native dependency for one sheet.
**Revisit if:** Slice 3's session logger puts several fields in a sheet. At that point
`keyboard-controller`'s focused-input scrolling would earn its place.
**This will recur.** Nearly every input still to be built sits in a sheet or a form:
- Slice 3: log session.
- Slice 4: add manually. That's a full-screen form, a different case, still unverified.
- Slice 5: finish note and date.
- Slice 5b: note editor.

What protects each of them:
- The rule in `06-CONVENTIONS.md` (Styling).
- A check written into each of those slices in `05-BUILD-PLAN.md`.
- A line in `CLAUDE.md`.
- The how-to in `09-ENVIRONMENT.md`.

**Known gap:** `Sheet` lifts itself as a whole, but in a sheet taller than the space
above the keyboard it does not scroll the focused field into view. Keyboard events were
confirmed to fire inside the RN Modal on Android 16. Neither Reanimated's keyboard hook nor
dialog resizing was needed.

## 2026-09-10 · Session recovery never invents a duration
**The bug:** "Save this session" wrote `now - startedAt`. A session killed at 23:00 and
reopened at 08:00 saved nine hours of reading, silently, into the statistics that are the
product's core metric, under a title that said "You were reading for 9h".
**Chose:** the elapsed time is treated as what it is, an **upper bound**. Within 180 minutes
it is pre-filled as editable minutes, with copy saying it is the most it could have been.
Past 180 minutes the field starts **empty** and the sheet asks. Save is disabled until the
value is a whole number from 1 to the elapsed minutes. The title no longer claims a
reading time at all. The rule is `src/features/launch/recoveryPolicy.ts`, with tests.
**Over:**
- Saving the elapsed time silently. That was the bug.
- Capping it silently at 3h. That still writes a number nobody read.
- Always asking, with an empty field. For the common case (an OEM kills a 25-minute
  session) the bound is a good answer, and making the reader type it is friction for nothing.
- Discarding by default. That loses real reading, which rule 2 forbids.
**Because:** the app knows when the session started and nothing about when the reader
stopped. Any duration it writes without the reader seeing and accepting it is fabricated.
**Accepted cost:** within the cap, a reader who taps Save without reading the number still
over-records if they stopped early. They have seen the number and the sentence that
qualifies it; that is the line between asking and assuming.
**Revisit if:** Slice 6's timer writes a heartbeat while running. `lastAlive - startedAt`
is a far tighter bound than `now - startedAt`, and should replace it. It still will not
know when the reader stopped reading, so the reader still confirms. Also revisit the
180-minute cap if real sessions longer than three hours turn out to be common.

## 2026-09-10 · Try again blanked the screen; the busy state it already had was never shown
**Cause:** the retry reset the migration status to `pending`, which the gate order reads as
"still booting", which renders nothing once the splash has gone. The notice, and the
"Trying again" label wired to `retrying`, vanished for the length of the retry.
**Chose:** the status stays `failed` until the retry resolves, and `retrying` alone carries
the in-progress state. `gateOrder.test.ts` pins that `failed` renders the notice and never
`booting`. **What it does not pin:** the hook's own state transition, which needs React and
expo-sqlite and cannot run under node. That half was verified on the phone.

## 2026-09-10 · The gate order is a pure module with a test
`evaluate()` moved from `useLaunchGates.ts` to `gateOrder.ts`, with type-only imports so it
loads under node. It takes `MigrationStatus` rather than the hook's whole state, since
the retry flag is a rendering concern, not a gate. The test covers the precedence matrix:
force update beats everything; "still checking" shows nothing; a failed migration beats
session recovery; unanswered is not "none". Each was watched to fail by breaking it.

## 2026-09-10 · The Metro and native-font checks are in the suite, not a scratch folder
**Chose:** `src/__tests__/metro-blocklist.test.ts` (the block-list check that caught two
wrong versions, previously in a scratch directory) and `src/__tests__/native-fonts.test.ts`,
which reads `android/app/src/main/res/font` and the built debug APK and compares them
with brand.json. A stale `android/` fails with the instruction to `npm run prebuild`.
The APK half searches the zip's central directory for `res/font/<file>` as plain bytes,
with no zip dependency. Font names are compared on letters and digits only, rather than
reimplementing expo-font's renaming rule, which would itself drift.
**Both halves SKIP, loudly, when there is nothing to inspect.** A fresh clone has no
`android/`. A skip is visible in the test output; a pass there would be a lie.
**Also:** `app.config.ts` now throws if a font file named in brand.json is missing, which
fails `expo prebuild` outright. That needed `node:fs` and `__dirname`, so `app.config.ts`
moved from the app tsconfig (`types: []`) to `tsconfig.test.json`, which is now described
as "the files that run under Node". It never ran on the phone anyway.
**Revisit if:** EAS release builds become the norm. The APK check reads the local debug
APK only.

## 2026-09-10 · Rebrand drift closed: one accent, one font source, computed tokens, wider lint
**Chose:**
- **The accent is one hex in brand.json.** Every variant in both schemes is derived in
  theme.ts by `accentVariants()`, as fixed HSL offsets fitted to the design sheet: each
  reproduces the sheet within one channel step. That includes the lighter accent, the
  light-mode ink, both on-accent near-blacks, the light hairline, every rgba and the
  glow triplet. Offsets rather than absolutes, because "lighter and warmer" survives a
  rebrand and `#FFD173` does not.
- **The font is named once.** brand.json holds the family, the package and the five
  files. theme.ts applies the family, and app.config.ts embeds exactly those files under
  exactly that name. `brand-font.test.ts` evaluates the real config through
  `@expo/config` and fails if the two diverge, or if the scale uses a weight with no file.
- **Arithmetic tokens are computed.** `tabRaised` (fab + 2 × ring), `iconButtonHitSlop`
  ((minTouch − iconButton) / 2) and `toastLift` (tabBar + row) were stored as 62, 3 and 66.
- **`typeStyle` takes one argument.** Six call sites passed a weight override; each is now
  a named variant built from its base with a spread (`chipSelected`, `tabFocused`,
  `pillLabel`…), so the size is shared by construction.
- **The lint now sees opacity, JSX `size`/`strokeWidth`/`width`/`height`, numeric
  defaults on visual props, and a second `typeStyle` argument.** A probe file violating
  each raised all five. Test files are exempt from `no-restricted-syntax`: their job is to
  state the expected value literally.
- **Tab labels and screen titles** live in `strings.ts` as `nav`.
**Over:** deriving with a colour library (chroma-js and similar): about 60 lines of HSL
did it, and the test pins the output.
**What derivation cannot promise is contrast.** `theme.test.ts` asserts it: on-accent text
must reach 4.5:1 in both schemes. A rebrand to `#4040C0` was watched to fail it.
> **Superseded the same day:** the owner ruled this theirs to fix now. Fixed, with four
> more failures the new contrast test found. See "CORRECTION to the design sheet" above.

**FOUND, NOT FIXED, a design question:** light-mode `accentInk` (`#A4681A`, the sheet's own
value) is **4.26:1** on the light ground. That clears WCAG's 3:1 for icons, hairlines and
large text, but it is also used for small text: the focused tab label at 10px, Undo, and
the pill button's label. Those would need 4.5:1. The test holds it to 3 and says why.
Darkening it is a one-number change to the offset, but it is the designer's colour to move.
**The rebrand touch count is now:** brand.json, and the artwork (below).

## 2026-09-10 · Deferred, each with an owner
- **The error-boundary test and Sentry end to end → Slice 11, on the release build.** Both
  need a release bundle: `enabled: !__DEV__` keeps Sentry off in development, and dev
  builds show the red box before the boundary. Proving it means a deliberate crash in a
  release build and the event arriving in Sentry with a readable, source-mapped stack.
- **The toast's offset from the real tab-bar height → Slice 11 polish.** `toastLift` is a
  static tabBar + row, so on a screen without the bar (Settings) the toast sits higher
  than it needs to. Cosmetic. The fix is to read `BottomTabBarHeightContext`, which the
  custom tab bar already reports to.
- **The restore gate → Slice 8.** It needs sign-in to be true. The slot is in
  `gateOrder.ts`, in order, and `isLibraryEmpty()` already exists.
- **Brand artwork → before submission.** The splash and all five icon layers are still
  Expo's placeholders. Recorded in the build plan's submit checklist, because nothing in
  code will notice they are missing.

## 2026-09-10 · The LogBox toast blocked every tap in the recovery sheet — and I was raising it
**Symptom, on the phone:** "Save this session" and "Discard it" did nothing. No busy state,
no error, no log, database unchanged. The tap landed inside the button's clickable bounds.
**Two hypotheses killed first.** `statusBarTranslucent` on the Modal (removed: no change,
reverted). A hung write (a spinner would have shown; none did).
**Proven cause, in both directions.** Temporary logging at the entry and exit of the sheet's
handler. With LogBox's "Open debugger to view warnings" toast visible: no log line at all —
the press never reached JS. Toast dismissed: Save fired on the first tap, the sheet closed,
`duration_seconds` was written and exactly one `upsert` was queued.
**Why:** in development, every `console.warn` raises LogBox's toast, and on Android it sits in
a window above a Modal and swallows the touches beneath it. Its bounds (y 2186–2297 on this
phone) also cover the tab bar, which very likely explains the emulator's "taps don't reach
the app" — plausible, not proven.
**And the warn raising it was mine:** `[launch] force update: proceeding` fires on every dev
launch. It now goes to logcat only, via `LogBox.ignoreLogs`; the line stays because it is
what proved the real Cloudflare flag was being fetched.
**Scope:** development builds only. Release builds have no LogBox, so no reader can hit this.
**The rule this adds:** a `console.warn` on a normal path is not free in development. Warn
for what is actually wrong; route diagnostics that fire routinely away from LogBox.

## 2026-09-10 · Metro crashed when started during a Gradle build; Gradle output is now blocked
**Observed twice in one afternoon.** Once Metro sat "running" for over ten minutes without
finishing a single bundle, so the phone received no JS. Once it died on start with
`ENOENT ... watch ... node_modules/expo/android/build/kotlin/.../local-state`.
**Cause:** Metro's fallback file watcher crawls `node_modules`, including every native
library's `android/build` and `.cxx` directories. Gradle creates and deletes files there
throughout a build, so a directory can vanish between Metro's walk and its watch call.
Both incidents happened with a Gradle build running at the same time.
**Fix:** `resolver.blockList` in `metro.config.js` excludes `android/build`,
`android/app/build`, `android/.cxx` and `android/.gradle` at any depth. The block list also
feeds the file map's ignore pattern, so these paths are neither resolved nor watched.
**Two bugs in the fix, both caught by a test before Metro ever ran with them.** First,
a shell-escaping slip wrote the separator class so that it matched only `/`, which blocks
nothing on Windows. Second, and worse: metro-config's own `exclusionList` helper re-escapes
`/` inside each pattern, which turned the corrected class into an unterminated one — Metro
would have thrown on every start. The patterns are now plain RegExps appended to Expo's
default block list. The test runs Windows and POSIX Gradle paths that must be blocked, and
app files — migrations, route files, Sentry, expo-router — that must not be.
**Revisit if** Metro still stalls with no build running, which would point at the watcher
problem already recorded for this machine rather than at this collision.

## 2026-09-10 · `android/` was a week stale: no config plugin since Slice 0 had reached a build
**Found on the first physical-device run.** The app rendered entirely in Roboto. The APK
contained no font files; `android/app/src/main/res` had no `font/` directory at all.
**Cause:** `android/` was generated once, on 2026-09-03, and never again. `npx expo
run:android` only runs prebuild when `android/` is MISSING — it does not regenerate it when
`app.config.ts` changes. So every config-plugin change since then existed in the config and
nowhere in the binary:
- **Plus Jakarta Sans** (Slice 0 review): declared, embedded in config, absent from every
  build since. The "font.family applied by nothing" fix never actually shipped.
- **The Slice 1 splash config** (colours, dark variant): the build carried Expo's template
  splash from the original generation instead.
- **The Sentry plugin**: no `sentry.properties`, no Gradle wiring. Crash capture still works
  through autolinking; the plugin's build-time half did not exist.
**Why nothing caught it:** the config typechecks, `getConfig` evaluates it correctly, the
fonts exist in `node_modules`, and Roboto renders without complaint. Only looking at the
screen — impossible on the emulator, where every capture was black — showed it.
**Fix:** `npm run prebuild` (`expo prebuild --platform android --clean`) regenerates
`android/` from config. That was always the sanctioned path — `android/` is continuous native
generation and never hand-edited — it simply was not being run.
**The rule this adds:** **any change to `app.config.ts` plugins or native config means
`npm run prebuild` and then `npx expo run:android`.** A rebuild alone reuses the stale
native project. Recorded in `CLAUDE.md` and `docs/09-ENVIRONMENT.md`.
**Revisit if:** a check can assert the native project matches the config — e.g. the device
pass asserting a font file exists in the installed APK — so this cannot silently recur.

## 2026-09-12 · The Fabric crash, measured: 0 in 100 debug and 0 in 100 release cold starts
**Method**, on the phone (Nothing Phone 2a, arm64, Android 16), per build: `logcat -c -b all`,
then 100 × (`am force-stop`; `am start -W`; wait 5 s), then count tombstones in the crash
buffer for this package, `Fatal signal` lines, and `Running "main"` lines so the denominator
is launches that actually reached JS.

| Build | Launches | Reached JS | Tombstones | ANRs | Rate | Minutes |
|---|---|---|---|---|---|---|
| Debug (dev client, warm bundle from Metro) | 100 | 100 | **0** | — | 0/100 | 23.1 |
| Release (embedded bundle, not debuggable, `flags=0x0`) | 100 | 100 | **0** | 0 | 0/100 | 12.5 |
| Debug, **fresh Metro per launch** (`--clear`, cold bundle each time) | 20 | 20 | **0** | — | 0/20 | 33.8 |

The third row is the condition both occurrences actually shared: the first cold start
against a newly started Metro. It was run deliberately, because a 0/100 under the wrong
condition says nothing about the right one.

**What this settles.** 220 launches, 0 crashes, including 20 under the suspected trigger.
Against roughly 2 in 15 on 2026-09-10, that is a real change in rate. **Release is not
blocked**: 0/100 on the release build, and the suspected trigger — switching bundles —
cannot happen in a release build at all.

**What it does not settle, and I will not pretend otherwise.**
- **A 0/20 cannot distinguish "fixed" from "rarer than 1 in 20".** At a true rate of 2 in
  15, twenty clean launches would happen by chance roughly 6% of the time; at 1 in 50, they
  are unremarkable.
- **The code changed between the crashes and the measurement** — the whole Slice 1 review,
  including a rewritten `Toast` on `useReducer` and changes to the launch path. If some
  mount pattern of ours was provoking a renderer bug, it may simply no longer happen. The
  tombstone had no app frame, so this is a possibility, not a claim.
- **Neither crash was ever reproduced on demand.** Both were caught in passing.
**So: not development noise, not a shipping blocker on this evidence, and not closed.** The
standing instruction stays: Sentry's native reporting on for release builds, and re-measure
if it recurs. The 100-launch loops are reusable; they are the measurement this bug gets
instead of a test.
**Still open, and not downgraded to noise:** two occurrences, two architectures, a program
counter in a heap page. The next steps stay as recorded below.

## 2026-09-10 · OPEN, NOW TWICE ON TWO DEVICES: native crash in React Native Fabric
**Second occurrence, 2026-09-10 23:18:38 IST.** Pixel_7_API_36 emulator: x86_64, Android 16
userdebug, a different binary from the phone's arm64 build. It came on the first launch
after the dev client was pointed at a freshly started Metro, 2.1 s after `Running "main"`.
Full log: `docs/crashes/2026-09-10-fabric-sigsegv-emulator-x86_64.txt`. The frames that
matter:

    signal 11 (SIGSEGV), code 2 (SEGV_ACCERR)   tid mqt_v_js (the JS thread)
    Cause: trying to execute non-executable memory.
    #00 pc …16da8  [anon:scudo:primary]                        <- jumped into the heap
    #01 MountingCoordinator::pullTransaction(bool) const+713
    #02 FabricUIManagerBinding::schedulerDidFinishTransaction
    #03 Scheduler::uiManagerDidFinishTransaction
    #04 UIManager::shadowTreeDidFinishTransaction
    #05 ShadowTree::mount   #06 ShadowTree::tryCommit   #07 ShadowTree::commit
    #16 UIManager::completeSurface   … #22–28 libhermesvm (the JS render commit)

The first occurrence had the same frame, `pullTransaction` inside `completeSurface`, and also
came on a cold start seconds after the bundle's source changed. The next five emulator
launches in this session did not crash.

**What two occurrences change.**
- **Not one device, ABI or build artifact.** arm64 and x86_64, two binaries. The "noise on
  this machine" reading is much weaker.
- **Not a clean null dereference.** The program counter landed in a heap page, which is a
  call through a pointer into freed or corrupted memory inside `pullTransaction`. That is a
  memory-safety bug on the render-commit path, whether it lives in React Native core or in
  a native module hooked into mounting.
- **Still no app frame, and no Sentry, SQLite or splash frame.** Nothing in `src/` is
  implicated.
- **The one shared circumstance** is the first cold start after the bundle's source
  changed. With two data points that is a pattern, not proof. It is also the only reason
  a release build might behave differently, since a release build never switches bundles.

**Is a release-build run enough to settle it? No.** A clean release launch, or a handful of
them, cannot settle a crash that has appeared in roughly two of fifteen development cold
starts. Absence over a few runs is close to no evidence, and the earlier plan ("prove it
on the release build") would have closed this on exactly that. What would settle it:
1. **A scripted cold-start loop:** 100 launches each of the debug and release builds on the
   phone (`am force-stop`, `am start -W`, count new tombstones). That gives a rate per
   build type, takes under an hour, and needs no human.
2. **If release crashes at any rate,** it is a shipped crash against the 99.5% crash-free
   target. Bisect by disabling native suspects one at a time (Reanimated, react-native-screens,
   Sentry's native SDK), and search the React Native tracker for `pullTransaction` on 0.86.
3. **If only debug crashes, and only after a bundle change,** record it as a dev-client
   reload race, with the loop as the evidence. Keep Sentry's native crash reporting on in
   release so a field occurrence cannot hide.
**Owner and deadline:** before Slice 2's dogfooding, when the owner's phone becomes the
real library. **Revisit:** when the loop's numbers exist.

### The original entry, kept as written
## 2026-09-10 · OPEN: one native crash in React Native Fabric, not reproduced
**Observed:** one cold start during the Slice 1 device pass died in the foreground with no
Java exception. Tombstone: SIGSEGV (SEGV_ACCERR) on the JS thread, inside React Native core
- `MountingCoordinator::pullTransaction` during `UIManager::completeSurface`, called from
Hermes. No frame from Sentry, the splash module, SQLite, or app code.
**Reproduction:** 0 of 4 further cold starts, no new tombstone. The crashing launch was the
one that started seconds after Metro restarted, so a dev-client race while the bundle loads
is plausible - but plausible is not shown, and it is not being called harmless.
**Not ours to fix directly** if it is an RN 0.86 renderer bug, but it is ours to watch.
**Revisit when:** a Sentry DSN is configured (native crashes then report from release
builds), and on the first physical-device run in Slice 6. If it recurs outside a Metro
restart, capture the tombstone and search the React Native issue tracker by the frame.
A second tombstone at 14:12 the same day was the emulator's Bluetooth service, not this app.

## 2026-09-10 · Optional keys are read from `process.env`, not `expo-constants` — found on the device
**The bug:** with `EXPO_PUBLIC_FORCE_UPDATE_URL` set and Metro restarted, the device logged
"no force-update URL configured". Metro's served manifest contained the URL. The APK's
embedded `app.config`, written at native build time, did not — and `expo-constants` reads
the embedded copy, even in a development build.
**Impact:** every optional key in `.env` — the kill switch, the Sentry DSN — silently did
nothing until a full native rebuild. Restarting Metro, the obvious step, changed nothing and
reported nothing. The setup instructions written the same day were wrong because of it.
**Fix:** `src/lib/config.ts` reads each key as a literal `process.env.EXPO_PUBLIC_*` member
expression, which Metro inlines at bundle time. A Metro restart with `--clear` is now
genuinely sufficient, and release builds still carry the value baked in. The keys were
removed from `app.config.ts`'s `extra`, so there is one source rather than two that
disagree. `appVersion` and `androidPackage` stay on `expo-constants`: they genuinely are
build-time facts.
**Over:** keeping `extra` and documenting "rebuild after every `.env` change" — accurate,
but a trap for the next person, who will restart Metro and conclude their key is wrong.
**The rule this adds:** read a public key only as `process.env.EXPO_PUBLIC_NAME`. Destructuring
or `process.env[name]` is not inlined and is undefined on a device.
**Another instance of the silent-pass shape**, added to the list in CLAUDE.md: typechecked,
linted, threw nothing, and the kill switch could not be switched on.

## 2026-09-10 · The force-update flag lives on Cloudflare Pages, and it must be impossible for it to brick anyone
**Chose:** one static file, `v1/kill-switch.json`, on Cloudflare Pages, deployed with
`wrangler`. Fetched every launch with a 2s timeout and a cache-busting query parameter.
**Over, with the reasons that decided it** (researched, then adversarially judged; scores
out of 60: Cloudflare Pages 48, GitHub Pages 31, Supabase Storage 22):
- **Supabase Storage** — free projects pause after a week of inactivity, the free CDN serves
  a replaced file stale for up to an hour, and above all it puts the kill switch in the
  **same failure domain as the thing it exists to kill**: from Slice 8 Supabase is the
  backend, and a bad migration or a blown quota there is precisely when the switch is needed.
- **GitHub Pages** — `Cache-Control: max-age=600` is fixed and unpurgeable, the repo is
  local-only so it means publishing a new public repo, and its terms bar commercial use —
  this app has a paid tier.
- **raw.githubusercontent / Gist** — pinned 300s cache, per-IP rate limits that punish
  carrier-grade NAT, and not intended for production hosting.
- **Netlify** — a free site goes offline when its monthly credits run out, and each deploy
  spends them. **Vercel Hobby** — no commercial use.
- **Firebase Remote Config** — a 12-hour default fetch interval, a native SDK, and ADR 003
  rejected Firebase. **EAS Update** — structurally wrong: a kill switch has to be able to
  stop an app whose update path is the broken thing.

**Because:** Cloudflare static assets are free with no request cap, need no card, do not
pause on inactivity, default to `max-age=0, must-revalidate`, and invalidate on deploy. The
failure that matters for a kill switch is not downtime — the gate fails open, so an
unreachable host is harmless — it is a flag that is **reachable but stale**, or one you
**cannot flip**. Cloudflare wins on both.

**The known cost, stated rather than hidden:** a Pages deploy needs a laptop; there is no
editing a deployed file from a phone. Mitigated by keeping `killswitch/` in this repo and
authenticating `wrangler` once, now, so a 2am flip is one command.
**Revisit if** a phone-only flip becomes a requirement. Workers + KV can be edited from a
browser, but every launch is then a metered invocation against 100,000 a day, and
exceeding it returns an error — the switch would stop working exactly when the app got
popular.

**The safety design.** The update screen has no dismiss, so every false positive is a reader
locked out with no way back:
- **Blocking is the narrow path.** It needs a fresh successful response on this launch,
  valid JSON, a parseable `minimumVersion`, a parseable app version, and this build strictly
  older. Offline, timeout, 500, an HTML error page, malformed JSON, an unknown shape: all
  proceed to the library.
- **`latestVersion` is required, and the flag must agree with itself.** One typo — `11.0.0`
  for `1.1.0` — would retire every build including the fix. So a flag whose `latestVersion`
  does not clear its own `minimumVersion` is ignored, and locking everyone out now takes two
  mistakes that agree with each other. **The first test run caught a hole in this guard:** an
  unparseable `latestVersion` compared as null, `isOlderThan` read null as "not older", and
  the block went through. Fixed by requiring a parseable, coherent pair; asserted.
- **An unreadable app version never blocks.** The obvious `'0.0.0'` fallback sits below every
  minimum and would pin readers on the screen forever. Caught while writing it, not after.
- **The verdict is never persisted.** Caching "blocked" so the gate answers offline would
  turn one mistaken flip into a permanent brick for everyone who then goes offline.
- **No `storeUrl` in the payload.** The button's destination is derived from the package id.
  A remote file choosing where the only button on an undismissable screen goes is a phishing
  page the reader cannot leave.
- **The message is bounded to 300 characters and stripped of control characters**, so a long
  or hostile string cannot push the button off a 360px screen.
- **Cache-busted on every request.** The host revalidates, but Android's HTTP cache or a
  carrier proxy can answer first, and a stale flag fails silently in both directions — the
  frightening one is the un-brick flip not being seen.
- **Semver with a tested numeric comparator, not an integer build number.** An integer is
  harder to get wrong, but the version is what the reader sees and what the flag's author
  types. The comparator has dedicated assertions including `1.10.0` against `1.9.0`, and was
  watched to fail — five tests red — when swapped for a string comparison.

**The path is versioned (`/v1/`)** so a future shape ships at `/v2/` without ever having to be
backward compatible with builds that can no longer change.

## 2026-09-10 · Launch gates: evaluated in order, started concurrently; restore deferred
**Chose:** start the force-update fetch and the migration at the same moment, and evaluate
the gates strictly in Journey A's order once each has an answer.
**Over:** running them in sequence, as the build plan's ordering reads.
**Because:** rule 1 says the UI never waits on the network. In sequence, every cold start on
a poor connection pays up to 2s of splash for a flag that is false essentially always.
Concurrently, that cost hides behind work that has to happen anyway. What the order
specifies is which screen wins, and that is preserved exactly — `evaluate()` in
`useLaunchGates.ts` reads as the specification.
**Gates are rendered state, never routes.** Navigating before the root layout has mounted a
navigator throws, and a gate that is a route sits in the back stack.
**Gate 3 (restore) is a declared slot that always passes.** It triggers on "signed in AND
local database empty"; there is no sign-in until Slice 8, so the condition cannot be true,
and building the screen now would mean inventing a book count. `isLibraryEmpty()` is written.
**The splash always hides.** On Android an un-hidden splash means nothing draws at all —
including the error screen — so it hides on the first decision, and a 4s failsafe hides it
regardless. The exit fade is 150ms; the default 400ms is half the 800ms budget.

## 2026-09-10 · A failed migration is a notice with a retry, not the React error boundary
**The build plan's done condition says** a corrupted migration "shows the error boundary".
**What ships instead:** a full-screen notice, "Could not open your library", with Try again.
**Because:** a migration runs asynchronously in an effect, and React error boundaries catch
errors thrown during render — an async failure never reaches one. Throwing it into render to
make the boundary fire would add a crash in order to show a crash screen. The migration
already returns its failure as an `AppError`; rendering that directly is honest and gives a
real retry (`retryMigrations`, which is meaningful because the restore path closes the
database). The root `ErrorBoundary` still exists and still reports render errors.
**The boundary's fallback has no provider dependencies.** When the root boundary fires, every
provider beneath it is gone; a fallback that calls `useSafeAreaInsets` throws inside the
boundary and loops. So `AppErrorBoundary` uses plain Views and the palette directly.

## 2026-09-10 · Sentry is a no-op without a DSN, pinned at the version Expo resolves
**Chose:** `@sentry/react-native` 7.11.0, from `npx expo install`, initialised only when a DSN
exists, disabled in development, errors only (`tracesSampleRate: 0`).
**Over:** 8.25.0, the current npm release.
**Because:** 7.11.0 is what Expo SDK 57 pins, so `expo install --check` stays clean. The pin
is stale — it predates SDK 57 and was copied forward from SDK 55 — and that is recorded
rather than hidden. **Revisit when** Expo bumps the pin, or when source-map upload is set up:
the 8.x plugin keys `disableAutoUpload` and `options` are silently ignored on 7.x.
**`Sentry.init({ dsn: undefined })` is not a no-op** — it binds a client and installs every
integration. The guard is on the call, not on the option.
**The DSN is public; the auth token is not.** The DSN only permits sending events and is
safe in the bundle; its risk is quota burn, mitigated by spike protection. The auth token,
needed only for source-map upload, is a real secret: EAS secrets, never a committed file.
**Caught failures are reported explicitly.** The failures that matter most here are returned
as `AppError`s rather than thrown, so Sentry would never observe them. `reportUnrecoverable`
sends each with context — for a migration, the data version, the target version and whether
the restore worked, without which a report cannot tell a clean rollback from a failure that
left the library untouched.

## 2026-09-10 · `updateRow` landed in Slice 1, not Slice 2
**Deviation from** the 2026-09-04 deferral. The session-recovery gate closes a session by
setting `duration_seconds` and nothing else. Without a partial update that means reading the
row and writing it all back — the lost-update race that entry warned Slice 2 against. It
updates only the supplied columns of a live row, stamps `updated_at`, enqueues, and reports
`changed`. An empty patch runs no statement at all.

## 2026-09-10 · Smaller Slice 1 calls
- **Where an artboard disagrees with `Components.dc.html`, the sheet wins.** The Launch
  artboard draws a 48px button; the notices use the standard 56px primary.
- **`Button` gained a `ghost` variant** for the plain-text half of a pair ("Discard it"), so
  its hit target, debounce and font-scale cap match every other button.
- **The tab bar's raised button sits inside the bar's bounds.** A view overhanging its parent
  on Android is only reliably tappable with view flattening on, which Reanimated turns off —
  the failure is half a button that renders and ignores taps.
- **Settings is a gear in the Library header.** The design's header shows search and a shelf
  filter; both arrive with the list in Slice 2, beside it.
- **Add and Stats are real tabs with honest empty states**, so the shell is exercised end to
  end without pretending to content.
- **The device-pass runner moved to `db/devPass.ts`.** Settings needed it, and features may
  not import from one another.
- **`brand.json` gained `groundLight`** for the light-mode splash. The Android 12+ splash is
  configured natively because only the system splash can appear before any JS exists.
- **Five new tokens rather than arithmetic**, after the lint rule caught `size.fab +
  ring * 2`, `(minTouch - iconButton) / 2` and a bare `height: 1` in code written this
  slice: `tabRaised`, `iconButtonHitSlop`, and `StyleSheet.hairlineWidth`.

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

> **Superseded 2026-09-04:** now **RUNTIME 14/14 · COMPILE-TIME 1/1**, after check 6b was
> added. The rule in this entry stands unchanged; only the number moved. Left in place
> rather than edited, because a running log that quietly rewrites its own history is not
> a log.

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
