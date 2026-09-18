"""
Mutation sweep for Slice 5b: break each rule on purpose and confirm a test goes red.

A guard nobody has watched fail is decoration (CLAUDE.md). Each entry below is (file, find,
replace, expected-failing-suite). The script applies one mutation, runs that suite, restores
the file, and reports RED or GREEN. GREEN means the guard did not catch its own mutation and
is the only interesting result.

    python scripts/device/mutate_s5b.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FORM = "src/features/notes/noteForm.ts"
DRAFT = "src/features/notes/noteDraft.ts"
LIST = "src/features/notes/noteList.ts"
EXPORT = "src/features/notes/noteExport.ts"
LINE = "src/domain/noteLine.ts"
THEME = "src/ui/theme.ts"
TABREQ = "src/features/library/tabRequest.ts"
TRASH = "src/features/trash/deletedLine.ts"

FORM_T = "src/features/notes/__tests__/noteForm.test.ts"
DRAFT_T = "src/features/notes/__tests__/noteDraft.test.ts"
LIST_T = "src/features/notes/__tests__/noteList.test.ts"
EXPORT_T = "src/features/notes/__tests__/noteExport.test.ts"
LINE_T = "src/domain/__tests__/noteLine.test.ts"
THEME_T = "src/ui/__tests__/theme.test.ts"
TABREQ_T = "src/features/library/__tests__/tabRequest.test.ts"
TRASH_T = "src/features/trash/__tests__/deletedLine.test.ts"

MUTATIONS = [
    # ── The note is the BOOK's, not the read's ──
    ("a note written against the read instead of the book",
     FORM, "    bookId: context.bookId,", "    bookId: context.readId ?? context.bookId,", FORM_T),
    ("a patch that moves the note to the current read",
     FORM, "  if (form.type !== stored.type) patch.type = form.type",
     "  patch.content = form.content\n  if (form.type !== stored.type) patch.type = form.type", FORM_T),

    # ── What saves and what is refused ──
    ("an empty note allowed to save",
     FORM, "    canSave: content !== '' && errors.content === undefined",
     "    canSave: errors.content === undefined", FORM_T),
    ("content saved without trimming",
     FORM, "    content: form.content.trim(),", "    content: form.content,", FORM_T),
    ("a page past the page count refused instead of pointed out",
     FORM, "    hints.push(`That is past page ${context.pageCount}, the page count on file.`)",
     "    errors.page = 'Too far.'", FORM_T),
    ("an enormous paste allowed through",
     FORM, "  if (content.length > CONTENT_MAX) {", "  if (false) {", FORM_T),
    ("an audiobook offered the page it cannot have",
     FORM, "    page: context.hasPages && context.currentPage !== null ? String(context.currentPage) : '',",
     "    page: context.currentPage !== null ? String(context.currentPage) : '',", FORM_T),
    ("a page of 'p. 212' written as NaN",
     FORM, "  if (!/^\\d+$/.test(trimmed)) return Number.NaN", "  return Number(trimmed)", FORM_T),

    # ── The half-written note ──
    ("a draft never restored",
     DRAFT, "  if (draft === null || !isDirty(draft, baseline)) return { form: baseline, restored: false }",
     "  return { form: baseline, restored: false }", DRAFT_T),
    ("a draft identical to the saved note offered as a restore",
     DRAFT, "  if (draft === null || !isDirty(draft, baseline)) return { form: baseline, restored: false }",
     "  if (draft === null) return { form: baseline, restored: false }", DRAFT_T),
    ("a corrupt payload trusted instead of discarded",
     DRAFT, "  if (typeof content !== 'string' || typeof page !== 'string') return null",
     "  if (false) return null", DRAFT_T),
    ("THE AFTER-SAVE FLUSH writing the saved note back as a draft",
     DRAFT, "  if (phase === 'finished') return 'none'", "  if (false) return 'none'", DRAFT_T),
    ("two books sharing one draft",
     DRAFT, "  return target.kind === 'new' ? `new:${target.bookId}` : `edit:${target.noteId}`",
     "  return target.kind === 'new' ? 'new' : `edit:${target.noteId}`", DRAFT_T),

    # ── The list ──
    ("a note counted as a quote",
     LIST, "  for (const n of notes) if (n.type === 'quote') quotes += 1",
     "  for (const n of notes) if (n.type !== 'quote') quotes += 1", LIST_T),
    ("a note with no page showing an empty one",
     LIST, "  return note.page === null ? kind : `${kind} · P.${note.page}`",
     "  return `${kind} · P.${note.page}`", LIST_T),
    ("the filter showing the wrong type",
     LIST, "  return filter === 'all' ? notes : notes.filter((n) => n.type === filter)",
     "  return filter === 'all' ? notes : notes.filter((n) => n.type !== filter)", LIST_T),

    # ── The shared line ──
    ("a book with no notes rendering '0 notes · 0 quotes'",
     LINE, "  if (counts.notes > 0) parts.push(plural(counts.notes, 'note', 'notes'))",
     "  parts.push(plural(counts.notes, 'note', 'notes'))", LINE_T),

    # ── The export ──
    ("an export silently truncated",
     EXPORT, "  const blocks = notes.map((n) => `${heading(n)}\\n${n.content.trim()}`)",
     "  const blocks = notes.slice(0, 10).map((n) => `${heading(n)}\\n${n.content.trim()}`)", EXPORT_T),
    ("a share sheet opened over nothing",
     EXPORT, "  if (notes.length === 0) return null", "  if (false) return null", EXPORT_T),
    ("a book with no author exported 'by null'",
     EXPORT, "  const head = book.author === null ? book.title : `${book.title}\\nby ${book.author}`",
     "  const head = `${book.title}\\nby ${book.author}`", EXPORT_T),

    # ── Recently Deleted ──
    ("a deleted note that does not say which book it was from",
     TRASH, "      detail: `${kind}${page} from ${item.bookTitle} · deleted ${formatted.removed}`,",
     "      detail: `${kind}${page} · deleted ${formatted.removed}`,", TRASH_T),
    ("a long note cut with no sign that it was cut",
     TRASH, "  return flat.length <= NOTE_PREVIEW ? flat : `${flat.slice(0, NOTE_PREVIEW).trimEnd()}…`",
     "  return flat.slice(0, NOTE_PREVIEW)", TRASH_T),
    ("a multi-line note breaking the row's layout",
     TRASH, "  const flat = content.replace(/\s+/g, ' ').trim()", "  const flat = content", TRASH_T),

    # ── Carried from earlier today ──
    ("a type token's letterSpacing dropped again",
     THEME, "    letterSpacing: token.letterSpacing,", "    // dropped", THEME_T),
    ("'Start the next one' twice ignored the second time",
     TABREQ, "  const key = `${params.tab ?? ''}@${params.at ?? ''}`",
     "  const key = `${params.tab ?? ''}`", TABREQ_T),
]


def run(suite: str) -> bool:
    """True when the suite passes."""
    result = subprocess.run(
        ["npx", "tsx", "--test", suite],
        cwd=ROOT, capture_output=True, text=True, shell=True,
    )
    return result.returncode == 0


def main() -> int:
    red = 0
    green: list[str] = []
    for label, rel, find, replace, suite in MUTATIONS:
        path = ROOT / rel
        # BYTES, not text. `write_text` on Windows rewrites every \n as \r\n, so
        # restoring a file changed all its line endings. Git normalises them, so the diff
        # stayed empty and nothing complained — but a script that mutates source must put
        # it back exactly as it found it, and prove it did.
        original = path.read_bytes()
        text = original.decode("utf-8")
        if find not in text:
            print(f"SKIP  {label}\n      (pattern not found in {rel} - the code was rewritten)")
            green.append(label)
            continue
        path.write_bytes(text.replace(find, replace, 1).encode("utf-8"))
        try:
            passed = run(suite)
        finally:
            path.write_bytes(original)
            assert path.read_bytes() == original, f"{rel} was not restored byte for byte"
        if passed:
            print(f"GREEN {label}  <-- the guard did not catch this")
            green.append(label)
        else:
            red += 1
            print(f"RED   {label}")

    print(f"\n{red}/{len(MUTATIONS)} mutations went red.")
    if green:
        print("NOT CAUGHT:")
        for label in green:
            print(f"  - {label}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
