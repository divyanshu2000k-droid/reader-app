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
        // CLAUDE.md rule 3 covers colours, spacing, radii AND type sizes. This rule
        // used to check colours only, so the other three quietly drifted: the shared
        // primitives alone carried a pill height of 34, four inline radii and a dozen
        // bare paddings. Zero is allowed - it means "none", not a chosen value.
        {
          selector:
            'Property[key.name=/^(gap|rowGap|columnGap|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|fontSize|lineHeight|letterSpacing|width|height|minWidth|minHeight|maxWidth|maxHeight)$/] > Literal[raw=/^-?(?:[1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]+)$/]',
          message:
            'Hardcoded spacing, radius or type size. Every one comes from src/ui/theme.ts. ' +
            'If the value is real, name it in the theme; if it is not, do not use it.',
        },
        // And the way around the rule above: `font.body.size + 0.5` is a font size that
        // does not exist in the scale, written so that it reads as though it does. Four
        // separate components each invented their own that way.
        //
        // Only token-against-LITERAL is forbidden. `insets.bottom + space.bottomSafe`
        // adds a runtime value the theme cannot know to a token, which is the correct
        // way to use one.
        {
          selector:
            ':matches(BinaryExpression[left.type="Literal"], BinaryExpression[right.type="Literal"]) > MemberExpression[object.name=/^(font|space|radius|size|shadow)$/]',
          message:
            'Arithmetic on a theme token. A size reached by adding to another size ' +
            'either belongs in src/ui/theme.ts with a name, or does not exist.',
        },
        {
          selector:
            ':matches(BinaryExpression[left.type="Literal"], BinaryExpression[right.type="Literal"]) > MemberExpression[object.object.name=/^(font|space|radius|size|shadow)$/]',
          message:
            'Arithmetic on a theme token. A size reached by adding to another size ' +
            'either belongs in src/ui/theme.ts with a name, or does not exist.',
        },
        // Type goes through `typeStyle(font.x)`, which is the only thing that applies
        // `font.family`. Spelling out fontSize and fontWeight by hand is how the app
        // spent all of Slice 0 rendering in Roboto while the theme declared Plus
        // Jakarta Sans: nothing looked broken enough for anyone to notice.
        {
          selector: 'Property[key.name=/^(fontFamily|fontSize|fontWeight)$/]',
          message:
            'Use typeStyle(font.<token>) from src/ui/theme.ts. It is the only place ' +
            'font.family is applied, so a hand-written text style silently loses the ' +
            'typeface.',
        },
      ],
    },
  },
  {
    // The one file allowed to contain colour values, because it is where they live.
    files: ['src/ui/theme.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Metro, Babel and ESLint's own config are CommonJS by necessity, and so are the
    // developer scripts in scripts/ — they run under bare node, not under Metro. They
    // are also command-line tools whose entire job is printing to stdout.
    files: ['*.config.js', 'eslint.config.js', 'scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
]
