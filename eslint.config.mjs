import html from 'eslint-plugin-html';
import globals from 'globals';

export default [
  { files: ['index.html'], plugins: { html }, languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, Decimal: 'readonly' } } },
  { files: ['tests/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, Decimal: 'readonly' } } },
  { rules: { 'no-unused-vars': 'error', 'no-undef': 'error', 'no-redeclare': 'error', eqeqeq: ['error', 'always', { null: 'ignore' }], 'prefer-const': 'error', 'no-var': 'error', 'no-unreachable': 'error', 'no-empty': 'error' } }
];
