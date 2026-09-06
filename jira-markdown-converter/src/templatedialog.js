/**
 * Dialog "Vorlage einfuegen": nimmt bis zu fuenf Platzhalterwerte entgegen
 * und reicht sie an den Aufrufer weiter.
 *
 * Der Dialog kennt weder Jira-Felder noch Einstellungen - er sammelt nur
 * Werte und ruft onInsert(values) auf. Das Fuellen und Maskieren des Markups
 * (Settings.fillPlaceholders) macht der Aufrufer.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraTemplateDialog = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var MAX_FIELDS = 5;

  var dialog = null;
  var handlers = null;       // { onInsert, onClose } des offenen Dialogs
  var opener = null;         // Element, das vor dem Oeffnen den Fokus hatte

  var DIALOG_HTML = [
    '<div class="jmd-dialog__box" role="dialog" aria-modal="true" aria-labelledby="jmd-tpl-title">',
    '  <div class="jmd-dialog__head">',
    '    <span class="jmd-dialog__title" id="jmd-tpl-title">Vorlage einfuegen</span>',
    '    <button type="button" class="jmd-icon-btn" data-tpl-action="close" title="Schliessen" aria-label="Schliessen">x</button>',
    '  </div>',
    '  <div class="jmd-dialog__body">',
    '    <p class="jmd-hint"><b data-role="tpl-name">-</b></p>',
    '    <div class="jmd-dialog__fields" data-role="tpl-fields"></div>',
    '    <div class="jmd-target">',
    '      <span class="jmd-target__text">Ziel: <b data-role="tpl-target">-</b></span>',
    '    </div>',
    '    <div class="jmd-row jmd-row--main">',
    '      <button type="button" class="jmd-btn jmd-btn--primary" data-tpl-action="insert">Einfuegen</button>',
    '      <button type="button" class="jmd-btn" data-tpl-action="close">Abbrechen</button>',
    '    </div>',
    '    <p class="jmd-hint">Strg+Enter fuegt ein, Enter im letzten Feld ebenso, Escape schliesst den Dialog.</p>',
    '  </div>',
    '</div>'
  ].join('\n');

  function create() {
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.className = 'jmd-dialog';
    dialog.dataset.jmdUi = 'template-dialog';
    dialog.innerHTML = DIALOG_HTML;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (event) {
      // Klick neben den Kasten schliesst - wie beim Code-Dialog.
      if (event.target === dialog) {
        close();
        return;
      }
      var button = event.target.closest('[data-tpl-action]');
      if (!button) return;
      event.preventDefault();
      if (button.getAttribute('data-tpl-action') === 'insert') {
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
      if (event.key === 'Enter' && isLastField(event.target)) {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Tab') {
        keepFocusInside(event);
      }
    });

    return dialog;
  }

  function fieldInputs() {
    if (!dialog) return [];
    var nodes = dialog.querySelectorAll('[data-role="tpl-fields"] input');
    return Array.prototype.slice.call(nodes);
  }

  /** Enter fuegt nur im letzten Feld ein - in den anderen soll es nichts tun. */
  function isLastField(element) {
    var inputs = fieldInputs();
    return !!inputs.length && element === inputs[inputs.length - 1];
  }

  function focusables() {
    if (!dialog) return [];
    var nodes = dialog.querySelectorAll('button, input');
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
   * Felder
   * ------------------------------------------------------------------ */

  function buildFields(names) {
    var container = dialog.querySelector('[data-role="tpl-fields"]');
    container.textContent = '';

    names.slice(0, MAX_FIELDS).forEach(function (name, index) {
      var field = document.createElement('div');
      field.className = 'jmd-dialog__field';

      var inputId = 'jmd-tpl-field-' + index;

      var label = document.createElement('label');
      label.className = 'jmd-label';
      label.setAttribute('for', inputId);
      label.textContent = name;

      var input = document.createElement('input');
      input.type = 'text';
      input.id = inputId;
      input.className = 'jmd-textarea';
      input.dataset.name = name;

      field.appendChild(label);
      field.appendChild(input);
      container.appendChild(field);
    });
  }

  function values() {
    var result = {};
    fieldInputs().forEach(function (input) {
      result[input.dataset.name] = input.value;
    });
    return result;
  }

  function submit() {
    if (!dialog) return;
    var accepted = handlers && handlers.onInsert ? handlers.onInsert(values()) : false;
    Promise.resolve(accepted).then(function (ok) {
      if (ok !== false) close();
    });
  }

  /* ------------------------------------------------------------------ *
   * Oeffnen und Schliessen
   * ------------------------------------------------------------------ */

  /**
   * options: { title: Vorlagenname, placeholders: string[], target: Beschriftung
   *            des Zielfeldes, onInsert: fn(values), onClose: fn }
   * onInsert darf false (oder ein Promise darauf) liefern - dann bleibt der
   * Dialog offen.
   */
  function open(options) {
    handlers = options || {};
    create();
    opener = document.activeElement;

    dialog.querySelector('[data-role="tpl-name"]').textContent = handlers.title || '-';
    dialog.querySelector('[data-role="tpl-target"]').textContent = handlers.target || '-';
    buildFields(handlers.placeholders || []);

    dialog.classList.add('jmd-dialog--open');
    var first = fieldInputs()[0];
    if (first) first.focus();
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
    isOpen: isOpen
  };
});
