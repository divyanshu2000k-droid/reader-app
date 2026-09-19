# Device-check scripts

The scripts that drove the Nothing Phone 2a through Slices 3 to 5, kept so a new session does not
rebuild them. Python 3 and `adb` on the PATH, run from Git Bash on Windows. Everything they write
(screenshots, pulled databases, run state) goes to `out/`, which is gitignored. A pulled
`sandbox.db` must never be committable.

**They drive the sandbox or device-pass database, never `reader.db`.** Take the library's md5 before
and after any session with them:
`adb shell run-as com.example.reader md5sum files/SQLite/reader.db files/SQLite/reader.db-wal`.

## Two things that will bite you

**The phone is the owner's.** `phone.require_our_app()` refuses to dump anything that is not
our app, and it exists because a run on 2026-09-18 continued while the owner was in WhatsApp
and put a private conversation into the session log. It fired again on 2026-09-19 when a call
came in mid-run. **Do not weaken it.** The one exception is `dump_permission_dialog()`, which
allows exactly `com.google.android.permissioncontroller` and nothing else, because Android's
permission prompt is a one-shot that has to be driven rather than skipped.

**A locked screen ends the session.** The phone has a PIN, so any run that sleeps the screen
finishes at a lock screen no script can get past — everything queued behind it fails at its
first step with a confusing message about the Reading tab. Put the locking run LAST, or pass
`--no-lock`.

## The pieces

| File | What it is |
|---|---|
| `phone.py` | The core: `dump()` the view tree (uiautomator), `find` by text or content-desc, `tap`, `require`, `wait_for`, `screenshot` |
| `s3lib.py` | Shared steps: `launch` (force-stop and start), `back`, `hide_keyboard`, `keyboard_up`, date and time dialog pickers, `field_value` |
| `pulldb.py` | Force-stops the app and pulls `sandbox.db` with its `-wal` and `-shm`, then queries the copy. `python pulldb.py "select …"` |
| `devpass.sh` | One device pass: restarts Metro on **port 8081** with `EXPO_PUBLIC_DEVICE_PASS=1`, launches, waits for the result, writes `C:/Temp/devpass-<label>.txt`. **It used to use 8082, and that cost three runs**: a dev client built by `expo run:android` remembers the LAN URL it was built with and IGNORES `adb reverse`, so the phone quietly loaded the ORDINARY bundle from 8081 and the pass never ran |
| `devpass_s5_mutations.py` | Breaks one source line at a time, runs a device pass, restores the file. The pattern for watching a device check fail |
| `mutate_s5.py` | The same for node tests: 16 Slice 5 mutations, each restored in `finally` |
| `devpass_s6_mutations.py` | Watches device checks 19 and 20 fail: four mutations of the timer's writes and the sweep |
| `devpass_s5b_mutations.py` | Watches device checks 17 and 18 fail: four mutations of `write.ts`, each restored in `finally` with its md5 verified |
| `run_one_mutation.py` | Runs one mutation from the above by label prefix, for when one needs correcting |
| `s5b_*.py` | Slice 5b's run sheet as steps: `notes`, `draft`, `edit`, `undo2`, `64`, `reread`, `export`, `offline`, `longnote`, `keyboard`, `light`. **`s5b_light.py` has never been run** |
| `s5b_prep_reading.py` | Puts two books on Reading, so run-sheet item 1 can finish two in ONE app session. Picks them OFF THE SCREEN rather than by title: a hardcoded pair broke the moment the sandbox was reseeded, and the failure looked like a missing book rather than a stale script |
| `wait_free.sh` | Waits for the phone to be free (our app, the launcher, or a dark screen) before driving it |
| `mutate_s6.py` | Slice 6: **22** mutations over the timer's arithmetic, both heartbeats, the priming rule, the notification copy and the recovery cap. Bytes in, bytes out, md5 verified |
| `s6_foreground_service.py` | **Is there actually a foreground service?** Asks Android, three ways: a `ServiceRecord` exists, `isForeground=true`, and the BACKGROUNDED process is not `cch`/900. Written after a day in which the service was a manifest entry naming a class that does not exist |
| `s6_pocket.py` | Run-sheet item 1: `--minutes N --mode locked\|swiped\|restricted`, `--no-lock`. Simulates unplugging and forces deep doze, samples the service and the notification, and reads the NATIVE heartbeat at the end. Restores the phone in a `finally` |
| `s6_heartbeat_doze.py` | Where does the heartbeat stop? Counts `[dev] timer heartbeat` in logcat across three conditions. This is what found that JS timers do not run when the app is backgrounded |
| `s6_permission.py` | Item 0b: the priming sheet and the real system dialog, on a permission that is still `undetermined`. **Only meaningful once per install** |
| `s6_prime_once.py` | "Not now" is final: the sheet does not return on the next timer |
| `s6_late_grant.py` | The permission arrives AFTER the timer started — does the notification appear? |
| `s6_restricted_recovery.py` | Background usage restricted end to end: Android kills the service, the reader keeps reading, and the sheet must let them record what they actually read |
| `s6_reader_clock.py` | Run-sheet items 2, 3 and 5: the saved duration against the wall clock, pause across a background, and a second book showing the SAME timer |
| `s6_timer.py` | The timer's screens on an emulator: start, resume, pause, finish |
| `s6_recovery.py` | Kill the app mid-timer; the recovery sheet, and that discarding clears the run |
| `s6_audit_background.py` | **The audit experiment**: start a timer, LEAVE the screen, wait, kill, and read the offered bound. Proves whether the heartbeat survives navigation |
| `s6_notification.py` | The timer notification: posted, own channel, ONGOING, 2 actions, changes on pause, cleared on finish. Labels are read off a shade screenshot, not dumpsys |
| `s6_overnight.py` | **The decisive one**: read 53s, shut the app 4 minutes, prove the sheet offers the HEARTBEAT bound and not the wall clock |
| `mutate_s5b.py` | Slice 5b: 25 mutations over notes, drafts, export, Recently Deleted, the theme and the tab request. Exits non-zero if any goes GREEN **or stops matching** — a rewritten rule must be re-watched |
| `s5_phone.py`, `s5_more.py`, `s5_twice.py`, `s5_edit.py`, `s5_sample.py`, `s5_offline.py`, `s5_look.py` | Slice 5's run sheet (`docs/device-checks/slice-5.md`) as steps. `python s5_more.py 1 1db 2 2db 3 want refuse already about fault` |

## Setup, every session

1. **Metro for scripts runs on 8082,** so it never collides with a Metro the owner starts on 8081:
   `EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --dev-client --clear --port 8082`, then
   `adb reverse tcp:8081 tcp:8082`. The dev build always asks for `localhost:8081`.
2. **Restart Metro with `--clear` after every source change.** Its file watcher does not work on
   this machine (`09-ENVIRONMENT.md`).
3. **Never edit source while a device pass is bundling.** The edit lands in the bundle.

## Things that cost time once, so they will not again

- **A command over 10 minutes is killed.** Run device passes one at a time, or in the background
  with `run_in_background`, never five in one foreground command.
- **Phone settings are the owner's.** Airplane mode, dark/light, font size, display size. Ask, then
  verify: after "airplane mode is on", `adb shell ping -c 1 -W 2 8.8.8.8` must say "Network is
  unreachable". Android can keep Wi-Fi on in airplane mode, and once did.
- **USB drops happen.** `adb devices` empty: wait in a loop (`until adb devices | grep -q
  "device$"`), then redo `adb reverse`.
- **A TalkBack adjustable control** (the rating) shows in the dump as one node, content-desc
  "Rating, 4.5 out of 5". Its tap targets are listed beside it, not inside it: find them by bounds.
- **`selected="true"`** on a node reflects `accessibilityState.selected` (the Library's tab chips).
- **Clearing a text field:** tap it, `adb shell input keycombination 113 29` (Ctrl+A), then `input
  keyevent 67`. **DEL with no field focused acts as Back** and leaves the screen.
- **Many keys in one call:** `adb shell input keyevent 67 67 67 …` is one round trip.
- **The Library's first Continue pill may be an audiobook,** whose logger asks for minutes; pick a
  print book for a pages logger (`reading_pill_title` in `s5_more.py`).
- **A dev client remembers the LAN Metro URL** (`192.168.x.x:8081`) and IGNORES
  `adb reverse`. `devpass.sh` serves on 8082 and relies on the reverse, so the pass can
  silently run the ORDINARY bundle and log nothing. Kill whatever holds 8081 and start the
  device-pass Metro there instead.
- **A mutation script's `finally` can itself fail.** On 2026-09-18 `write_bytes` threw a
  transient `OSError` on Windows and the mutation was left in `noteForm.ts`. Both sweeps
  now restore through a shared `restore()` that retries and, failing that, exits non-zero
  naming the `git checkout --` that fixes it. **Never let a sweep finish over a tree it
  could not restore.**
- **Python on Windows prints `ℹ` only with `sys.stdout.reconfigure(encoding='utf-8')`.** Without it a
  mutation script crashed mid-run and left a mutation in the source. Every mutation script
  restores its file in `finally`, and a source md5 before and after proves it.
- **`sqlite3` holds the pulled `-shm` open.** Pull into a fresh folder name for a second pull in the
  same process.
- **In the Bash tool, a heredoc containing quotes can fail with "unexpected EOF".** Write the script
  to a file and run it. This bit twice more on 2026-09-18.
- **A dump reads WHATEVER is on screen.** `phone.dump()` now calls `require_our_app()` and
  refuses when our app is not in the foreground. It exists because a run continued into the
  owner's WhatsApp and put a private conversation in the session log. Do not weaken it; use
  `wait_free.sh` to wait for the phone instead.
- **The guard costs a round trip per dump, and a toast lives 5 s.** Tap an undo from the SAME
  dump that finds it, never after another dump. Check 6.4 failed twice on this.
- **uiautomator reports an empty `EditText`'s text as its PLACEHOLDER.** "What do you want to
  remember?" is not characters of draft.
- **An accessibility HINT is not exposed.** A note card is found by its `content-desc`, which
  is `noteAnnouncement` plus the note's words, not by "Opens this note to edit it".
- **`adb shell input text` truncates a long string** (1488 characters became 463). Assert
  against what was actually typed or stored, never against what the script meant to type.
- **`ping` writes to stderr and `phone.adb()` returns stdout only.** Use
  `adb shell 'ping ... 2>&1'`, or an offline check silently concludes the phone is online.
- **`pulldb.py` FORCE-STOPS the app, which is the crash case.** Pulling the database while a
  timer runs walks straight into the launch recovery sheet — the first run of `s6_timer.py`
  did exactly that. Check the database before starting a timer or after finishing one.
- **The Gradle build needs `TEMP="C:\gtmp" TMP="C:\gtmp"`** or it dies with "Unable to
  establish loopback connection". See `09-ENVIRONMENT.md`.
- **Android does NOT print notification action titles in `dumpsys`.** Only `actions=N`. A
  regex for `title=(\w+)` returns the literal word "String", because every value is
  printed as `key=String (value)`. Read the labels off an EXPANDED shade screenshot.
- **A LOW-importance notification is collapsed in the shade**, so its buttons need an
  expand before they are visible or tappable.
- **A book below the fold is not a missing book.** Use `s3lib.open_by_search()` rather than
  scrolling a tab; three runs failed on this alone.
