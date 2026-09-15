# Slice 5 · phone checks

**Status, 2026-09-15: run on the phone, every item passed.** Results are at the end. Not run: the
largest font and 360 dp, filed with the Slice 11 font pass.

What only a phone can show for finishing a book: the real screens, Android's date dialog, the
keyboard over the note, the Library's tabs afterwards, and a real network for book details.
Record results with numbers here and in `DECISIONS.md`.

## Setup
- **Library:** the sandbox (`EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --dev-client --clear`), network
  on unless an item says otherwise.
- **Build:** no native rebuild needed. The date dialog and `Linking` are already in the build.
  Migration 0002 applies on launch, after its backup, exactly as it did on `devcheck.db`.
- **Before and after:** take the `reader.db` md5 (1623cf85…/wal 6ab7bff2… on 2026-09-14).
- **Owner's settings:** the owner switches anything that is a phone setting (airplane mode, font
  size, theme).
- **The phone script** from 2026-09-14 (`s5_phone.py`, covering items 1 to 3 below) lived in that
  session's scratchpad and may be gone. Rebuild it from `phone.py` in `09-ENVIRONMENT.md` if so.

## 0. First: the device pass, and the unexplained network failures
Before the screens, settle what 2026-09-14 left open.
- **What was seen:** RUNTIME 34/34 twice. But in three mutation runs, whose mutations touched
  neither, **14c** (no local cover within 10 s) or **16** (nothing written) also failed.
- **Run:** the clean pass five times in a row, one at a time (each takes about 2–3 minutes; do not
  batch them into one 10-minute command).
- **Record:** how many passed, and for each failure of 14c or 16 its detail line.
- **If 14c fails again:** test the suspected cause. Adding from search now starts two background
  jobs at once, the cover download and `ensureBookDetails`. Run 14c with `ensureBookDetails`
  removed from `addFromSearch`, five times. If it then passes 5/5, the details fetch interferes
  with the cover and is a real bug to fix (a fix in `db/`, and a check that fails without it). If
  it still fails, it is the network: make 14c and 16 say "network" in their failure text, so a slow
  connection is never read as a broken app.

## 1. The owner's case: finishing moves the book off Currently Reading
1. A sandbox book on Reading with sessions: open it, Book actions, **Finished**.
2. **The screen:** "That's a wrap on <title>." and "N pages over N days · your Nth book this year".
3. **Rate 4.5:** the left half of the fifth star. It shows "4.5 out of 5 · tap it again to clear".
4. **Note:** type one. With the keyboard up, **Add to Finished stays on screen above it**. Take a
   screenshot and write down its y and the keyboard's top.
5. **Add to Finished.** Book detail shows the stars, "Finished today" and the note.
6. **Library:** the book is **gone from Reading** and **on Finished exactly once**.
7. **Pulled database:** the read has status `finished`, rating 4.5, the note, and `finished_at`
   today. One upsert is queued for the read.

## 2. The owner's case: finish, re-read, finish again, each in its own year
1. **Add manually** a new book ("Slice Five Year Test"), Add to: Reading. It has no sessions.
2. **Book actions, Finished.** Change the date to **31 December last year** in Android's dialog:
   tap the year, pick last year, step to December, tap 31, OK. The line must now say "**your Nth
   book of <last year>**".
3. **Rate 3, Add to Finished.** Detail shows "Finished 31 Dec <last year>".
4. **Book actions, Start a re-read.** The badge says "READING · READ 2", and there are no stars.
5. **Finish again:** Book actions, Finished. The line says "**book this year**". Rate 1.5, Add to
   Finished.
6. **Detail:** today's finish with 1.5 stars. **Earlier reads** shows "Read 1 · Finished · 31 Dec
   <last year>" with 3 stars.
7. **Pulled database:** **two live `reads` rows** for the book:
   - Read 1: rating 3, `finished_at` last 31 Dec.
   - Read 2: rating 1.5, `finished_at` today.
   - Different ids, and neither overwrote the other.
   - Bucketing both `finished_at` in the phone's zone gives one book in each year.
   - Device check 15 asserts the same through the query Stats will use; this is the screen path.

## 3. The rest of the flow
- **Session complete:** log pages on a Reading book, then **I finished the book**. The finish
  screen opens. **Close** without touching anything: back where the session was started (book
  detail, or the Library when started from its Continue pill), and the book still on Reading.
- **Close with a rating chosen asks** "Discard changes?". Keep editing, then **Start the next one**:
  it saves and opens the Library on **Want** (the Want chip selected).
- **Dates:** Change never offers a day after today. A day **before the last session** shows the
  refusal ("Your last session on this read was on …") and disables Add to Finished.
- **A Want to read book with no sessions, moved to Finished,** asks "When did you finish?" with no
  date (fixed 2026-09-15; it used to say "Finished today").
- **"Start the next one" twice:** after the first, switch the Library to Reading, finish another
  book with Start the next one, and the Library is on **Want** again (fixed 2026-09-15).
- **"I already finished it" from search:** after adding, the finish screen opens over the new book
  with **no date** ("When did you finish?", "Add date"). Close: the book is on Finished, with no
  date shown and none stored.
- **A finished read, changed later:** Book actions has **Rating, note and finish date**, which
  opens the same screen with **Save**. Change the rating; nothing else is written.
- **Forced failure:** arm "Finishing a book fails" in Settings. The screen stays, the rating and
  note stay, the reason shows, and the book does not move.

## 4. Book details and "Read a sample"
- **A Google book added from search** (a key is set): detail shows **ABOUT THIS BOOK** with the
  description, **More/Less** when long, and **Read a sample**, which opens the browser on Google's
  preview. A book whose Google result had no viewable pages shows no Read a sample.
- **An Open Library book** fills its description within a few seconds of adding. The screen
  reloads itself.
- **A book added in Slice 4** fills its description the first time it is opened online.
- **Pulled database:** `details_checked_at` is set and `categories` is a JSON array.
- **Offline** (the owner switches airplane mode): the description still shows. A book never fetched
  shows no About card and nothing breaks. Turn the network back on and reopen it: it fills.
- **Edit details:** the description field is there. Clear it and save: the About card is gone, and
  reopening the book does not bring it back.

## 5. Owner's settings passes for the new screens
- **Light mode and dark mode:** the finish screen and the About card.
- **Font:** the finish screen at the largest font the phone offers (Accessibility → Display size
  and text). Nothing clips: the stars row, the date row, both buttons.
- **360 dp wide** if the owner can set it: the five star targets fit on one row.

## Results, 2026-09-15 (Nothing Phone 2a, sandbox library)
**Passed: every item run, 21 of 21.** Not run: the largest font (skipped by the owner, on the Slice 11 font
pass) and 360 dp. `reader.db` md5 unchanged before and after (1623cf85…/6ab7bff2…).

**0. Device pass:** RUNTIME 34/34 · COMPILE-TIME 1/1 in **5 of 5** consecutive clean runs, including the
2026-09-15 review fixes. 14c and 16 passed every time. With 2026-09-14's two, **7 of 7** clean runs.
- **The earlier 14c/16 failures:** they came only in mutation runs, did not recur, and are not explained.
- **If they recur:** use the procedure above.

**1. The owner's case: finishing moves the book off Currently Reading.** Passed.
- "the ovOffline Added Book", Finished chip: "20 pages over 2 days · your 5th book this year".
- **Rating and note:** rated 4.5 by the left half of the fifth star, note typed.
- **Keyboard:** up, with Add to Finished ending at y=1388 px above the keyboard's top at ~1530.
- **Detail:** stars, "Finished 15 Sep 2026" and the note.
- **Library:** Reading 0 rows for it, Finished 1.
- **Pulled database:** status `finished`, rating 4.5, the note, `finished_at` 2026-09-15.

**2. The owner's case: finish, re-read, finish again.** Passed on "Slice Five Year 4281", added manually
with no sessions.
- **Read 1:** dated 31 Dec 2025 in Android's dialog. The line said "your 2nd book of 2025". Rated 3.
- **Re-read:** "READING · READ 2".
- **Read 2:** finished today, "your 6th book this year", rated 1.5.
- **Earlier reads:** "Read 1 · Finished · 31 Dec 2025" with 3 stars.
- **Pulled database:** two live rows with distinct ids. Read 1: rating 3.0, finished 2025-12-31,
  counts in 2025. Read 2: rating 1.5, finished 2026-09-15, counts in 2026.

**3. The rest, all passed:**
- **Session complete → I finished the book → Close:** returned where the session was started (the
  Library, from its Continue pill), with the book still on Reading.
- **Close with a rating chosen** asked "Discard changes?".
- **Start the next one** opened the Library on Want. **Twice**, with a switch to Reading between:
  Want again (the 2026-09-15 fix).
- **A Want book with no sessions** ("Godaan (Hindi)"): the date row asks "When did you finish?"
  (the 2026-09-15 fix).
- **A day before the last session** was refused with "Your last session on this read was on 15 Sep
  2026. Pick that day or later." Add to Finished was disabled, and tomorrow was disabled in the
  dialog.
- **"I already finished it" from search** (Fantastic Mr Fox: A Play): the finish screen opened over
  the new book, with no date and "Add date".
- **A finished read changed later** (Rating, note and finish date, Save only): rating 1.5 → 4. The
  database had `finished_at` and the note unchanged.
- **Forced failure:** "Could not save this" shown, the rating kept on screen; after discarding, the
  book still on Reading.

**4. Book details, all passed:**
- **About card:** description with More, which expanded.
- **Read a sample** opened `com.android.chrome`, and Back returned to the app.
- **No preview:** Fantastic Mr Fox (a Google edition) was fetched with a 541-character description
  and no preview link, and shows no Read a sample.
- **Filled on first open:** "The Psychology of Money" (Slice 4, Open Library): 835 characters and
  12 categories. Godaan (Hindi) and Piranesi from Slice 4 also filled when opened.
- **Cleared in Edit details:** Godaan's description was cleared. The About text went (Read a
  sample stays: its link is separate). After a fresh launch and reopening it was not refetched:
  column NULL, checked.
- **Offline** (confirmed: ping "Network is unreachable"):
  - The stored description of The Psychology of Money showed.
  - "Idgah" was added from remembered results under the offline banner, with no About card and
    nothing broken. `details_checked_at` was NULL.
- **Back online:** opening Idgah filled 708 characters.

**5. Light mode:** the finish screen and the About card screenshotted. The stars (empty ones visible),
the note field, the date row and Save are all legible, and the stars fit one row. Dark mode is the
phone's default and every other screenshot today.

**Found, filed, not fixed (one review pass; neither loses data):**
- **Long descriptions in Edit details:** the multiline description field grows to the height of
  the whole screen for an 840-character description. It works, and scrolls. Cap its height with an
  inner scroll in Slice 11 polish.
- **Book detail wording:** it says "Finished 15 Sep 2026" while the finish screen says "Finished
  today". Both are true; make them match in Slice 11.

**My script errors, discarded, not counted:**
- **Rating control:** looked up by a label that TalkBack's adjustable control does not expose.
- **Wrong expectations:** "Finished today" on detail, and Close returning to detail.
- **Book choice:** an audiobook picked for a pages logger.
- **USB:** the phone dropped for 5 s.
- **Clearing the field:** DEL keystrokes sent while the field was not focused navigated Back.
  Nothing was saved; the field was then cleared with select-all.

Each was re-run with the step corrected.

## Automatic checks, for reference (2026-09-14)
- RUNTIME 34/34 · COMPILE-TIME 1/1, twice.
- **Check 15:** watched failing with the move to Finished removed, and with a re-read inheriting
  the first read's rating.
- **Check 16:** watched failing with a fetch allowed to replace the reader's description.
- **Node:** 383 tests, 121 per zone, 16 of 16 mutations red, and the `MoveStatus` type assertion.
- **Not yet re-run after the 2026-09-15 review fixes:** the device pass. Item 0 covers it.
