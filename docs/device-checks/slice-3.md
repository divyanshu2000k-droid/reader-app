# Slice 3 · phone checks

**Results, 2026-09-14** (details in `DECISIONS.md`, 2026-09-14):
- **Items 1, 2, 3 and 6:** passed, and dark mode in item 4.
- **Four bugs found and fixed:** Undo not redrawing, a deprecated picker callback raising LogBox,
  skeletons under an error, and last year's dates without the year.
- **Then, with the owner's settings:** item 4 in light mode at 320 dp and 1.3x font, where two
  label fixes were needed, and item 5 in Pacific/Pago_Pago. Both pass.
- **Not yet:** 200% font. The phone's Display setting stops at 1.3.

What must be seen on the phone before Slice 3 is done. Node tests hold the rules; these hold
what node cannot see: the native pickers, the keyboard, navigation, real SQLite in the phone's
timezone, and how the screens look. Record each result, with numbers, in `DECISIONS.md`.

**Setup.** Rebuild the native app first: the date picker is a new native module, and Metro
alone does not carry it. Then run on `sandbox.db` (`EXPO_PUBLIC_SANDBOX_DB=1`), seeded from
Settings with "Seed 12 books, no DNF". Every scripted step checks its precondition on screen
before acting (`09-ENVIRONMENT.md`). The reader's `reader.db` md5 is taken before and after,
and must not change.

## 1. The backdated session, then edited. First, because it is the thesis

1. Open a Reading book from the Library's **Continue** pill. Confirm "Now on page" is focused
   and the keyboard is up, with **Save session** visible above it.
2. Type an end page. Tap **When**: pick **last Tuesday** in the date dialog, then **11:00 pm** in
   the time dialog. The field reads "Tue 8 Sep, 11:00 pm" (or that Tuesday's date).
3. **Save session.** Session complete shows SESSION SAVED, the pages, and "When" as last
   Tuesday.
4. **Done.** Back on the Library. Open the book. The session row says last Tuesday, and is
   ordered by that date among the others.
5. **Pull `sandbox.db` (with `-wal`, `-shm`) and read the row:** `local_day` is last Tuesday's
   date and `occurred_at` is 23:00 local. There is one `sync_queue` upsert for it.
6. Tap the session row (pencil). Change **When** to **4:00 am** on the **Thursday** after.
   **Save changes.** The row now says Thursday, 4:00 am, re-ordered.
7. **Pull again:** `local_day` is Thursday's date, `occurred_at` 04:00 local, and there are now
   two upserts queued for that session. No other column changed (`created_at` identical).
8. **Stats tab:** the pages bar stands on Thursday, not on Tuesday and not on Wednesday.
9. Edit it back to **today**, any time before now. The bar moves to today. Session complete's
   streak tile, reached by logging a fresh session, counts today.
10. Try a time **later than now** today: the When field says it has not happened yet, and Save
    is disabled.

## 2. The rest of the core loop

- **Two-tap budget:** Library → Continue → type → Save session. Count the taps.
- **Quick add:** +10, +25, +50 each move "Now on page" from the typed end, else the start.
  **Finished** appears only when the book has a page count, and sets its last page.
- **Hints, not refusals:** an end past the page count saves, with the page-count hint. A range
  overlapping an existing session saves, with a hint naming that session's date.
- **Refusals:** end before or equal to start, and letters (paste "12a"), each keep Save
  disabled with a reason on the field.
- **Pages ↔ Minutes** on a new session restarts from that format's position.
- **Want → Reading:** log a session on a Want book from book detail's **Log pages**. It moves to
  the Reading tab, listed once.
- **Session complete:** the stepper steps one page at a time and stops one after the start.
  Change the date here, and the streak tile changes before Done. The note saves on Done.
  **I finished the book** moves it to Finished, and the button is absent on a finished read.
- **Unsaved input:** type in the logger, then press Android back. It asks. Keep editing stays;
  Discard leaves. The same from Session complete after using the stepper. After a save, Back
  never asks.
- **Delete:** from the editor, **Delete this session** asks in a sheet, then returns to book
  detail and shows **Undo** there, visible, not beneath a sheet. Undo brings the row back.
  Delete again, and find it in **Recently deleted** named by its pages, book and date. Restore.
- **Double taps:** a fast double tap on Continue, Log pages, a session row and Save each act
  once (one screen, one row).
- **A session whose book was removed:** remove the book, then open the session's editor route
  from history (Back into it). It says the session is not here, with a way back.

## 3. Forced failures, from Settings (deferred from Slice 2)

Arm each in Settings' dev block, see its render, disarm, retry:
- **Library list fails to load:** the inline error with Try again, never an empty library.
- **Book detail fails to load:** the inline error, not the not-in-library screen.
- **Actions sheet action fails:** move, re-read and remove each keep the sheet open with the
  reason.
- **Saving a session fails:** the logger stays, with the error above Save and the typed values
  intact. Disarm, Save again, and one row exists (the same id is upserted).

## 4. Layout pass, Slices 2 and 3 (deferred from Slice 2; the owner changes the settings)

Screenshot every Slice 2 and 3 screen in each: Library tabs, book detail, the actions sheet,
Recently Deleted, the logger (keyboard up and down), Session complete, Stats.
- **200% system font** (Settings → Display → Font size, largest). The logger at 200% with the
  keyboard up is the most likely break: Save must stay visible above the keyboard.
- **360 dp display size** (Settings → Display → Display size, largest). The four quick-add chips
  and the four "Move to" chips wrap rather than overflow.
- **Dark mode** (Settings → Display → Dark theme).
Nothing clips or overlaps, and no row loses its label.

## 5. Timezone on the phone (the owner changes the zone)

With the phone's zone set to a US zone (e.g. Chicago), log a session at **11:00 pm** yesterday
and one at **4:00 am** today. Each session's `local_day` is the Chicago calendar day, and the
pace bars stand on those days. Set the zone back: the stored days do not move (03-DATA-MODEL,
rule 3), while the times display in the new zone.

## 6. The device pass

`EXPO_PUBLIC_DEVICE_PASS=1`: expect RUNTIME 29/29 · COMPILE-TIME 1/1, check 13 included. Watch
check 13 fail twice before trusting it: once with `createSession` skipping the Want → Reading
move, and once with `updateSession` writing nothing (return `ok({ changed: false })`). Each must
turn check 13 red and nothing else. Restore, and green again.
