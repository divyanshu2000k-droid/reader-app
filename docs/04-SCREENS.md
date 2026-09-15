# SCREENS AND JOURNEYS

Behaviour, not appearance. The design canvas is the source of truth for how things look;
this document is the source of truth for what they do.

**Read the whole file before building any screen.** Screens that look independent share
state, and knowing that in advance changes how you structure things.

---

## Where the visuals live

Behaviour is here. Appearance is in `design/`, as HTML you can read directly. Read the
design file for a screen **before** building it.

| Screen | Design file |
|---|---|
| Design system, colours and components | `Components.dc.html` |
| States, motion, edge cases | `States.dc.html` |
| All eleven journeys mapped | `Journeys.dc.html` |
| Splash, restore, timer recovery, force update | `Launch.dc.html` |
| Library, dark and light | `Main.dc.html`, `LibraryAL.dc.html` |
| Reading timer | `Reading.dc.html`, `ReadingAL.dc.html` |
| Log a session | `Session.dc.html`, `SessionAL.dc.html` |
| Session complete | `SessionComplete.dc.html` |
| Finish a book | `FinishBook.dc.html` |
| Add a book, manual entry, library search | `AddBook.dc.html`, `ManualEntry.dc.html`, `LibrarySearch.dc.html` |
| Book detail and actions sheet | `BookDetail.dc.html`, `BookActions.dc.html` |
| Notes and note editor | `Notes.dc.html`, `NoteEditor.dc.html` |
| Import flow | `ImportHowTo.dc.html`, `Import.dc.html`, `ImportDone.dc.html` |
| Backup prompt, email sign in, account | `Backup.dc.html`, `Auth.dc.html`, `Account.dc.html` |
| Stats, Settings, Upgrade | `Stats.dc.html`, `Settings.dc.html`, `Paywall.dc.html` |
| Onboarding, three screens | `Onboarding.dc.html`, `Onboarding2.dc.html`, `Onboarding3.dc.html` |
| Empty states | `Empty.dc.html` |
| Shelf picker, import failure, delete confirm, Plus moments | `Moments.dc.html` |
| Import progress, notification priming, trash, share card, widget | `Utility.dc.html` |

Values come from `src/ui/theme.ts`, not from the HTML. Read the HTML for layout and
composition.

---

## Global rules

Apply everywhere unless a screen says otherwise.

- Back always works and never loses unsaved input. Warn before discarding.
- Every destructive action gets an undo toast, five seconds, above the tab bar. Toasts
  **queue** rather than replace, so a second delete never discards the first one's undo —
  but a screen deleting many rows at once raises ONE toast that reverses the batch, not
  one per row.
- Every list uses FlashList and has an empty state naming one specific next action.
- Nothing under 44px is tappable. Body text is never below 12px.
- Every screen must survive 360px width **and 200% system font scale**. The shared
  primitives grow rather than clip and cap scaling at `rules.maxFontScale`, but only real
  screens prove it.
- Text meets WCAG AA in both schemes: 4.5:1 against whatever it sits on, 3:1 for icons.
  `textMuted` is the faintest text colour; `textFaint` and `textGhost` are never text,
  including placeholders. `contrast.test.ts` holds it (`DECISIONS.md`, 2026-09-10).
- Primary buttons ride above the keyboard, never behind it. Inside a `Sheet` this is the
  sheet's job, not the screen's: Android does not resize the edge-to-edge Modal for the
  keyboard, so `Sheet` lifts itself by the keyboard's height (`DECISIONS.md`, 2026-09-10).
- Anything under 400ms shows no loading state at all.
- Double taps are idempotent. Debounce every submit.

---

## Journey A · Cold start

Runs on every launch. Four gates, strictly in this order. Each either passes through
invisibly or takes over the screen.

1. **Splash.** Under 800ms. Android 12+ system splash API. No spinner, no tagline. If the
   library is slow, show the Library with skeleton rows rather than holding here.
2. **Force update.** Remote flag check with a 2 second timeout. On timeout, proceed. Never
   block launch on a network call. If the flag says this build is retired, show the update
   screen with no dismiss. The check **fails open** on every error, and blocks only on a
   fresh, well-formed, self-consistent flag — see `DECISIONS.md`, 2026-09-10.
3. **Session recovery.** If an unfinished session exists in the database, show the recovery
   sheet. Never silently discard, and **never invent a duration.** The app knows when the
   session started, not when the reader stopped, so the elapsed time is only an upper
   bound. A session killed at 23:00 and reopened at 08:00 is nine hours of the app being
   closed, not of reading.
   - **Within 3 hours**, the elapsed minutes are pre-filled in an editable field, and the
     copy says this is the most it could have been.
   - **Past 3 hours**, the field starts empty and the sheet asks how long they read.
   - **Save** is disabled until the value is a whole number of minutes from 1 to the
     elapsed time. **Discard** is always available.

   The sheet cannot be dismissed; if saving the choice fails it stays open with the error.
   Asking where the reader got to belongs to the session logger (Slice 3). The rule and
   its tests are in `src/features/launch/recoveryPolicy.ts`, and the reasoning is in
   `DECISIONS.md`, 2026-09-10. When Slice 6's timer records a heartbeat, the bound
   tightens to the last heartbeat, but the reader still confirms.
4. **Restore.** If signed in and the local database is empty, run first sync with the
   restore screen and a real count. **Not built until Slice 8**, which adds sign-in; until
   then the condition cannot be true and the gate passes through.

**The gates are evaluated in this order, but their work starts at the same time.** The
flag fetch runs alongside the database migration, so its 2 seconds are hidden behind work
that happens anyway. The order decides which screen wins, not what runs first.

**Underneath all four:** the database must open and migrate. If it cannot, a full-screen
notice says so and offers Try again. That is a notice, not the React error boundary — a
migration fails asynchronously, and boundaries only catch render errors.

Then Library. In the ordinary returning case the user sees only the splash, briefly.

---

## Journey B · First run

Three screens, skippable at any point.

1. **Welcome.** Leads with Import from Goodreads, because that is who we are recruiting.
   Secondary action starts fresh. States that no account is needed.
2. **How it works.** Sells the thesis: logging works with or without a timer, any date.
3. **Set a goal.** Number stepper with presets 12, 24, 36, 52. "No goal for now" is a
   first class option and must be equally easy.

Then notification priming, then the OS permission prompt, then Library.

**Never block on any of it.** Skipping every screen must land in a working app.

---

## Journey C · Import

The most fragile sequence in the product and where a defector lands or leaves.

1. **How to export.** Four numbered steps. Users genuinely do not know Goodreads export
   exists. An "Open Goodreads" button launches the browser.
2. **File pick.** System document picker, `.csv` only.
3. **Parse and progress.** Streaming parse, never load the whole file into memory. Progress
   with a real count. A 2000 row file must not freeze the UI.
4. **Preview.** Two numbers: ready, and needs attention. Only ambiguous rows are listed,
   each with inline resolution. Ambiguity means a missing start date, unclear format, or a
   title that matched nothing.
5. **Commit.** A single transaction. Nothing is written before this point.
6. **Done.** Real counts by shelf. Honest that Goodreads does not export sessions, so pace
   charts start from today.

**Failure branch:** wrong file type, malformed CSV, or zero rows all lead to the import
failed sheet, which states the library is untouched and offers to pick another file.

**Rules.** Never fabricate a date. Deduplicate by ISBN then by title plus author. Import is
resumable if the app dies mid-commit.

---

## Journey D · Adding a book

1. **Search.** Debounce 300ms. Query Google Books and Open Library in parallel. Merge on
   ISBN, dedupe, render as results arrive rather than waiting for both. **"Add manually" is
   visible in the results list, not only in the empty state.**
2. **Shelf picker sheet.** Three options: start reading now, want to read, already finished.
   Choosing finished routes into the finish flow so a rating can be captured.
3. **Add manually.** Title, author, page count, format, cover. Only title is required. This
   same screen is the edit form, reached from the actions sheet.

Search failure shows the recoverable error from the States sheet. Offline shows the offline
banner and manual entry still works completely.

**As built in Slice 4:**
- **Results match what was typed.** A result containing none of the words is dropped; one with
  every word ranks first. Merged by ISBN, then by title and first author.
- **Progress line:** "Searching Open Library" (and Google Books, with a key). When one source
  failed and the other answered, the results show with a line naming the missing one.
- **Offline:** the banner, plus books searched before ("Showing books you searched for
  before"). Never the error card: that is for a database that answered badly.
- **A result already in the library** says "In your library" and opens that book.
- **"Which shelf?"** Start reading it now, Want to read, I already finished it. Finished is
  status only until Slice 5's finish flow. Book detail opens after adding.
- **Add manually / Edit details form:**
  - Title (required), author, Print or Audiobook, and length in pages or minutes.
  - "Add to" chips when adding; publisher, year and ISBN (checksum-checked).
  - A cover colour.
  - Save rides above the keyboard, and leaving with input asks first.
- **Edit details** is in the book actions sheet.
- **Search your library** is the search icon on the Library header:
  - Instant and offline, and accent-insensitive.
  - Every word must match as a prefix.
  - Scope chips narrow it, and each result carries a status badge.
  - "Not in your library?" hands the words to Add.
- **Not built:** the barcode button, "More editions", and a photographed cover (Plus, custom
  covers).

---

## Journey E · The core loop

**Log a session** is the most important screen in the app.

- Opens from the Library card, book detail, or the FAB
- Defaults: `from_position` is the current page, `occurred_at` is now, format is the book's
  usual format
- **Positions are labelled as boundaries: "Was on page" and "Now on page"** (`session` in
  `strings.ts`). Reading pages 1 to 10 is "was on page 0, now on page 10": ten pages. Never
  "From page" / "To page", which reads as 1 → 10 and nine pages. The Session artboards still
  say "From page" / "To page". That is a design revision item, and the code wins
- Quick add chips adjust `to_position` without typing
- **The date field is prominent and always editable**, before and after saving
- Format toggle per session, pages or minutes
- Save writes to SQLite, returns immediately, queues sync. No spinner over the user's data

**Timer.** Start creates an open session row immediately, so a crash cannot lose it. A
foreground service keeps it alive. The notification carries working Pause and Finish.
Finishing routes to Session complete.

**Session complete.** Confirms the end page with a stepper, shows the editable date, shows
streak, percent and time remaining. Two actions: Done, or I finished the book.

**Editing.** Every session is editable and deletable from book detail, forever.

**As built in Slice 3:**
- **The logger is a full screen** (`session/log`), for a new session (`?book=`) or an edit
  (`?session=`). A new session opens with "Now on page" focused. Save rides above the keyboard.
- **Opens from** the Library's Continue pill (Reading tab only) and book detail's Log pages.
  On a narrow window for its text size (width ÷ font scale under 360 dp), the pill sits below
  the progress line so the title and author keep their words.
  There is no FAB: the raised tab is Add a book (Slice 4).
- **Any past date and time; never the future.** Date then time, in Android's dialogs. A time
  later than now is refused with a reason.
- **Refused:** an end at or before the start, and anything that is not a whole number.
  **Saved, with a hint:** an end past the book's length ("its page count may be wrong"), and a
  range overlapping another session of the read, naming that session's date.
- **Logging on a Want book moves it to Reading.**
- **Session complete** (`session/complete`) shows the saved session, a stepper for the end
  page, the date with Change, streak, percent through, and time left: from the reader's own
  timed sessions, else pages left, never an average reader's speed. Edits and the note are
  written on Done. Every number follows the edit before Done. **I finished the book** moves
  the read to Finished, status only, until Slice 5's finish flow.
- **Editing** opens from any session row on book detail (the pencil). **Delete** asks once,
  leaves, then raises the undo toast on book detail.
- **Leaving with unsaved input asks first**, by any route, and never after a save.
- **Undo redraws the screen it is on.** A restored session reappears on book detail, and a
  restored book on the Library tab, without leaving the screen.
- **A session's date always says its day**: "Today, 9:40 pm", "Tue 8 Sep, 11:00 pm", and the
  year when it is not this one.

**Undo can fail, and says so.** An undo toast's action returns a `Result`. The toast stays
up while it runs. If it fails (the book it belonged to is deleted too, or something added
since takes its place), the toast is replaced by what happened and what to do. It never
just disappears with nothing restored.

---

## Journey F · Finishing a book

Half star rating, optional private note, editable finish date defaulting to today. On save:
status becomes finished, the book **automatically leaves Currently Reading**, and the year
count increments.

Starting a re-read creates a new `reads` row. The previous read keeps its rating, review,
dates and sessions untouched.

**As built in Slice 5** (`features/finish`, route `book/finish?read=`):
- **Opened from:** the actions sheet's Finished chip, "I finished the book" on Session complete
  (replacing it), and "I already finished it" when adding (over the new book's detail).
- **The screen:** "That's a wrap on <title>." with "502 pages over 23 days · your 31st book this
  year". The line follows the date: move it to last December and it says "book of 2025".
- **Rating:** tap the left or right half of a star; tap the shown rating to clear. The note is
  optional and private.
- **Date row:** Finished today / yesterday / a date, and Change. It asks "When did you finish?"
  when there is no date. A Want to read book with no sessions starts with no date: that move is
  nearly always a book read before the app.
- **Refused:** a date after today, or before the read's last session.
- **Buttons:** "Add to Finished" moves the book and saves everything in one write. "Start the
  next one" does the same, then opens the Library on Want to read.
- **Closing** changes nothing, and asks first if a rating, note or date was changed.
- **A finished read:** the actions sheet row "Rating, note and finish date" opens the same screen
  with Save. Earlier reads are not editable yet (filed, Slice 11).
- **Book detail shows,** once finished: the stars, "Finished <date>" and the note. Earlier reads
  show their note too.
- **Not linked:** notes and quotes (Slice 5b).

---

## Journey G · Notes and quotes

List filtered by all, quotes, notes. The plus button opens the editor. Type toggle between
quote and note, page defaulting to the current page, draft autosaved while typing because
losing a half written note is a live StoryGraph complaint. Notes attach to the book rather
than the read, so they survive re-reads.

---

## Journey H · Managing a book

The actions sheet is the hub. Shelf move including DNF, start a re-read, edit details,
notes, share progress, remove.

**DNF keeps the pages already read.** They count toward yearly totals. Abandoning a book is
not failure and the data should not treat it as such.

**Remove** soft deletes, shows an undo toast, and the row appears in Recently Deleted for
30 days.

**As built in Slice 2:**
- **The Library** has status chips (Reading, Want, Finished, DNF) over one FlashList. **Each
  tab opens at its top**; switching tabs must never keep another tab's scroll position.
  **An empty tab and an empty library say different things**: "No books yet" appears only
  when there is no live book at all.
- **A Library row** shows cover, title, the author only when there is one (never "Unknown",
  never a blank line), and progress: a percentage when the page count is known, pages read
  when it is not (no bar), time for an audiobook, and nothing at all for an unstarted book.
  The rules are `domain/progressDisplay.ts`.
- **Book detail** shows the hero (cover, title, author, rating, status and format badges), a
  progress card, this read's sessions newest first, and earlier reads. **A book that is not
  in the library** (deleted elsewhere, or a stale route) gets its own screen with a way back,
  never a blank.
- **A session that counts for nothing is marked** in the list. A timed session with broken
  positions says "only its time counts": its duration is still counted.
- **The actions sheet**: move to any status (DNF keeps its pages), start a re-read, remove.
  **Remove asks once, in the sheet**, using the confirm copy, then leaves book detail and
  raises the undo toast, **only if the delete changed something**. A failed action keeps the
  sheet open with the reason.
- **Recently Deleted** is in Settings. It lists removed books and, since Slice 3, sessions
  deleted on their own, each named by its pages, book and date. A session deleted with its
  book is not listed: restoring the book brings it back. Restore brings back exactly what the
  removal took. Notes join it with Slice 5b.
- **A book appears once in the Library, on its current read's tab.** A re-read book is on
  Reading, not also on Finished.
- **Start a re-read is offered only when the current read is finished or DNF**, and
  `startReread` refuses otherwise.
- **A double tap on a row or a header button is one tap.**
- **Not yet, with the slice that owns each:** the Continue pill and Log pages (3), Start timer
  and the dock (6), search, Discover and Edit details (4), notes (5b), the stats strip (7),
  and share (11). None renders as a control that goes nowhere.
- **About this book (Slice 5):** the description, five lines until More, and "Read a sample"
  opening Google's preview in the browser, only when pages are viewable. No card when there is
  neither. Missing details are fetched once when the book is opened online. Edit details can
  change the description.
- **Planned:** a genre filter on the Library (Slice 7); the sample read inside the app (Slice 11).

---

## Journey I · Backup and account

Prompt triggers at day seven or five books logged, whichever is first, and never on first
launch. It is a sheet over the working app with "Not now" always available, and it can be
dismissed indefinitely without degrading anything.

Google sign in hands off to the system sheet. Email uses a six digit code with three
attempts and a ten minute expiry.

Account screen carries subscription, download everything, sign out, the legal links, and
**delete account**. Deletion requires typing DELETE, offers a data download first, and
purges within 30 days. **This is a Play Store requirement.**

---

## Journey J · Paying

Upgrade lists the free tier **first and in full**, then Plus. Free means unlimited books,
all statistics, timer, streaks, goals, both themes, import and export, no ads.

Plus adds soundscapes, comparative statistics, widgets, custom covers.

Trial ending states the exact amount and date. Purchase success confirms. Restore purchase
is always reachable, needed after any reinstall.

**Cancelling never locks anything the user logged.**

---

## Journey K · Settings and stats

Settings holds the yearly goal, theme with a system option, one notification toggle,
import, export, recently deleted, and account. Nothing else.

Stats shows three separate numbers, a daily pace chart, and a genre breakdown, with a year
switcher. Genres come from book categories captured since Slice 5 (see `05-BUILD-PLAN.md`). **Slice 3 ships the pace chart alone**: the last 14 days by `local_day`, pages or
time as separate charts, a bar for every day. Slice 7 adds the rest. All free. The empty state explains that charts need a few sessions rather than
implying something is locked.

---

## Gaps you should expect to find

This spec was written by walking eleven journeys, and eleven is not all of them. Things
likely still missing, offered as prompts rather than a list to work through:

- What happens when a book is deleted while its timer is running?
- What happens if the same book is added twice by different editions?
- What if a session's `to_position` exceeds the book's page count, because the page count
  was wrong?
- What does a re-read look like in the pace chart, two lines or one?
- What if the user changes their goal mid year to below their current count?
- What if a sync pull deletes a book the user is currently viewing?

**When you find one, decide sensibly, write it in `DECISIONS.md`, and continue.** Do not
stop and wait.
