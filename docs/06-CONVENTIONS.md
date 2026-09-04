# CONVENTIONS

Structure and standards. The goal is that any file can be understood without reading four
others, because that is what keeps an AI assistant effective past 8000 lines.

---

## Folder structure

Feature folders, not type folders. Everything a feature needs lives together.

```
src/
  app/                    Expo Router. Routes only, thin.
    (tabs)/
      library.tsx
      stats.tsx
    book/[id].tsx
    session/log.tsx
    onboarding/
  features/               The real code.
    library/
      components/
      hooks/
      queries.ts          All SQL for this feature
    session/
    import/
    sync/
    timer/
  db/
    schema.ts             Drizzle schema, single source of truth
    migrations/
    client.ts
  ui/                     Shared primitives from the design system sheet
    Button.tsx
    Card.tsx
    theme.ts              Every token. No colour exists outside this file.
  domain/                 Business logic shared across features.
    progress.ts           Current page, percent complete
    streaks.ts            Streak and goal calculation
    stats.ts              Aggregations, pages and hours kept separate
  lib/                    Generic utilities with no domain knowledge.
    dates.ts              All date handling. UTC in, local out.
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

`writeRow` stamps `created_at`, `updated_at` and `deleted_at` itself, so `RowFor<K>` omits
all three and a caller cannot pass them. An update that rewrites a row's creation date, or
a delete performed by setting `deleted_at` through `writeRow` — which would enqueue an
`upsert` instead of a `delete` and skip the cascade — are both unrepresentable rather than
merely discouraged.

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

**Two guards in `src/db/__tests__/no-bypass.test.ts`:** one fails on any
`.transaction(async` anywhere in `src/`, the other on any `db.insert` / `db.update` /
`db.delete` or raw `execSync` / `runSync` outside the one file allowed to have them.

**Why the original test did not catch it, which is the lesson worth keeping.** The
substitute test asserted that a transaction *aborts* when its first statement fails. That
is a different and much weaker claim than the second statement failing and rolling the
first one back — and only the second is the guarantee `write.ts` exists to provide. See
the silent-pass hazard in `CLAUDE.md`.

---

## Styling

- **Every colour, radius, spacing and type size comes from `ui/theme.ts`.** A hardcoded hex
  in a component is a bug, no matter how small
- The theme mirrors the design system sheet exactly, including the light mode accent split:
  bright `#F9BE3D` for fills, `#A4681A` for text and hairlines
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
- `local_day` is written whenever `occurred_at` is written, and never otherwise
- `occurred_at` is user editable everywhere it appears
- Test explicitly: a session logged at 11pm on the 31st in IST must belong to the correct
  day, month and year. Bookly gets this wrong and travellers notice

---

## Secrets

- **Public keys** (Supabase anon key, Sentry DSN) go in `app.config.ts` via
  `expo-constants`. They are designed to be public; Row Level Security is what protects the
  data.
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
  cannot be counted surfacing as `unusable` rather than as a silent zero
- Import parsing against real Goodreads exports, including malformed ones
- Sync queue replay idempotency
- Migrations against a 2000 book seeded database

**Do not bother testing:** component rendering, navigation, styling. Manual use catches
those faster.

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
