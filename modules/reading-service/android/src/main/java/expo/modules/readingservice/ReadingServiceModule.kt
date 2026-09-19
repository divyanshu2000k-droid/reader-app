package expo.modules.readingservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript end of the foreground service.
 *
 * Four things only: start it, update what it says, stop it, and forward the notification's
 * buttons back to JS. Every decision about WHAT the timer is doing stays in
 * `features/timer/timerService.ts`; this moves bytes across the bridge and nothing else.
 *
 * The receiver is registered for the whole lifetime of the module rather than per-session,
 * because a button can be pressed at any moment — including while the reader is somewhere
 * else entirely in the app.
 */
class ReadingServiceModule : Module() {

  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "no React context" }

  override fun definition() = ModuleDefinition {
    Name("ReadingService")

    Events("onAction")

    OnCreate {
      val filter = IntentFilter(ReadingService.BROADCAST)
      val listener = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          val action = intent?.getStringExtra(ReadingService.EXTRA_ACTION) ?: return
          this@ReadingServiceModule.sendEvent("onAction", mapOf("action" to action))
        }
      }
      // NOT_EXPORTED: the only sender is our own service, in our own process. An exported
      // receiver would let any app on the phone pause or finish the reader's session.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(listener, filter)
      }
      receiver = listener
    }

    OnDestroy {
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }

    /**
     * Start the service, or replace what an already-running one is showing.
     *
     * `startForegroundService` rather than `startService`: from Android 8 the latter is not
     * allowed to start something that will call `startForeground`, and the difference only
     * shows up when the app is not in front — which is every interesting case here.
     */
    Function("start") { title: String, body: String, running: Boolean ->
      val intent = Intent(context, ReadingService::class.java)
        .setAction(ReadingService.ACTION_START)
        .putExtra(ReadingService.EXTRA_TITLE, title)
        .putExtra(ReadingService.EXTRA_BODY, body)
        .putExtra(ReadingService.EXTRA_RUNNING, running)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("stop") {
      val intent = Intent(context, ReadingService::class.java)
        .setAction(ReadingService.ACTION_STOP)
      // stopService, not startForegroundService: a service that is already gone must not be
      // started again just to be told to stop, which on Android 14 is an ANR waiting to
      // happen (a started FGS that never calls startForeground is killed with a crash).
      context.stopService(intent)
    }

    /** For the device checks, and for a dev log that can say what Android actually thinks. */
    Function("isRunning") {
      ReadingServiceState.running
    }

    /**
     * The last moment the native heartbeat proved the app was alive, or 0.
     *
     * Read at launch by the recovery gate, which takes the LATER of this and the heartbeat
     * stored in the run. The JavaScript one stops the moment the app is backgrounded — which
     * is the only situation either of them exists for — so in practice this is the one that
     * carries the bound. See `ReadingService.startBeating`.
     */
    Function("lastNativeBeat") {
      context
        .getSharedPreferences(ReadingService.PREFS, Context.MODE_PRIVATE)
        .getLong(ReadingService.KEY_LAST_BEAT, 0L)
        .toDouble()
    }
  }
}

/** Set by the service itself, so `isRunning` reports Android's view rather than JS's. */
object ReadingServiceState {
  @Volatile
  var running: Boolean = false
}
