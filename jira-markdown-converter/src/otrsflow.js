/**
 * JiraOtrsFlow - traegt einen bereits geparsten OTRS-Verweis (JiraOtrsLink.parse)
 * strikt sequenziell in drei Stellen des Jira-Vorgangs ein: Label, Custom
 * Field "Kunden Referenz", Web-Link im Reiter "Web Link".
 *
 * Jeder Schritt versucht zuerst den Tastatur-Shortcut der klassischen AUI-
 * Oberflaeche (l bzw. .), bei Timeout folgt ein direkter DOM-Selektor. Warten,
 * Klicken, Tasten und Werte laufen ausschliesslich ueber JiraUi - kein eigenes
 * setTimeout-Polling.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraOtrsFlow = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var DEFAULT_FIELD_NAME = 'Kunden Referenz';
  var DEFAULT_TIMEOUT = 5000;
  var SHORTCUT_TIMEOUT = 1500;
  var STEP_DELAY = 150;

  /** Liefert JiraUi aus dem Fenster - erst zur Laufzeit aufgeloest, nicht beim Laden dieses Moduls. */
  function getUi() {
    if (typeof window !== 'undefined' && window.JiraUi) return window.JiraUi;
    if (typeof self !== 'undefined' && self.JiraUi) return self.JiraUi;
    return null;
  }

  /**
   * Fehler mit step-Eigenschaft, damit der Aufrufer den gescheiterten Schritt
   * erkennt. previousReference ist optional - nur setReference() liefert ihn,
   * damit der Aufrufer den alten Feldwert auch im Fehlerfall noch hat.
   */
  function stepError(step, message, previousReference) {
    var error = new Error(message);
    error.step = step;
    if (previousReference !== undefined) {
      error.previousReference = previousReference;
    }
    return error;
  }

  /**
   * Ruft die interne, instabile JIRA.trace-API auf, sofern vorhanden - reine
   * Kuer, keine Abhaengigkeit. Leerer catch-Block ist hier Absicht: ein
   * Fehler in einer fremden, undokumentierten API darf den Ablauf nicht
   * stoppen.
   */
  function pingJiraTrace() {
    try {
      if (typeof window !== 'undefined' && window.JIRA && typeof window.JIRA.trace === 'function') {
        window.JIRA.trace();
      }
    } catch (error) {
      // Absicht - siehe Kommentar oben.
    }
  }

  /* ---------------------------------------------------------------- *
   * Schritt 1: Label
   * ---------------------------------------------------------------- */

  function openLabelDialogFallback(doc, timeout) {
    var ui = getUi();
    var trigger = doc.querySelector('#edit-labels') || doc.querySelector('[data-fieldtype="labels"] .editable-field');
    if (!trigger) {
      return Promise.reject(new Error('Kennzeichen-Feld nicht gefunden'));
    }
    ui.click(trigger);
    return ui.waitForElement('#edit-labels-dialog', { root: doc, timeout: timeout });
  }

  function addLabel(ticketNumber, doc, timeout) {
    var ui = getUi();
    ui.sendKey(doc.body, 'l');
    return ui.waitForElement('#edit-labels-dialog', { root: doc, timeout: SHORTCUT_TIMEOUT })
      .catch(function () {
        return openLabelDialogFallback(doc, timeout);
      })
      .then(function () {
        return ui.waitForElement('#labels-textarea', { root: doc, timeout: timeout });
      })
      .then(function (textarea) {
        ui.setValue(textarea, ticketNumber);
        ui.sendKey(textarea, 'Enter');
        return ui.waitForElement('#edit-labels-dialog .aui-dialog2-footer .aui-button-primary', { root: doc, timeout: timeout });
      })
      .then(function (button) {
        ui.click(button);
        return ui.waitForGone('#edit-labels-dialog', { root: doc, timeout: timeout });
      })
      .catch(function (error) {
        throw stepError('label', 'Kennzeichen konnte nicht gesetzt werden: ' + error.message);
      });
  }

  /* ---------------------------------------------------------------- *
   * Schritt 2: Custom Field "Kunden Referenz"
   * ---------------------------------------------------------------- */

  /**
   * Primaerpfad: Schnellsuche nach dem Feldnamen oeffnet das Custom-Field-
   * Dialog. Das Feld selbst wird ueber ein generisches input im Dialog
   * gesucht, nicht ueber eine feste ID - die Custom-Field-ID ist
   * instanzabhaengig.
   */
  function locateReferenceInDialog(fieldName, doc, timeout) {
    var ui = getUi();
    ui.sendKey(doc.body, '.');
    return ui.waitForElement('#quick-search-dialog', { root: doc, timeout: SHORTCUT_TIMEOUT })
      .then(function () {
        var input = doc.querySelector('#quick-search-input');
        ui.setValue(input, fieldName);
        ui.sendKey(input, 'Enter');
        return ui.waitForElement('#customfield-dialog', { root: doc, timeout: timeout });
      })
      .then(function (dialog) {
        return { field: dialog.querySelector('input'), dialog: dialog };
      });
  }

  /**
   * Fallback: das Feld steht bereits inline auf der Seite, ohne Dialog.
   * Zwei getrennte Anlaeufe statt einer Selektorliste in einem querySelector
   * - eine Liste loest in Dokumentreihenfolge auf, nicht in Listenreihenfolge,
   * und wuerde damit die Prioritaet der beiden Selektoren durcheinanderbringen.
   */
  function locateReferenceFallback(fieldName, doc) {
    var field = doc.querySelector('[data-field-name="' + fieldName + '"] input');
    if (!field) {
      field = doc.querySelector('.customfield input');
    }
    if (!field) {
      return Promise.reject(new Error('Feld fuer Kunden Referenz nicht gefunden'));
    }
    return Promise.resolve({ field: field, dialog: null });
  }

  function setReference(text, fieldName, doc, timeout) {
    var ui = getUi();
    var previousReference = '';
    return locateReferenceInDialog(fieldName, doc, timeout)
      .catch(function () {
        return locateReferenceFallback(fieldName, doc);
      })
      .then(function (target) {
        previousReference = (target.field.value || '').trim();
        ui.setValue(target.field, text);
        if (!target.dialog) {
          var form = target.field.closest('form');
          var confirmButton = form ? form.querySelector('button[type="submit"], .aui-button[type="submit"]') : null;
          if (confirmButton) {
            ui.click(confirmButton);
          } else {
            // Letzter Versuch: synthetische KeyboardEvents loesen keine
            // Default-Action aus, Enter allein committet das Feld nicht.
            ui.sendKey(target.field, 'Enter');
          }
          return previousReference;
        }
        var button = target.dialog.querySelector('.aui-dialog2-footer .aui-button-primary');
        ui.click(button);
        return ui.waitForGone('#customfield-dialog', { root: doc, timeout: timeout }).then(function () {
          return previousReference;
        });
      })
      .catch(function (error) {
        throw stepError('reference', 'Kunden Referenz konnte nicht gesetzt werden: ' + error.message, previousReference);
      });
  }

  /* ---------------------------------------------------------------- *
   * Schritt 3: Web-Link
   * ---------------------------------------------------------------- */

  function openWebLinkDialogFallback(doc, timeout) {
    var ui = getUi();
    var trigger = doc.querySelector('#link-issue');
    if (!trigger) {
      return Promise.reject(new Error('Verweis-Knopf nicht gefunden'));
    }
    ui.click(trigger);
    return ui.waitForElement('#link-issue-dialog', { root: doc, timeout: timeout });
  }

  function openWebLinkDialog(doc, timeout) {
    var ui = getUi();
    ui.sendKey(doc.body, '.');
    return ui.waitForElement('#quick-search-dialog', { root: doc, timeout: SHORTCUT_TIMEOUT })
      .then(function () {
        var input = doc.querySelector('#quick-search-input');
        ui.setValue(input, 'link');
        ui.sendKey(input, 'Enter');
        return ui.waitForElement('#link-issue-dialog', { root: doc, timeout: timeout });
      })
      .catch(function () {
        return openWebLinkDialogFallback(doc, timeout);
      });
  }

  function addWebLink(linkText, url, doc, timeout) {
    var ui = getUi();
    var dialogRef = null;
    return openWebLinkDialog(doc, timeout)
      .then(function (dialog) {
        dialogRef = dialog;
        var tab = dialog.querySelector('.aui-tabs .menu-item a[href="#web-link"]');
        if (!tab) throw new Error('Reiter Web-Link nicht gefunden');
        ui.click(tab);
        // Auf dialogRef statt doc scopen: AUI laesst beim Oeffnen oft einen
        // alten, ausgeblendeten .aui-dialog2-Knoten stehen (siehe findMatch-
        // Kommentar in jiraui.js) - Panel und Primaerbutton muessen aus
        // demselben Dialogknoten stammen, sonst laufen sie auseinander.
        return ui.waitForElement('#web-link.active-pane', { root: dialogRef, timeout: timeout });
      })
      .then(function (panel) {
        ui.setValue(panel.querySelector('#weblink-url'), url);
        ui.setValue(panel.querySelector('#weblink-linktext'), linkText);
        var button = dialogRef.querySelector('.aui-dialog2-footer .aui-button-primary');
        ui.click(button);
        return ui.waitForGone('#link-issue-dialog', { root: doc, timeout: timeout });
      })
      .catch(function (error) {
        throw stepError('link', 'Web-Link konnte nicht erstellt werden: ' + error.message);
      });
  }

  /* ---------------------------------------------------------------- *
   * Oeffentliche API
   * ---------------------------------------------------------------- */

  /**
   * Fuehrt die drei Schritte strikt sequenziell aus. parsed kommt aus
   * JiraOtrsLink.parse() (ok: true) - dieses Modul parst selbst nichts.
   * options = { fieldName, timeout, doc }.
   */
  function run(parsed, options) {
    var opts = options || {};
    var doc = opts.doc || document;
    var timeout = opts.timeout === undefined ? DEFAULT_TIMEOUT : opts.timeout;
    var fieldName = opts.fieldName || DEFAULT_FIELD_NAME;
    var ui = getUi();
    var previousReference = '';

    if (!ui) {
      return Promise.reject(stepError('init', 'JiraUi nicht verfuegbar'));
    }

    return addLabel(parsed.label, doc, timeout)
      .then(function () {
        pingJiraTrace();
        return ui.delay(STEP_DELAY);
      })
      .then(function () {
        return setReference(parsed.reference, fieldName, doc, timeout);
      })
      .then(function (previous) {
        previousReference = previous;
        pingJiraTrace();
        return ui.delay(STEP_DELAY);
      })
      .then(function () {
        return addWebLink(parsed.linkText, parsed.url, doc, timeout);
      })
      .then(function () {
        pingJiraTrace();
        return {
          ok: true,
          steps: ['label', 'reference', 'link'],
          previousReference: previousReference
        };
      });
  }

  return {
    run: run
  };
});
