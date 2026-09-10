/**
 * src/lib/strings.ts
 *
 * Copy that REPEATS or must stay consistent: button labels, error messages, empty
 * states, confirmations, the free-tier promise wording. Screen-specific prose stays
 * inline where you can read it in context.
 *
 * The reason is consistency, not localisation. "Not now" versus "Not right now" versus
 * "Later" across three sheets is drift nobody notices individually and everybody feels.
 *
 * Error copy rule: say what happened, say what is still safe, offer the next action.
 * Never a code, never "Oops", never blame the network without saying the library is
 * untouched.
 */

export const actions = {
  save: 'Save',
  cancel: 'Cancel',
  done: 'Done',
  notNow: 'Not now',
  tryAgain: 'Try again',
  undo: 'Undo',
  delete: 'Delete',
  remove: 'Remove',
  edit: 'Edit',
  addManually: 'Add manually',
  startReading: 'Start reading',
  logSession: 'Log a session',
  startTimer: 'Start timer',
  finishBook: 'I finished the book',
  restore: 'Restore',
} as const

export const errors = {
  searchUnavailable: {
    message: 'Could not reach the book database',
    safe: 'Your library is fine. This is only the search.',
  },
  offline: {
    message: 'Offline. Logging still works, syncing later.',
  },
  sessionSaveFailed: {
    message: 'Could not save that session',
    safe: 'Nothing else in your library changed. Try again.',
  },
  importFailed: {
    message: 'Could not read that file',
    safe: 'Your library is untouched. Nothing was imported.',
  },
  unrecoverable: {
    message: 'Something went wrong',
    safe: 'Your library is saved on this phone and was not affected.',
  },
} as const

export const empty = {
  library: {
    title: 'No books yet',
    body: 'Add your first book, or bring your shelves over from Goodreads.',
    action: 'Add a book',
  },
  currentlyReading: {
    title: 'Nothing on the go',
    body: 'Start a book and it will show up here.',
    action: 'Add a book',
  },
  sessions: {
    title: 'No sessions yet',
    body: 'Log one for any day, including days that have already passed.',
    action: actions.logSession,
  },
  notes: {
    title: 'No notes yet',
    body: 'Save a quote or a thought while you read.',
    action: 'Add a note',
  },
  stats: {
    title: 'Not enough to chart yet',
    body: 'Log a few sessions and your pace will appear here. Nothing is locked.',
    action: actions.logSession,
  },
  trash: {
    title: 'Nothing deleted',
    body: 'Anything you remove waits here for 30 days.',
  },
} as const

export const confirm = {
  deleteBook: {
    title: 'Remove this book?',
    body: 'It moves to Recently Deleted for 30 days. Your sessions are kept.',
    action: actions.remove,
  },
  deleteSession: {
    title: 'Delete this session?',
    body: 'You can undo this for a few seconds.',
    action: actions.delete,
  },
  discardChanges: {
    title: 'Discard changes?',
    body: 'What you typed will not be saved.',
    action: 'Discard',
  },
} as const

/**
 * Tab labels and screen titles. Each name appears in more than one place (a tab, its
 * screen's header, an accessibility label on the button that opens it), so a rename made
 * in one of them used to leave the others behind.
 */
export const nav = {
  library: { tab: 'Library', title: 'The library' },
  add: { tab: 'Add', title: 'Add a book' },
  stats: { tab: 'Stats', title: 'Stats' },
  settings: { title: 'Settings' },
} as const

export const toasts = {
  sessionDeleted: 'Session deleted',
  bookRemoved: 'Book removed',
  noteDeleted: 'Note deleted',
  bookRestored: 'Book restored',
} as const

/**
 * The four launch gates and the error boundary.
 *
 * These live here rather than inline because they are the app's highest-stakes copy: the
 * reader is looking at one of them on their worst day, and three of the four cannot be
 * dismissed. They must say what happened, what is still safe, and what to do — the error
 * copy rule at the top of this file, applied where it matters most.
 */
export const launch = {
  update: {
    title: 'Time for an update',
    /** Overridable by the remote flag, so an incident can explain itself specifically. */
    body: 'This version has a problem that could affect your reading history, so we have retired it. Your books are safe and waiting.',
    action: 'Update now',
    /** Shown when the flag carries no store link, so the button would go nowhere. */
    noStore: 'Update Reader from the Play Store to carry on.',
  },
  migrationFailed: {
    title: 'Could not open your library',
    body: 'Your books are still on this phone and nothing was deleted. This usually clears on a second try.',
    action: actions.tryAgain,
    busy: 'Trying again',
  },
  /**
   * The app only knows when a timed session STARTED. It never claims to know how long the
   * reader read: the old title, "You were reading for 9h", was the app closing overnight
   * dressed up as reading. See recoveryPolicy.ts and DECISIONS.md, 2026-09-10.
   */
  sessionRecovery: {
    title: 'A session was still running',
    /** e.g. "You started timing it 41m ago". The duration comes from lib/dates. */
    started: (ago: string) =>
      `You started timing it ${ago} ago, and the app closed before you stopped it.`,
    /** Within the cap: the elapsed time is pre-filled, as the most it could have been. */
    offered:
      'We cannot tell when you stopped reading, so this is the most it could have been. Change it if you read for less.',
    /** Past the cap: nothing is pre-filled. */
    asked:
      'That is too long ago for us to guess when you stopped. How long did you actually read?',
    field: 'Minutes you read',
    invalid: {
      notWhole: 'Whole minutes only',
      tooShort: 'At least one minute',
      tooLong: (max: number) => `It started ${max} minutes ago, so no more than that`,
    },
    save: 'Save this session',
    discard: 'Discard it',
  },
  crashed: {
    title: 'Something went wrong',
    body: 'Your library is saved on this phone and was not affected. Restarting usually fixes it.',
    action: 'Restart the app',
  },
} as const

/**
 * The free-tier promise. This wording is a store-listing claim and appears on the
 * paywall. It must not drift, and the list it describes must never shrink.
 */
export const promise = {
  freeForever: 'Your books and your stats are free. Forever.',
  noAds: 'No ads. No review prompts. Not even in the free tier.',
  cancelSafe: 'Cancelling never locks anything you logged.',
} as const
