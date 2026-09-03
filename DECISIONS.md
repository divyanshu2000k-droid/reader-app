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
