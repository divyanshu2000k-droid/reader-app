/**
 * src/domain/isbn.ts
 *
 * ISBNs, normalised. Pure.
 *
 * The two search sources disagree on shape: Google Books gives `ISBN_10` and `ISBN_13`
 * identifiers per edition, Open Library a flat list of every edition's ISBN in both lengths,
 * with and without hyphens. Merging them by ISBN, and recognising a book already in the
 * library, needs one canonical form: thirteen digits. A ten-digit ISBN converts exactly.
 *
 * A checksum that does not hold is not an ISBN, whatever it looks like. Guessing would merge
 * two different books, and a merged book is a reader's sessions under the wrong title.
 */

/** Digits (and a final X for ISBN-10) with spaces and hyphens removed, uppercased. */
function strip(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidIsbn10(raw: string): boolean {
  const s = strip(raw)
  if (!/^\d{9}[\dX]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i += 1) {
    const ch = s[i] ?? '0'
    const value = ch === 'X' ? 10 : Number(ch)
    sum += value * (10 - i)
  }
  return sum % 11 === 0
}

export function isValidIsbn13(raw: string): boolean {
  const s = strip(raw)
  if (!/^\d{13}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 13; i += 1) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
  return sum % 10 === 0
}

/** A valid ISBN-10 as its ISBN-13 (the 978 prefix and a new check digit), else null. */
export function isbn10To13(raw: string): string | null {
  if (!isValidIsbn10(raw)) return null
  const core = `978${strip(raw).slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  return `${core}${(10 - (sum % 10)) % 10}`
}

/** Any valid ISBN, as thirteen digits. Null for anything that is not one. */
export function toIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = strip(raw)
  if (isValidIsbn13(s)) return s
  return isbn10To13(s)
}
