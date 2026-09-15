# ARCHITECTURE

Every technology choice, with the reasoning and the rejected alternatives. This document
exists so that in month five, when something is painful, you can tell whether it is painful
because the choice was wrong or because the thing is just hard.

---

## The constraints that drove everything

1. **All code is written by an AI assistant.** Not a preference, a hard constraint. The
   language and framework must be ones the assistant writes well, because a stack the
   assistant is mediocre at means a project that stalls.
2. **Solo developer, nights and weekends.** Roughly 15 hours a week. Anything requiring a
   specialist or a long ramp is out.
3. **Android only for v1.** A scope decision: one platform is what one part-time developer
   can build, test on real devices and support. It is **not** a market gap. This line
   used to say every well-designed competitor is iOS only; that was false, and the
   category's leading apps are on Android too (`01-PRODUCT.md`, Positioning, corrected
   2026-09-10).
4. **Effectively zero budget.** Total spend must be a $25 one time Play Store fee plus
   nothing recurring until there is revenue.
5. **Must work fully offline.** Reading happens on planes, in bed, on the metro.
6. **Two features are unusually demanding:** a timer that survives the app being killed,
   and a home screen widget. Both need real native Android capability.

---

## ADR 001 · Client framework: React Native with Expo

**Chosen:** React Native with Expo, TypeScript, Expo Router.

> **Use the latest stable Expo SDK at the time you start**, with the New Architecture
> enabled. Do not pin to a version named in this document; it is already stale. Run
> `npx create-expo-app@latest`, take what it gives you, then pin exact versions in
> `package.json` and record them in `DECISIONS.md`.

### Why

**The decisive factor is constraint 1.** An AI assistant writes TypeScript and React
dramatically better than it writes Dart, and better than it navigates Gradle. The volume
of training data is not close. Every other consideration is secondary to this one, because
a stack where the assistant produces subtly wrong code is a stack where a non hand coding
developer cannot make progress.

Supporting reasons:

- Expo removes Android Studio configuration, which is where solo projects historically die
- EAS Build produces signed release builds in the cloud, free tier, no local toolchain.
  **For day to day work build locally with `npx expo run:android`, which is free and
  unlimited.** Keep EAS for release builds only. This is a real advantage of Android only
- Expo Router is file based, so navigation structure is legible rather than configured
- Over the air updates let you ship JS fixes without a Play Store review cycle
- The specific native modules needed are all mature: `expo-sqlite`, `expo-notifications`,
  `expo-task-manager`, `expo-file-system`, `expo-document-picker`
- The path to iOS in month twelve is open without a rewrite

### Rejected

**Flutter.** Genuinely better raw performance and animation, and a more consistent widget
model. Rejected purely on constraint 1. The assistant's Dart output is meaningfully weaker
than its TypeScript output, and that gap compounds over a codebase. If you were hand coding,
this would be a close call and possibly the better answer.

**Native Android, Kotlin and Compose.** Best possible performance, best foreground service
and widget story, no bridge. Rejected because Gradle and the Android build system are where
AI assisted development breaks down hardest, and because it forecloses iOS entirely.

**Next.js, or any web framework in a shell.** Rejected firmly, and this is worth
understanding because it is the trap this category keeps falling into. Next.js builds
websites. Wrapping one in a native shell gives you no real foreground service, poor
notifications, no proper widgets, and a cold start that feels wrong. The research is
unambiguous here: Hardcover users say *"the app keeps redirecting me to the website which
is pretty annoying"* and StoryGraph users say *"its lag time to open is killing me."* Both
wrapped the web. That is a mistake we get to not make.

**Capacitor or Cordova.** Same problems as above, plus a smaller ecosystem.

### Known costs of this choice

Be honest about these rather than discovering them in month four:

- **Widgets need native code.** React Native has no first class widget story. Use
  `react-native-android-widget`, which works but is a real integration. Budget several days
  and treat the widget as v1.1 if it fights you.
- **The foreground service needs a config plugin.** `expo-notifications` alone will not keep
  a timer alive reliably. You will write or adapt an Expo config plugin that declares the
  foreground service in the manifest. This is the hardest technical item in Phase 1.
- **You must use a development build, not Expo Go.** Expo Go cannot load custom native
  modules. Set up `npx expo prebuild` and EAS development builds on day one, not later.
- **List performance needs care.** Importers arrive with 500 to 2000 books. Use FlashList
  from Shopify rather than FlatList, from the first list you write.

---

## ADR 002 · Local database: SQLite via Expo, with Drizzle ORM

**Chosen:** `expo-sqlite` as the engine, Drizzle ORM for typed queries and migrations.

### Why

The data model is genuinely relational. A book has many reads, a read has many sessions,
sessions aggregate into statistics. Every meaningful query is a join or an aggregate. This
is what SQL is for, and forcing it into a document store is how you end up recomputing
statistics in JavaScript over the whole library.

Drizzle specifically because it gives compile time typed queries, which catches an entire
class of error before it runs, and because its migration story is explicit files rather than
magic. Both matter more than usual when an AI is writing the queries.

SQLite is also the correct answer for offline. There is no sync layer to be down, no cache
to be stale. The database is on the phone and it is the truth.

> **Caveat worth knowing up front.** Drizzle's Expo SQLite driver is newer than its server
> equivalent and the migration story is less polished. You will hit at least one rough edge.
> Get migrations working end to end in Slice 0, including a rollback test, before there is
> any data to lose. If it fights you for more than two days, plain `expo-sqlite` with hand
> written SQL is an acceptable fallback and the schema does not change.

### Rejected

**WatermelonDB.** Purpose built for local first sync and genuinely good. Rejected because
its sync model wants to own your schema and it adds a large conceptual surface for a solo
developer to hold. Revisit if hand rolled sync becomes painful.

**Realm / MongoDB Device Sync.** Sync is excellent and free at this scale. Rejected because
it is a document store, which fights the relational model, and because Atlas Device Sync
has been deprecated once already. Platform risk on a foundational choice is not worth it.

**AsyncStorage or MMKV alone.** Fine for preferences, hopeless for a library of 2000 books
with 50000 sessions. Use MMKV alongside SQLite for small key value settings only.

---

## ADR 003 · Backend: Supabase

**Chosen:** Supabase. Postgres, Auth, and Row Level Security. Free tier.

### Why

**The schema is the same on both ends.** Local SQLite and remote Postgres share a
relational model, so sync is row mapping rather than translation. This is a bigger deal
than it sounds; a document store on the server would mean maintaining two mental models.

**Auth is exactly what was designed.** Google sign in and email one time codes both ship
out of the box. No auth code to write, which is the part of a backend most likely to be
subtly insecure when generated.

**Row Level Security means no backend code at all.** A policy saying a row is visible only
to its owner is four lines of SQL and it is enforced by the database. There is no API layer
to write, deploy, secure, or pay for. For a solo developer this removes an entire category
of work.

**Free tier is genuinely sufficient.** 500MB database, 50000 monthly active users, 5GB
bandwidth. Book rows are tiny. You will not approach these limits before you have revenue.

### The gotcha you must design around

**Free tier projects pause after seven days with no activity.** This would be fatal for a
server dependent app. It is survivable here precisely because the architecture is local
first: if Supabase is asleep, the app still works perfectly and sync simply retries later.
Design so a paused backend is invisible to the user, and it will be.

### Rejected

**Firebase.** Firestore is a document store, which fights the model. Pricing is per read
and gets alarming when you sync thousands of rows. The free tier is generous until
suddenly it is not, and the failure mode is a bill.

**PocketBase self hosted.** Excellent software, genuinely free, single binary. Rejected
because it means you now run a server, which is a second job. Revisit if Supabase pricing
ever changes badly.

**Turso.** SQLite in the cloud, which is conceptually beautiful next to local SQLite.
Rejected because it has no auth layer, so you would build that yourself.

**No backend at all.** Tempting, and the app would work. Rejected because losing everything
on a phone upgrade is the single most rating destroying event in this category, documented
with real one star reviews in `01-PRODUCT.md`.

---

## ADR 004 · Sync: last write wins per row, with a local outbox

**Chosen:** Each table carries `updated_at` and `deleted_at`. Local writes go to SQLite and
also append to a local `sync_queue`. A background task drains the queue when there is
network. Pulling down, the newer `updated_at` wins per row.

### Why

Conflicts are genuinely rare in this app. One person, usually one device at a time, and
sessions are append only in practice. Nobody edits the same session from two phones
simultaneously. Paying the complexity cost of CRDTs to solve a problem that will occur a
handful of times is the wrong trade.

Sessions being append only is what makes this safe. The dangerous case for last write wins
is two people editing one document; here the equivalent barely exists.

### Rules that make it correct

- Every row has a client generated UUID primary key, never an auto increment integer.
  Two phones offline must be able to create rows that do not collide.
- Deletes are soft. `deleted_at` is set, the row syncs, and a purge job removes rows older
  than 30 days. This is also what powers Recently Deleted.
- The sync queue is idempotent. Replaying it must be safe, because it will be replayed.
- Never block UI on sync. Ever. Show a quiet indicator at most.

### Rejected

**CRDTs.** Correct, and overkill. Revisit only if real multi device conflicts appear.

**Operation log sync.** More precise, more code, more failure modes.

---

## ADR 005 · Book metadata: Google Books plus Open Library, merged

**Chosen:** Query both in parallel. Merge by ISBN, dedupe, prefer Google Books for covers
and Open Library for coverage gaps. Cache every result permanently in local SQLite.

> **Get a free Google Books API key in Slice 4.** Unkeyed requests are rate limited by IP
> and you will hit that during development. Set a descriptive User-Agent on Open Library
> requests, which they ask for.
>
> **As built (2026-09-14):**
> - **Google refused unkeyed requests outright** (429, quota 0), so without
>   `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` it is not asked and search is Open Library alone.
> - **Open Library returns works, not editions, and matches fuzzily.** A hit keeps no ISBN or
>   publisher of its own, and results matching none of the typed words are dropped.
> - **Offline is told apart from a broken server by what the request failed with.** Expo's
>   fetch rejects offline with a `FetchError`, not a `TypeError`.
> - **How a search runs:** no server and no search engine.
>   - **Book search:** the phone asks Google Books and Open Library at the same time, after a
>     300 ms pause in typing (`rules.searchDebounceMs`) and from 2 characters, with no automatic
>     retries.
>   - **Results:** render as each source answers, merged with Google's edition first, and are
>     remembered in `metadata_cache` for offline.
>   - **Library search:** TypeScript over local SQLite rows (accent-insensitive; SQLite `LIKE`
>     cannot be).
> - **Book details (Slice 5):** Google's search result already carries description, categories
>   and viewability, so adding a Google book costs no extra request. An Open Library book fetches
>   its work (`/works/<id>.json`) once, in the background. A book from before Slice 5 fetches
>   once when opened: a Google volume (`/volumes/<id>`, one quota request per book, ever) or an
>   Open Library work. `db/bookDetails.ts`, beside `coverFiles.ts`.
>
> See `DECISIONS.md`, 2026-09-14.

### Why

Search failure is the single most cited complaint against Goodreads, with users reporting
that *"searches fail to return books that exist in the system."* One source is not enough.
Google Books has better covers and metadata; Open Library has better coverage of older,
international, and self published titles. Together they cover meaningfully more than either.

Both are free. Google Books needs no key for basic search, though an API key raises the
rate limit and is free to obtain. Open Library has no key and no hard limit but asks for a
descriptive User-Agent, which you must set.

**Caching is not an optimisation, it is correctness.** Once a book is in a user's library,
its metadata must never depend on a network call again.

### The rule that matters more than the sources

**Every metadata field is user editable, and manual entry is always one tap away.** The
research is emphatic that bad metadata is the median case, not an edge case. Wrong page
counts break progress and statistics silently, which is worse than an obvious error.

---

## ADR 006 · Supporting choices

| Concern | Choice | Why |
|---|---|---|
| Navigation | Expo Router | File based, legible, deep linking free |
| State | Zustand | Minimal, no boilerplate, assistant writes it well |
| Server state | TanStack Query | Only for the two search APIs, not for local data |
| Styling | StyleSheet plus a typed theme object | No extra runtime; theme file mirrors the design system sheet exactly. Every colour, spacing, radius and type size is lint-enforced to come from it |
| Fonts | Plus Jakarta Sans, embedded at build time via the `expo-font` config plugin | Five weights linked as an Android XML font family, so one `fontFamily` plus a `fontWeight` resolves correctly. Runtime `useFonts()` would mean a blocked splash or a visible reflow against a sub-2s cold start. Applied only through `typeStyle()` in `theme.ts`. The family, package and files are named once in `src/ui/brand.json`, read by both `theme.ts` and `app.config.ts`; `brand-font.test.ts` fails if they diverge, and `native-fonts.test.ts` fails if `android/` or the APK lacks them |
| Lists | FlashList | FlatList will not survive a 2000 book import |
| Payments | RevenueCat | Free under $2500 monthly tracked revenue, handles Play billing edge cases you should not hand write |
| Strings | One flat `src/lib/strings.ts` | No i18n library. Costs nothing now, saves the India localisation later. See `06-CONVENTIONS.md` |
| Secrets | `app.config.ts` for public keys, EAS Secrets for real ones | The Supabase service role key never appears in the app. See `06-CONVENTIONS.md` |
| Crash reporting | Sentry (`@sentry/react-native`, pinned to the version Expo resolves) | 5000 errors a month free, and you need this on day one. A no-op until a DSN is configured |
| Analytics | PostHog | 1M events a month free. Instrument second session rate first, it is the only early number that means anything |
| Notifications | expo-notifications plus a custom foreground service plugin | The timer notification is a designed feature, see the States sheet |
| Widgets | react-native-android-widget | Only real option. Treat as v1.1 if it resists |
| Dates | date-fns with explicit timezone handling | Bookly scrambles sessions across timezones. Store UTC, render local, always |
| Date and time pickers | `@react-native-community/datetimepicker`, Android's own dialogs (Slice 3) | The session date is the most important control in the app, and the native dialogs are accessible and localised for free. A native module: adding it needs a native rebuild. Its config plugin only themes the dialog and is not used. See `DECISIONS.md`, 2026-09-13 |

---

## ADR 007 · The force update flag is hosted outside the backend

**Chosen:** one static JSON file on Cloudflare Pages, at a versioned path
(`/v1/kill-switch.json`).

**Why not Supabase, when it is already the backend of record:** a kill switch must not share
a failure domain with the thing it switches off. The incidents most likely to make you reach
for it — a bad migration, a blown quota, an RLS lockout — are Supabase incidents. Free
Supabase projects also pause after a week idle and serve a replaced file stale for up to an
hour. A switch that is asleep or stale during the incident is not a switch.

**What the choice actually optimises:** not uptime. The client fails open, so an unreachable
host is harmless by construction. The two dangerous failures are a flag that is reachable but
**stale**, and a flag you **cannot flip** in time. Cloudflare serves static assets with
`max-age=0, must-revalidate`, invalidates on deploy, and has no request cap.

**Known cost:** flipping needs a laptop and `wrangler`; a deployed file cannot be edited from
a phone. See `DECISIONS.md`, 2026-09-10, and `09-ENVIRONMENT.md` for the flip procedure.

---

## Total cost

| Item | Cost |
|---|---|
| Play Store developer account | $25 once |
| Expo EAS free tier | $0 |
| Supabase free tier | $0 |
| Google Books, Open Library | $0 |
| RevenueCat under $2.5k monthly | $0 |
| Sentry, PostHog free tiers | $0 |
| **Recurring** | **$0** |

---

## Architectural rules that outlive any library

1. **The database is the truth. The UI is a view of it.** Never hold app data in component
   state that is not derived from SQLite.
2. **Never block the UI on the network.** If the user has to wait for a server to see their
   own books, the architecture has failed.
3. **Every write is local first and synchronous from the user's perspective.**
4. **All IDs are UUIDs generated on the client.**
5. **All timestamps are UTC in the database, formatted at render time.**
6. **Deletes are soft, everywhere, no exceptions.**
7. **The theme file mirrors the design system sheet.** No hardcoded colours in components,
   ever. This is what keeps screen 30 looking like screen 1.
8. **Feature flags for anything risky.** The force update kill switch is one of these. It
   is hosted deliberately **outside** Supabase — see ADR 007.

---

## Known risks, ranked

| Risk | Likelihood | Mitigation |
|---|---|---|
| Foreground service unreliable across OEMs | High | Test on Xiaomi and Samsung specifically, they kill background work aggressively. Always offer manual session logging as the fallback, which the design already does |
| Widget integration eats a week | Medium | Ship v1 without it. It is Plus tier, not core |
| Sync bugs corrupt data | Medium | Soft deletes, sync queue replay tests, and a local backup before every migration |
| Import chokes on a real Goodreads file | High | Test against ten real exports, not one. The formats vary more than the docs suggest |
| Supabase free tier pause confuses you | Medium | Expected behaviour. Local first means users never see it |
| Codebase outgrows assistant context | High | `DECISIONS.md`, small modules, strict feature folders |
