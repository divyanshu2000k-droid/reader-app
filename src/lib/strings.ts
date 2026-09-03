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

export const toasts = {
  sessionDeleted: 'Session deleted',
  bookRemoved: 'Book removed',
  noteDeleted: 'Note deleted',
  bookRestored: 'Book restored',
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
