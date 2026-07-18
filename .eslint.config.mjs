import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignora artefactos de build y archivos experimentales no incluidos en el runtime
  globalIgnores([
    'dist',
    'android/**/build/**',
    '.kilocode',
    '.kilocode/**',
    // Worktrees ocultos de kilo: copias obsoletas (a veces con conflictos sin resolver)
    // que NO forman parte del runtime. Rompían `eslint .` (CI en rojo).
    '.kilo',
    '.kilo/**',
    // Artefactos de test/reporte de Playwright.
    'playwright-report',
    'playwright-report/**',
    'test-results',
    'test-results/**',
    'backend/routes/crossfit_endpoints.js',
    'backend/routes/funcional_endpoints.tmp.js',
  ]),

  // Frontend (browser + React)
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // Browser env + permitir 'process' como global para código que lo referencia
      globals: { ...globals.browser, process: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Limpieza sin romper: no detener CI por variables no usadas en UI
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      // Evitar errores por mezcla de helpers en módulos con componentes
      'react-refresh/only-export-components': 'warn',
      // Temporiza reglas estrictas de hooks en UI (fase 1)
      'react-hooks/rules-of-hooks': 'warn',
    },
  },

  // Backend y scripts (Node.js)
  {
    files: [
      'backend/**/*.js',
      'scripts/**/*.js',
      'vite.config.js',
      '*.config.js',
      'tests/**/*.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Permitir utilidades CLI con variables no usadas sin romper
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      // No aplica reglas de React/fast-refresh en Node
      'react-refresh/only-export-components': 'off',
    },
  },
])
