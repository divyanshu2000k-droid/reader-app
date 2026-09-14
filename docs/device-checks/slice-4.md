# Slice 4 · phone checks

What only a phone can show for adding books: real APIs, real covers, a real network going away.
Record results with numbers in `DECISIONS.md`.

**Setup.** Sandbox library (`EXPO_PUBLIC_SANDBOX_DB=1`). No native rebuild is needed for this
slice. The network is switched off and on by the OWNER (it is a phone setting); Metro keeps
working over USB (`adb reverse`) in airplane mode. `reader.db` md5 before and after.

## Online
1. **Search:** "piranesi" shows "Searching Open Library" (no Google key) and then results with
   covers. Nothing unrelated to the typed words appears.
2. **Add from search:** tap +, then "Which shelf?", then Start reading. Book detail opens. The
   pulled database has `source` `openlibrary`, the work id, pages, year, `cover_url`, and a
   `cover_local_path` to a file of real size.
3. **Already in the library:** search again and the result says "In your library" and opens the
   book.
4. **Add manually:** the title arrives from the search. With the keyboard up on the last field
   (ISBN), Add to library is on screen. A wrong ISBN checksum is refused and Add is disabled.
   Saves on the chosen shelf.
5. **Edit details** from the actions sheet: the form loads the book, and a page count and a
   cover colour save.
6. **Search your library:** "toibin" finds Tóibín (highlighted). Scope chips narrow it.
   "Not in your library?" hands the words to Add.

## Offline (owner turns on airplane mode)
7. **Killed mid-search:** with live results on screen, the network goes off and typing
   continues. Expected: the offline banner within seconds, books searched before, no error
   card, Add manually on screen.
8. **Add manually offline**, then log a session on that book.
9. **Cold start offline:** the book added from search shows its real cover (the local file,
   since the image memory cache is gone) and all its metadata, in detail and in Edit details.

## Forced failures (Settings, dev)
10. **Book search gets a server error:** the error card with Try again, not the offline banner.
11. **Adding or editing a book fails:** the form stays, with the reason and the typed title;
    Back asks.

## Device pass (network on)
12. RUNTIME 32/32 · COMPILE-TIME 1/1. Check 14 watched failing: a non-atomic `writeTogether`
    (14a) and a cover path never recorded (14c).

## Results, 2026-09-14
- **Items 1–12 all passed.** 7 and 9 are the owner's named cases.
- **Found and fixed on the phone:** offline searches showed "Could not reach the book
  database". Expo's fetch rejects with a `FetchError`, not the `TypeError` the code expected.
  After the fix, item 7 was re-run twice (from a fresh launch, and with the network killed
  mid-search): banner in 3 s, remembered results, no error card.
- **Google Books, once the owner's key existed:** "godaan" searched both sources in 5.7 s. A
  Google result was added with ISBNs, publisher, year, pages and an 11,791 B local cover.
- **Not verified:** 200% font / 360 dp / TalkBack on the new screens (the Slice 11 passes).
