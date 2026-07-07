import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.venv/**',
      '**/coverage/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/next-env.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Invariant #9: no `any` escapes except where an external SDK forces it.
      // The MCP SDK is the only allowed exception, and only at its boundary.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // React / Next rules scoped to the web app (TSX). The TS parser already
    // handles JSX, so we only add the React-specific rule sets here.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react/jsx-key': 'error',
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
