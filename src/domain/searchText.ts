/**
 * src/domain/searchText.ts
 *
 * HOW SEARCH COMPARES TEXT, in one place. Pure.
 *
 * Searching the internet and searching the library must agree on what "the same word" is, or a
 * book found in one is missed in the other. Lowercase, accents removed (so "toibin" finds
 * "Tóibín" and "godana" finds "Godāna"), punctuation to spaces. SQLite's LIKE does none of the
 * accent part, which is why both searches match in TypeScript.
 */

export function normaliseText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function textWords(text: string): string[] {
  return normaliseText(text)
    .split(' ')
    .filter((w) => w.length > 0)
}
