# ENVIRONMENT

## Two traps that each cost a run on 2026-09-19

**A dev client ignores `adb reverse`.** `expo run:android` bakes the LAN URL
(`192.168.x.x:8081`) into the development client, and the client keeps using it. Serving a
device-pass bundle on any other port means the phone quietly loads the ORDINARY bundle from
8081 instead: the pass never runs, nothing is logged, and it looks exactly like a hang.
`devpass.sh` now kills 8081 AND 8082 and serves on **8081**.

**A local native module is not a config plugin.** Anything under `modules/` needs
`npm run prebuild` and then `npx expo run:android` — a JS reload cannot pick up Kotlin. And
`expo-module-gradle-plugin` fails configuration without `versionCode` and `versionName` in
the module's `defaultConfig`, with the unhelpful message
`'android.defaultConfig.versionName' is not defined`.

## Driving the phone when it is the owner's

`scripts/device/phone.py` refuses to dump any app but ours, and it will abort a run when a
call comes in or the owner opens something else. That is correct and it is not a bug to work
around: a run on 2026-09-18 continued while the owner was in WhatsApp and captured a private
conversation into the session log.

**The phone has a PIN**, so a script that sleeps the screen ends the whole session at a lock
screen. Anything queued behind it fails at its first step. Put the locking run last.

**Temporary phone state must be restored in a `finally`.** `s6_pocket.py` simulates
unplugging (`dumpsys battery unplug`), forces deep doze (`dumpsys deviceidle force-idle`) and
sometimes restricts background usage. All three are undone whatever happens, because they are
the owner's phone's settings and a crashed script must not leave them set.

How to build and run this project on a machine that has never built it, and how to run the
device pass.

Everything else in `docs/` describes the product. This file describes the workshop. It
exists because none of it was written down the first time, and rebuilding it from memory
cost the better part of a day.

Nothing here is a decision. The reasoning behind these choices is in `DECISIONS.md`; this
is the recipe.

---


## The Gradle build needs a TEMP path without an 8.3 short name

`npx expo run:android` fails on this machine with:

```
java.io.IOException: Unable to establish loopback connection
```

That is the AF_UNIX problem from `DECISIONS.md` (2026-09-03): Gradle opens a socket under
the temp directory, and connect fails when the path is the 8.3 short-name form
`C:\Users\DIVYAN~1\AppData\Local\Temp`. It is not a Gradle version, a JDK or a firewall
problem, and `--no-daemon` does not help.

**The fix, every time:**

```sh
TEMP="C:\gtmp" TMP="C:\gtmp" npx expo run:android
```

Any directory whose full path has no `~1` in it works. Verified 2026-09-18: the same
build failed immediately with the default TEMP and succeeded in 5m 30s with this one.

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
| Test phone | Nothing Phone 2a (A142), Android 16, arm64, 1084×2412 with a display density override of 375, dark mode, IST. The device Slice 1 was verified on |

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

**From the assistant's own shell, Gradle needs a real temp directory:** set
`TEMP=C:\Temp`, `TMP=C:\Temp` and `JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=C:\Temp` for the
build. That shell inherits a short 8.3-form `TEMP` (`C:\Users\DIVYAN~1\…`) under which
Java's NIO selector cannot start, so no Gradle build can start. The user's own terminal
does not have this problem. `DECISIONS.md`, 2026-09-03, has the investigation and its
correction: a failure seen only in the assistant's shell is a claim about that shell.

**After any change to `app.config.ts` plugins or native config, regenerate first:**

```
npm run prebuild          # expo prebuild --platform android --clean
npx expo run:android
```

`run:android` only generates `android/` when the directory is missing; it does not
regenerate it when the config changes. Skipping this step is how Plus Jakarta Sans, the
splash config and the Sentry plugin sat in the config for a week without reaching a single
build. `android/` is generated, gitignored and never hand-edited, so `--clean` loses nothing.

**`npm test` now catches a stale `android/`.** `src/__tests__/native-fonts.test.ts` compares
`android/app/src/main/res/font` with the fonts in `src/ui/brand.json`, then checks that the
built debug APK contains every font resource the native project declares. It fails with the
command to run. Both halves **skip**, visibly, when there is no `android/` or no APK yet.
`app.config.ts` also throws if a font file named in brand.json is missing, so a typo fails
`npm run prebuild` instead of producing a build without that weight.

**Before driving the app with `adb` taps, make sure no LogBox toast is showing.** In a
development build, any `console.warn` raises LogBox's "Open debugger to view warnings" toast.
On Android it sits above Modals and over the tab bar and swallows the taps beneath it, so a
button that "does nothing" may never have been touched. Dismiss it with its X first. The
app's own routine diagnostics are routed away from LogBox; a toast that still appears means
something genuinely warned. **`console.error` raises a red error toast the same way.** A
failed migration raises one by design (the `[unrecoverable]` report), bottom of the screen.
It does not cover Try again, but it covers anything drawn at the bottom.

**Let a native build finish before starting Metro.** Gradle creates and deletes files in
`node_modules/*/android/build` throughout a build. `metro.config.js` now blocks those paths,
but before it did, a Metro started mid-build either crashed on start or hung without ever
serving a bundle. If Metro sits at "Bundler cache is empty, rebuilding" for more than a
couple of minutes, restart it with `--clear`.

**On a phone over USB:** run `adb reverse tcp:8081 tcp:8081` so the dev build reaches Metro
on `localhost`. If `expo run:android` cannot find the phone, set `ANDROID_SERIAL` to its
serial from `adb devices` rather than passing `--device`, which expects a device name.

**A local RELEASE build needs Sentry's upload switched off.** Without it, the build fails:

```
error: An organization ID or slug is required (provide with --org)
> Task :app:createBundleReleaseJsAndAssets_SentryUpload_… FAILED
```

The Sentry Gradle plugin tries to upload source maps for a release bundle and fails the
build when no org and token exist. Until those are configured (Slice 11, with the release
signing), build with:

```
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:android --variant release --no-bundler
```

The crash reporting inside the app is unaffected: that is the DSN, a different thing. Only
the build-time source-map upload is skipped, so a release stack trace would be minified
until the token exists. **Release builds are signed with the debug keystore** by the React
Native template, so one installs over a debug build and keeps the app's data.

**The debug APK is around 80 MB and that is expected.** It carries an unminified JS
bundle, source maps, the dev client and Hermes debugger, and every ABI, with no R8
shrinking. The `< 15 MB` budget in `06-CONVENTIONS.md` is a **release** budget and is
still realistic. Measure it properly at Slice 11, not before.

---

## Optional services: `.env`, Sentry and the kill switch

**Every one of these is optional.** A fresh clone with no `.env` builds, launches and works:
crash reporting is off and the force-update check is skipped. Copy `.env.example` to `.env`
to turn them on. `.env` is gitignored; `.env.example` is committed and holds no values.

`EXPO_PUBLIC_*` values are inlined into the bundle, so **only public keys go in `.env`**.
After changing `.env`, restart Metro with `--clear`.

### Sentry

1. In Sentry, create a **React Native** project. Copy its DSN (Settings → Client Keys).
2. Put it in `.env`: `EXPO_PUBLIC_SENTRY_DSN=https://…@….ingest.sentry.io/…`
3. Turn on **spike protection** in the project settings: the DSN is extractable from the
   APK, and the realistic abuse is someone burning the free quota.
4. Events are **disabled in development builds** on purpose. To see one arrive, use a
   release build.

**The auth token is a different thing and a real secret.** It is only needed to upload source
maps, which is not set up yet. When it is: `eas secret:create --name SENTRY_AUTH_TOKEN`, or
`.env.local` for local builds. Never in `app.config.ts`, never in a committed file.

### The force-update kill switch

The payload lives in `killswitch/public/v1/kill-switch.json` and is served from Cloudflare
Pages. See ADR 007 for why.

**One-time setup:**

1. Create a free Cloudflare account. No card needed.
2. `npx wrangler login` — do this now, not during an incident.
3. `npx wrangler pages deploy killswitch/public --project-name reader-killswitch`
4. Put the resulting URL in `.env`:
   `EXPO_PUBLIC_FORCE_UPDATE_URL=https://reader-killswitch.pages.dev/v1/kill-switch.json`

**The payload:**

```json
{ "minimumVersion": "0.1.0", "latestVersion": "0.1.0", "message": null }
```

- Builds **strictly below** `minimumVersion` see the update screen. Equal is allowed.
- `latestVersion` must be **at or above** `minimumVersion`, or the whole flag is ignored.
  This is deliberate: it stops a typo like `11.0.0` from locking out every reader.
- `message` optionally replaces the body text, 300 characters maximum.
- There is no store URL field. The button's destination comes from the package id.

**To flip it during an incident:** edit the JSON, run the deploy command in step 3, then
check it took with `curl -s <url>`. The host revalidates on every request, so a flip is live
as soon as the deploy finishes.

**To test it locally without deploying:** serve the folder and point the emulator at the host
machine, which the emulator sees as `10.0.2.2`:

```
python -m http.server 8787 --directory killswitch/public
EXPO_PUBLIC_FORCE_UPDATE_URL=http://10.0.2.2:8787/v1/kill-switch.json
```

Plain `http` works in debug builds only. Release builds require `https`, which is correct.

**On a physical phone, `10.0.2.2` does not exist.** Reverse the port instead and use
`localhost`:

```
adb reverse tcp:8787 tcp:8787
EXPO_PUBLIC_FORCE_UPDATE_URL=http://localhost:8787/v1/kill-switch.json
```

Remove it afterwards with `adb reverse --remove tcp:8787`, and put `.env` back. Restart
Metro with `--clear` after each change: the URL is inlined at bundle time.

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

**Use exactly that URL.** `node_modules/expo-router/entry.bundle?platform=android&dev=true`
also returns a full-sized bundle (about 6 MB, 2875 modules) with **none of the app's code in
it**. Grepping it for a string you just wrote returns 0 whether or not the change is live,
which reads as "stale" when it isn't. That cost a Metro restart on 2026-09-10.

**Starting Metro in the background, from the assistant's shell on Windows.** Bash
`cmd //c start …` hangs. Start it from PowerShell instead, logging to a file:

```powershell
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c npx expo start --dev-client --clear > C:\Temp\metro-a.log 2>&1'
$psi.WorkingDirectory = '<repo>'
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null
```

- **To stop it, stop only the process listening on 8081:**
  `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8081 -State Listen).OwningProcess`.
  Never kill every `node` process: the user's other tools are node too.
- **Use a new log file name on each restart.** Stopping the node process can leave its
  parent `cmd.exe` holding the old log open. A restart that redirects to the same file then
  fails to start, silently, and the old log still ends in a healthy-looking "Bundled" line.
- **Confirm it is listening** with `Get-NetTCPConnection -LocalPort 8081 -State Listen`
  before launching the app.
- **A cold start after `--clear` spends 13–16 s bundling.** A screenshot taken before
  "Android Bundled" appears in the log shows the splash screen, which is not a bug.

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

## Hardware: use the phone

**The phone is the device. Plug it in first.**

- **One attempt on the emulator, then stop.** If it does not work first time — input not
  reaching the app, black screenshots, the dev client loading a Metro you did not start —
  **stop and ask for the phone**. Do not debug the emulator.
- Two sessions have been lost to emulator problems the phone did not have: taps that never
  reached JS, `screencap` returning black, and a dev client that loads `10.0.2.2:8081`
  whatever is serving it, so the flag you set never arrived. The same work on the phone
  succeeded on the first try, through `adb reverse`.
- The emulator stays for the case where no phone is available at all. It is not the default
  and it is not worth an hour.

## A sandbox library of 2000 books

For building and measuring screens at scale without touching the reader's library:

```
EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --dev-client --clear
```

The app then opens `sandbox.db`; Settings says so in its dev block. The device pass has its own
file, `devcheck.db`, so passes do not fill the sandbox with soft-deleted rows.
- **Seed 2000 books** writes 2000 books, about 2100 reads and 11,000 sessions through the real
  write path, and takes **about two and a half minutes** on the Nothing Phone 2a.
- **Seed 12 books, no DNF** is a new reader's library: small, with an empty DNF tab.
- **Either refuses a sandbox that already has books.** Seeding twice would double it.
- The same seed produces the same ids, titles and shapes; dates sit at the same distances
  from the day it runs.

**Testing offline on the phone.** Airplane mode is a phone setting, so the owner switches it.
Metro keeps serving the bundle over USB (`adb reverse`), so the app keeps reloading with the
network off. Confirm it is really off with `adb shell ping -c 1 -W 2 8.8.8.8` failing. A cold
start (`am force-stop`, then launch) empties React Native's image memory cache, which is what
makes "the cover still shows" a test of the local file. Google Books refuses unkeyed requests;
set `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` in `.env` and restart Metro with `--clear`.

**A Gradle build from the assistant's shell** needs `TEMP` and `TMP` pointed at a long path
(`C:\Temp`): the shell's 8.3 short temp path breaks Gradle's loopback socket
(`DECISIONS.md`, 2026-09-03 correction).

**Release builds ignore both flags** and open the reader's library. The 2026-09-13 release
scroll measurement used a sandbox release build, which is now impossible by design. Measuring
scroll at Slice 11 needs a separate bench variant with its own package id, so it can never
share a reader's data. Filed against Slice 11.

**Measuring a list's scroll:** `adb shell dumpsys gfxinfo com.example.reader reset`, fling with
`adb shell input swipe 540 1900 540 500 120` a dozen times, then `dumpsys gfxinfo` again.
Report "Janky frames" and the percentiles. **A debug build's numbers are not the release
budget**: measure 60fps on a release build.

## Running the device pass

**It runs on its own database, and will not run on yours.** `EXPO_PUBLIC_DEVICE_PASS=1`
makes the whole app open `devcheck.db` (and `backups-devcheck/`) from launch. Without the
flag the Settings button refuses, saying so. Verified on the phone on 2026-09-12:
`devcheck.db` appeared, and `reader.db` kept its byte-for-byte md5 and its mtime.

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

**Prefer the phone, and know which Metro the app is actually talking to.** Learned on
2026-09-10, at the cost of an evening:
- **On the phone,** `adb reverse tcp:8081 tcp:<your port>` routes the dev client to your
  Metro. It worked first time: RUNTIME 18/18.
- **On the emulator, `adb reverse` does not apply.** The dev client loads
  `http://10.0.2.2:8081`, the host's port 8081, whatever is serving it. Here that was a
  second Metro, started earlier by someone else, so the flag set on mine never reached the
  app and the pass silently did not run. A `reader://expo-development-client/?url=…` deep
  link was accepted by Android and then ignored. Emulator `input tap` did not reach JS, and
  `screencap` came back black.
- **Prove the route before reading any result.** List the app's connections with
  `adb shell cat /proc/net/tcp6`, filtered to its uid: `127.0.0.1` means your reverse,
  `10.0.2.2` means the host's 8081. Also check that your Metro's log gained an
  `Android Bundled` line when the app launched. A device pass that never started looks, in
  logcat, exactly like one that has not finished yet.
- **That second Metro did pick up file edits.** The "watcher does not work" warning above
  was not true of it. Still verify by grepping the bundle, which is the rule either way.

**Why a flag and not the button.** A suite that can only be started by a finger cannot be
run from a script, and Slice 2 has to re-run this against 2000 books.

> **Correction, 2026-09-10.** This paragraph used to say `adb shell input tap` never
> reaches the JS handler. On the Slice 0 emulator it didn't, and two ANR dialogs appeared
> ("Application does not have a focused window"). **On the Slice 1 phone, taps reach JS
> reliably** once no LogBox toast is showing: Save, Discard, Try again and text fields were
> all driven by `input tap` and confirmed in the database. The LogBox toast, which swallows
> taps and was only identified in Slice 1, may have been the Slice 0 cause too. That was
> never re-tested on the emulator. If a tap seems to do nothing, check for a toast first.

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
   **That works on the emulator only: physical phones ship no `sqlite3`.** On a phone, use
   the pull, edit and push recipe below.
   Include the shapes that violate whatever the new migration adds.
4. **Fingerprint the data before upgrading**, so "nothing was lost" is checkable rather
   than asserted.
5. Restore `migrations.js` and `_journal.json`, restart Metro with `--clear`, relaunch.
6. Compare the fingerprint, check `select count(*) from __drizzle_migrations`, and inspect
   the indexes actually present in `sqlite_master`.

---

## Driving a phone from a script

**The scripts themselves are in `scripts/device/`, with a README of every trap they hit**: Metro on
8082 behind `adb reverse tcp:8081 tcp:8082`, 10-minute command limits, verifying airplane mode with a
ping, clearing a field without DEL acting as Back, and finding the rating's tap targets. Start there
rather than rebuilding them. They write only to `scripts/device/out/`, which is gitignored.

How Slice 1 was verified on the phone without a human tapping. From Git Bash, with
`export MSYS_NO_PATHCONV=1 ANDROID_SERIAL=<serial>`. Without the first, Git Bash rewrites
`/sdcard/...` into a Windows path and adb fails confusingly.

- **Screenshots: `adb exec-out screencap -p > shot.png`, from Bash.** PowerShell's `>`
  re-encodes the stream and corrupts the PNG. That happened twice in Slice 1.
- **Read the screen as data, not pixels:**
  `adb shell uiautomator dump /sdcard/ui.xml` then `adb exec-out cat /sdcard/ui.xml`. Each
  node carries `text` or `content-desc`, `enabled` and `bounds`. This is how "Save is
  disabled" or "the field shows 41" is proven rather than eyeballed. A Pressable's
  `enabled` reflects its `disabled` prop.
- **Tap using the dump's `bounds`, which are device pixels.** A screenshot shown to an
  assistant is usually scaled, so its coordinates are not the phone's.
  `adb shell input tap X Y` for a tap, and `adb shell input text 25` to type into the
  focused field.
- **Launch:** `adb shell am start -n com.example.reader/.MainActivity`. The debug build has
  no dev-client deep-link scheme; it loads from `localhost:8081` through `adb reverse`.
- **Anything shorter than about half a second cannot be screenshotted.** A screencap takes
  that long, and there's no video decoder on this machine to read a `screenrecord`.
  Examples: a busy label during a fast retry, or a one-frame blank. Prove those states by
  behaviour instead. Logcat is the usual witness: count `[unrecoverable]` reports before
  and after a tap to show a retry ran.
  - A tap followed by a screencap inside one `adb shell "…; …"` call is the fastest
    capture available, and it still missed the retry's busy label.
  - It did catch Save's and Discard's busy states, which last longer.
- **The keyboard check** (`06-CONVENTIONS.md`): tap the field, `input text`, then screenshot
  and dump. The field's, the error's and the button's `bounds` must all sit above the
  keyboard's top edge.

## Editing the app's database on a phone

Phones have no `sqlite3`, so the database is edited on the host. Every step below exists
because skipping it broke something in Slice 1.

1. `adb shell am force-stop com.example.reader` first. An open connection keeps writing to
   the WAL.
2. Pull all three files:
   `adb exec-out run-as com.example.reader cat files/SQLite/reader.db > reader.db`, then the
   same for `reader.db-wal` and `reader.db-shm`. Without the WAL you edit a stale database.
3. Edit with Python's `sqlite3`. Then `PRAGMA wal_checkpoint(TRUNCATE)` and
   `PRAGMA journal_mode=DELETE`, so the result is one self-contained file.
4. **Run steps 4 and 5 as one script with `set -e`, and never delete the live `-wal` until the
   copy has succeeded.** On 2026-09-10 the push failed and the script carried on: it
   deleted the phone's live `reader.db-wal`, which held 2.3 MB of committed,
   un-checkpointed data. It was recovered only because step 2's copies existed. The push
   failed because, with `MSYS_NO_PATHCONV=1`, `adb.exe` receives a Git-Bash path such as
   `/c/Users/...` literally and cannot read it. **Give `adb push` a Windows path**:
   `adb push "$(cygpath -w reader.db)" …`.
   Push through `/data/local/tmp`, since `run-as` cannot read your host.
   - `adb push reader.db /data/local/tmp/reader.db`, then `adb shell chmod 644` it.
   - `adb shell run-as com.example.reader cp /data/local/tmp/reader.db files/SQLite/reader.db`
     as **separate arguments**. `run-as … sh -c '…'` loses its quoting through
     `adb shell`, and `cp` receives one argument.
   - `adb shell run-as com.example.reader rm -f files/SQLite/reader.db-wal files/SQLite/reader.db-shm`,
     or SQLite replays the old WAL over your edit.
   - Delete the `/data/local/tmp` copy.
5. Keep a clean copy of the pulled database, and push it back when done.

**Rows planted this way bypass `sync_queue`.** That's fine for testing screens. It is
invalid for testing sync, which must go through `write.ts`.

**Recipes used in Slice 1:**
- **An unfinished timed session (recovery gate):** insert into `sessions` with
  `is_timed = 1`, `duration_seconds` NULL, and `occurred_at` set to the elapsed time you
  want. 9 h exercises the "ask" path; 41 min exercises the pre-filled one.
- **A migration that fails on every attempt (failure notice, Try again):** delete the last
  row of `__drizzle_migrations`. Drizzle re-runs that migration against a schema that
  already has it, and it fails every time, retries included. Restore the clean copy
  afterwards.

---

## Version control

The human runs every git command, in a separate terminal. The assistant runs none — not
`init`, `add`, `commit`, `branch`, `push` or `checkout`. When something is worth
committing, the assistant says so and stops. See `DECISIONS.md`, 2026-09-03.
