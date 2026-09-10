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
