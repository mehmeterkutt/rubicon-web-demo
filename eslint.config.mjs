// ESLint for the demo, as strict as the SDK's (typescript-eslint strictTypeChecked) over the app,
// the Vite plugin, the Playwright specs and the configurations; the two classic scripts the pages
// load as they are (the snippet's init tag and the sandboxed frame's script) as browser scripts.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'temp/**', 'test-results/**', 'playwright-report/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      // Two programs: the app (tsconfig.json) and the Node code (tsconfig.node.json).
      parserOptions: { project: ['./tsconfig.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      // Numbers read naturally in the demo's messages.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['e2e/**/*.ts', 'tooling/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // The snippet page's init tag, inlined beside the SDK's ES5 stub: ES5 in a browser.
    files: ['snippet/init.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.browser, rubicon: 'readonly', __DEMO_DEFAULTS__: 'readonly' },
    },
    // ES5 has no optional catch binding; the tag swallows a bad cookie and keeps the defaults.
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  {
    // The sandboxed frame's classic script, after the script build.
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: { ...globals.browser, Rubicon: 'readonly' } },
  },
);
