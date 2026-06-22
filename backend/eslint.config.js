// ESLint flat config — backend Node 20 + ESM
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'prisma/migrations/**', 'dist/**'] },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Bugs reales — error
      'no-undef':           'error',
      'no-unreachable':     'error',
      'no-dupe-keys':       'error',
      'no-constant-condition': ['error', { checkLoops: false }],

      // Higiene — warn (no rompe el flujo, pero te avisa)
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'prefer-const':       'warn',
      'no-var':             'warn',

      // Ruido innecesario — off
      'no-console':         'off',
      'no-empty':           ['warn', { allowEmptyCatch: true }],
    },
  },
]
