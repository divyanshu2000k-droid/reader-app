module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Lets Drizzle's generated migrations be imported as strings:
      //   import m0000 from './migrations/0000_init.sql'
      ['inline-import', { extensions: ['.sql'] }],
      // Must stay last.
      'react-native-worklets/plugin',
    ],
  }
}
