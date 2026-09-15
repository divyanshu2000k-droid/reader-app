import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  CATEGORIES_MAX,
  cleanDescription,
  DESCRIPTION_MAX_LENGTH,
  detailsPatch,
  googlePreviewUrl,
  normaliseCategories,
  parseCategories,
  parseGoogleVolumeDetails,
  parseOpenLibraryWorkDetails,
  serialiseCategories,
} from '../bookDetails'

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'domain', '__tests__', 'fixtures', name), 'utf8'),
  )

describe('a Google volume, real response', () => {
  const details = parseGoogleVolumeDetails(fixture('google-volume-piranesi.json'))

  test('the HTML description becomes plain paragraphs, with no tags, entities or rules', () => {
    const d = details.description ?? ''
    assert.ok(
      d.startsWith(
        "Winner of the 2021 Women's Prize for Fiction\nA SUNDAY TIMES & NEW YORK TIMES BESTSELLER",
      ),
      d.slice(0, 120),
    )
    assert.doesNotMatch(d, /<[a-z/]/i)
    assert.doesNotMatch(d, /&amp;|&#/)
    assert.doesNotMatch(d, /_{3,}/)
    assert.match(d, /Piranesi lives in the House\. Perhaps he always has\./)
  })

  test('its categories, raw and in order', () => {
    assert.deepEqual(details.categories.slice(0, 2), [
      'Fiction / Literary',
      'Fiction / Fantasy / General',
    ])
  })

  test('PARTIAL viewability gives a preview link without the search words or a country domain', () => {
    assert.equal(
      details.previewUrl,
      'https://books.google.com/books?id=pPa0DwAAQBAJ&printsec=frontcover',
    )
  })
})

describe('an Open Library work, real responses', () => {
  test('Markdown emphasis goes, and the text stays', () => {
    const d =
      parseOpenLibraryWorkDetails(fixture('openlibrary-work-piranesi.json')).description ?? ''
    assert.ok(
      d.startsWith(
        'From the New York Times bestselling author of Jonathan Strange & Mr. Norrell,',
      ),
      d.slice(0, 100),
    )
    assert.doesNotMatch(d, /\*/)
    assert.match(d, /Neil Gaiman's The Ocean at the End of the Lane/)
  })

  test('the "Also contained in" list after the rule is not part of the description', () => {
    const d =
      parseOpenLibraryWorkDetails(fixture('openlibrary-work-nineteen-eighty-four.json'))
        .description ?? ''
    assert.match(d, /manipulated\.$/)
    assert.doesNotMatch(d, /Also contained in|openlibrary\.org|-{3}/)
  })

  test('a description given as { type, value } is read', () => {
    const d =
      parseOpenLibraryWorkDetails(fixture('openlibrary-work-lord-of-the-rings.json'))
        .description ?? ''
    assert.match(d, /^Originally published from 1954 through 1956/)
  })

  test('subjects become categories, capped', () => {
    const piranesi = parseOpenLibraryWorkDetails(fixture('openlibrary-work-piranesi.json'))
    assert.ok(piranesi.categories.includes('genre:fantasy'))
    assert.ok(piranesi.categories.length <= CATEGORIES_MAX)
    assert.equal(piranesi.previewUrl, null)
  })

  test('a work with no description and no subjects has none, rather than empty strings', () => {
    assert.deepEqual(parseOpenLibraryWorkDetails(fixture('openlibrary-work-godaan.json')), {
      description: null,
      categories: [],
      previewUrl: null,
    })
  })
})

describe('cleaning', () => {
  test('entities, including numeric ones, are decoded once', () => {
    assert.equal(
      cleanDescription('Tom &amp; Jerry &#8212; &quot;yes&quot; &amp;amp;'),
      'Tom & Jerry — "yes" &amp;',
    )
  })

  test('blank runs collapse to one paragraph break, and whitespace-only is nothing', () => {
    assert.equal(cleanDescription('One.<br><br><br><br>Two.'), 'One.\n\nTwo.')
    assert.equal(cleanDescription('  <b> </b> '), null)
    assert.equal(cleanDescription(42), null)
  })

  test('Markdown links keep their text, footnote links go', () => {
    assert.equal(
      cleanDescription(
        'See [the book](https://example.org/x) ([source][1])\n\n[1]: https://example.org',
      ),
      'See the book',
    )
  })

  test('an asterisk that is not emphasis is left alone', () => {
    assert.equal(cleanDescription('5 * 3 = 15'), '5 * 3 = 15')
  })

  test('a very long description is cut at a word, with an ellipsis', () => {
    const long = 'word '.repeat(2000)
    const d = cleanDescription(long) ?? ''
    assert.ok(d.length <= DESCRIPTION_MAX_LENGTH + 1)
    assert.ok(d.endsWith('word…'))
  })
})

describe('categories and previews', () => {
  test('categories are trimmed, de-duplicated ignoring case, and only strings', () => {
    assert.deepEqual(normaliseCategories([' Fiction ', 'fiction', 7, '', 'Fantasy']), [
      'Fiction',
      'Fantasy',
    ])
    assert.deepEqual(normaliseCategories('Fiction'), [])
  })

  test('they round-trip through the column, and a broken column reads as none', () => {
    assert.deepEqual(parseCategories(serialiseCategories(['Fiction', 'Fantasy'])), [
      'Fiction',
      'Fantasy',
    ])
    assert.equal(serialiseCategories([]), null)
    assert.deepEqual(parseCategories('not json'), [])
    assert.deepEqual(parseCategories('{"a":1}'), [])
  })

  test('no preview link unless some pages can be read', () => {
    assert.equal(googlePreviewUrl('abc', 'NO_PAGES'), null)
    assert.equal(googlePreviewUrl('abc', undefined), null)
    assert.ok(googlePreviewUrl('abc', 'ALL_PAGES'))
    assert.equal(googlePreviewUrl('a b&c', 'PARTIAL'), null)
  })
})

describe('what a fetch writes', () => {
  const fetched = {
    description: 'From the source',
    categories: ['Fiction'],
    previewUrl: 'https://books.google.com/books?id=x&printsec=frontcover',
  }

  test('an empty book gets everything, and the time it was checked', () => {
    assert.deepEqual(
      detailsPatch({ description: null, categories: null, previewUrl: null }, fetched, 5),
      {
        detailsCheckedAt: 5,
        description: 'From the source',
        categories: '["Fiction"]',
        previewUrl: 'https://books.google.com/books?id=x&printsec=frontcover',
      },
    )
  })

  test("the reader's own description is never replaced", () => {
    const patch = detailsPatch(
      { description: 'My words', categories: null, previewUrl: null },
      fetched,
      5,
    )
    assert.equal(patch.description, undefined)
    assert.equal(patch.categories, '["Fiction"]')
  })

  test('a fetch that found nothing still records that it looked', () => {
    assert.deepEqual(
      detailsPatch(
        { description: null, categories: null, previewUrl: null },
        { description: null, categories: [], previewUrl: null },
        9,
      ),
      { detailsCheckedAt: 9 },
    )
  })
})
