import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // ADR-001: src/core is pure domain logic. It must never depend on UI, rendering,
    // storage or browser APIs, so it stays portable and trivially unit-testable.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'three',
                'three/*',
                '@react-three/*',
                'zustand*',
                'immer',
                'idb',
                'jspdf*',
              ],
              message: 'src/core must stay framework-free (ADR-001).',
            },
            {
              group: ['**/app/**', '**/app'],
              message: 'src/core must not import from src/app (ADR-001).',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests index into fixtures they just built; a failed lookup fails the test anyway.
    files: ['**/*.test.ts', '**/__tests__/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['*.config.{js,ts}', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
