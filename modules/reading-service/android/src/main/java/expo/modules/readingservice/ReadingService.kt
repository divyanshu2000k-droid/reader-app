package expo.modules.readingservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * THE FOREGROUND SERVICE THAT KEEPS A READING SESSION ALIVE.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Slice 6 believed it had a foreground service for a day. It had a manifest entry naming
 * `expo.modules.notifications.service.NotificationForegroundService`, a class that does not
 * exist in `expo-notifications` and appears nowhere in `node_modules`. The manifest merged,
 * the build succeeded, nothing started it, and the app ran as a CACHED process at
 * `oom_score_adj` 900 — first in line to be killed — while showing an ongoing notification
 * that looked exactly like proof it was protected.
 *
 * Found on a real phone on 2026-09-19 by `dumpsys activity services`, which said `(nothing)`.
 *
 * ─── WHY THE SERVICE OWNS THE NOTIFICATION ───────────────────────────────────
 *
 * `startForeground` REQUIRES the service to hand Android the notification itself. Two
 * notifications — one from the service to satisfy Android, one from JS to show the reader —
 * would mean two entries in the shade. So this is the only thing that posts the timer
 * notification, and `ui/timerNotification.ts` is now a thin wrapper over it.
 *
 * The buttons are native `PendingIntent`s for the same reason: they have to work when no
 * JavaScript is running, which is the entire point of a notification that outlives the app
 * being in front.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * **`START_NOT_STICKY`.** If Android kills the process anyway, this service does not come
 * back by itself. A restarted service would have no JavaScript state, and would either show
 * a frozen notification or invent a duration — and inventing a duration on the reader's
 * behalf is the bug in silent-pass item 9. The launch recovery gate is the designed path
 * back, and it bounds the session by the heartbeat instead of guessing.
 *
 * **It does not tick.** The elapsed time is written into the notification when it is posted
 * and on every state change, never on a timer. See `ui/timerNotification.ts` for that
 * reasoning; a wakeup every second for a number nobody is reading costs the reader battery.
 */
class ReadingService : Service() {

  companion object {
    const val CHANNEL_ID = "reading-timer"
    /** One id, so re-posting REPLACES the notification instead of stacking a second one. */
    const val NOTIFICATION_ID = 1837

    const val ACTION_START = "expo.modules.readingservice.START"
    const val ACTION_STOP = "expo.modules.readingservice.STOP"

    /** What the buttons send back. Kept identical to `TIMER_ACTION` in the TypeScript. */
    const val ACTION_PAUSE = "timer-pause"
    const val ACTION_RESUME = "timer-resume"
    const val ACTION_FINISH = "timer-finish"

    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_RUNNING = "running"

    /** Broadcast to the module when a button is pressed. */
    const val BROADCAST = "expo.modules.readingservice.ACTION"
    const val EXTRA_ACTION = "action"

    /**
     * Where the native heartbeat is written, and how often.
     *
     * Mirrors `HEARTBEAT_MS` in `domain/timerRun.ts`; the two are held equal by
     * `src/ui/__tests__/timerNotification.test.ts`.
     */
    const val PREFS = "reading-service"
    const val KEY_LAST_BEAT = "last_beat"
    const val HEARTBEAT_MS = 30000L
  }

  private var beatThread: HandlerThread? = null
  private var beatHandler: Handler? = null

  override fun onBind(intent: Intent?): IBinder? = null

  /**
   * THE HEARTBEAT, IN NATIVE CODE, AND WHY IT HAD TO MOVE HERE.
   *
   * It used to be a JavaScript `setInterval` in `timerService.ts`. Measured on a phone on
   * 2026-09-19:
   *
   *   screen on, app in front      2 beats / 75s   <- correct
   *   screen on, app BACKGROUNDED  0 beats / 75s
   *   screen off, deep doze        0 beats / 6 min
   *
   * React Native's timers are driven by frame callbacks, and a backgrounded app draws no
   * frames. **So the heartbeat — which exists for exactly one purpose, bounding a kill that
   * happens while the app is in the background — had never once run in the background.**
   * The foreground service keeps the PROCESS alive; it does not make `setInterval` fire.
   *
   * What that cost: `recoveryBoundAt` is `min(lastBeatAt, now)`, so a reader who started a
   * timer and put the phone in their pocket for an hour, and was then killed by an
   * aggressive OEM, would be offered the seconds before they locked the screen. Not a lost
   * row — a lost evening, presented as a considered number.
   *
   * A `HandlerThread` is an ordinary background thread with its own looper. It has nothing
   * to do with frames, and Doze does not suspend a running foreground service's threads.
   */
  private fun startBeating() {
    if (beatThread != null) return
    val thread = HandlerThread("reading-heartbeat").apply { start() }
    val handler = Handler(thread.looper)
    beatThread = thread
    beatHandler = handler
    val tick = object : Runnable {
      override fun run() {
        beat()
        handler.postDelayed(this, HEARTBEAT_MS)
      }
    }
    handler.post(tick)
  }

  private fun beat() {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putLong(KEY_LAST_BEAT, System.currentTimeMillis())
      .apply()
  }

  private fun stopBeating() {
    beatHandler?.removeCallbacksAndMessages(null)
    beatHandler = null
    beatThread?.quitSafely()
    beatThread = null
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      ReadingServiceState.running = false
      stopBeating()
      // The session is over, so the bound is meaningless now. Leaving it behind would let a
      // LATER session inherit a heartbeat from this one.
      getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LAST_BEAT).apply()
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Reading"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: ""
    val running = intent?.getBooleanExtra(EXTRA_RUNNING, true) ?: true

    ensureChannel()
    val notification = build(title, body, running)

    // Android 14 demands the type at the call site as well as in the manifest. Passing it
    // only in the manifest throws MissingForegroundServiceTypeException at runtime.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    ReadingServiceState.running = true
    startBeating()
    return START_NOT_STICKY
  }

  private fun ensureChannel() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // LOW: visible and silent. A timer that buzzes every time you pause is a timer the
    // reader turns off, and turning it off is how they lose the service.
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Reading timer",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun actionIntent(action: String): PendingIntent {
    val intent = Intent(BROADCAST)
      .setPackage(packageName)
      .putExtra(EXTRA_ACTION, action)
    return PendingIntent.getBroadcast(
      this,
      action.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Tapping the notification itself opens the app where it left off. */
  private fun contentIntent(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    return PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun build(title: String, body: String, running: Boolean): Notification {
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(applicationInfo.icon)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSilent(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      // Visible on the lock screen: the reader's phone is locked in a pocket for most of a
      // session, which is exactly when they want Pause within reach.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

    contentIntent()?.let { builder.setContentIntent(it) }

    if (running) {
      builder.addAction(0, "Pause", actionIntent(ACTION_PAUSE))
    } else {
      builder.addAction(0, "Resume", actionIntent(ACTION_RESUME))
    }
    builder.addAction(0, "Finish", actionIntent(ACTION_FINISH))
    return builder.build()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  override fun onDestroy() {
    ReadingServiceState.running = false
    stopBeating()
    stopForegroundCompat()
    super.onDestroy()
  }
}
