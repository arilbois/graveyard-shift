// @ts-check
import { builtinModules } from 'node:module';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * Architecture boundaries (structure.md, design §3, R20.2) and privacy guards (R14.1).
 * `no-restricted-imports` settings do not merge across config objects, so each scope lists
 * the full set of restrictions that applies to it.
 */

const NETWORK_MESSAGE = 'Graveyard Shift makes no network requests (R14.1).';
const NETWORK_MODULES = ['http', 'https', 'http2', 'net', 'tls', 'dgram', 'undici'];
const networkPaths = NETWORK_MODULES.flatMap((name) => [
  { name, message: NETWORK_MESSAGE },
  { name: `node:${name}`, message: NETWORK_MESSAGE },
]);

const restrictedGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: NETWORK_MESSAGE,
}));
const restrictedProperties = ['globalThis', 'window', 'self'].map((object) => ({
  object,
  property: 'fetch',
  message: NETWORK_MESSAGE,
}));

const DOMAIN_MESSAGE = 'Domain code must stay pure: no vscode, Node built-ins, adapters or webview code.';
const nodeBuiltinPaths = builtinModules
  .filter((name) => !name.startsWith('_') && !NETWORK_MODULES.includes(name))
  .flatMap((name) => [
    { name, message: DOMAIN_MESSAGE },
    { name: `node:${name}`, message: DOMAIN_MESSAGE },
  ]);

/** Pure domain modules: deterministic, testable without VS Code. */
const DOMAIN_FILES = [
  'src/shared/**/*.ts',
  'src/extension/session/**/*.ts',
  'src/extension/reminders/**/*.ts',
  'src/extension/companion/**/*.ts',
  'src/extension/application/engine.ts',
  'src/extension/application/selectors.ts',
];

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.vscode-test/**', '*.vsix'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  // Everywhere: no network access.
  {
    files: ['**/*.{ts,tsx,mts,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': ['error', { paths: networkPaths }],
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
    },
  },
  // Webview: browser only, never imports host code or vscode.
  {
    files: ['src/webview/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...networkPaths, { name: 'vscode', message: 'Webview code cannot use the extension API.' }],
          patterns: [{ group: ['**/extension/**', '**/extension'], message: 'Webview code cannot import host code.' }],
        },
      ],
    },
  },
  // Domain: pure modules.
  {
    files: DOMAIN_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...networkPaths, ...nodeBuiltinPaths, { name: 'vscode', message: DOMAIN_MESSAGE }],
          patterns: [
            {
              group: [
                '**/webview/**',
                '**/activity/**',
                '**/storage/**',
                '**/webviews/**',
                '**/notifications/**',
                '**/demo/**',
                '**/application/runtime',
                '**/application/runtime.*',
              ],
              message: DOMAIN_MESSAGE,
            },
          ],
        },
      ],
    },
  },
);
