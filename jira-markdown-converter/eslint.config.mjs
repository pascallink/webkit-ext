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
        Blob: 'readonly',
        ClipboardItem: 'readonly',
        MutationObserver: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLInputElement: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        importScripts: 'readonly'
      }
    },
    rules: {
      // Leere catch-Bloecke sind hier Absicht: Jira baut das DOM staendig um.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'off',
      // Das Content-Script laeuft in der isolierten Welt und sieht diese
      // Seiten-Globals der Hauptwelt nie (Grund im Quelltext: otrsflow.js:289,
      // jiraui.js:156) - die Regel haelt den heute schon freien Quellstand so.
      'no-restricted-globals': ['error',
        { name: 'JIRA', message: 'Isolierte Welt: window.JIRA der Seite ist hier nie erreichbar.' },
        { name: 'AJS', message: 'Isolierte Welt: AJS der Seite ist hier nie erreichbar.' },
        { name: 'jQuery', message: 'Isolierte Welt: jQuery der Seite ist hier nie erreichbar.' },
        { name: '$', message: 'Isolierte Welt: $ der Seite ist hier nie erreichbar.' }
      ]
    }
  }
];
