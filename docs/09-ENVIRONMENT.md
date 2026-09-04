# ENVIRONMENT

How to build and run this project on a machine that has never built it, and how to run the
device pass.

Everything else in `docs/` describes the product. This file describes the workshop. It
exists because none of it was written down the first time, and rebuilding it from memory
cost the better part of a day.

Nothing here is a decision. The reasoning behind these choices is in `DECISIONS.md`; this
is the recipe.

---

## What is installed, exactly

Recorded so a second machine or a rebuild can be made identical rather than approximately
similar.

| Thing | Value |
|---|---|
| OS | Windows 11 |
| JDK | Microsoft OpenJDK **17**, at `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot` |
| Android SDK | `C:\Users\<you>\AppData\Local\Android\Sdk` |
| Platforms | android-34, **android-36**, android-36.1 |
| Build-tools | 33.0.1, 34.0.0, 35.0.0, **36.0.0**, 36.1.0, 37.0.0 |
| NDK | **27.1.12297006** (~1 GB, installed automatically by the first Gradle build) |
| Emulator AVD | **`Pixel_7_API_36`**, system image `system-images;android-36.1;google_apis;x86_64` |
| Node / npm | Node 24, npm 11 |

**JDK 17, not 21.** Android Studio bundles a JBR 21 at `…\Android Studio\jbr`. Expo SDK 57
documents 17, and a mismatch surfaces as a Gradle
`Unsupported class file major version` error. Install 17 explicitly.

---

## Setting it up from scratch

### 1. JDK 17

```
winget install --id Microsoft.OpenJDK.17 --silent --accept-package-agreements --accept-source-agreements
```

### 2. Android SDK command-line tools

**There is a bootstrap problem here.** `sdkmanager` lives *inside* `cmdline-tools`, so it
cannot install itself, and Android Studio does not ship it in a location on `PATH`.
Download the zip directly and unpack it so that `sdkmanager.bat` ends up at
`%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat` — the `latest` directory level is
required and the tools will not work without it.

```
curl.exe -sSL -o "%TEMP%\clt.zip" https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip
```

Use `curl.exe`, not PowerShell's `Invoke-WebRequest` — its progress meter makes a 136 MB
download take many minutes.

### 3. Environment variables

PowerShell, user scope. This reads and rewrites `PATH` rather than using `setx`, which
truncates `PATH` at 1024 characters and will silently destroy it:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$jdk = (Get-ChildItem "C:\Program Files\Microsoft" -Directory | Where-Object { $_.Name -like "jdk-17*" } | Select-Object -First 1).FullName
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'User')
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
$add = @("$sdk\platform-tools", "$sdk\emulator", "$sdk\cmdline-tools\latest\bin", "$jdk\bin")
$path = [Environment]::GetEnvironmentVariable('Path','User'); if ($null -eq $path) { $path = '' }
foreach ($p in $add) { if ($path -notlike "*$p*") { $path = "$path;$p" } }
[Environment]::SetEnvironmentVariable('Path', $path.Trim(';'), 'User')
```

**Then close and reopen every terminal.** A running process never re-reads the
environment. This is the single most common reason the next step appears to fail.

### 4. Licences

Non-interactive, via stdin redirection from a file of `y` lines. Piping into
`sdkmanager.bat` from PowerShell does **not** work — the batch file does not read the
pipeline:

```
cmd /c "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat --licenses --sdk_root=%ANDROID_HOME% < yes.txt"
```

Seven licence files should appear in `%ANDROID_HOME%\licenses`.

### 5. Emulator, as a fallback device

A physical phone is the better default — see `05-BUILD-PLAN.md` Slice 6, where OEM
background-killing is the thing that actually matters and an emulator cannot reproduce it.
The AVD exists so a build is never blocked on having a phone to hand.

```
sdkmanager --sdk_root=%ANDROID_HOME% "system-images;android-36.1;google_apis;x86_64" "platforms;android-36"
avdmanager create avd -n Pixel_7_API_36 -k "system-images;android-36.1;google_apis;x86_64" -d pixel_7
```

`avdmanager` prints `Warning: This version only understands SDK XML versions up to 3` and
records `target=android-0` in the `.ini`. Both are cosmetic; the emulator reads
`image.sysdir.1` from `config.ini`, which is correct.

### 6. Verify

```
java -version && adb devices
```

Wanted: `openjdk version "17.x"`, and a device line ending in the word `device`.
`unauthorized` means the USB-debugging prompt is waiting on the phone.

---

## Running the app

```
emulator -avd Pixel_7_API_36     # or plug in a phone with USB debugging on
npx expo run:android
```

First build takes 10–20 minutes and installs the NDK. Subsequent builds are minutes.

**The debug APK is around 80 MB and that is expected.** It carries an unminified JS
bundle, source maps, the dev client and Hermes debugger, and every ABI, with no R8
shrinking. The `< 15 MB` budget in `06-CONVENTIONS.md` is a **release** budget and is
still realistic. Measure it properly at Slice 11, not before.

---

## Metro, and the two things that will waste your time

**The file watcher does not work on this machine.** Editing a source file does not update
the served bundle. Metro will happily serve stale code indefinitely, with no error, and
the app will show behaviour from a previous edit. Every change needs a full restart:

```
npx expo start --dev-client --clear
```

**Verify the change is actually live** rather than trusting it, by grepping the served
bundle for something you just wrote:

```
curl -s "http://127.0.0.1:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true" | grep -c "some new string"
```

**When a bundle fails with a confusing internal Metro error** — `Cannot read properties of
undefined (reading 'transformFile')` and similar — run `npx expo export --platform android`.
It prints the real underlying cause, which the dev server hides behind an HTTP 500.

Two further constraints that are easy to trip over, both learned the hard way:

- Metro **excludes `__tests__/` directories from module resolution**. A module there is
  silently not bundled and fails at runtime with `Cannot find module`. That is why
  `src/db/devchecks.ts` does not live beside the test that specifies it.
- Metro resolves the `@/` path aliases for static `import` but **not inside `require()`**.
  An aliased dynamic require typechecks cleanly and fails at runtime. Use a relative path.

---

## Running the device pass

The node test suite (`npm test`) covers pure logic. Anything needing a real SQLite
connection or a real filesystem runs on a device instead, from a `__DEV__`-only button.

`src/db/__tests__/sync-queue.device.md` says what the checks assert and why.
`src/db/devchecks.ts` implements them. This is how to run them:

1. Start a device: `emulator -avd Pixel_7_API_36`, or plug in a phone.
2. Start Metro **with `--clear`**, and with the autorun flag set:
   `EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --dev-client --clear`.
3. Confirm the bundle is current (see the grep above). Skipping this means testing stale
   code, which looks exactly like a passing run.
4. Launch the app: `adb shell monkey -p com.example.reader -c android.intent.category.LAUNCHER 1`.
   The pass starts on mount; it takes about 40 seconds.
5. Read the results:

```
adb logcat -d | grep devcheck
```

**Why a flag and not the button.** The `__DEV__` button still exists and still works for a
human finger, but `adb shell input tap` does **not** reach the JS handler — not with
`tap`, `touchscreen tap`, or a zero-length `swipe`, and not with the window focused. Two
ANR dialogs appeared during that attempt ("Input dispatching timed out (Application does
not have a focused window)"), though thread dumps taken at the time showed both the main
thread and `mqt_v_js` idle, so there was no app-level hang. A suite that can only be
started by a finger also cannot be run from a script, and Slice 2 has to re-run this
against 2000 books.

**On Windows, set the flag through the process environment, not `set VAR=1 && cmd`.** In
`cmd.exe` that form puts the trailing space *into the value*, so the flag arrives as
`"1 "`, every comparison fails, and the pass silently does not run.

The final line reports **runtime and compile-time counts separately**, e.g.
`RUNTIME 14/14 PASSED · COMPILE-TIME 1/1`. They are never combined: one check asserts a
property the type system guarantees and executes nothing, and folding it into the runtime
tally inflates the number. Any failures are repeated at the end of the log.

**Re-run this after any change to `db/`, and always after adding a migration.**
`06-CONVENTIONS.md` forbids shipping a migration that has not run against a seeded
database, and the device pass is where that happens.

### Testing a migration against a POPULATED old database

A fresh install is not a test of a migration: it has no rows to violate a new constraint,
nothing to lose and nothing to restore. Migration `0001` passed every local check and
still could not run on a real database. To exercise the upgrade path properly:

1. **Pin the journal to the old version.** Edit `src/db/migrations/migrations.js` to
   import only the earlier migrations, and drop the later entries from
   `meta/_journal.json`. Keep copies of both — you are putting them back.
2. Restart Metro with `--clear` and confirm the served bundle does **not** contain the new
   migration's SQL.
3. Launch, letting the app build the old schema, then populate it — through the app, or
   directly with `adb shell run-as com.example.reader sqlite3 files/SQLite/reader.db`.
   Include the shapes that violate whatever the new migration adds.
4. **Fingerprint the data before upgrading**, so "nothing was lost" is checkable rather
   than asserted.
5. Restore `migrations.js` and `_journal.json`, restart Metro with `--clear`, relaunch.
6. Compare the fingerprint, check `select count(*) from __drizzle_migrations`, and inspect
   the indexes actually present in `sqlite_master`.

---

## Version control

The human runs every git command, in a separate terminal. The assistant runs none — not
`init`, `add`, `commit`, `branch`, `push` or `checkout`. When something is worth
committing, the assistant says so and stops. See `DECISIONS.md`, 2026-09-03.
