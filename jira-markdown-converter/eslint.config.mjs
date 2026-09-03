export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        self: 'readonly',
        globalThis: 'readonly',
        chrome: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Promise: 'readonly',
        Event: 'readonly',
        ClipboardEvent: 'readonly',
        DataTransfer: 'readonly',
        MutationObserver: 'readonly',
        HTMLTextAreaElement: 'readonly',
        importScripts: 'readonly'
      }
    },
    rules: {
      // Leere catch-Bloecke sind hier Absicht: Jira baut das DOM staendig um.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'off'
    }
  }
];
