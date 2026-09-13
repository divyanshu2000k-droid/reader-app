import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { shouldRenderSheet, shouldUnmountAfterExit } from '../sheetMount'

describe('shouldRenderSheet', () => {
  it('renders an open sheet whatever the exit state says', () => {
    assert.equal(shouldRenderSheet(true, false), true)
    assert.equal(shouldRenderSheet(true, true), true)
  })

  it('keeps a closing sheet rendered until its exit ends', () => {
    assert.equal(shouldRenderSheet(false, true), true)
    assert.equal(shouldRenderSheet(false, false), false)
  })
})

describe('shouldUnmountAfterExit', () => {
  it('ends the exit when it finished and the sheet is still closed', () => {
    assert.equal(shouldUnmountAfterExit(true, false), true)
  })

  it('never ends the exit of a sheet that has been reopened', () => {
    assert.equal(shouldUnmountAfterExit(true, true), false)
  })

  it('does not end a cancelled exit', () => {
    assert.equal(shouldUnmountAfterExit(false, false), false)
    assert.equal(shouldUnmountAfterExit(undefined, false), false)
  })
})

// A textual guard, so it carries a control.
const WIRING = [
  /if \(!shouldRenderSheet\(visible, exiting\)\) return null/,
  /shouldUnmountAfterExit\(finished, visibleRef\.current\)/,
]
const FORBIDDEN = /setMounted|if \(!mounted\)/

function wiringProblems(source: string): string[] {
  const missing = WIRING.filter((rx) => !rx.test(source)).map((rx) => `missing ${String(rx)}`)
  return FORBIDDEN.test(source) ? [...missing, 'renders from derived `mounted` state'] : missing
}

describe('Sheet wiring', () => {
  it('renders through shouldRenderSheet and ends exits through shouldUnmountAfterExit', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'ui', 'Sheet.tsx'), 'utf8')
    assert.deepEqual(wiringProblems(source), [])
  })

  it('control: flags the version that kept Book actions shut', () => {
    const bad = `
      const [mounted, setMounted] = useState(visible)
      if (prevVisible !== visible) { setPrevVisible(visible); if (visible) setMounted(true) }
      progress.value = withTiming(0, { duration }, (finished) => { if (finished) runOnJS(setMounted)(false) })
      if (!mounted) return null`
    assert.equal(wiringProblems(bad).length, 3)
  })
})
