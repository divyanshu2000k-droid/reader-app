/**
 * plugins/withReadingService.js
 *
 * The Android permissions a reading timer needs to survive being backgrounded.
 *
 * ─── THIS FILE USED TO DECLARE A SERVICE THAT DID NOT EXIST ──────────────────
 *
 * Until 2026-09-19 it also added a `<service>` entry naming
 * `expo.modules.notifications.service.NotificationForegroundService`, above a comment that
 * said "the class itself comes from the library". **That class is not in
 * `expo-notifications`** — the package ships `NotificationsService`,
 * `ExpoFirebaseMessagingService` and `NotificationForwarderActivity`, and the name appears
 * nowhere in `node_modules`. The manifest merged, the build succeeded, nothing started it,
 * and on a real phone `dumpsys activity services` returned `(nothing)` while the process sat
 * at `oom_score_adj` 900 — first in line to be killed.
 *
 * The lesson is about what a config plugin can and cannot do. **A plugin can only ever
 * declare.** Something has to BE the service. It is now `modules/reading-service`, a local
 * Expo module wrapping a real Kotlin `Service`, and the `<service>` element lives in that
 * module's own `AndroidManifest.xml` next to the class it names — so the two cannot drift
 * apart again without the module failing to compile.
 *
 * ─── WHAT IS LEFT HERE, AND WHY ──────────────────────────────────────────────
 *
 * The permissions, which are an app-level concern rather than a module-level one:
 *
 *   - `FOREGROUND_SERVICE` — the base permission, required since Android 9.
 *   - `FOREGROUND_SERVICE_SPECIAL_USE` — since Android 14 every foreground service must
 *     declare a TYPE, and a reading timer is none of the listed ones: not location, not media
 *     playback, not a data sync. `specialUse` is the honest answer, and it is the one that
 *     requires a written justification at Play review. **Forgetting that justification is a
 *     rejection, not a warning** — it is in the submit checklist in `05-BUILD-PLAN.md`, and
 *     the module's manifest carries it as `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`.
 *   - `POST_NOTIFICATIONS` — since Android 13 the notification itself must be granted. The
 *     service still RUNS when it is denied; the reader just cannot see or control it.
 *
 * They are declared in both places on purpose: the module's manifest so the module is
 * self-contained, and here so the app's own manifest states what it asks the reader for.
 * Duplicate `uses-permission` entries merge to one.
 *
 * ─── WHAT IS NOT PROVEN ──────────────────────────────────────────────────────
 *
 * The service is verified on a Nothing Phone 2a, which is near-stock AOSP and therefore the
 * FLOOR for this risk, not the test of it. Xiaomi, Samsung and OnePlus kill background work
 * far more aggressively, which is the highest-risk item in Phase 1 and the entire reason the
 * timer has a two-week limit. `docs/device-checks/slice-6.md` has the measurements.
 */

const { AndroidConfig } = require('expo/config-plugins')

const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
]

module.exports = function withReadingService(config) {
  return AndroidConfig.Permissions.withPermissions(config, PERMISSIONS)
}
