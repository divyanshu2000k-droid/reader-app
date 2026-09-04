/**
 * Runs the timezone-sensitive suites under three zones.
 *
 * `streaks.test.ts` was missing from this list, which is the one suite where the zone
 * genuinely changes the answer: it holds the DST transition case and every
 * "11pm on the 31st" boundary. It was only ever run in whatever zone the machine
 * happened to be in.
 *
 * IST is half-hour offset and ahead of UTC; US Central is behind it and observes DST;
 * UTC is the control. A day-bucketing bug shows up in at least one of the three.
 */
const { execSync } = require('node:child_process')

const ZONES = ['UTC', 'Asia/Kolkata', 'America/Chicago']
const SUITES = [
  'src/lib/__tests__/dates.test.ts',
  'src/domain/__tests__/stats.test.ts',
  'src/domain/__tests__/streaks.test.ts',
]

let failed = false
for (const TZ of ZONES) {
  console.log(`\n===== TZ=${TZ} =====`)
  try {
    execSync(`npx tsx --test ${SUITES.join(' ')}`, {
      stdio: 'inherit',
      env: { ...process.env, TZ },
    })
  } catch {
    failed = true
    console.error(`FAILED under TZ=${TZ}`)
  }
}

if (failed) process.exit(1)
console.log(`\nAll suites pass in ${ZONES.join(', ')}.`)
