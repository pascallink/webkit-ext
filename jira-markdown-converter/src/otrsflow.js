/**
 * JiraOtrsFlow - traegt einen bereits geparsten OTRS-Verweis (JiraOtrsLink.parse)
 * strikt sequenziell in drei Stellen des Jira-Vorgangs ein: Label, Custom
 * Field "Kunden Referenz", Web-Link im Dialog "Link".
 *
 * Zielplattform Jira Server / Data Center 9.12 LTS: Label (Taste l) und
 * Kunden Referenz/Web-Link (Taste . oeffnet den Shifter) versuchen zuerst den
 * Tastatur-Shortcut, bei Timeout folgt ein sichtbarer DOM-Trigger aus der
 * Werkzeugleiste. Die Legacy-Dialoge (jira-dialog) liegen in 9.12 dauerhaft
 * im DOM und werden nur per Klasse jira-dialog-open sichtbar - jedes Warten
 * auf einen Dialog laeuft darum mit { visible: true }. Warten, Klicken,
 * Tasten und Werte laufen ausschliesslich ueber JiraUi - kein eigenes
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

  /* ---------------------------------------------------------------- *
   * Schritt 1: Label
   * ---------------------------------------------------------------- */

  /**
   * Fallback-Trigger in Dokumentreihenfolge der Prioritaet: zuerst das
   * Kennzeichen-Feld selbst (steht direkt in der Ansicht), sonst das
   * More-Menue der Werkzeugleiste oeffnen und darin "Labels" klicken -
   * #edit-labels steht dort verborgen, bis #opsbar-operations_more das
   * Dropdown aufklappt.
   */
  function openLabelDialogFallback(doc, timeout) {
    var ui = getUi();
    var trigger = doc.querySelector('#wrap-labels .labels-wrap.editable-field');
    if (trigger) {
      ui.click(trigger);
      return ui.waitForElement('#edit-labels-dialog', { root: doc, visible: true, timeout: timeout });
    }
    var moreButton = doc.querySelector('#opsbar-operations_more');
    if (!moreButton) {
      return Promise.reject(new Error('Kennzeichen-Feld nicht gefunden'));
    }
    ui.click(moreButton);
    var editLabels = doc.querySelector('#edit-labels');
    if (!editLabels) {
      return Promise.reject(new Error('Kennzeichen-Feld nicht gefunden'));
    }
    ui.click(editLabels);
    return ui.waitForElement('#edit-labels-dialog', { root: doc, visible: true, timeout: timeout });
  }

  function addLabel(ticketNumber, doc, timeout) {
    var ui = getUi();
    ui.sendKey(doc.body, 'l');
    return ui.waitForElement('#edit-labels-dialog', { root: doc, visible: true, timeout: SHORTCUT_TIMEOUT })
      .catch(function () {
        return openLabelDialogFallback(doc, timeout);
      })
      .then(function () {
        return ui.waitForElement('#labels-textarea', { root: doc, timeout: timeout });
      })
      .then(function (textarea) {
        ui.setValue(textarea, ticketNumber);
        ui.sendKey(textarea, 'Enter');
        var dialog = doc.querySelector('#edit-labels-dialog');
        if (!ui.submitForm(dialog)) {
          throw new Error('Formular des Labels-Dialogs nicht gefunden');
        }
        return ui.waitForGone('#edit-labels-dialog', { root: doc, visible: true, timeout: timeout });
      })
      .catch(function (error) {
        throw stepError('label', 'Kennzeichen konnte nicht gesetzt werden: ' + error.message);
      });
  }

  /* ---------------------------------------------------------------- *
   * Schritt 2: Custom Field "Kunden Referenz"
   * ---------------------------------------------------------------- */

  /**
   * Oeffnet den Shifter (Taste .), tippt query in #shifter-dialog-field -
   * das input-Ereignis filtert die Vorschlagsliste - und waehlt den ersten
   * sichtbaren Treffer per Klick, nicht per Enter: ein synthetisches
   * KeyboardEvent loest in 9.12 keinen Formular-Submit aus. Loest mit dem
   * per targetSelector gefundenen Folge-Dialog auf ({ visible: true }, die
   * Legacy-Dialoge stehen dauerhaft im DOM).
   */
  function runShifterAction(query, targetSelector, doc, timeout) {
    var ui = getUi();
    ui.sendKey(doc.body, '.');
    return ui.waitForElement('#shifter-dialog', { root: doc, visible: true, timeout: SHORTCUT_TIMEOUT })
      .then(function () {
        var field = doc.querySelector('#shifter-dialog-field');
        ui.setValue(field, query);
        return ui.waitForElement('#shifter-dialog-suggestions .aui-list-item', { root: doc, visible: true, timeout: timeout });
      })
      .then(function (suggestion) {
        ui.click(suggestion);
        return ui.waitForElement(targetSelector, { root: doc, visible: true, timeout: timeout });
      });
  }

  /**
   * Primaerpfad: der Shifter mit dem Feldnamen als Suchbegriff oeffnet
   * #modal-field-view. Das Feld selbst wird ueber input[id^="customfield_"]
   * im Dialog gesucht, nicht ueber eine feste ID - die Custom-Field-ID ist
   * instanzabhaengig (siehe docs/jira-dialogs-referenz.md).
   */
  function locateReferenceInDialog(fieldName, doc, timeout) {
    return runShifterAction(fieldName, '#modal-field-view', doc, timeout)
      .then(function (dialog) {
        var field = dialog.querySelector('input[id^="customfield_"]');
        if (!field) {
          throw new Error('Feld fuer Kunden Referenz nicht im Dialog gefunden');
        }
        return { field: field, dialog: dialog };
      });
  }

  /**
   * Letzte Stufe, kein regulaerer Weg in 9.12: ohne Wert steht das Feld
   * "Kunden Referenz" nicht in der Ansicht, der Shifter ist der einzige
   * Weg hinein. Zwei getrennte Anlaeufe statt einer Selektorliste in einem
   * querySelector - eine Liste loest in Dokumentreihenfolge auf, nicht in
   * Listenreihenfolge, und wuerde damit die Prioritaet der beiden
   * Selektoren durcheinanderbringen.
   */
  function locateReferenceFallback(fieldName, doc) {
    var field = doc.querySelector('[data-field-name="' + fieldName + '"] input');
    if (!field) {
      field = doc.querySelector('.customfield input');
    }
    if (!field) {
      return Promise.reject(new Error('Feld fuer Kunden Referenz steht nicht in der Ansicht - der Shifter ist der einzige Weg'));
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
        if (!ui.submitForm(target.dialog)) {
          throw new Error('Formular fuer Kunden Referenz nicht gefunden');
        }
        return ui.waitForGone('#modal-field-view', { root: doc, visible: true, timeout: timeout }).then(function () {
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

  /**
   * Fallback: More-Menue der Werkzeugleiste oeffnen und darin "Link"
   * klicken - #link-issue steht dort verborgen, bis #opsbar-operations_more
   * das Dropdown aufklappt.
   */
  function openWebLinkDialogFallback(doc, timeout) {
    var ui = getUi();
    var moreButton = doc.querySelector('#opsbar-operations_more');
    if (!moreButton) {
      return Promise.reject(new Error('Verweis-Knopf nicht gefunden'));
    }
    ui.click(moreButton);
    var trigger = doc.querySelector('#link-issue');
    if (!trigger) {
      return Promise.reject(new Error('Verweis-Knopf nicht gefunden'));
    }
    ui.click(trigger);
    return ui.waitForElement('#link-issue-dialog', { root: doc, visible: true, timeout: timeout });
  }

  function openWebLinkDialog(doc, timeout) {
    return runShifterAction('Link', '#link-issue-dialog', doc, timeout)
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
        var webLinkButton = dialog.querySelector('#add-web-link-link');
        if (!webLinkButton) throw new Error('Reiter Web-Link nicht gefunden');
        if (!webLinkButton.classList.contains('selected')) {
          ui.click(webLinkButton);
        }
        // Der Rumpf wird per AJAX aus data-url nachgeladen - auf dialogRef
        // statt doc scopen, damit ein alter, noch nicht ausgetauschter
        // Dialogknoten nicht faelschlich trifft (siehe findMatch-Kommentar
        // in jiraui.js).
        return ui.waitForElement('#web-link-url', { root: dialogRef, timeout: timeout });
      })
      .then(function (urlField) {
        // #web-link-url ist mit http:// vorbelegt - ersetzen, nicht ergaenzen.
        ui.setValue(urlField, url);
        ui.setValue(dialogRef.querySelector('#web-link-title'), linkText);
        if (!ui.submitForm(dialogRef)) {
          throw new Error('Formular des Link-Dialogs nicht gefunden');
        }
        return ui.waitForGone('#link-issue-dialog', { root: doc, visible: true, timeout: timeout });
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

    // Kein Warten auf Jiras internes Trace-Signal (JIRA.trace): das
    // Content-Script laeuft in der isolierten Welt und sieht window.JIRA nie
    // (Issue #113, Ursache Issue 16) - die Schritte verlassen sich allein auf
    // JiraUi.delay als Pause zwischen den Dialogen.
    return addLabel(parsed.label, doc, timeout)
      .then(function () {
        return ui.delay(STEP_DELAY);
      })
      .then(function () {
        return setReference(parsed.reference, fieldName, doc, timeout);
      })
      .then(function (previous) {
        previousReference = previous;
        return ui.delay(STEP_DELAY);
      })
      .then(function () {
        return addWebLink(parsed.linkText, parsed.url, doc, timeout);
      })
      .then(function () {
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
