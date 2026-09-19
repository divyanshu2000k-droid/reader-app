# Slice 6 · the timer · phone checks

**Status, 2026-09-19: RUN ON A REAL PHONE (Nothing Phone 2a, Android 16).** The sheet below
is now a record, not a plan. Read "What the phone found" first — the headline is that the
foreground service this slice is built around **did not exist**, and item 1 is what found it.

The emulator verified the arithmetic, the screens and the crash-recovery path. It could not
verify the one thing this slice is risky for, and it did not.

> **A Nothing Phone 2a is near-stock AOSP: the FLOOR for the background-kill risk, not the
> test of it.** MIUI, One UI and ColorOS are all more aggressive. `05-BUILD-PLAN.md` calls
> this "the single highest-risk item in Phase 1 and the entire reason the timer has a
> two-week hard limit". Validating it needs a Xiaomi or Samsung, via beta testers.

---

## What the phone found, 2026-09-19

**1. THE FOREGROUND SERVICE DID NOT EXIST.** `plugins/withReadingService.js` declared a
`<service>` naming `expo.modules.notifications.service.NotificationForegroundService`, above
a comment reading "the class itself comes from the library". That class is not in
`expo-notifications`, is not in `node_modules`, and appeared **0 times in the built APK's
dex**. The manifest merged, the build succeeded, nothing started it.

| | before | after |
|---|---|---|
| `dumpsys activity services` | `(nothing)` | `ServiceRecord … isForeground=true` |
| process state, backgrounded | `cch b/ /LAST (previous-expired)` | `fg +50 F/S/FGS (fg-service-act)` |
| `oom_score_adj`, backgrounded | **900** — first to be killed | **50** |

`s6_notification.py` passed 5/5 the whole time, because an ongoing notification looks
identical whether or not a service is behind it. **The fix is `modules/reading-service`**, a
local Expo module wrapping a real Kotlin `Service`. A config plugin can only DECLARE;
something has to BE the service.

**2. The first timed session a reader ever runs got no notification at all.** The priming
sheet comes after the timer starts, so the first post is always refused for want of the
permission, and nothing retried. Measured: granted, timer running, 60 s of polling, zero
notifications.

**3. The `AppState` listener was still in the screen** — audit finding 1 living on inside its
own fix.

**4. "Not now" was not remembered**, so the sheet returned on every new timer.

**5. The notification's Finish button was wired to nothing.** The listener handled `pause`
and `resume` and fell through on `finish`. It was built, photographed in the shade, and
written up as working.

All five are fixed, and each has a check that was watched failing first. See `DECISIONS.md`
and CLAUDE.md items 21 and 22.

---

---

## Everything is built. Nothing is proven.

The three items that were missing earlier on 2026-09-18 are done:

- **Foreground service**, declared with its Android 14 `specialUse` type, the Play
  justification property, and `stopWithTask="false"` so swiping from Recents does not end it.
- **Notification** on its own silent channel, ONGOING, carrying **Pause** and **Finish**.
- **Permission priming**, shown after the timer starts, with "Not now" as an equal.

The blocker was drift, not an incompatibility: the npm tree held `react-dom` one minor ahead
of what Expo SDK 57 itself pins, so `"overrides": { "react-dom": "19.2.3" }` fixed it. See
`DECISIONS.md`, 2026-09-18.

**Three silent bugs sat between "written" and "working", and none of them threw:**

1. **The notification was never presented.** `expo-notifications` suppresses presentation in
   the foreground unless `setNotificationHandler` opts in, and a timer screen is by definition
   foregrounded. `dumpsys notification` had no record for the package at all.
2. **It was on the wrong channel.** `channelId` lives on the TRIGGER; `trigger: null` has
   nowhere to put it, so Android used Expo's fallback channel at importance 4 — one that can
   pop a heads-up. `trigger: { channelId }` fixes it.
3. **It came back after Finish.** The clear ran, then `setRun` fired the effect that posts it.
   A paused timer stayed in the shade after its session ended.

All three were found by reading `dumpsys` and looking at the shade — not by any test.

---

## What the emulator DID check, and passed

Run `python scripts/device/s6_timer.py` and `s6_recovery.py`; both pass on Pixel_7_API_36.

- **Start writes the session row first.** A crash one second in leaves a record.
- **Reopening resumes the same timer** and does not start a second. Exactly one open timed
  session at all times.
- **Pause stops the clock; Resume restarts it.** Held at 34s across 6 seconds paused.
- **Finish saves a duration matching the screen** (54s saved against 48s shown — the
  difference is the script's own dump latency, which is real elapsed reading), lands on
  Session complete, leaves 0 open sessions and clears the timer's local record.
- **Killing the app mid-timer raises the recovery sheet**, which is Slice 1's gate meeting a
  real timed session for the first time.
- **THE DECISIVE ONE** (`s6_overnight.py`): a 53-second session, app force-stopped and left
  shut for **4 minutes**, reopened. The wall clock would say ~5 minutes. **The sheet offered
  1 minute.** The heartbeat bound reaches the reader.
- **The notification** (`s6_notification.py`, 5/5): posted on `channel=reading-timer` with
  `flags=ONGOING_EVENT|SILENT` and `actions=2`; the text changes to "paused at 00:20" on
  Pause; it is cleared when the session ends. The button LABELS are not in `dumpsys` — Android
  does not print them — so they were read off a screenshot of the expanded shade, which showed
  **Pause** and **Finish** under "Reader · Reading · Late Garden in Translation · 00:00 so
  far", filed under **Silent**.
- **Filed, not fixed:** the notification is COLLAPSED by default, so Pause needs an expand
  first. Ordinary for a LOW-importance channel, and the trade is deliberate — a higher
  importance would pop a heads-up mid-paragraph — but it is one more gesture than the artboard
  implies. Decide on the phone.

---

## On the phone

### 0. First, the automatic checks

**Setup that cost three runs last time, so do it in this order:**
1. Kill anything on 8081 AND 8082.
2. For the device pass: `EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --dev-client --clear` on
   **8081**, not 8082. A dev client built by `expo run:android` remembers the LAN URL
   (`192.168.x.x:8081`) and IGNORES `adb reverse`, so `devpass.sh`'s 8082 Metro is bypassed
   and the pass silently runs the ORDINARY bundle, logging nothing at all.
3. For the screen checks: `EXPO_PUBLIC_SANDBOX_DB=1 npx expo start --dev-client --clear`.
4. A Gradle rebuild needs `TEMP="C:\gtmp" TMP="C:\gtmp"` or it dies with "Unable to establish
   loopback connection".

- `npm test` — expect **478**, and `npm run test:tz` for the three zones.
- `python scripts/device/mutate_s6.py` — expect **15/15 red**.
- The device pass, which does not cover the timer yet: expect RUNTIME 36/36.
- The emulator scripts, which should all still pass on a phone:
  `s6_timer.py` (5), `s6_recovery.py` (4), `s6_notification.py` (5), `s6_overnight.py`,
  `s6_deleted_book.py` (5), and `s6_audit_background.py` — the last of which is the one that
  found the architectural defect and must keep reporting "HEARTBEAT KEPT BEATING".
- **Device pass expects RUNTIME 38/38** now that checks 19 and 20 exist. It has been running
  37/38 on the emulator, failing `14c` (the cover download). **That failure is UNEXPLAINED** —
  attributed to the emulator's network and not proven. If it fails on the phone too, it is not
  the network and it needs chasing.
- `python scripts/device/devpass_s6_mutations.py` — expect **4/4 red** for checks 19 and 20.

### 0b. The permission prompt, which the emulator was granted around
The emulator runs were granted `POST_NOTIFICATIONS` with `pm grant`, so **the priming sheet
and the real system dialog have never been seen**. On the phone: uninstall, reinstall, start a
timer, and check the sheet appears BEFORE the system prompt, that "Not now" leaves the timer
running, and that declining does not ask again.

### 1. The thing the emulator cannot do · **the highest-value hour in this slice**
1. Start a timer on a real book.
2. **Lock the screen and put the phone in your pocket for 20 minutes.** Do not look at it.
3. Unlock. **Is the timer still running, and is the elapsed time right?**
4. Repeat with the app swiped away from Recents.
5. Repeat after **Settings → Battery → restrict background** for the app, which is what a
   Xiaomi does to anything it does not recognise.
6. **Record which of the four survived**, with numbers. This is the measurement that decides
   whether the two-week limit gets invoked.

### 2. Against the reader's own clock
1. Start a timer, note the wall-clock time.
2. Read for a genuine 10 to 15 minutes.
3. Finish. **The saved duration must match your own watch**, not merely look plausible.
4. Pull the database and check `duration_seconds` against what Session complete showed.

### 3. Pause across a background
1. Start, read 2 minutes, **Pause**.
2. Background the app for 5 minutes.
3. Return. **The clock must still read 2 minutes**, not 7. Paused time is not reading, and
   this is the case where a wall-clock implementation would be caught.

### 4. The overnight case, for real
1. Start a timer at night, read for a few minutes, lock the phone and leave it.
2. In the morning, force-stop the app, then open it.
3. **The sheet must offer a few minutes, not the whole night.** The emulator proved this at a
   4-minute scale; a real overnight is the case the copy was written for.

### 5. Two books, and a deleted one
1. Start a timer on book A. Without finishing, open book B — **Start timer must show A's
   timer**, not start a second.
2. While a timer runs, remove the book from another screen. The open question in
   `04-SCREENS.md` is exactly this: *"What happens when a book is deleted while its timer is
   running?"* Record what happens; decide and write it in `DECISIONS.md`.

### 6. The screen
1. **Light mode**, the ring and the clock.
2. **The largest font and 360 dp** — the clock is `displayLg` (68px) and is the most likely
   thing in the app to overflow. This is a font-pass item that should NOT wait for Slice 11.
3. The ring past an hour: it must **hold full**, not wrap.

### 7. Battery
Run a timer for an hour and check Android's battery attribution. A 30-second heartbeat is 120
tiny local writes an hour; that should be invisible, but "should be" is not a measurement.

---

## Fixed since this sheet was written, and therefore unproven on a phone

Everything below was built and verified on an EMULATOR on 2026-09-18/19. None of it has met
real hardware:

- **The timer's runtime moved out of its screen** (`timerService.ts`). Leaving the timer
  screen used to stop the heartbeat, the notification and its Pause button. **Item 1 below is
  the check that this actually fixed it.**
- **The foreground service, the notification with Pause/Finish, and permission priming** —
  all three were missing when this sheet was first written.
- **A book removed mid-timer** now stops the timer and says where the session went.
- **`metadata_cache` is swept at launch**; orphaned drafts and runs are removed, live drafts
  never are.
- **Device checks 19 and 20** cover timed sessions, which nothing did before.

## The order for tomorrow

1. **Item 0** — the automatic checks, with the Metro setup above.
2. **Item 1** — twenty minutes with the phone locked in a pocket. **This is the hour that
   matters**, and it is only meaningful now that the runtime survives navigation.
3. **Item 0b** — the permission prompt, which has never been seen (the emulator was granted
   around it with `pm grant`).
4. Items 2 to 7.
5. **Then, and only then, commit.** Slice 6 is not done until this sheet is.

## Recorded, 2026-09-19 · Nothing Phone 2a (A142), Android 16

Every number here was measured on the phone. Where something was not run, it says so.

### The automatic checks
| | result |
|---|---|
| `npm test` | **506 pass** (was 478 at the start of the day) |
| `npm run test:tz` | 121 in each of three zones |
| typecheck · lint · Prettier | clean |
| `mutate_s6.py` | **22/22 red** |
| `devpass_s6_mutations.py` | **4/4 red** (checks 19 and 20) |
| device pass | **RUNTIME 38/38 · COMPILE-TIME 1/1** |
| `reader.db` md5, before and after | `1623cf85…` / wal `6ab7bff2…` — **identical** |

**`14c` is explained and closed.** It had been failing on the emulator and was written up here
as UNEXPLAINED. On the phone it passed: "cover saved locally (16679 B), metadata kept (272
pages)". It was the emulator's network.

### The device scripts
`s6_timer` 5/5 · `s6_recovery` 4/4 · `s6_notification` 5/5 · `s6_overnight` pass ·
`s6_deleted_book` 5/5 · `s6_late_grant` 4/4 · `s6_prime_once` 4/4 ·
`s6_foreground_service` 5/5 · `s6_restricted_recovery` 5/5 · `s6_permission` (item 0b, first
and only run on a fresh install) · `s6_audit_background`: **"HEARTBEAT KEPT BEATING
off-screen"**, 3 minutes open → 2 offered, against 1 before the audit fix.

The notification's flags now read
`ONGOING_EVENT|ONLY_ALERT_ONCE|NO_CLEAR|FOREGROUND_SERVICE|SILENT`. The
`FOREGROUND_SERVICE` flag is Android saying the notification belongs to a real service — it
was absent all day yesterday and nobody looked.

### Item 0b · the permission prompt, seen for the first time
Driven on a fresh install with the permission still `undetermined`. The timer starts FIRST
and the sheet follows; the system dialog was not spent before the reader was told what it
buys them; it reads **"Allow Reader to send you notifications?"**; "Not now" leaves the timer
running and the permission untouched. Three bugs came out of this one run — see the findings
at the top of this sheet.

### Item 1 · the phone locked, in a pocket · **the hour that mattered**
20 minutes, screen off, `battery unplug`, `deviceidle force-idle`, 13 samples. Run twice:
once against the build as it arrived, once against the fixed one.

| | before the fix | after |
|---|---|---|
| `dumpsys activity services` | `(nothing)` at every sample | `foreground` at **13 of 13** |
| notification | present (and meaningless) | present at **13 of 13** |
| backgrounded `oom_score_adj` | **900** (`cch`, first killed) | **50** (`fg-service-act`) |
| native heartbeat at the end | did not exist | **11 s old** |
| verdict | DID NOT SURVIVE | **SURVIVED** |

**Do not read the "before" run's heartbeat number as a measurement.** It reported the stored
beat 19.7 minutes in, which looks like twenty minutes of beating and is not: the script wakes
the device and clears doze before reading the database, and a single catch-up beat at that
moment is indistinguishable from having beaten throughout. That is what `s6_heartbeat_doze.py`
was written to settle, and it settled it the other way.

**Variants:**
- **Swiped off Recents: SURVIVED.** Service still foreground, notification still up, native
  heartbeat 27 s old. `stopWithTask="false"` does what it claims.
- **Background usage restricted: KILLED at 67 s.** Android demoted the service the instant
  the restriction was applied, then removed it. This cannot be prevented — the phone's owner
  asked for it — and it is what made the recovery-cap bug visible. Run with the screen on:
  doze is not the variable in that mode, and a locked run ends at a PIN this session cannot
  answer.

### The heartbeat, measured from logcat rather than the database
| | JS heartbeat | native |
|---|---|---|
| app in front | 2 / 75 s ✓ | — |
| backgrounded, screen on | **0 / 75 s** | — |
| screen off, deep doze 6 min | 0, then erratic | **12 s old at the end** |

React Native's timers need frames. The JavaScript heartbeat had never run in the background,
which is the only place it was ever for. It is a `HandlerThread` in the service now.

### Items 2, 3, 5 and 6 · the ordinary cases
- **2. Against a real clock:** saved **196 s**, screen showed **192 s**, Session saved said
  "3m". Four seconds apart, which is the script's own dump latency.
- **3. Pause across a background:** **67 s when paused, 67 s after 60 s backgrounded, drift
  0.** Paused time is not reading, and this is the case a wall-clock implementation fails.
- **5. Two books:** Start timer on the second book showed the running timer for the first.
  One open timed session throughout. The deleted-book case is `s6_deleted_book.py`, 5/5.
- **6. The screen — AUDIT FINDING 6 IS CLOSED.** The `displayLg` clock at **200% font**
  (where `rules.maxFontScale` caps it) and at **360 dp** (density 482): clock at
  `[276..806]` of 1084 px, Pause and Finish both on screen. Checked in dark and light. The
  ring past an hour is still only covered by `timerState.test.ts`, not by eye.

### Item 7 · what the timer costs
`batterystats` over exactly the final 20-minute locked run:

    UID u0a661: 60.3   screen=60.1  cpu=0.186
      (on battery, screen off/doze)  cpu:bg=0.0341

**0.034 mAh of CPU for 20 minutes of timer in deep doze** — roughly 0.1 mAh an hour, about
0.002% of a 5000 mAh battery. The 60.1 is the SCREEN, attributed to whichever app is in
front. The 30-second heartbeat is invisible, and that is now a number rather than a hope.

### Found here, filed not fixed
**Changing the system font size restarts the app.** `MainActivity`'s `configChanges` omits
`fontScale` and `density`, so changing either destroys the activity; with a timer running the
reader comes back to the recovery sheet. App-wide and true since Slice 0 — filed against
Slice 11's font pass (`DECISIONS.md`, 2026-09-19). Found because the item 6 script reported
"NO CLOCK ON SCREEN" three times, which was true and was not the overflow it looked like.

### Still not run, and why
- **Item 4, a real overnight.** `s6_overnight.py` proves the mechanism at a 4-minute scale
  and the native heartbeat now carries it, but a genuine night has not been left. Worth one.
- **The ring past an hour**, by eye. Held by a unit test only.
- **Item 7 across a full hour.** Measured across 20 minutes; the rate is so low that an hour
  would not change the conclusion, but it has not been sat through.
- **A Xiaomi or Samsung.** This phone is near-stock AOSP and is the FLOOR. The restricted run
  is the closest stand-in and it is not the same thing. Beta testers before launch.

## Record here
Counts and numbers, not impressions. Anything found goes into `DECISIONS.md` the same day.
