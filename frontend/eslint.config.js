// ESLint flat config — frontend React 18 + Vite
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['node_modules/**', 'dist/**', 'android/**', '**/*.patch.cjs'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks':   reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // React 18 — JSX runtime automático, no hace falta importar React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react':     'off',
      // El proyecto usa props sin PropTypes — ruido innecesario para JS puro
      'react/prop-types':         'off',
      // Para HMR — avisa si exportás algo no-componente desde un archivo con componentes
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Bugs reales — error
      'no-undef':                'error',
      'no-unreachable':          'error',
      'no-dupe-keys':            'error',
      'react-hooks/rules-of-hooks':   'error',
      'react-hooks/exhaustive-deps':  'warn',
      // Reglas nuevas de eslint-plugin-react-hooks v7 — útiles pero estrictas
      // contra patrones que el proyecto ya usa. Bajadas a warning para no
      // romper el flujo; reconsiderar si decidimos refactorar los useEffect.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability':        'warn',

      // Higiene — warn
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'prefer-const':            'warn',
      'no-var':                  'warn',
      'no-empty':                ['warn', { allowEmptyCatch: true }],
      'react/no-unescaped-entities': 'off',
    },
  },
]
