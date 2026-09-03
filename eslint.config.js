const expo = require('eslint-config-expo/flat')
const prettier = require('eslint-config-prettier')
const tseslint = require('typescript-eslint')

module.exports = [
  ...expo,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['node_modules/', 'android/', 'ios/', '.expo/', 'dist/', 'src/db/migrations/'],
  },
  {
    // Metro, Babel and ESLint's own config are CommonJS by necessity.
    files: ['*.config.js', 'eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    rules: {
      // No `any`. TypeScript strict, always. See docs/06-CONVENTIONS.md.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Features never import from other features. Only from ui/, db/, domain/ and lib/.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message:
                'Features must not import from other features. Shared logic goes in domain/, generic utilities in lib/.',
            },
          ],
        },
      ],
    },
  },
  {
    // All colours come from ui/theme.ts. A hardcoded colour in a component is a bug
    // regardless of how small.
    //
    // src/ui/** is included deliberately: the first version of this rule covered only
    // features and routes, which left the shared primitives — the files most likely to
    // set a colour — unchecked. theme.ts is the sole exception, below.
    files: ['src/features/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}){1,2}$/]',
          message: 'Hardcoded colour. Every colour comes from src/ui/theme.ts.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Hardcoded colour. Every colour comes from src/ui/theme.ts.',
        },
      ],
    },
  },
  {
    // The one file allowed to contain colour values, because it is where they live.
    files: ['src/ui/theme.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]
