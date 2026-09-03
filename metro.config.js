const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Drizzle migrations are .sql files imported as strings via babel-plugin-inline-import.
config.resolver.sourceExts.push('sql')

module.exports = config
