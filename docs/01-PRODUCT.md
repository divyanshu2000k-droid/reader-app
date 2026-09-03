# PRODUCT

Why this app exists, distilled from a study of nine competitors and several hundred real
user reviews. Read this before the technical documents, because most architectural
decisions here are downstream of a specific documented complaint.

---

## The opening

Goodreads has roughly 150 million users and has not shipped a meaningful update in a
decade. Amazon owns it, killed its API in 2020, and the community forums contain a group
literally titled *"Goodreads Keeps Getting Worse."* The alternatives that emerged each
solved one slice and left the rest broken.

The interesting finding from the research is this: **of the nine most cited complaints
across the category, only two are about missing features.** The rest are about losing data,
losing time, or being charged for something users feel they already own. This is not a
category won by out-featuring anyone.

---

## The nine findings, ranked by how often they recur

### 1. Dates are the fragile spine, and every app snaps it
The deepest structural flaw in the category. Four symptoms, one cause.

> *"It automatically marks ALL pages as being read on the final day, there seems to be no
> way to back date entries."* · StoryGraph review

> *"In 2020, I read over 100 books but StoryGraph says I read 1."* · after an import

**Our answer:** sessions are the atom, each carries its own editable date. See
`03-DATA-MODEL.md`.

### 2. No account means catastrophic loss at phone upgrade
Apps that skip auth to reduce friction create the single most rating destroying event in
the category.

> *"I just got a new phone… no data."* · Bookmory
> *"The app has deleted a lot of my reading sessions (going back months!)"* · a *paying*
> Bookly subscriber who dropped four stars to two

**Our answer:** local first SQLite for speed, silent anonymous cloud backup from launch,
email requested only at day seven and framed as protecting the library, never as a wall.

### 3. Paywalling the user's own data reads as theft
The angriest reviews in the category. The register is betrayal, not disappointment.

> *"You can't even see all of your read genres without paying. That's super lame."*
> · Hardcover

Bookly caps free users at 10 books and will not let them delete any. Bookmory hides basic
statistics behind a subscription or an ad watch.

**Our answer:** anything the user entered, and anything trivially derived from it, is free
permanently. We charge for what we compute or supply.

### 4. Search fails on books that exist
The most cited Goodreads complaint outright. Searching *Holiday Heart* returned five
results not containing both words.

**Our answer:** two sources merged, permanent caching, and manual entry always visible
rather than buried.

### 5. Audiobooks break every statistic they touch
The largest unmet feature area in the category and the top voted cluster on StoryGraph's
public roadmap. Every app forces one unit, so switching formats mid book double counts.

**Our answer:** format lives on the session. Books, pages and hours are three separate
numbers that never combine.

### 6. The timer is hostile to how people actually read
Basmo has no pause. Bookly cannot cancel a mis-started session and has silently zeroed
whole days, killing streaks. Book Riot's reviewer named the deeper flaw: session timers
only serve people who read in long planned blocks.

**Our answer:** manual logging sits beside the timer with equal weight on the home screen.
Pause, edit and delete on every session. Lock screen controls so stopping never requires
unlocking the phone.

### 7. Goodreads import is where trust dies
The number one migration complaint, failing at the exact moment of highest intent.

> *"Importing from Goodreads made a mess of all of my information… they were marked as
> being audiobooks."*

**Our answer:** preview and repair before anything is written. Ambiguous rows flagged and
resolved by the user. Nothing committed until confirmed.

### 8. Core actions cost too many taps
> *"Updating progress or adding a book shouldn't feel like a side quest."*

**Our answer:** two taps to log progress from home, as a hard budget. Treat a tap count
regression as a bug.

### 9. Missing table stakes that generate outsized rage
No half stars. No DNF status. No dark mode in Fable, reportedly called too difficult. Re-reads
that overwrite. Relentless review prompts.

**Our answer:** all of them ship in v1, because together they are about two days of work
and each is currently costing a competitor stars.

---

## Design principles

These settle arguments when you are mid build and unsure.

1. **Never lose a reader's data.** The only unforgivable failure here.
2. **Their data is theirs, free, forever.** A moral line and a marketing one.
3. **Every date is editable.** Reading happens before it gets logged.
4. **The timer is optional, logging is not.** Design for the reader who forgot to press start.
5. **Bad metadata is the default, not the exception.** Manual entry is a core flow.
6. **Never nag. Not once.** No review prompts, no share prompts, no ads in any tier.

---

## The nine distinctive features

Each maps to a numbered finding above. None require technology a competitor lacks; they
require decisions the incumbents already failed to make.

| | Feature | Kills finding |
|---|---|---|
| 1 | Any date session logging | 1 |
| 2 | Logging without the timer | 6 |
| 3 | Format on the session | 5 |
| 4 | Import preview and repair | 7 |
| 5 | Re-reads that do not overwrite | 9 |
| 6 | Timer controls on the lock screen | 6 |
| 7 | Never lose a session | 2 |
| 8 | Your data is free forever | 3 |
| 9 | Zero nagging | 9 |

---

## What the store listing can say

Six sentences no competitor can currently write. Every one is a promise the architecture
has to keep.

- "Log a session for any date. Change it whenever you like."
- "Audiobooks counted properly. Hours and pages, never mixed."
- "Your books and your stats are free. Forever."
- "Import from Goodreads without losing your dates."
- "No ads. No review prompts. Not even in the free tier."
- "Forgot to start the timer? Log it in four seconds."

---

## Positioning

**Android first, deliberately.** Margins, Bookly, Reading List, Basmo and TBR are all iOS
only. The best designed apps in the category are invisible to 72% of the world's phones.

**Accessible pricing.** Free tier is genuinely complete. Plus is ₹99 a month or ₹699 a
year, roughly a seventh of what StoryGraph and Margins charge. India is a volume and word
of mouth market, not the revenue engine; price for the US and let India compound.

---

## Success metrics

Downloads are vanity. Instrument these from day one.

| Metric | Target | Why |
|---|---|---|
| Second session within 7 days | > 40% | The only early number that means anything. One session is curiosity, two is a habit |
| Import completion rate | > 85% | Every drop off is a highest intent user lost |
| Manual vs timer log split | watch | If manual exceeds 50%, feature 2 was right and deserves more investment |
| D30 retention | > 25% | Below category norms means onboarding, not features |
| Day 30 free to paid | 1 to 2% | Plus is thin at launch by design. See `08-MONETISATION.md` |
| Crash free sessions | > 99.5% | Below this, nothing else matters. Track "sessions that failed to save" as a separate alarm |

---

## Event taxonomy

Use exactly these names, snake_case, and no others. Inventing event names per screen makes
the funnel unqueryable, which is the usual way analytics ends up useless.

```
app_opened              { cold_start, days_since_install }
onboarding_completed    { skipped, goal_set }
import_started
import_previewed        { total_rows, ambiguous_rows }
import_completed        { books_imported }
import_failed           { reason }
book_added              { source: google|openlibrary|manual|import, shelf }
session_logged          { method: timer|manual, format: pages|minutes, backdated }
book_finished           { rating, days_to_finish }
paywall_viewed          { trigger }
trial_started
purchase_completed      { plan: monthly|annual }
sync_failed             { reason }
session_save_failed     { reason }
```

`session_logged.backdated` validates the entire product thesis. Do not omit it.

`session_save_failed` is an alarm, not a metric. It should page you.
