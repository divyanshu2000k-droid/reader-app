/**
 * src/lib/result.ts
 *
 * Fallible operations return a Result rather than throwing. Throwing is reserved for
 * genuinely unrecoverable states. See docs/06-CONVENTIONS.md.
 */

export type Result<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * The three error tiers from docs/06-CONVENTIONS.md. The tier decides how it is shown:
 * recoverable gets an inline retry, offline gets a banner and never a modal, and
 * unrecoverable gets the error boundary and a Sentry report.
 */
export type ErrorTier = 'recoverable' | 'offline' | 'unrecoverable'

export interface AppError {
  readonly tier: ErrorTier
  /** What happened, in the reader's terms. Never a code, never "Oops". */
  readonly message: string
  /**
   * What is still safe. Error copy must always say this, because the most common fear
   * in this category is that something was lost.
   */
  readonly safe?: string
  readonly cause?: unknown
}

export function appError(
  tier: ErrorTier,
  message: string,
  options: { safe?: string; cause?: unknown } = {},
): AppError {
  return { tier, message, safe: options.safe, cause: options.cause }
}

/** Runs a throwing operation and captures the failure as a Result. */
export async function attempt<T>(
  fn: () => Promise<T>,
  onError: (cause: unknown) => AppError,
): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (cause) {
    return err(onError(cause))
  }
}
