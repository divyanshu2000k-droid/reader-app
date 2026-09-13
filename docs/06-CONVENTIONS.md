# CONVENTIONS

Structure and standards. The goal is that any file can be understood without reading four
others, because that is what keeps an AI assistant effective past 8000 lines.

---

## Folder structure

Feature folders, not type folders. Everything a feature needs lives together.

```
src/
  app/                    Expo Router. Routes only, thin.
    _layout.tsx           Providers, launch gates, root error boundary
    (tabs)/
      _layout.tsx         The tab shell; the bar itself is ui/TabBar.tsx
      index.tsx           Library
      add.tsx
      stats.tsx
    settings.tsx
    trash.tsx             Recently deleted (Slice 2)
    book/[id].tsx         Book detail (Slice 2)
    session/log.tsx       (Slice 3)
    onboarding/           (Slice 11)
  features/               The real code.
    launch/               Gates, recovery sheet, kill switch (Slice 1)
    library/              Status tabs and the list (Slice 2)
      components/
      hooks/
      queries.ts          All SQL for this feature
      tabData.ts          Pure: a tab never shows another tab's rows
    book/                 Detail, sessions, actions sheet (Slice 2)
      sessionLine.ts      Pure: what a session row says
    trash/                Recently deleted (Slice 2)
    settings/
    session/  import/  sync/  timer/     (later slices)
  db/
    schema.ts             Drizzle schema, single source of truth
    migrations/
    client.ts             The only raw SQLite handle
    write.ts              The only write path: writeRow, writeBatch, updateRow, softDelete, restoreRow
    progressAggregates.ts Shared SQL: a read's progress. Held equal to domain/stats.ts by check 10
    currentRead.ts        Shared SQL: a book's current read. Every list of books filters with it
    migrationPlan.ts      Pure: what is pending, by drizzle's rule
    devchecks.ts          The device pass (dev only)
  ui/                     Shared primitives from the design system sheet
    Button.tsx  Card.tsx  Sheet.tsx  Toast.tsx  InlineError.tsx  Stars.tsx  ...
    pressGuard.ts         Pure: a double tap is one tap (usePressGuard)
    sheetMount.ts         Pure: an open sheet always renders
    useOnRefocus.ts       Reload on return, not on first mount
    coverSource.ts        Pure: a cover's fallback chain
    theme.ts              Every token. No colour exists outside this file.
  domain/                 Business logic shared across features.
    progress.ts           Current page, percent complete
    progressDisplay.ts    What progress says, and the ONE definition of an audiobook
    reads.ts              When a re-read may start
    streaks.ts            Streak and goal calculation
    stats.ts              Aggregations, pages and hours kept separate
  lib/                    Generic utilities with no domain knowledge.
    config.ts             The only reader of the environment
    databaseChoice.ts     Pure: which database a build opens. Release: always the library
    dates.ts              All date handling. UTC in, local out.
    devLog.ts             Dev diagnostics that do not raise LogBox
    ids.ts                UUID generation
    result.ts             Result type for fallible operations
    strings.ts            Shared and repeated copy only
docs/                     These specs, kept current
DECISIONS.md
```

**Rule:** a route file in `app/` should be under 50 lines. It composes a feature component
and nothing else. All logic lives in `features/`.

**Why `domain/` exists.** Features must not import from each other, but some logic is
genuinely shared: progress calculation is needed by the session logger, book detail and
stats. Without a home, that logic ends up in `lib/`, which then becomes a junk drawer of
half-domain half-utility code. So: `lib/` is generic and knows nothing about books;
`domain/` knows about books but belongs to no single feature.

**Watch condition:** if `lib/` grows past ten files, something domain-shaped has leaked
into it. Move it to `domain/`.

---

## Naming

| Thing | Convention | Example |
|---|---|---|
| Components | PascalCase | `BookRow.tsx` |
| Hooks | camelCase, `use` prefix | `useCurrentRead.ts` |
| Queries | camelCase verbs | `getSessionsForRead` |
| DB columns | snake_case | `occurred_at` |
| TS properties | camelCase | `occurredAt` |
| Booleans | `is` / `has` / `can` | `isTimed`, `hasCover` |

Drizzle maps snake_case columns to camelCase properties. Keep that boundary clean and never
mix conventions within a layer.

---

## TypeScript

- `strict: true`, no exceptions
- **No `any`.** If you reach for it, the type is wrong or you need `unknown` plus narrowing
- Types derive from the Drizzle schema, never hand written duplicates
- Fallible operations return `Result<T, E>` rather than throwing. Throwing is for genuinely
  unrecoverable states
- `exactOptionalPropertyTypes` is on. An optional property may be absent, but it may not
  be present holding `undefined` unless its type says `| undefined`. Widen a component
  prop that way when a caller genuinely passes "maybe"
- **Compile-time assertions live in `__tests__/*.types.ts`**: `@ts-expect-error` lines
  that `npm run typecheck` checks and nothing executes. They are deliberately not
  `*.test.ts`, so they never inflate the runtime count. `transaction.types.ts` and
  `write.types.ts` are the pattern

---

## Data access

- **All SQL lives in `queries.ts` files.** Never inline a query in a component
- Every query function is named for what it returns, and does one thing
- Components read data through hooks, never touch the database directly
- **Every write goes through `src/db/write.ts`, which enqueues sync in the same
  transaction. There is no other path**, and a test enforces it. `queries.ts` files never
  call `db.insert`, `db.update` or `db.delete` directly. `sync_queue` and `metadata_cache`
  are local only and never enqueue

```ts
// features/session/queries.ts
export async function createSession(input: NewSession): Promise<Result<Session>> {
  // writeRow('sessions', row) — insert and enqueue in one transaction. Both or neither.
}
```

`softDelete` and `restoreRow` return `Result<WriteOutcome>`, and **`ok` is not the same as
"something happened"**: deleting an already-deleted or nonexistent row succeeds and changes
nothing. Check `changed` before showing a confirmation or an undo — rule 2 promises an undo
for every destructive action, not a toast for every call.

`writeRow` stamps `created_at`, `updated_at` and `deleted_at` itself, so `RowFor<K>` omits
all three and a caller cannot pass them. An update that rewrites a row's creation date, or
a delete performed by setting `deleted_at` through `writeRow` — which would enqueue an
`upsert` instead of a `delete` and skip the cascade — are both unrepresentable rather than
merely discouraged.

**`sessions.local_day` is derived by the write path, and `RowFor<'sessions'>` omits it.**
`writeRow` and `updateRow` compute it from the `occurredAt` being written. On an existing
row they recompute it only if the instant actually changed. A caller that could supply it
could supply one that disagrees, and `updateRow` once let a date move without its day.

**`updateRow` takes `PatchFor<K>`**: any subset of columns, where a key that is present
carries a real value. `null` clears a column. `undefined` is not a write: it is a compile
error, and a patch of only `undefined` values is `changed: false` with nothing queued.

**No live row under a deleted parent, in either direction.** `softDelete` cascades down.
`writeRow`, `updateRow` and `restoreRow` check the row's parents inside their transaction
and roll back if one is deleted. A cascade restore skips a child whose *other* parent is
still deleted. A refusal comes back as an `AppError` whose `safe` line names the parent to
restore first, or says it clashes with something added since. **An undo passes that
`Result` to the toast (`showUndo(msg, () => restoreRow(…))`), never a function that
swallows it.**

### Transactions: `runInTransaction`, never `db.transaction(async …)`

**"One transaction" was false for the whole of Slice 0, and everything passed.**

Drizzle's expo-sqlite driver is a **synchronous** dialect, so `transaction()` is typed to
take a sync callback. Handing it an `async` callback typechecks — the return type is just
`Promise<T>` — but **the transaction commits the instant the callback returns its
promise**, before any awaited statement has executed. Every statement then runs outside
the transaction and nothing rolls back. A failing enqueue left the table row behind: a row
that exists locally and never reaches the server, discovered months later on a new phone.

```ts
// WRONG. Typechecks, lints, never throws, and rolls nothing back.
await db.transaction(async (tx) => { … })

// RIGHT. src/db/client.ts, wrapping expo-sqlite's withTransactionSync.
runInTransaction(() => {
  db.insert(t).values(row).run()
  db.insert(syncQueue).values(entry).run()
})
```

Everything inside `runInTransaction` must be synchronous. Drizzle's builders end in
`.run()` / `.all()` / `.get()` on this dialect, so there is nothing to await; the public
functions in `write.ts` stay `async` so no caller changed.

**The compiler enforces it.** `runInTransaction` takes `task: () => undefined`, not
`() => void`. It shipped as `() => void`, which TypeScript satisfies with an async function,
so the replacement for the broken API had the same hole. A promise-returning task is now a
compile error, pinned by `src/db/__tests__/transaction.types.ts`. One thing no type can
see: a promise started *inside* a sync task (`void writeRow(…)`) runs after the commit.
**Never call the public write functions from inside a transaction.**

**The guards in `src/db/__tests__/no-bypass.test.ts`:**
- Any `db.insert` / `db.update` / `db.delete`, or raw `execSync` / `runSync`, outside the
  one file allowed to have them.
- Any drizzle `.transaction(`, sync or async.
- Any `runInTransaction(async`.
- Any expo-sqlite `with…Transaction…` outside `client.ts`.

The transaction guard strips comments before matching, because the files that explain
these bugs name them.

**Why the original test did not catch it, which is the lesson worth keeping.** The
substitute test asserted that a transaction *aborts* when its first statement fails. That
is a different and much weaker claim than the second statement failing and rolling the
first one back — and only the second is the guarantee `write.ts` exists to provide. See
the silent-pass hazard in `CLAUDE.md`.

---

## Styling

- **Every colour, radius, spacing, type size, opacity, icon size and stroke width comes
  from `ui/theme.ts`.** A hardcoded value in a component is a bug, no matter how small.
  ESLint enforces it: hex and rgba literals, bare numbers on spacing/radius/size/type
  properties, arithmetic on a token, `opacity` literals, numeric JSX `size`,
  `strokeWidth`, `width` and `height`, numeric defaults on visual props, and hand-written
  `fontFamily`/`fontSize`/`fontWeight`. `theme.ts` and test files are exempt
- **`ui/brand.json` is the brand identity**: the two grounds, the accent, and the typeface
  (family, package, files). It is JSON because `app.config.ts` runs in plain Node and cannot
  import `theme.ts`. theme.ts reads it, and app.config.ts reads it. A rebrand edits this
  file and the artwork, and nothing else
- **Every accent variant is derived** from `brand.accent` by `accentVariants()` in
  theme.ts, including the light mode split: the accent for fills, a darker derived ink for
  text and hairlines. Never type an accent hex or an accent rgba anywhere, theme.ts included
- **Tokens that are arithmetic are computed, not stored.** `size.tabRaised`,
  `size.iconButtonHitSlop` and `space.toastLift` are expressions over the values they
  depend on
- **`typeStyle(token)` takes one argument.** A control shown at two weights gets a named
  variant in `font` built from its base (`{ ...scale.chip, weight: '600' }`), never a
  weight passed at the call site
- Tab labels and screen titles live in `strings.ts` as `nav`
- **Contrast, WCAG AA, both schemes.** Text is at least 4.5:1 against the surface it sits
  on, after compositing any translucent surface over the ground. Icons and other non-text
  marks are at least 3:1. **`textMuted` is the faintest text colour.** `textFaint` is for
  icons only, and `textGhost` for decoration (the grabber, a progress track). Placeholders
  are text. `src/ui/__tests__/contrast.test.ts` holds all of this and fails if a faint token
  appears as a text colour. **When a component draws text on a new background, add the
  pair to that test's `SPECIAL` list**; the test can only check pairs it knows about
- **An input inside a `Sheet` is checked on a phone with the keyboard open.** The field, its
  error and the primary button must be visible above the keyboard. Android does not resize
  an edge-to-edge Modal for the IME, so `Sheet` lifts itself by the keyboard height. Never
  put an input in your own `Modal`: it gets none of this. A sheet taller than the space
  left above the keyboard does not yet scroll the focused field into view (decision due in
  Slice 3). A full-screen form is a separate case, unverified until Slice 4
- Sibling groups use flex with `gap`, never margins on children
- Motion values come from the States sheet. One `motion` object, no magic numbers

**Strings.** `lib/strings.ts` holds copy that **repeats or must stay consistent**: button
labels, error messages, empty states, confirmations, the free-tier promise wording.
Screen-specific prose stays inline where you can read it in context.

The reason is consistency rather than localisation. "Not now" versus "Not right now"
versus "Later" across three sheets is the kind of drift nobody notices individually and
everybody feels. Full extraction can happen later when localisation is real.

---

## State

| Kind | Where |
|---|---|
| Server data (two search APIs) | TanStack Query |
| Local data | SQLite via hooks. Never cached in a store |
| UI state (open sheet, current tab) | Component state |
| Cross screen UI state | Zustand, one small store |
| Settings | MMKV |

**Never hold book or session data in a Zustand store.** The database is the truth. A store
holding a copy is a store that goes stale.

---

## Errors

Three tiers, and the sheet defines how each looks:

1. **Recoverable** → inline error with a retry, states what is still safe
2. **Expected offline** → banner, never a modal, because the app works offline
3. **Unrecoverable** → error boundary with a restart, reported to Sentry

**What each tier's machinery can actually catch**, because it is not the same thing:

- **React error boundaries catch render errors only** — and a synchronous throw inside a
  `useEffect`. Nothing after an `await`, no promise rejection, no `onPress` throw. The root
  `ErrorBoundary` in `src/app/_layout.tsx` is the last-resort net for render failures.
- **Everything asynchronous is returned, not thrown.** A failed migration, backup or write
  comes back as an `AppError` and is rendered by the screen that asked for it — a failed
  migration is a full-screen notice with Try again, not the boundary.
- **Caught failures reach Sentry only if you send them.** Call `reportUnrecoverable` from
  `src/lib/sentry.ts` with the context that distinguishes one failure from another. With no
  DSN configured it logs and does nothing else; the app must behave identically either way.
- **A root boundary fallback may use no provider.** When it fires, every provider beneath
  the root layout is gone. `useSafeAreaInsets`, `useToast`, a query hook — any of them
  throws inside the fallback and loops. Plain Views and the palette only.

**Launch gates are rendered state, never routes.** See `src/features/launch/`. A gate that
is a route sits in the back stack and can be returned to with the back button.

**Typed routes regenerate only when Metro runs.** After adding or renaming a route file,
`npm run typecheck` reports the new path as invalid until `npx expo start` has rewritten
`.expo/types/router.d.ts`. That is stale generated types, not a wrong path.

Error copy says what happened, what is still safe, and one next action. Never a code, never
"Oops", never blame the network without stating the library is untouched.

---

## Dates

The most bug prone area in this app, and the one the whole product thesis rests on.

- **Store UTC unix milliseconds. Always.**
- Format at render time in the device timezone
- All date logic lives in `lib/dates.ts`. Nowhere else imports date-fns
- **Group by `sessions.local_day`, never by `date(occurred_at)`.** The latter buckets in UTC
  and misfiles early morning or late evening sessions depending on the timezone. This is the
  one stored derivation in the schema and the reasoning is in `03-DATA-MODEL.md`
- `local_day` is written whenever `occurred_at` is written, and never otherwise, **by the
  write path**. No caller supplies it; see Data access
- `occurred_at` is user editable everywhere it appears
- Test explicitly: a session logged at 11pm on the 31st in IST must belong to the correct
  day, month and year. Bookly gets this wrong and travellers notice

---

## Secrets

- **Public keys** (Supabase anon key, Sentry DSN, the force-update URL) go in `.env` as
  `EXPO_PUBLIC_*` and are read **only** in `src/lib/config.ts`, as literal
  `process.env.EXPO_PUBLIC_NAME` expressions. Metro inlines those at bundle time, so a
  Metro restart with `--clear` picks up a change. **Not** `app.config.ts` `extra`:
  `expo-constants` reads the copy embedded in the APK at native build time, so a `.env`
  change there silently does nothing until a full rebuild. Destructuring `process.env` or
  indexing it by a variable is not inlined and is undefined on a device. They are designed to
  be public; Row Level Security and rate limits are what protect the data.
- **Real secrets** go in EAS Secrets and never in git.
- `.env` is gitignored from the first commit, not added after.
- **The Supabase service role key must never appear in the app.** Reaching for it client
  side means the RLS policy is wrong instead.

---

## Accessibility

Not optional, and Android font scaling will break these layouts if ignored.

- **Every layout survives 200% system font scale without clipping.** Several designed
  screens have fixed height rows and tight two column sections; test this early, it is one
  system setting
- Every interactive element has an `accessibilityLabel`
- TalkBack can complete the log a session flow start to finish
- Nothing tappable under 44px, body text never below 12px
- Contrast is handled by the theme. Do not introduce new greys

---

## Testing

Not comprehensive. Targeted at the things that silently corrupt data.

**Must have tests:**
- Date boundary handling across timezones, and `local_day` matching `occurred_at` under
  IST, a US timezone and a DST transition
- Every day-bucketed aggregate grouping on `local_day`, never `date(occurred_at)`
- **No write path bypasses `sync_queue`.** Two parts: a source guard that fails on any
  `db.insert(` / `db.update(` / `db.delete(` outside `src/db/write.ts`, and a behavioural
  test per syncable table asserting one matching queue row and that a failing enqueue rolls
  the table write back
- **Every schema-shape guard, watched failing at least once.** A guard that has only ever
  been seen to pass may be reading the wrong thing entirely: the first version of the
  syncable-table check terminated its regex at the wrong brace and silently asserted
  nothing for two of the seven tables. Break what it protects, on purpose, and see it go
  red before you trust it
- **A soft delete cascades and its restore reverses exactly that set.** A live session
  under a deleted read is a wrong statistic that no screen can explain
- Statistics aggregation, especially pages and hours staying separate, and sessions that
  cannot be counted surfacing as `unusable` rather than as a silent zero. **A recovered
  session (a duration, no positions) counts fully in time and is never `unusable`**; the
  full table is in `03-DATA-MODEL.md`
- **When a backup is taken** (`migrationPlan.test.ts`): only when drizzle will apply
  something, by drizzle's own timestamp rule, and never on a fresh install. Also that the
  journal's timestamps strictly increase
- Import parsing against real Goodreads exports, including malformed ones
- Sync queue replay idempotency
- **Migrations against a populated database of the previous schema**, under node:
  `src/db/__tests__/migrations.test.ts` runs the real SQL files the way drizzle's migrator
  does, against 2000 books holding the shapes a new constraint forbids, with a positive control
  that the unrepaired migration fails on the same fixture. Watched failing against three broken
  versions of `0001`
- **Anything the app records on the reader's behalf without their input** must be bounded
  by what the app actually knows. `recoveryPolicy.test.ts` is the model: the recovered
  session's elapsed time is an upper bound, never a duration
- **The launch gate order** (`gateOrder.test.ts`): which screen wins when more than one gate
  has an opinion
- **Derived theme values** (`theme.test.ts`): the accent derivation reproduces the design
  sheet, a rebrand moves every variant, derived text stays readable, and the computed
  tokens hold their relationships
- **Config that reaches the native build** (`brand-font.test.ts`, `native-fonts.test.ts`,
  `metro-blocklist.test.ts`): the font brand.json names is the one app.config.ts embeds,
  the one in `android/`, and the one in the APK; Metro blocks Gradle output with either
  path separator. These run against the real config and the real build output, because
  every past failure here was a config that was correct and never reached a build

**Do not bother testing:** component rendering, navigation, styling. Manual use catches
those faster.

**`npm test` passes its glob in double quotes, and a test holds it there.** Unquoted, `sh`
expands the glob itself, and without `globstar` `**` means one directory. On macOS, Linux or
any CI that ran 44 of 106 tests and reported a clean pass. Windows hid it, because `cmd`
hands the literal to Node's own glob. `src/lib/__tests__/test-runner.test.ts` fails if the
quotes go, or if any `*.test.ts` on disk is not matched. It lives one directory under
`src/` on purpose: the broken glob still reaches it there, while `src/__tests__/` is exactly
where it would silently not run.

**Logic that must be tested lives in a pure module the node suite can load.** `npm test`
runs under plain Node, which cannot load `expo-*`, `react-native`, `expo-sqlite` or anything
that imports them. A test that imports a hook fails to start, and a decision written inside
a hook is untestable. So the decision goes in its own file whose only imports from those
worlds are `import type` (erased at compile time), and the hook or component beside it does
the I/O and calls it. The pattern, in `src/features/launch/`:
- `forceUpdatePolicy.ts` beside `forceUpdate.ts`
- `recoveryPolicy.ts` beside `SessionRecoverySheet.tsx`
- `gateOrder.ts` beside `useLaunchGates.ts`
- `src/db/migrationPlan.ts` beside `migrate.ts`
- `src/ui/toastQueue.ts` beside `Toast.tsx`
- `src/ui/coverSource.ts` beside `BookCover.tsx`
- `src/domain/progressDisplay.ts`, shared by the Library row and book detail
- `src/features/book/sessionLine.ts` beside `SessionRow.tsx`

What stays untested is the hook's state transition itself; that half is verified on a
device, and the entry in `DECISIONS.md` says so.

**Config is tested against the real config.** `@expo/config`'s `getConfig(process.cwd())`
evaluates `app.config.ts` exactly as the Expo CLI does. `brand-font.test.ts` uses it.
Reading the file as text, or re-deriving what it should produce, tests a copy.

### Regression tests, guards and their controls

Four rules, from three bugs that came back inside the code that fixed them. The analysis is
in `CLAUDE.md`; this is what it means while writing code.

1. **Every bug that gets fixed gets a check that fails without the fix.** A node test, a
   `@ts-expect-error` type assertion, or a device check — whatever is automatic. Where
   nothing can assert it (a native crash, a timing race), the check is a **counted
   measurement** with the number written down.
2. **A type beats a lint rule beats a comment.** Writing "never do X" in a comment is the
   moment to ask which type makes X not compile.
3. **A guard counts only once it has been watched failing**, and must be re-watched when
   the code it guards is rewritten.
4. **After fixing a bug, look for the same class of bug in the rest of that file.**

**Every textual guard carries a positive control.** A regex over source text fails in one
direction: it stops matching, and passes. So each one is fed a known-bad sample every run,
and prose it must not flag. See `no-bypass.test.ts`, `contrast.test.ts` and
`test-runner.test.ts`. A guard without a control is not a guard.

**Where we still have the weaker form.** Each is a candidate for a type, not an accepted
state:

| Rule | Enforced by | A structural version would be |
|---|---|---|
| Never call `writeRow` and friends inside a transaction | a comment | internal writers taking a transaction token the public API cannot produce |
| Every day-bucketed aggregate groups on `local_day` | a comment and review | a branded `LocalDay` that the query builders demand |
| All SQL lives in `queries.ts` | a textual guard | a module boundary the type system can see |
| Colours, spacing and type come from the theme | ESLint | branded token types on style props |
| An input in a sheet is keyboard-checked on a phone | a doc rule | nothing automatic; it needs the device |

**Every list of books filters with `isCurrentRead`** (`db/currentRead.ts`). A book's tab is
its current read's status. Filtering each read by its own status put a re-read book on two
tabs. Device check 12 holds it.

**Every tappable that navigates or writes goes through `usePressGuard`**, or through
`Button`, which uses it. A double tap on a Library row used to open book detail twice.

**Never let whether something is shown depend on state derived during render.** `Sheet`
derived `mounted` from `visible` with a render-phase `setState`. React dropped that update
behind a skipped no-op one, and the actions sheet never opened. Render from the prop and let
derived state only extend it (`ui/sheetMount.ts`).

**A screen that loads in an effect reloads on return with `useOnRefocus`, never with a bare
`useFocusEffect`.** That one also fires on mount, and every open ran its query twice.

**The contrast test's `SPECIAL` list is not wired to the components.** It proves a pair is
readable, not that a component uses that pair. When a component draws text on a coloured
surface, add the pair, and name the component in the pair's label. A component quietly
switching to another token is not caught.

**A rule expressed twice needs a check that holds the copies equal.** The counting rule
lives in `domain/stats.ts` and, for lists, in `db/progressAggregates.ts`. Device check 10
asserts they agree. Do not add a third expression; import one of the two.

**Mass-writing dev tools run on a sandbox database only, in development builds only.**
`EXPO_PUBLIC_SANDBOX_DB=1` opens `sandbox.db`, and the device-pass flag opens `devcheck.db`.
A release build ignores both (`lib/databaseChoice.ts`, tested, wiring included). The seeds
refuse on the library, and refuse a sandbox that already has books. Nothing seeds,
bulk-deletes or restores over the reader's library.

### Running the device pass

**It runs on its own database.** With `EXPO_PUBLIC_DEVICE_PASS=1` the app opens
`devcheck.db` instead of `reader.db`, from launch, and the pass, the gates and the
migrations all use it. The pass seeds, deletes, renames `sync_queue` and restores backups
over the live file, and it shared the reader's library until 2026-09-12: it wrote to the
owner's real library twice. Without the flag the Settings button refuses to run.

Everything above runs in Node. The checks that need a real SQLite connection and a real
filesystem live in `src/db/devchecks.ts`, are specified in
`src/db/__tests__/sync-queue.device.md`, and run on a device.

**The procedure is in `docs/09-ENVIRONMENT.md`, and only there.** That file is the
workshop; this one is the standard. What belongs here is the rule:

**A migration is not tested until it has run against a POPULATED database of the previous
schema.** A fresh install exercises none of the interesting paths: it has no rows to
violate a new constraint, nothing to lose, and nothing to restore. Pin the journal to the
old version, launch, populate, then restore the journal and relaunch.

### The startup path is not covered by the device pass. Relaunch after touching it.

**Rule: after any change to `db/client.ts`, `db/backup.ts` or `db/migrate.ts`, relaunch
the app and confirm it reaches `schema vN`, and that `adb logcat | grep '\[migrate\]'` is
silent.** It costs one launch.

**The obvious rule — "re-run the device pass" — would not have caught the bug that
prompted this one, and it is worth understanding why.** A read left a transaction open,
so the `PRAGMA wal_checkpoint(TRUNCATE)` on the next line failed, so the backup failed, so
migrations could never run. The device pass calls `checkpointWal()` directly, in
isolation, with no open reader — it never executes the sequence that fails. It passed
14/14 while upgrades were bricked.

The pass tests **modules**. `performMigrations()` is a **sequence**, and the only thing
that executes it is starting the app. A suite of green unit checks over the parts of a
startup path says nothing about the path.

This generalises past this one file: when a bug lives in the *order* of two correct
operations, the test that finds it has to run them in that order, which usually means
running the real entry point rather than its pieces.

---

## Formatting

**Prettier owns it.** `eslint-config-prettier` is in the ESLint chain specifically to turn
off every formatting rule, so ESLint judges correctness and Prettier judges layout, and
they never disagree. Run `npm run format`; `npm run format:check` fails the same way CI
would.

**`src/ui/theme.ts` is the single exception, in `.prettierignore`.** Its type, space and
radius scales are laid out as aligned columns, and Prettier collapses that to one space
after each colon. The alignment is the point: the file is a design system sheet expressed
in code, and reading a scale as a table is how a wrong value gets spotted. Nothing else is
exempt, and a second exemption should be argued for rather than added.

Formatting was previously half-enforced — Prettier was installed, a `format` script
existed, and 26 files did not pass — which is worse than either extreme, because the diff
noise makes every real change harder to read.

---

## Git

- One slice per branch, small commits
- Commit messages say why, not what. The diff already says what
- **Never commit a migration you have not run against a seeded database**
- Tag every Play Store release

---

## Performance budget

| Metric | Budget |
|---|---|
| Cold start to Library | < 2s on a midrange phone |
| Log a session, tap to saved | < 100ms perceived |
| Library scroll with 2000 books | 60fps |
| Search results first paint | < 800ms |
| APK size | < 15MB |

If a change breaks one of these, treat it as a bug rather than a tradeoff.

---

## The 8000 line problem

Around 8000 lines an AI assistant stops holding the whole codebase in context and starts
breaking distant things. Defend against it structurally:

1. **`DECISIONS.md` is not optional.** It is how context gets rebuilt
2. **Feature folders stay independent.** A feature imports from `ui/`, `db/`, `domain/`
   and `lib/`, and from no other feature
3. **200 lines or one clear responsibility, whichever is larger.** The limit is a smell
   detector, not a law. `schema.ts` and `theme.ts` will exceed it legitimately because
   they are single cohesive declarations. A screen split across four files to satisfy a
   line count is worse than one 300 line screen. When a file is both long *and* doing two
   jobs, split it
4. **Keep `docs/` current in the same commit as the change**
5. **When starting a session, read `DECISIONS.md` and the relevant spec first.** It is
   cheaper than rediscovering why something is the way it is
