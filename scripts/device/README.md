# Device-check scripts

The scripts that drove the Nothing Phone 2a through Slices 3 to 5, kept so a new session does not
rebuild them. Python 3 and `adb` on the PATH, run from Git Bash on Windows. Everything they write
(screenshots, pulled databases, run state) goes to `out/`, which is gitignored. A pulled
`sandbox.db` must never be committable.

**They drive the sandbox or device-pass database, never `reader.db`.** Take the library's md5 before
and after any session with them:
`adb shell run-as com.example.reader md5sum files/SQLite/reader.db files/SQLite/reader.db-wal`.

## The pieces

| File | What it is |
|---|---|
| `phone.py` | The core: `dump()` the view tree (uiautomator), `find` by text or content-desc, `tap`, `require`, `wait_for`, `screenshot` |
| `s3lib.py` | Shared steps: `launch` (force-stop and start), `back`, `hide_keyboard`, `keyboard_up`, date and time dialog pickers, `field_value` |
| `pulldb.py` | Force-stops the app and pulls `sandbox.db` with its `-wal` and `-shm`, then queries the copy. `python pulldb.py "select …"` |
| `devpass.sh` | One device pass: restarts Metro on port 8082 with `EXPO_PUBLIC_DEVICE_PASS=1`, launches, waits for the result, writes `C:/Temp/devpass-<label>.txt` |
| `devpass_s5_mutations.py` | Breaks one source line at a time, runs a device pass, restores the file. The pattern for watching a device check fail |
| `mutate_s5.py` | The same for node tests: 16 Slice 5 mutations, each restored in `finally` |
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
- **Python on Windows prints `ℹ` only with `sys.stdout.reconfigure(encoding='utf-8')`.** Without it a
  mutation script crashed mid-run and left a mutation in the source. Every mutation script
  restores its file in `finally`, and a source md5 before and after proves it.
- **`sqlite3` holds the pulled `-shm` open.** Pull into a fresh folder name for a second pull in the
  same process.
- **In the Bash tool, a heredoc containing quotes can fail with "unexpected EOF".** Write the script
  to a file and run it.
