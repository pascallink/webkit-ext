/**
 * JiraOtrsDialog - Dialog fuer OTRS-Verweis-Eingabe mit Validierung.
 * UMD: root.JiraOtrsDialog, UMD Container auch fuer Node require().
 */
/* global globalThis, global */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.JiraOtrsDialog = factory(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : {}, function (root) {
  'use strict';

  var state = {
    isOpen: false,
    onSubmit: null,
    onError: null,
    lastParsed: null,
    inputElement: null
  };

  function open(options) {
    options = options || {};
    state.isOpen = true;
    state.onSubmit = options.onSubmit || function () {};
    state.onError = options.onError || function () {};
    state.lastParsed = null;

    if (typeof document !== 'undefined') {
      // Haenge den Tastaturhandler an das Document, nicht an das Input-Element,
      // damit er auch dann funktioniert, wenn das Element spaeter hinzugefuegt wird.
      document.addEventListener('keydown', handleKeydown);
    }
  }

  function close() {
    state.isOpen = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeydown);
    }
    state.inputElement = null;
  }

  function isOpen() {
    return state.isOpen;
  }

  function handleKeydown(event) {
    if (!state.isOpen) return;
    if (!(event.ctrlKey && event.key === 'Enter')) return;

    var inputElement = document.getElementById('jmd-otrs-input');
    if (!inputElement || event.target !== inputElement) return;

    event.preventDefault();
    submit();
  }

  function submit() {
    if (typeof document === 'undefined') return;

    var input = document.getElementById('jmd-otrs-input');
    if (!input) return;

    var value = input.value.trim();

    if (!value) {
      if (state.onError) {
        state.onError('Eingabe ist leer.');
      }
      return;
    }

    var parsed = parseInput(value);
    if (!parsed || !parsed.url) {
      if (state.onError) {
        state.onError('Ungueltige Eingabe: keine URL gefunden.');
      }
      return;
    }

    state.lastParsed = parsed;
    if (state.onSubmit) {
      state.onSubmit(parsed);
    }
    close();
  }

  function parseInput(text) {
    // Minimale Parsing-Logik: suche nach URL im Text
    var urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
      return null;
    }

    return {
      url: urlMatch[0],
      text: text
    };
  }

  function updatePreview(value) {
    if (value && value.trim()) {
      var parsed = parseInput(value);
      if (!parsed || !parsed.url) {
        if (state.onError) {
          state.onError('Ungueltige Eingabe: keine URL gefunden.');
        }
      }
    }
  }

  // Listener fuer Input-Aenderungen waehrend Bearbeitung
  if (typeof document !== 'undefined') {
    document.addEventListener('input', function (event) {
      if (!state.isOpen) return;
      if (event.target && event.target.id === 'jmd-otrs-input') {
        updatePreview(event.target.value);
      }
    }, true);
  }

  return {
    open: open,
    close: close,
    isOpen: isOpen,
    submit: submit
  };
}));
