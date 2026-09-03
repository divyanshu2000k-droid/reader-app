# BUILD PLAN

Twelve numbered slices, 0 through 11, plus Slice 5b, which is thirteen work items in
total. Each one ends with an app that launches and does something useful. Do not start a
slice before the previous one runs on a real phone.

Estimates assume roughly 15 hours a week and an AI writing the code. They are ranges
because the native pieces are genuinely unpredictable.

---

## Slice 0 · Foundations
**~1 week. Nothing visible. Everything depends on it.**

- Expo project, TypeScript strict mode, Expo Router
- **Development build via EAS on day one.** Not Expo Go. Expo Go cannot load the native
  modules this app needs and discovering that in week six is demoralising
- Drizzle plus `expo-sqlite`, full schema from `03-DATA-MODEL.md`, first migration
- **`src/db/write.ts` and `sync_queue` from the first write, with a no-op drain.** Every
  write in the app enqueues from Slice 0 onward, so Slice 8 only replaces the drain body.
  Ships with the two tests that prove no write path bypasses it. See `DECISIONS.md`
- Theme file mirroring the design system sheet exactly. Every colour, every radius, every
  type size as a named token. **No component may ever hardcode a colour**
- Shared components built from the system sheet: Button, Card, Field, Chip, Segmented,
  ProgressBar, BookCover, Sheet, Toast, Skeleton
- **Agent skills installed first**, before any code: `expo/skills` and Callstack's
  `react-native-best-practices`. They carry current Expo API patterns and RN performance
  rules that no static spec can keep up to date
- `tsconfig.json` path aliases: `@/features/*`, `@/ui/*`, `@/db/*`, `@/domain/*`, `@/lib/*`
- ESLint and Prettier, configured once so formatting never becomes a diff
- Empty skeletons for `lib/dates.ts`, `lib/ids.ts`, `lib/result.ts`, `lib/strings.ts` and
  the three `domain/` files, so their existence is not a question later
- Sentry, and a `DECISIONS.md` with your first entries, dated

**Done when:** a blank screen renders using theme tokens, the database opens, migrations
run, and a seed script can insert a book with a read and three sessions. Each of those
sessions has a correct `local_day`, and each left a row in `sync_queue`.

> Resist the urge to skip the component library and "just build screens". This slice is
> what stops screen 30 looking different to screen 1.

---

## Slice 1 · Launch and shell
**~4 days**

- Splash under 800ms, using the Android 12+ system splash API
- The four launch gates in order: force update check → running session recovery →
  restore → Library
- Force update driven by a remote flag. Build the kill switch before you need it
- Tab shell: Library, Add, Stats, with Add as a raised centre button
- Settings reachable from the Library header, not a tab

**Done when:** the app launches to an empty Library, tabs switch, and toggling the remote
flag shows the update screen.

---

## Slice 2 · Library and book detail
**~1 week**

- Library with shelf tabs, FlashList from the start
- Book detail: metadata, progress, session list, previous reads
- Book actions sheet: shelf move, re-read, edit, notes, share, delete
- Soft delete with undo toast, and Recently Deleted
- Empty states for every list

**Done when:** seeded books display, you can move one between shelves, delete it, and
restore it.

---

## Slice 3 · The core loop
**~1 week. This is the product.**

- Log session, with the editable date field prominent
- Quick add chips, +10, +25, +50, Finished
- Format toggle per session, pages or minutes
- Session complete screen
- Session edit and delete from book detail
- Streak and goal calculation

**Done when:** you can log a session for last Tuesday, edit its date afterwards, and see a
correct daily pace chart. **Test this specific case, it is the whole thesis.** Test it with
the device clock at 11pm and at 4am, in IST and in a US timezone: the session must land on
the day the reader thinks it did, which is what `local_day` exists for.

---

## GATE · after Slice 3, roughly six weeks in

**Stop and decide whether to continue.** The core loop works now, which makes this the
cheapest honest test you will get.

- Put it in front of ten real readers from r/books or bookstagram
- Watch them log a session without narrating
- Ask the only question that matters: would you be annoyed if this disappeared tomorrow

**Continue if** at least four say yes **and** you have been logging your own real reading
in it daily for two weeks.

**Stop or rethink if** neither is true. Finding out here costs six weeks. Finding out at
launch costs five months.

---

## Slice 4 · Adding books
**~1 week**

- Search hitting Google Books and Open Library in parallel, merged and deduped
- Permanent caching in `metadata_cache`
- Shelf picker sheet after selecting a result
- Add manually, doubling as the edit form
- Search your library, separate from search the internet
- Error and offline states from the States sheet

**Done when:** search works, killing the network still lets you add a book manually, and
a searched book stays fully usable offline afterwards.

---

## Slice 5 · Finishing a book
**~3 days**

- Finish flow with half star rating, optional note, editable finish date
- Auto move off Currently Reading, which Fable users complain it does not do
- Re-read creating a new `reads` row that leaves the old one intact

**Done when:** finishing then re-reading a book produces two reads with separate ratings
and dates, and both count in their own years.

---

## Slice 5b · Notes and quotes
**~3 days**

The actions sheet links here from Slice 2 and the screens exist in `design/`. Without this
slice that link is a dead end.

- Notes list per book, filtered by all, quotes, notes
- Note editor: quote or note toggle, page defaulting to current page, autosaved draft
- Notes attach to the **book**, not the read, so they survive re-reads
- Export notes for a single book

**Done when:** you can capture a quote mid session, it survives a re-read of that book, and
backing out of a half written note does not lose it.

> Draft autosave matters more than it looks. Losing a half written review is a live
> StoryGraph complaint.

---

## Slice 6 · The timer
**~1 to 2 weeks. The hardest technical work in Phase 1.**

- Timer screen with the ring
- Foreground service so it survives backgrounding, via an Expo config plugin
- Notification with working Pause and Finish
- Recovery sheet when the app was killed mid session
- Notification permission priming before the system prompt

**Done when:** start a timer, force stop the app, reopen, and be offered the elapsed time.
**Test on Xiaomi and Samsung**, they kill background work far more aggressively than stock
Android and this is where the feature will break.

> **Hard rule: two weeks, then ship without it.** Manual logging is the differentiated
> feature and it already works. The timer is table stakes you can add in 1.1. Three to
> four weeks is a realistic worst case for a first custom config plugin, and never is
> possible. Write this limit into `DECISIONS.md` now, while you are calm, because you will
> not want to honour it in week three.
>
> **The full shape of that cut is already written**, dated 2026-09-03 in `DECISIONS.md`:
> what launch gate 3 does, what replaces the Reading screen, that v1 then requests no
> notification permission at all, and what comes off the store listing. Executing the
> deadline is a decision that has already been made, not one to make in week fifteen.

---

## Slice 7 · Stats
**~4 days**

- Three separate numbers: books, pages, hours. Never combined
- Daily pace chart, genre breakdown, year switcher
- Empty state for a library with too little data
- Everything free, no gating

**Done when:** a library with both print and audiobook sessions shows correct separate
totals, and no audiobook inflates a page count.

---

## Slice 8 · Account and sync
**~1 to 2 weeks**

- Supabase project, mirrored schema, Row Level Security policies
- Google sign in and email one time code
- Sync queue drain, pull with last write wins
- Backup prompt at day seven or five books
- Restore on a fresh install
- Account screen: subscription, sign out, **delete account**, privacy policy, support

**Done when:** sign in on phone A, sign in on phone B, and the library appears intact.
Then delete the account and confirm the data is actually gone.

> Account deletion and the privacy policy link are Play Store requirements. Not optional,
> not later.

---

## Slice 9 · Import
**~1 to 2 weeks. Leave it this late deliberately.**

- How to export walkthrough
- **Collect three real Goodreads exports before this slice starts.** Ask in r/books or
  from friends. You cannot build this against a file you wrote yourself; the real ones are
  messier in ways that matter
- File picker, parse, progress screen
- Preview with ambiguous rows flagged for resolution
- Nothing written until confirmed
- Import done summary
- Import failed state

**Done when:** ten real Goodreads exports from ten different accounts all import correctly,
including the messy ones. **Not one file. Ten.** The format varies more than the
documentation suggests.

---

## Slice 10 · Money
**~4 days**

- RevenueCat, Play Billing products
- Upgrade screen leading with what stays free
- Welcome to Plus, trial ending, restore purchase
- Read `docs/08-MONETISATION.md` before this slice. Plus is deliberately thin at launch
- Plus gating: soundscapes, comparative statistics, custom covers.
  **Widgets are NOT on the Plus list until they actually ship.** Selling four features and
  delivering three is lying to paying customers. Add widgets to the list in the release
  where they work
- **Nothing the user typed is ever gated**

**Done when:** a test purchase unlocks Plus, a reinstall restores it, and cancelling leaves
every book and statistic untouched.

---

## Slice 11 · Onboarding and polish
**~1 week**

- Three onboarding screens
- Every empty state
- Every loading skeleton and error state from the States sheet
- Widget, if Slice 6 did not exhaust your patience for native work
- Play Store listing, screenshots, privacy policy hosted somewhere

**Done when:** a fresh install walks a stranger from launch to logging their first session
without confusion.

---

## Totals

| | |
|---|---|
| Optimistic, nothing goes wrong | 9 weeks |
| Realistic | 14 weeks |
| **Plan for this** | **18 to 22 weeks** |

These assume no learning curve on Expo, EAS, Drizzle, Supabase or Play Console, which for
a first Android app is not a safe assumption. **Plan for 18 to 22 weeks** and treat
anything faster as a pleasant surprise. A plan you are already behind on by month two is
demoralising in a way that compounds.

---

## Before you submit to Play

- [ ] Account deletion works and is reachable in app
- [ ] Privacy policy hosted and linked
- [ ] Data safety form filled honestly
- [ ] Tested on a 360px wide device
- [ ] Tested on Xiaomi or Samsung for background killing
- [ ] Ten real Goodreads imports pass
- [ ] Airplane mode: every core flow still works
- [ ] 2000 book library: lists scroll at 60fps
- [ ] Migration tested from a seeded old schema
- [ ] Crash free above 99.5% across a week of your own use
- [ ] Every string checked for a stray em dash

---

## After launch, in order

1. Barcode scanning, the top deferred request
2. Reading Wrapped, **built in November, shipped in December**, not later
3. Widget, if it did not make v1
4. Content warnings
5. Reading challenges, timed for January
6. iOS, month twelve

---

## The one instruction that matters most

**At the end of every slice, use the app yourself for real.** Log your actual reading in
it. Not test data. If you are not using your own app daily by Slice 4, something is wrong
with the product and no amount of further building will fix it.
