/**
 * Dialog "Code einfuegen": Sprache waehlen, Code eintippen, fertigen
 * Codeblock zurueckgeben.
 *
 * Der Dialog kennt weder Jira-Felder noch Einstellungen - er baut nur das
 * Ergebnis (Jira-Markup und HTML) und reicht es an den Aufrufer weiter.
 * Der Code-Text laeuft dabei nie durch den Markdown-Parser.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraCodeDialog = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  // Eine Einrueckstufe im Eingabefeld. Tab schreibt sie, Umschalt+Tab nimmt
  // sie zurueck.
  var INDENT = '    ';

  var NO_LANGUAGE = '';

  var dialog = null;
  var handlers = null;       // { onInsert: fn } des offenen Dialogs
  var opener = null;         // Element, das vor dem Oeffnen den Fokus hatte
  var lastLanguage = NO_LANGUAGE;

  var DIALOG_HTML = [
    '<div class="jmd-dialog__box" role="dialog" aria-modal="true" aria-labelledby="jmd-code-title">',
    '  <div class="jmd-dialog__head">',
    '    <span class="jmd-dialog__title" id="jmd-code-title">Code einfuegen</span>',
    '    <button type="button" class="jmd-icon-btn" data-code-action="close" title="Schliessen" aria-label="Schliessen">x</button>',
    '  </div>',
    '  <div class="jmd-dialog__body">',
    '    <label class="jmd-label" for="jmd-code-language">Sprache</label>',
    '    <select id="jmd-code-language" class="jmd-select jmd-select--wide" data-role="language"></select>',
    '    <label class="jmd-label" for="jmd-code-input">Code</label>',
    '    <textarea id="jmd-code-input" class="jmd-textarea jmd-code-input" rows="12" spellcheck="false"',
    '              aria-describedby="jmd-code-hint" placeholder="Code hier eintippen oder einfuegen ..."></textarea>',
    '    <p class="jmd-hint" id="jmd-code-hint">',
    '      Tabulator rueckt um vier Leerzeichen ein, Umschalt+Tab nimmt sie zurueck.',
    '      Ist am Zeilenanfang nichts mehr wegzunehmen, springt Umschalt+Tab aus dem',
    '      Feld zurueck zur Sprachauswahl. Strg+Enter fuegt ein, Escape schliesst den Dialog.',
    '    </p>',
    '    <div class="jmd-target">',
    '      <span class="jmd-target__text">Ziel: <b data-role="code-target">-</b></span>',
    '    </div>',
    '    <div class="jmd-row jmd-row--main">',
    '      <button type="button" class="jmd-btn jmd-btn--primary" data-code-action="insert">Einfuegen</button>',
    '      <button type="button" class="jmd-btn" data-code-action="close">Abbrechen</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  function converter() {
    return typeof window !== 'undefined' ? window.JiraMarkdown : null;
  }

  /** Die von Jira unterstuetzten Sprachen - Liste kommt aus dem Konverter. */
  function languages() {
    var api = converter();
    return (api && api.codeLanguages) || [];
  }

  function fillLanguages(select) {
    var none = document.createElement('option');
    none.value = NO_LANGUAGE;
    none.textContent = '(ohne Sprache)';
    select.appendChild(none);

    var names = languages();
    for (var i = 0; i < names.length; i++) {
      var option = document.createElement('option');
      option.value = names[i];
      option.textContent = names[i];
      select.appendChild(option);
    }
  }

  function create() {
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.className = 'jmd-dialog';
    dialog.dataset.jmdUi = 'code-dialog';
    dialog.innerHTML = DIALOG_HTML;
    document.body.appendChild(dialog);

    fillLanguages(dialog.querySelector('[data-role="language"]'));

    dialog.addEventListener('click', function (event) {
      // Klick neben den Kasten schliesst - wie bei Jiras eigenen Dialogen.
      if (event.target === dialog) {
        close();
        return;
      }
      var button = event.target.closest('[data-code-action]');
      if (!button) return;
      event.preventDefault();
      if (button.getAttribute('data-code-action') === 'insert') {
        submit();
      } else {
        close();
      }
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Tab') {
        keepFocusInside(event);
      }
    });

    var input = dialog.querySelector('#jmd-code-input');
    input.addEventListener('keydown', onInputKeydown);
    // Im eigenen Feld nie die globale Auto-Konvertierung anwenden.
    input.addEventListener('paste', function (event) {
      event.stopPropagation();
    }, true);

    return dialog;
  }

  function focusables() {
    if (!dialog) return [];
    var nodes = dialog.querySelectorAll('button, select, textarea');
    return Array.prototype.slice.call(nodes);
  }

  /** Modaler Dialog: der Tabulator soll den Kasten nicht verlassen. */
  function keepFocusInside(event) {
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------------ *
   * Einrueckung im Eingabefeld
   * ------------------------------------------------------------------ */

  function onInputKeydown(event) {
    if (event.key !== 'Tab') return;
    var area = event.currentTarget;
    var changed = event.shiftKey ? outdent(area) : indent(area);
    // Nur wenn wirklich eingerueckt wurde, bleibt der Fokus im Feld. So
    // kommt man mit Umschalt+Tab auch ohne Maus wieder heraus.
    if (changed) event.preventDefault();
  }

  function lineStart(value, index) {
    var found = value.lastIndexOf('\n', index - 1);
    return found === -1 ? 0 : found + 1;
  }

  function apply(area, value, start, end) {
    area.value = value;
    area.setSelectionRange(start, end);
  }

  function indent(area) {
    var start = area.selectionStart;
    var end = area.selectionEnd;
    var value = area.value;

    if (value.slice(start, end).indexOf('\n') === -1) {
      var caret = start + INDENT.length;
      apply(area, value.slice(0, start) + INDENT + value.slice(end), caret, caret);
      return true;
    }

    var from = lineStart(value, start);
    var lines = value.slice(from, end).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (i === lines.length - 1 && lines[i] === '') continue;
      lines[i] = INDENT + lines[i];
    }
    var block = lines.join('\n');
    apply(area, value.slice(0, from) + block + value.slice(end), from, from + block.length);
    return true;
  }

  function outdent(area) {
    var start = area.selectionStart;
    var end = area.selectionEnd;
    var value = area.value;
    var from = lineStart(value, start);
    var lines = value.slice(from, end === start ? lineEnd(value, start) : end).split('\n');
    var removed = 0;

    for (var i = 0; i < lines.length; i++) {
      var match = /^(?: {1,4}|\t)/.exec(lines[i]);
      if (!match) continue;
      lines[i] = lines[i].slice(match[0].length);
      removed += match[0].length;
    }
    if (!removed) return false;

    var stop = end === start ? lineEnd(value, start) : end;
    var block = lines.join('\n');
    var caret = Math.max(from, start - removed);
    apply(area, value.slice(0, from) + block + value.slice(stop),
      end === start ? caret : from,
      end === start ? caret : from + block.length);
    return true;
  }

  function lineEnd(value, index) {
    var found = value.indexOf('\n', index);
    return found === -1 ? value.length : found;
  }

  /* ------------------------------------------------------------------ *
   * Ergebnis
   * ------------------------------------------------------------------ */

  /**
   * Baut aus Sprache und Code beide Ausgaben. Der Code bleibt woertlich:
   * fuer Jira-Markup unveraendert, fuers HTML maskiert der Dialekt selbst.
   */
  function build(language, code) {
    var api = converter();
    var body = String(code == null ? '' : code)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\n]+$/, '');
    var lang = api && api.mapLanguage ? api.mapLanguage(language) : language;
    return {
      language: lang,
      code: body,
      jira: api ? api.dialects.jira.codeBlock(lang, body) : body,
      html: api ? api.dialects.html.codeBlock(lang, body) : body
    };
  }

  function submit() {
    if (!dialog) return;
    var input = dialog.querySelector('#jmd-code-input');
    var select = dialog.querySelector('[data-role="language"]');
    if (!input.value.trim()) {
      input.focus();
      if (handlers && handlers.onEmpty) handlers.onEmpty();
      return;
    }
    lastLanguage = select.value;
    var result = build(select.value, input.value);
    var accepted = handlers && handlers.onInsert ? handlers.onInsert(result) : false;
    Promise.resolve(accepted).then(function (ok) {
      if (ok !== false) close();
    });
  }

  /* ------------------------------------------------------------------ *
   * Oeffnen und Schliessen
   * ------------------------------------------------------------------ */

  /**
   * options: { target: Beschriftung des Zielfeldes, onInsert: fn(result),
   *            onEmpty: fn, onClose: fn }
   * onInsert darf false (oder ein Promise darauf) liefern - dann bleibt der
   * Dialog offen.
   */
  function open(options) {
    handlers = options || {};
    create();
    opener = document.activeElement;

    var input = dialog.querySelector('#jmd-code-input');
    var select = dialog.querySelector('[data-role="language"]');
    var label = dialog.querySelector('[data-role="code-target"]');

    input.value = '';
    select.value = lastLanguage;
    if (select.value !== lastLanguage) select.value = NO_LANGUAGE;
    label.textContent = handlers.target || '-';

    dialog.classList.add('jmd-dialog--open');
    input.focus();
    return dialog;
  }

  function close() {
    if (!dialog) return;
    dialog.classList.remove('jmd-dialog--open');
    var done = handlers && handlers.onClose;
    handlers = null;
    // Fokus zurueck ins Jira-Feld, damit die Cursorposition erhalten bleibt.
    if (opener && opener.isConnected && opener.focus) opener.focus();
    opener = null;
    if (done) done();
  }

  function isOpen() {
    return !!dialog && dialog.classList.contains('jmd-dialog--open');
  }

  return {
    open: open,
    close: close,
    isOpen: isOpen,
    build: build,
    languages: languages,
    INDENT: INDENT
  };
});
