/**
 * Dialog "OTRS-Link einpflegen": nimmt einen OTRS-Verweis in beliebigem
 * Format entgegen, zeigt per JiraOtrsLink eine Live-Vorschau der drei
 * Zielwerte (Label, Kunden Referenz, Web-Link) und reicht das geparste
 * Ergebnis ueber handlers.onSubmit weiter.
 *
 * Der Dialog kennt Jira nicht - er baut nur das Ergebnis und reicht es an
 * den Aufrufer weiter, genau wie codedialog.js und templatedialog.js.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraOtrsDialog = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var dialog = null;
  var handlers = null;       // { onSubmit: fn(parsed), onError: fn(message), onClose: fn, opener: Element } des offenen Dialogs
  var opener = null;         // Element, das vor dem Oeffnen den Fokus hatte
  var lastParsed = null;     // letztes Ergebnis von JiraOtrsLink.parse()
  var lastReportedError = null; // zuletzt an onError gemeldete Fehlermeldung, fuer die Entprellung

  var DIALOG_HTML = [
    '<div class="jmd-dialog__box" role="dialog" aria-modal="true" aria-labelledby="jmd-otrs-title">',
    '  <div class="jmd-dialog__head">',
    '    <span class="jmd-dialog__title" id="jmd-otrs-title">OTRS-Link einpflegen</span>',
    '    <button type="button" class="jmd-icon-btn" data-otrs-action="close" title="Schliessen" aria-label="Schliessen">x</button>',
    '  </div>',
    '  <div class="jmd-dialog__body">',
    '    <label class="jmd-label" for="jmd-otrs-input">OTRS-Verweis</label>',
    '    <textarea id="jmd-otrs-input" class="jmd-textarea" rows="4" data-role="otrs-input"',
    '              placeholder="Markdown-Link, HTML-Anker oder Text mit OTRS-Link einfuegen ..."></textarea>',
    '    <div class="jmd-otrs-preview">',
    '      <div class="jmd-otrs-preview__row">',
    '        <span class="jmd-otrs-preview__key">Label</span>',
    '        <span class="jmd-otrs-preview__value" data-role="preview-label">-</span>',
    '      </div>',
    '      <div class="jmd-otrs-preview__row">',
    '        <span class="jmd-otrs-preview__key">Kunden Referenz</span>',
    '        <span class="jmd-otrs-preview__value" data-role="preview-reference">-</span>',
    '      </div>',
    '      <div class="jmd-otrs-preview__row">',
    '        <span class="jmd-otrs-preview__key">Web-Link</span>',
    '        <span class="jmd-otrs-preview__value" data-role="preview-link">-</span>',
    '      </div>',
    '    </div>',
    '    <p class="jmd-hint jmd-otrs-error" data-role="otrs-error"></p>',
    '    <div class="jmd-row jmd-row--main">',
    '      <button type="button" class="jmd-btn jmd-btn--primary" data-otrs-action="submit" disabled>Absenden</button>',
    '      <button type="button" class="jmd-btn" data-otrs-action="close">Abbrechen</button>',
    '    </div>',
    '    <p class="jmd-hint">Strg+Enter sendet ab, Escape schliesst den Dialog.</p>',
    '  </div>',
    '</div>'
  ].join('\n');

  function otrsLink() {
    return typeof window !== 'undefined' ? window.JiraOtrsLink : null;
  }

  function create() {
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.className = 'jmd-dialog';
    dialog.dataset.jmdUi = 'otrs-dialog';
    dialog.innerHTML = DIALOG_HTML;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (event) {
      // Klick neben den Kasten schliesst - wie bei Jiras eigenen Dialogen.
      if (event.target === dialog) {
        close();
        return;
      }
      var button = event.target.closest('[data-otrs-action]');
      if (!button) return;
      event.preventDefault();
      if (button.getAttribute('data-otrs-action') === 'submit') {
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

    var input = dialog.querySelector('[data-role="otrs-input"]');
    input.addEventListener('input', updatePreview);
    // Im eigenen Feld nie die globale Auto-Konvertierung anwenden.
    input.addEventListener('paste', function (event) {
      event.stopPropagation();
    }, true);

    return dialog;
  }

  function focusables() {
    if (!dialog) return [];
    var nodes = dialog.querySelectorAll('button, textarea');
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
   * Vorschau
   * ------------------------------------------------------------------ */

  function resetPreview() {
    dialog.querySelector('[data-role="preview-label"]').textContent = '-';
    dialog.querySelector('[data-role="preview-reference"]').textContent = '-';
    dialog.querySelector('[data-role="preview-link"]').textContent = '-';
    dialog.querySelector('[data-role="otrs-error"]').textContent = '';
    dialog.querySelector('[data-otrs-action="submit"]').disabled = true;
  }

  /**
   * Ruft JiraOtrsLink.parse() auf und schreibt die erkannten Werte per
   * textContent in die Vorschau - nie per innerHTML, package.test.js prueft
   * das. Bei ok:false bleibt die Vorschau leer, der Fehlertext erscheint und
   * "Absenden" wird gesperrt.
   */
  function updatePreview() {
    var input = dialog.querySelector('[data-role="otrs-input"]');
    var api = otrsLink();
    lastParsed = api ? api.parse(input.value) : { ok: false, error: 'JiraOtrsLink nicht verfuegbar.' };

    var submitBtn = dialog.querySelector('[data-otrs-action="submit"]');
    var errorLine = dialog.querySelector('[data-role="otrs-error"]');

    if (lastParsed.ok) {
      dialog.querySelector('[data-role="preview-label"]').textContent = lastParsed.label;
      dialog.querySelector('[data-role="preview-reference"]').textContent = lastParsed.reference;
      dialog.querySelector('[data-role="preview-link"]').textContent =
        lastParsed.linkText + ' (' + lastParsed.url + ')';
      errorLine.textContent = '';
      submitBtn.disabled = false;
      // Reset fuer die Entprellung: nach einer gueltigen Eingabe zaehlt eine
      // erneut auftretende Fehlermeldung wieder als neu.
      lastReportedError = null;
    } else {
      dialog.querySelector('[data-role="preview-label"]').textContent = '-';
      dialog.querySelector('[data-role="preview-reference"]').textContent = '-';
      dialog.querySelector('[data-role="preview-link"]').textContent = '-';
      errorLine.textContent = lastParsed.error;
      submitBtn.disabled = true;
      // Nur bei geaenderter Meldung melden - sonst feuert onError bei jedem
      // Tastendruck erneut mit derselben Meldung.
      if (lastParsed.error !== lastReportedError) {
        lastReportedError = lastParsed.error;
        if (handlers && handlers.onError) handlers.onError(lastParsed.error);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Absenden
   * ------------------------------------------------------------------ */

  function submit() {
    if (!dialog) return;
    if (!lastParsed || !lastParsed.ok) {
      if (handlers && handlers.onError) {
        handlers.onError(lastParsed ? lastParsed.error : 'Eingabe ist leer.');
      }
      return;
    }
    var accepted = handlers && handlers.onSubmit ? handlers.onSubmit(lastParsed) : false;
    Promise.resolve(accepted).then(function (ok) {
      if (ok !== false) close();
    });
  }

  /* ------------------------------------------------------------------ *
   * Oeffnen und Schliessen
   * ------------------------------------------------------------------ */

  /**
   * handlers = { onSubmit: fn(parsed), onError: fn(message), onClose: fn,
   *              opener: Element }. onSubmit darf false (oder ein Promise
   * darauf) liefern - dann bleibt der Dialog offen. onClose ist optional und
   * wird beim Schliessen aufgerufen (Abbruchsignal fuer den Aufrufer).
   * opener ist optional - ohne Angabe zaehlt der Fokus beim Oeffnen
   * (document.activeElement), das reicht aber nicht, wenn der Aufrufer selbst
   * nicht den Fokus haelt (z. B. Oeffnen ueber einen Panel-Knopf).
   */
  function open(opts) {
    handlers = opts || {};
    create();
    opener = handlers.opener || document.activeElement;

    var input = dialog.querySelector('[data-role="otrs-input"]');
    input.value = '';
    lastParsed = null;
    lastReportedError = null;
    resetPreview();

    dialog.classList.add('jmd-dialog--open');
    input.focus();
    return dialog;
  }

  function close() {
    if (!dialog) return;
    // Vor dem Entfernen der Klasse pruefen - .jmd-dialog ist display: none,
    // danach waere der Fokus schon aus dem Dialog geblurrt.
    var focusInDialog = dialog.contains(document.activeElement);
    dialog.classList.remove('jmd-dialog--open');
    var done = handlers && handlers.onClose;
    handlers = null;
    lastParsed = null;
    lastReportedError = null;
    // Der Fokus geht nur zurueck, wenn er noch im Dialog steht (Abbrechen,
    // Escape, Klick daneben) - hat der Aufrufer nach dem Absenden bereits
    // ins Jira-Feld fokussiert, darf das hier nicht ueberschrieben werden.
    if (focusInDialog && opener && opener.isConnected && opener.focus) opener.focus();
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
