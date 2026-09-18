# Slice 5b · phone checks, with Slice 5's leftovers

**Status, 2026-09-18: not run. The phone is not attached.** By the owner's choice, Slice 5's
outstanding checks and all of Slice 5b run in one session. Work down this sheet in order:
items 0 to 2 are Slice 5's debt, 3 onwards are Slice 5b.

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
  decoration. `scripts/device/` has the mutation pattern; for these two:
  - **17:** add `notes` to the `reads` entry of `CHILDREN` in `write.ts`. The check must go red
    at "THE NOTE WENT WITH ITS READ". Then change `bookId: context.bookId` in `newNoteRow` and
    confirm the re-read step goes red.
  - **18:** add `notes` to `SYNCABLE`'s treatment of the draft — simplest is to make
    `saveDraft` call `writeRow('notes', …)` instead. It must go red at "the draft enqueued N
    sync rows".
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
