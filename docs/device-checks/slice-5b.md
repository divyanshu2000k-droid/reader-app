# Slice 5b · phone checks, with Slice 5's leftovers

**Status, 2026-09-18: run on the phone and COMPLETE. 43 screen checks passed, plus the
device pass.** Item 2 (largest font, 360 dp) stays deferred to the Slice 11 font pass, as
agreed; everything else on this sheet is done.

**No bug in the app was found by any of these checks.** Every failure during the session was
the script's: a placeholder read as content, a book below the fold, a toast sampled after it
expired, `ping` writing to stderr, a regex group that did not exist. That is an unusual
result - Slices 3, 4 and 5 each found real bugs on the phone - and it is recorded as a fact,
not a boast. Results are at the end.

By the owner's choice, Slice 5's outstanding checks and all of Slice 5b ran in one session.
Work down this sheet in order: items 0 to 2 are Slice 5's debt, 3 onwards are Slice 5b.

What only a phone can show for notes: the keyboard over a multiline editor that can scroll
past its own visible height, the draft surviving the app being killed, the undo toast under a
confirm sheet, and Android's share sheet.

## Setup
- **Library:** the sandbox (`EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --dev-client --clear`),
  network on unless an item says otherwise.
- **Build:** no native rebuild needed. Nothing new is native — the share sheet is React
  Native's own `Share`, and no migration was added. Metro's watcher does not work here, so
  every source change needs `--clear` (09-ENVIRONMENT).
- **Before and after:** take the `reader.db` md5, and confirm it is unchanged at the end.
- **Owner's settings:** the owner switches anything that is a phone setting (airplane mode,
  font size, theme).
- **Scripts:** `scripts/device/` (README). `phone.py` drives the phone, `pulldb.py` pulls the
  database.

---

## 0. The device pass, re-run — Slice 5's debt
It last ran BEFORE the 2026-09-15 review fixes, and the rule is to re-run after any change.
Two new checks arrive with this slice.
- `EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --clear`, then `adb logcat -d | grep devcheck`.
- **Expect RUNTIME 36/36 · COMPILE-TIME 1/1** (34 before, plus 17 and 18).
- **Watch 17 and 18 fail before believing them.** A guard nobody has watched fail is
  decoration. `python scripts/device/devpass_s5b_mutations.py` runs all four and writes every
  file back, with md5 verified. What each one breaks:
  - **17a:** `notes` added to the `reads` entry of `CHILDREN` in `write.ts` → "THE NOTE WENT
    WITH ITS READ".
  - **17b:** `notes` removed from the `books` entry of `CHILDREN` → "the note outlived its
    deleted book".
  - **18a:** a `sync_queue` insert added to `saveDraft` → "the draft enqueued N sync rows".
    **Omit `id` from that insert**: `sync_queue.id` is an autoincrement INTEGER, and passing a
    string made the insert throw, so the check went red at "could not save the draft" with its
    queue assertion still unwatched. Red for the wrong reason is not watched.
  - **18b:** `clearDraft` made a no-op → "the draft was still there after being cleared".
  - **Corrected 2026-09-18:** this section used to say "change `bookId: context.bookId` in
    `newNoteRow`". That would prove nothing — check 17 builds its row with `writeRow` directly
    and never calls `newNoteRow`.
- **Also settle 14c and 16.** They failed in three mutation runs on 2026-09-14 and have passed
  in 7 of 7 clean runs since. Record whether they pass again; the procedure if they do not is
  in `slice-5.md` item 0.
- **Record:** the counts, and every failure's detail line.

## 1. "Start the next one", twice — Slice 5's debt
The one-line fix from 2026-09-15 that now has a test (`tabRequest.test.ts`), unverified on a
phone.
1. Finish a book. On the finish screen, **Start the next one**. The Library opens on **Want to
   read**.
2. Tap **Finished**.
3. Finish another book, and tap **Start the next one** again.
4. **The Library must open on Want to read the second time too.** Before the fix it stayed on
   Finished.

## 2. Slice 5's own leftovers
- The largest font and 360 dp were deferred to the Slice 11 font pass. **Not run here either**
  unless the owner wants them now — say which was chosen.

---

## 3. A note, written and kept
1. Open a sandbox book with sessions. **Book actions** → the sheet has **Notes and quotes**,
   with **"Nothing saved yet"** under it.
2. Tap it. The empty state: "No notes yet".
3. **Add a note** (the + in the header, or the empty state's button).
4. **The page is already filled with the page the reader has reached.** Check it against the
   book's progress card.
5. Type a note. **With the keyboard up, Save note stays on screen above it.** Screenshot, and
   write down its y and the keyboard's top.
6. **Type past the visible height** — ten lines or so. The field scrolls, Save stays put, and
   nothing is clipped.
7. **Save note.** Back on the list: one row, badge `NOTE · P.<page>`, "Today".
8. **The header says "1 note"**, and the chips say `All 1` · `Quotes 0` · `Notes 1`.
9. **Book actions** now says **"1 note"** on the Notes row.

## 4. A quote, and the filter
1. Add a second note, **switch it to Quote**, save.
2. The row is a size larger, in brighter ink, under an **accent** badge. The note's is muted.
3. **Header: "1 note · 1 quote".** Chips: `All 2` · `Quotes 1` · `Notes 1`.
4. **Tap Quotes.** Only the quote. **The header still says "1 note · 1 quote"** — the counts
   are of the book, not of the filter.
5. **Tap Notes**, then a filter with nothing in it (make one by deleting, or use a book with
   only quotes): it says "No notes yet", **not** that the book is empty.

## 5. THE DRAFT — the slice's done-when
1. **Add a note**, type half a sentence, and **do not save**. Press **Back**.
2. **No "Discard changes?" appears.** That is deliberate: nothing is discarded.
3. **Add a note** again for the same book. **What you typed is there**, and the line under the
   field says it was picked up from the draft.
4. **Now the hard case: kill the app.** Type half a sentence into a new note, wait two seconds,
   then `adb shell am force-stop <package>`. Relaunch, open the book, Add a note. **The words
   are there.**
5. **Type a word and delete it again**, leave, come back: **no restore line**, and the field is
   empty. A draft equal to what is saved is not a draft.
6. **A second book's draft is its own.** Start a note on book A, leave, start one on book B:
   B's editor is **empty**, not holding A's words.
7. **THE ONE THAT BIT BEFORE IT WAS WRITTEN:** save a note, then **Add a note again for the
   same book**. The editor must be **EMPTY**. If it opens holding the note just saved, the
   after-save flush is writing the draft back (`draftAction`, node test).

## 6. Editing, and delete with undo
1. Open a saved note. Change its words, **Save changes**. The row shows the new words.
2. **Open it and close it without changing anything.** Pull the database: `updated_at` must be
   **unchanged**, and there must be **no new `sync_queue` row**.
3. Open a note → **Delete this note** → confirm. **The screen leaves first, then the Undo toast
   appears** — over the list, not underneath the confirm sheet. Screenshot it.
4. **Tap Undo.** The note comes back **and the list redraws to show it** (the Slice 3 bug: the
   screen kept showing it deleted).
5. Delete another, let the toast expire, and open **Settings → Recently deleted**. The note is
   listed by its opening words, its kind, its page and its book. **Restore** it.

## 7. A note survives a re-read — on real screens
The device pass holds this against the database (check 17); this is the reader's version.
1. On a book with a note, **Book actions → Finished**, finish it.
2. **Book actions → Start a re-read.**
3. **Book actions → Notes and quotes: the note is still there**, with its page.
4. Pull the database: its `read_id` still points at **read 1**, and it was not rewritten.

## 8. Export
1. With several notes, **Export these notes**. Android's share sheet opens.
2. Send it somewhere readable (a notes app, or yourself). Check: the book and author at the
   top, **every note present**, each with its kind, page and date.
3. **Filter to Quotes, export again.** Only the quotes, and the subject says "Quotes from …".
4. **A book with no notes offers no export** (the button is not there under an empty state).

## 9. An audiobook has no page
1. Open a book with `total_minutes` set (the sandbox has some; or set one in Edit details).
2. **Add a note: there is no Page field at all.** `notes.page` means a page.
3. Save it. The row's badge is `NOTE`, with no page.

## 10. The failure renders
1. Arm the forced failure from Settings if it covers note writes; if it does not, say so
   rather than skipping silently.
2. **Offline** (confirm with `ping`): notes open, save, edit and delete exactly as before —
   nothing here touches the network. Export still opens the share sheet.

## 11. Light mode, and a long note
1. **Light mode:** the list, a quote row, a note row and the editor. The accent badge, the
   muted badge and the draft line must all be legible.
2. **A very long note** (paste 2000 characters): the list row cuts at six lines, the editor
   shows all of it and scrolls, and Recently Deleted cuts it with an ellipsis.

---

## Record here
Counts, screenshots, and every failure's detail line. Anything found goes in `DECISIONS.md`
the same day, not in a sweep afterwards.

---

## Results, 2026-09-18

**The library was not touched, measured at both ends.** `reader.db` md5
`1623cf85872260684723c84a1636ab7a` and wal `6ab7bff24d26b872974e4739ede746cd` before the
session and **byte-identical after it**, and both still match 2026-09-14. The device pass ran
on `devcheck.db` and every screen check on `sandbox.db`.

### 0. The device pass · PASS
- **RUNTIME 36/36 · COMPILE-TIME 1/1** on a clean run (34 before, plus 17 and 18).
- **14c and 16 passed.** That is 8 of 8 clean runs since 2026-09-14. The three failures during
  mutation runs have not recurred and stay unexplained but quiet.
- **Check 17 watched failing twice:**
  - `notes` added to the `reads` cascade → *"THE NOTE WENT WITH ITS READ - notes must not be a
    cascade child of reads"* (35/36).
  - `notes` removed from the `books` cascade → *"the note outlived its deleted book"* (34/36).
- **Check 18 watched failing twice**, the first attempt corrected:
  - A `sync_queue` insert added to `saveDraft` → the first attempt failed at *"could not save
    the draft"*, because `sync_queue.id` is an autoincrement INTEGER and the mutation passed a
    string. **Red for the wrong reason, with the queue assertion still unwatched.** Fixed by
    omitting `id`; it then failed at *"the draft enqueued 1 sync rows; it must enqueue 0"*.
  - `clearDraft` made a no-op → *"the draft was still there after being cleared"*.
- Script: `devpass_s5b_mutations.py`, md5 of `write.ts` verified before and after each run.

### 1. "Start the next one", twice · PASS (Slice 5's debt)
- Finished *Godaan Test* → the Library opened on **Want**.
- Tapped **Finished**, finished *Idgah* → the Library opened on **Want the second time too**.
- **Both requests in one app session**, which is the only way this tests anything: a relaunch
  between them resets the screen and the second request stops being a repeat.

### 3 & 4. A note, a quote, and the filter · 10/10 PASS
- The actions sheet read **"Nothing saved yet"**, then **"1 note · 1 quote"** after.
- **The page defaulted to 369**, the reader's furthest page in *The Long Wolves* (of 659).
- Badge `NOTE · P.369`; switching to Quote relabelled the field to "The quote".
- **Tapping Quotes did not move the header count** — it stayed "1 note · 1 quote". Chips
  `All 2` · `Quotes 1` · `Notes 1`.

### 3.5 The keyboard, measured · PASS
- **Save note at y=1322–1469; the keyboard's top edge ~1549.** Roughly **80 px clear**, with
  the privacy line visible between them. Screenshot `s5b-keyboard-measured.png`.
- A note typed past the field's visible height scrolled without clipping.
- **Noted, not a data risk:** with a long note the field grows enough to scroll the book title
  and the "Saved as a draft while you type" line out of view, so the reader loses both the
  reassurance and which book they are writing about. Filed for Slice 11 polish.

### 5. THE DRAFT · 6/6 PASS — the slice's done-when
- Backing out mid-note: **no "Discard changes?"**, as designed.
- Reopening restored **62 characters** and said so on screen.
- **`am force-stop` mid-note: 87 characters survived.**
- Emptying the field left no draft, and offered no restore.
- *Idgah* opened empty while *The Long Wolves* held a draft — drafts are per book.
- **5.7, the one that was a bug before it was written:** after saving, "Add a note" opened
  **empty**. The after-save flush did not put the saved note back as a draft.

### 6. Editing, delete, undo, Recently Deleted · 6/6 PASS
- An edit saved and showed in the list.
- **Opening a note and closing it wrote nothing:** `updated_at` unchanged at
  `1789725630447`, `sync_queue` rows still 2.
- Delete **left the editor first, then toasted** over the list — never beneath the confirm
  sheet's Modal.
- **Undo: 2 rows → 1 deleted → 2 restored, and the list redrew under it.** The database
  agreed (3 live notes).
- Recently Deleted listed it as *"Nine separate stories and I still cannot see how they join
  up., Note, p.369 from The Long Wolves · deleted today"*, and Restore took live notes 1 → 2.
- **Timing note for next time:** the toast lives 5 s and each `dump()` now costs ~2 s plus the
  foreground guard's round trip. Tap Undo from the same dump that finds it, never after
  another. Two runs failed on this before it was understood.

### 7. A note survives a re-read · PASS
- Started read 2 on *The Long Wolves*: **2 notes still listed**, `read_id` still pointing at
  read 1, page still 369. The reader's version of device check 17.

### 8. Export · 3/3 PASS, with the content read
- `com.android.intentresolver` opened. The chooser's own preview showed
  `The Long Wolves / by Sally Rooney`, then `Quote — Today` and `Note, p.369 — Today`, each
  with its words. Exactly what `noteExport.ts` builds.
- The filtered export opened with the Quotes subset.
- **A book with no notes offers no Export button.**

### 9. An audiobook is offered no page · PASS
- *Northern Orchard* (900 minutes): **no Page field at all**, badge reads `NOTE`, stored page
  is `NULL`.

### 10. Offline · 5/5 PASS
- Airplane mode **verified by ping** (`connect: Network is unreachable`), not by the setting.
- Notes opened, saved, edited, deleted and undid with no network, and **no banner, spinner or
  error anywhere** — nothing in this slice touches the network.
- **26 note operations waiting in `sync_queue`** (18 upsert, 8 delete).
- Export still opened the share sheet offline.

### 11.2 A long note · 4/4 PASS
- Typed and saved with Save note still on screen.
- List row **486 px of a 2412 px screen** — cut, as `rules.noteLines` intends.
- The editor held **all 481 stored characters**, with Save changes reachable.
- Recently Deleted cut it to **80 characters ending "…"**.

### 11.1 Light mode · 4/4 PASS, by looking
`s5b_light.py` refuses to run unless `cmd uimode night` reports the phone is really in light
mode. **The screenshots were then read, not just captured** — "screenshotted" is not a check,
and the design sheet's own light-mode colours failed WCAG AA and shipped for two slices
precisely because nothing looked at them (CLAUDE.md item 10).
- **The list:** accent `QUOTE` badge and muted `NOTE · P.369` on white cards; the quote body in
  near-black against the note body in dark grey, so the two kinds are still distinguishable
  without the dark-mode contrast. Chips, Export and the privacy line all legible.
- **The editor:** the focused field's accent wash with near-black text, "Saved as a draft
  while you type" legible on the ground, and Save note in dark ink on the accent fill.
- **A quote row** and **Recently Deleted**: deleted notes named by their opening words, cut at
  80 characters with an ellipsis, each carrying its kind, page and book.
- Nothing measured badly, and `contrast.test.ts` computes every text/background pair in both
  schemes anyway, so the tokens themselves are held automatically.

### An unexplained delete
A note was soft-deleted at **15:43:33 IST** through the normal path, with its own `sync_queue`
delete row, during a window when the phone was in the owner's hands and the app was in the
foreground. **None of the scripts reached a delete in that window** — all three had aborted
earlier. Most likely the owner tapping around. Recorded rather than waved away; if a note ever
disappears without a delete row, this entry is the precedent to check against.

### My script errors, discarded, not counted as app failures
Every failure this session was the script's. Listed because the same traps will recur:
- **A placeholder read as content.** uiautomator reports an empty `EditText`'s text as its
  placeholder, so "What do you want to remember?" counted as characters of draft.
- **A book below the fold.** Three runs failed with "not on screen" simply because a long tab
  needed scrolling. Fixed for good with `s3lib.open_by_search()`.
- **A toast sampled after it expired.** See the timing note in item 6.
- **`ping` writes to stderr,** and `phone.adb()` returns stdout only, so the offline assertion
  read an empty string and concluded the phone was online.
- **A regex group that did not exist** (`x(\d+)` then `.group(2)`).
- **An assertion against what the script hoped to type,** not what it actually typed:
  `adb shell input text` truncated 1488 characters to 463.
- **A card selected by its accessibility HINT,** which uiautomator does not expose. The card's
  `content-desc` is `noteAnnouncement` plus the note's words.

### New this session
- **`phone.require_our_app()`** — every `dump()` now refuses when our app is not in the
  foreground. Written after a run continued into WhatsApp and put a private conversation in
  the session log; it then caught Instagram and the camera on later runs, and was watched
  firing against a deliberately wrong package.
- **`wait_free.sh`** — waits for the phone to be free rather than fighting the owner for it.
- **`s3lib.open_by_search()`** — reach any book in two taps, whatever tab it is on.
