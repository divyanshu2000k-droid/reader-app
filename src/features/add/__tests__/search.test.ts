import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  findInLibrary,
  mergeResults,
  normalise,
  parseRememberedResult,
  queryTerms,
  rankResults,
  resultDetail,
} from '../searchMerge'
import {
  googleBooksUrl,
  openLibraryUrl,
  parseGoogleBooks,
  parseOpenLibrary,
  type SearchHit,
} from '../searchSources'

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'src', 'features', 'add', '__tests__', 'fixtures', name),
      'utf8',
    ),
  )

describe('Open Library, real responses', () => {
  const hits = parseOpenLibrary(fixture('openlibrary-piranesi-clarke.json'))

  test('a work: title, author, median pages, first year, cover, every edition ISBN', () => {
    const piranesi = hits[0]
    assert.equal(piranesi?.title, 'Piranesi')
    assert.deepEqual(piranesi?.authors, ['Susanna Clarke'])
    assert.equal(piranesi?.pageCount, 272)
    assert.equal(piranesi?.publishedYear, 2020)
    assert.equal(piranesi?.sourceId, 'OL20893680W')
    assert.equal(piranesi?.coverUrl, 'https://covers.openlibrary.org/b/id/10226290-M.jpg')
    assert.ok(piranesi?.isbns.includes('9781635575637'))
    // Ten-digit ISBNs arrive converted, and there are no duplicates.
    assert.equal(new Set(piranesi?.isbns).size, piranesi?.isbns.length)
    assert.ok(piranesi?.isbns.every((i) => i.length === 13))
  })

  test('a work claims no single edition: no ISBN and no publisher of its own', () => {
    assert.equal(hits[0]?.isbn13, null)
    assert.equal(hits[0]?.publisher, null)
  })

  test('a repeated author name is listed once', () => {
    const overstory = parseOpenLibrary(fixture('openlibrary-the-overstory-powers.json'))
    assert.deepEqual(overstory[0]?.authors, ['Richard Powers'])
  })

  test('a work with no page count says so, rather than 0', () => {
    const godan = parseOpenLibrary(fixture('openlibrary-godaan.json')).find(
      (h) => h.title === 'Godan',
    )
    assert.equal(godan?.pageCount, null)
  })

  test('no results, and garbage, are an empty list', () => {
    assert.deepEqual(parseOpenLibrary(fixture('openlibrary-empty.json')), [])
    assert.deepEqual(parseOpenLibrary(null), [])
    assert.deepEqual(parseOpenLibrary({ docs: [{ title: 5 }, 'x', null] }), [])
  })
})

describe('Google Books, real responses', () => {
  const piranesi = parseGoogleBooks(fixture('google-real-piranesi-clarke.json'))
  const godaan = parseGoogleBooks(fixture('google-real-godaan.json'))
  const byId = (hits: readonly SearchHit[], id: string): SearchHit | undefined =>
    hits.find((h) => h.sourceId === id)

  test('every volume Google returned is read, none silently skipped', () => {
    assert.equal(piranesi.length, 20)
    assert.equal(godaan.length, 20)
  })

  test('an edition: its own ISBNs, publisher, pages, year, and an https cover without curl', () => {
    const first = byId(piranesi, 'pPa0DwAAQBAJ')
    assert.equal(first?.isbn13, '9781526622440')
    assert.equal(first?.isbn10, '1526622440')
    assert.equal(first?.publisher, 'Bloomsbury Publishing')
    assert.equal(first?.publishedYear, 2020)
    assert.equal(first?.pageCount, 231)
    assert.match(first?.coverUrl ?? '', /^https:\/\/books\.google\.com\//)
    assert.ok(!first?.coverUrl?.includes('edge=curl'))
  })

  test('a library scan with an OTHER identifier has no ISBN', () => {
    const scan = byId(piranesi, 'eNMfAQAAIAAJ')
    assert.equal(scan?.isbn13, null)
    assert.deepEqual(scan?.isbns, [])
  })

  test('no imageLinks, no identifiers, pageCount 0 and no authors are absent, not values', () => {
    assert.equal(byId(piranesi, 'oEJCzwEACAAJ')?.coverUrl, null)
    assert.equal(byId(godaan, 'V4TAijRyKikC')?.isbn13, null)
    assert.equal(byId(godaan, 'nwPJ0QEACAAJ')?.pageCount, null)
    assert.deepEqual(byId(godaan, 'sTCOAAAAMAAJ')?.authors, [])
  })

  test('a Devanagari title arrives intact', () => {
    assert.equal(byId(godaan, '624xEQAAQBAJ')?.title, 'Godaan (Hindi) - गोदान')
  })

  test('no matches is no items key, and no results', () => {
    assert.deepEqual(parseGoogleBooks(fixture('google-real-empty.json')), [])
  })

  test('one book from both real sources is one result', () => {
    const results = mergeResults(
      'piranesi clarke',
      piranesi,
      parseOpenLibrary(fixture('openlibrary-piranesi-clarke.json')),
    )
    const clarke = results.filter((r) => r.title === 'Piranesi')
    assert.equal(clarke.length, 1)
    assert.deepEqual(clarke[0]?.sources, ['google', 'openlibrary'])
    // The unrelated catalogues Google returned for "clarke" match neither word by title or author.
    assert.ok(!results.some((r) => r.title.startsWith('Book-prices')))
  })
})

describe('Google Books, hand-written shapes the real captures lack', () => {
  const hits = parseGoogleBooks(fixture('google-piranesi-clarke.json'))

  test('an edition: its own ISBNs, publisher, pages, year, and an https cover without curl', () => {
    const first = hits[0]
    assert.equal(first?.isbn13, '9781635575637')
    assert.equal(first?.isbn10, '163557563X')
    assert.equal(first?.publisher, 'Bloomsbury Publishing USA')
    assert.equal(first?.publishedYear, 2020)
    assert.equal(first?.pageCount, 272)
    assert.ok(first?.coverUrl?.startsWith('https://'))
    assert.ok(!first?.coverUrl?.includes('edge=curl'))
  })

  test('an edition with only an ISBN-10 still gets its ISBN-13', () => {
    assert.equal(hits[1]?.isbn13, '9781526622433')
  })

  test('a page count of 0, a missing author and a non-ISBN identifier are absent, not values', () => {
    const odd = hits[2]
    assert.equal(odd?.pageCount, null)
    assert.deepEqual(odd?.authors, [])
    assert.equal(odd?.isbn13, null)
    assert.deepEqual(odd?.isbns, [])
    assert.equal(odd?.coverUrl, null)
    assert.equal(odd?.publishedYear, 1994)
  })
})

describe('requests', () => {
  test('every word and symbol reaches the API encoded', () => {
    assert.match(openLibraryUrl('piranesi & clarke'), /q=piranesi%20%26%20clarke/)
    assert.match(googleBooksUrl('godāna', 'KEY'), /q=god%C4%81na.*key=KEY/)
  })
})

describe('the merged list', () => {
  const google = parseGoogleBooks(fixture('google-piranesi-clarke.json'))
  const openLibrary = parseOpenLibrary(fixture('openlibrary-piranesi-clarke.json'))

  test('results matching none of the words are dropped: no Gibbon for "piranesi clarke"', () => {
    const titles = mergeResults('piranesi clarke', null, openLibrary).map((r) => r.title)
    assert.deepEqual(titles, ['Piranesi'])
  })

  test('the same rule holds for Google: a volume matching no word is dropped', () => {
    const [first] = google
    assert.ok(first)
    const unrelated = {
      ...first,
      sourceId: 'unrelated',
      title: 'A Christmas Carol',
      authors: ['Charles Dickens'],
      isbn13: null,
      isbns: [],
    }
    const titles = mergeResults('piranesi clarke', [unrelated, first], null).map((r) => r.title)
    assert.deepEqual(titles, ['Piranesi'])
  })

  test('one book from both sources is one result: Google edition, Open Library gaps filled', () => {
    const results = mergeResults('piranesi clarke', google, openLibrary)
    const merged = results.find((r) => r.sources.length === 2)
    assert.equal(merged?.source, 'google')
    assert.equal(merged?.isbn13, '9781635575637')
    assert.deepEqual(merged?.sources, ['google', 'openlibrary'])
    assert.equal(
      results.filter((r) => r.title === 'Piranesi' && r.source === 'openlibrary').length,
      0,
    )
  })

  test('every word matched ranks above some words matched', () => {
    const results = mergeResults('piranesi clarke', google, openLibrary)
    // "Piranesi: A Study" has no author, so it matches one word of two and sorts last.
    assert.equal(results.at(-1)?.title, 'Piranesi: A Study')
  })

  test('an ISBN search matches by ISBN, not by words', () => {
    const results = mergeResults('978-1-63557-563-7', null, openLibrary)
    assert.deepEqual(
      results.map((r) => r.title),
      ['Piranesi'],
    )
  })

  test('results render as they arrive: one source alone is a list', () => {
    assert.equal(mergeResults('piranesi', google, null).length, 3)
    assert.equal(mergeResults('piranesi', null, null).length, 0)
  })

  test('accents and common words do not decide a match', () => {
    assert.equal(normalise('Godāna'), 'godana')
    assert.deepEqual(queryTerms('The Overstory by Powers'), ['overstory', 'powers'])
    assert.deepEqual(queryTerms('the'), ['the'])
  })

  test('partly typed words still match', () => {
    assert.equal(mergeResults('piran', null, openLibrary)[0]?.title, 'Piranesi')
  })
})

describe('already in the library', () => {
  const [result] = mergeResults(
    'piranesi',
    parseGoogleBooks(fixture('google-piranesi-clarke.json')),
    parseOpenLibrary(fixture('openlibrary-piranesi-clarke.json')),
  )

  test('by any of its ISBNs, including another edition of the same work', () => {
    assert.ok(result)
    const library = [
      { id: 'b1', title: 'Something else', author: null, isbn13: '9781526622440' },
    ]
    assert.equal(findInLibrary(result, library), 'b1')
  })

  test('by title and author, for a manual book with no ISBN', () => {
    assert.ok(result)
    assert.equal(
      findInLibrary(result, [
        { id: 'm', title: 'piranesi', author: 'SUSANNA CLARKE', isbn13: null },
      ]),
      'm',
    )
    assert.equal(
      findInLibrary(result, [
        { id: 'x', title: 'Piranesi', author: 'Someone Else', isbn13: null },
      ]),
      null,
    )
  })

  test('the detail line uses what is known and never says Unknown', () => {
    assert.ok(result)
    assert.equal(resultDetail(result), 'Bloomsbury Publishing USA · 2020 · 272pp')
    assert.equal(
      resultDetail({ ...result, publisher: null, publishedYear: null, pageCount: null }),
      null,
    )
  })
})

describe('remembered results, for offline', () => {
  const results = mergeResults(
    'piranesi',
    parseGoogleBooks(fixture('google-piranesi-clarke.json')),
    parseOpenLibrary(fixture('openlibrary-piranesi-clarke.json')),
  )

  test('a remembered result reads back exactly as it was stored', () => {
    const [first] = results
    assert.ok(first)
    assert.deepEqual(parseRememberedResult(JSON.stringify(first)), first)
  })

  test('a corrupt or foreign payload is null, never a half-read book', () => {
    assert.equal(parseRememberedResult('{not json'), null)
    assert.equal(parseRememberedResult(JSON.stringify({ title: 'Only a title' })), null)
    const [first] = results
    assert.ok(first)
    assert.equal(parseRememberedResult(JSON.stringify({ ...first, pageCount: '272' })), null)
  })

  test('remembered results are found and ranked by the same words rule', () => {
    assert.deepEqual(
      rankResults('clarke', results).map((r) => r.title),
      ['Piranesi', 'Piranesi'],
    )
    assert.deepEqual(rankResults('dickens', results), [])
    assert.equal(rankResults('9781635575637', results)[0]?.isbn13, '9781635575637')
  })
})
