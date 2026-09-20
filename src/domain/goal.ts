/**
 * src/domain/goal.ts
 *
 * THE YEARLY GOAL'S RULES. Pure, so they are asserted under `node --test`.
 *
 * In `domain/` rather than in `features/settings` because TWO features need it and features
 * may not import from one another (06-CONVENTIONS): Settings writes the goal, and Stats
 * draws the progress. It lived in the feature for about an hour, and Stats reached across
 * with a relative import that the ESLint rule did not catch.
 *
 * ─── A GOAL IS OPTIONAL, AND CLEARING IT IS NOT AN ERROR ─────────────────────
 *
 * `03-DATA-MODEL.md`: "Pages and hours are always tracked whether or not a goal exists.
 * Never gate statistics behind setting a target." So an empty field is a valid answer
 * meaning "I do not want one", not a validation failure to argue with. That is the
 * difference between a tool and a chore.
 *
 * ─── AND WHY IT ONLY COUNTS BOOKS ────────────────────────────────────────────
 *
 * `goals` has one target column, `target_books`, and it stays that way. A pages target and
 * an hours target would each need their own copy of the "never add these together" rule, and
 * a reader who set all three would be shown three progress bars that disagree about whether
 * they are on track. One number, clearly labelled.
 */

/** Above this, a goal is a typo rather than an ambition. */
export const GOAL_MAX = 3650

export type GoalCheck =
  | { readonly ok: true; readonly target: number | null }
  | { readonly ok: false; readonly reason: string }

/**
 * What the reader typed, as a target, or why it cannot be one.
 *
 * `null` for an empty field, which CLEARS the goal. Whole books only: "twelve and a half
 * books" is not a thing anyone means, and an INTEGER column would silently round it.
 */
export function checkGoal(input: string): GoalCheck {
  const text = input.trim()
  if (text === '') return { ok: true, target: null }
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'Whole books only' }
  const target = Number(text)
  // Refused rather than accepted-and-ignored: a reader who types 0 means "none", and the
  // way to mean none is to leave it empty, which the field says.
  if (target < 1) return { ok: false, reason: 'At least one book, or leave it empty' }
  if (target > GOAL_MAX) return { ok: false, reason: `That is more than ${GOAL_MAX}` }
  return { ok: true, target }
}

export interface GoalProgress {
  readonly target: number
  readonly finished: number
  /** 0 to 1, clamped. The bar's width. */
  readonly fraction: number
  readonly met: boolean
  /** Books still to go, never negative. */
  readonly remaining: number
}

/**
 * Where the reader is against their goal.
 *
 * **Clamped at 1, and `met` is separate.** Reading 30 books against a goal of 12 is a bar
 * that is full, not a bar drawn two and a half times across the screen — and the number
 * beside it still says 30, so nothing is hidden.
 */
export function goalProgress(target: number, finished: number): GoalProgress | null {
  if (!Number.isFinite(target) || target < 1) return null
  const done = Number.isFinite(finished) ? Math.max(0, finished) : 0
  return {
    target,
    finished: done,
    fraction: Math.max(0, Math.min(1, done / target)),
    met: done >= target,
    remaining: Math.max(0, target - done),
  }
}

/** "3 of 12 books" / "12 of 12 books — done". The label beside the bar. */
export function goalLabel(progress: GoalProgress): string {
  const books = progress.target === 1 ? 'book' : 'books'
  if (progress.met) return `${progress.finished} of ${progress.target} ${books} · done`
  return `${progress.finished} of ${progress.target} ${books}`
}
