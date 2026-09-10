const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Drizzle migrations are .sql files imported as strings via babel-plugin-inline-import.
config.resolver.sourceExts.push('sql')

// Never watch Gradle output. Metro's file watcher crawls node_modules, including each native
// library's `android/build` and `.cxx` directories, which Gradle creates and deletes mid-build.
// Starting Metro during a build crashed it on a directory that vanished between the walk and
// the watch (ENOENT), and once left it wedged serving no bundle at all. `blockList` also feeds
// the file map's ignore pattern, so these paths are neither resolved nor watched.
// See DECISIONS.md, 2026-09-10.
//
// Plain RegExps, appended to Expo's defaults rather than replacing them. NOT metro-config's
// `exclusionList` helper: it re-escapes `/` inside each pattern's source, which turns the
// character class `[\\/]` into an unterminated one, and Metro would throw on every start.
// `[\\/]` itself matches either separator — on Windows, a pattern written with `/` alone
// blocks nothing.
const gradleOutput = [
  /[\\/]android[\\/](app[\\/])?build[\\/].*/,
  /[\\/]android[\\/]\.cxx[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
]
const existing = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...gradleOutput,
]

module.exports = config
