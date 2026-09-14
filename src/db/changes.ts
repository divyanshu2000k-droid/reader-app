/**
 * src/db/changes.ts
 *
 * "SOMETHING IN THE LIBRARY CHANGED." A signal, not data: listeners are told a write
 * committed, and re-read whatever they show from SQLite. No row, no copy, no cache.
 *
 * Found on the phone, Slice 3: deleting a session from its editor returns to book detail
 * with an Undo toast. Undo restored the row, and the database proved it, but book detail
 * went on showing the list without it. The screen was focused the whole time, so the
 * reload-on-return had nothing to react to, and nothing else told it. The same held for
 * the Library under the "Book removed" toast.
 *
 * `write.ts` calls `notifyDataChanged()` after every write that committed and changed
 * something, and nowhere else does: it is the only write path, so it is the only place that
 * knows. `ui/useReloadOnChange.ts` is the other end.
 *
 * A listener that throws must never turn a committed write into a reported failure, so
 * each is isolated.
 */

type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeDataChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyDataChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // A screen failing to reload is that screen's problem; the write already committed.
    }
  }
}
