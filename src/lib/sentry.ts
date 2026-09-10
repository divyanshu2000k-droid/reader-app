/**
 * src/lib/sentry.ts
 *
 * The only file that imports the Sentry SDK.
 *
 * Tier 3 of the error contract in docs/06-CONVENTIONS.md: "unrecoverable → error boundary
 * with a restart, reported to Sentry". This is the reporting half.
 *
 * EVERY FUNCTION HERE IS A NO-OP WITHOUT A DSN, and that is load-bearing rather than
 * defensive. A fresh clone has no `.env`, and the app has to build, launch and behave
 * identically without one — otherwise "does it work without Sentry configured?" becomes a
 * question nobody asks until a contributor's first run crashes on the launch path.
 *
 * `init()` is called once from the root layout. It is deliberately not called at module
 * import: a throw during import is an unrecoverable module-load crash that no error
 * boundary can catch, which is the same reasoning that made the database open lazily.
 */

import * as Sentry from '@sentry/react-native'

import { config } from './config'
import type { AppError } from './result'

let started = false

/** True when a DSN was configured and `init()` succeeded. Drives the UI's "reported" copy. */
export function isReporting(): boolean {
  return started
}

/**
 * Start Sentry, once. Safe to call when no DSN exists — it does nothing and says so.
 *
 * Wrapped in try/catch because this runs on the launch path: a misconfigured DSN string
 * must degrade to "no crash reporting", never to "the app does not start". Losing
 * telemetry is an inconvenience; failing to launch is the whole product.
 */
export function initSentry(): void {
  if (started || !config.sentryDsn) return
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      // Errors only for now. Performance tracing is a separate decision with its own
      // quota cost, and nothing in Phase 1 reads a trace.
      tracesSampleRate: 0,
      // In development, report to the console rather than to the project's quota — the
      // free tier is 5000 events a month and a reload loop can spend it in an afternoon.
      enabled: !__DEV__,
      // The app is offline-first. Sentry's own queue retries when the network returns.
      enableAutoSessionTracking: true,
    })
    started = true
  } catch (cause) {
    console.warn('[sentry] init failed, continuing without crash reporting:', cause)
  }
}

/**
 * Report something that has already been caught and handled as unrecoverable.
 *
 * This exists because the failures that matter most in this app are the ones that DO NOT
 * throw past a boundary: a migration that failed and rolled back, a backup that could not
 * be written. They are returned as an `AppError`, handled, and shown to the reader — and
 * without an explicit call here they would never reach Sentry at all, because there is no
 * uncaught exception for the SDK to observe.
 *
 * Never throws. A reporting failure must not become the error.
 */
export function reportUnrecoverable(error: AppError, context?: Record<string, string>): void {
  // Log regardless of whether Sentry is configured. On a dev machine and on any build
  // without a DSN this is the only record that the failure happened at all.
  console.error(`[unrecoverable] ${error.message}`, error.cause ?? '', context ?? '')
  if (!started) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('tier', error.tier)
      scope.setContext('appError', {
        message: error.message,
        safe: error.safe ?? null,
        ...context,
      })
      // Prefer the underlying cause: its stack points at the real failure, while the
      // AppError was constructed at the handling site and its stack points here.
      Sentry.captureException(
        error.cause instanceof Error ? error.cause : new Error(error.message),
      )
    })
  } catch (cause) {
    console.warn('[sentry] report failed:', cause)
  }
}

/**
 * Report an error caught by a React error boundary — a render that threw.
 *
 * Separate from `reportUnrecoverable` because there is no `AppError` here: nobody
 * anticipated this one, which is exactly what makes it worth reporting.
 */
export function reportBoundaryError(error: Error, componentStack?: string): void {
  console.error('[boundary]', error, componentStack ?? '')
  if (!started) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('tier', 'unrecoverable')
      scope.setTag('source', 'errorBoundary')
      if (componentStack) scope.setContext('react', { componentStack })
      Sentry.captureException(error)
    })
  } catch (cause) {
    console.warn('[sentry] report failed:', cause)
  }
}
