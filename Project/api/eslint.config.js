import js from '@eslint/js';
import globals from 'globals';
import jestPlugin from 'eslint-plugin-jest';

export default [
  // 1. Base JS Recommended & Standard-like settings
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-console': 'off',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'no-unused-vars': ['warn'],
    },
  },
  // 2. Specific override for Test files
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    plugins: { jest: jestPlugin },
    languageOptions: {
      globals: jestPlugin.environments.globals.globals,
    },
    rules: {
      'no-undef': 'off',
    },
  },
];