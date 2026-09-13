/**
 * JiraKeySync - uebernimmt einen Kunden-Schluessel aus der Beschreibung eines
 * Jira-Vorgangs in zwei Stellen: Label, Custom Field (Name aus den
 * Einstellungen, customerKeyFieldName). Die Suche im Text selbst delegiert an
 * JiraMapping.findKeys() - dieses Modul parst nichts neu.
 *
 * Zielplattform Jira Server / Data Center 9.12 LTS: derselbe Weg wie
 * src/otrsflow.js - Label (Taste l) und Custom Field (Taste . oeffnet den
 * Shifter) versuchen zuerst den Tastatur-Shortcut, bei Timeout folgt ein
 * sichtbarer DOM-Trigger. Warten, Klicken, Tasten und Werte laufen
 * ausschliesslich ueber JiraUi - kein eigenes setTimeout-Polling.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraKeySync = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var DEFAULT_TIMEOUT = 5000;
  var SHORTCUT_TIMEOUT = 1500;
  var STEP_DELAY = 150;

  /** Liefert JiraUi aus dem Fenster - erst zur Laufzeit aufgeloest, nicht beim Laden dieses Moduls. */
  function getUi() {
    if (typeof window !== 'undefined' && window.JiraUi) return window.JiraUi;
    if (typeof self !== 'undefined' && self.JiraUi) return self.JiraUi;
    return null;
  }

  /** Liefert JiraMapping aus dem Fenster - dieselbe verzoegerte Aufloesung wie getUi(). */
  function getMapping() {
    if (typeof window !== 'undefined' && window.JiraMapping) return window.JiraMapping;
    if (typeof self !== 'undefined' && self.JiraMapping) return self.JiraMapping;
    return null;
  }

  /** Fehler mit step-Eigenschaft, damit der Aufrufer den gescheiterten Schritt erkennt. */
  function stepError(step, message) {
    var error = new Error(message);
    error.step = step;
    return error;
  }

  /**
   * Liefert die eindeutigen Kunden-Schluessel eines Textes, in Fundreihenfolge.
   * Ohne JiraMapping (z. B. eine veraltete gecachte Ladeliste) liefert diese
   * Funktion ein leeres Array statt zu werfen.
   */
  function keysInDescription(text, pattern) {
    var mapping = getMapping();
    if (!mapping) return [];
    return mapping.findKeys(text, pattern);
  }

  /**
   * Liest den Text der Beschreibung ausschliesslich aus der Leseansicht.
   * Gesucht wird nur der Rich-Text-Rahmen innerhalb des bekannten
   * Beschreibungscontainers: zuerst '#description-val .user-content-block'
   * (9.12 Standardansicht), sonst '#descriptionmodule .user-content-block'
   * (aeltere Themes) - kein dokumentweiter Selektor mehr, der auch einen
   * fremden .user-content-block traefe. In Jira 9.12 ersetzt die
   * Inline-Bearbeitung den Inhalt von #description-val durch
   * form#description-form mit Textarea: steht ein form-, textarea-, input-
   * oder [contenteditable]-Element im gefundenen Container, oder liegt der
   * Container in einem '.editable-field.active' (Bearbeitungsmodus), liefert
   * diese Funktion '' - niemals Editorinhalt oder Knopfbeschriftungen.
   * Liefert '' auch, wenn kein Beschreibungscontainer im DOM steht.
   */
  function descriptionText(doc) {
    var root = doc || document;
    var container = root.querySelector('#description-val .user-content-block') ||
      root.querySelector('#descriptionmodule .user-content-block');
    if (!container) return '';
    if (container.querySelector('form, textarea, input, [contenteditable]')) return '';
    if (container.closest('.editable-field.active')) return '';
    return (container.textContent || '').trim();
  }

  /* ---------------------------------------------------------------- *
   * Schritt 1: Label
   * ---------------------------------------------------------------- */

  /**
   * Fallback-Trigger in Dokumentreihenfolge der Prioritaet: zuerst das
   * Kennzeichen-Feld selbst (steht direkt in der Ansicht), sonst das
   * More-Menue der Werkzeugleiste oeffnen und darin "Labels" klicken -
   * #edit-labels steht dort verborgen, bis #opsbar-operations_more das
   * Dropdown aufklappt. Derselbe Weg wie openLabelDialogFallback() in
   * src/otrsflow.js.
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

  function addLabel(key, doc, timeout) {
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
        ui.setValue(textarea, key);
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
   * Schritt 2: Custom Field
   * ---------------------------------------------------------------- */

  /**
   * Oeffnet den Shifter (Taste .), tippt query in #shifter-dialog-field -
   * das input-Ereignis filtert die Vorschlagsliste - und waehlt den ersten
   * sichtbaren Treffer per Klick, nicht per Enter: ein synthetisches
   * KeyboardEvent loest in 9.12 keinen Formular-Submit aus. Derselbe Weg wie
   * runShifterAction() in src/otrsflow.js.
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
   * instanzabhaengig. Derselbe Weg wie locateReferenceInDialog() in
   * src/otrsflow.js.
   */
  function locateFieldInDialog(fieldName, doc, timeout) {
    return runShifterAction(fieldName, '#modal-field-view', doc, timeout)
      .then(function (dialog) {
        var field = dialog.querySelector('input[id^="customfield_"]');
        if (!field) {
          throw new Error('Feld "' + fieldName + '" nicht im Dialog gefunden');
        }
        return { field: field, dialog: dialog };
      });
  }

  /**
   * Letzte Stufe, kein regulaerer Weg in 9.12: ohne Wert steht das Feld
   * nicht in der Ansicht, der Shifter ist der einzige Weg hinein. Gesucht
   * wird ausschliesslich ueber [data-field-name="<fieldName>"] input - kein
   * generischer zweiter Versuch mehr ueber '.customfield input', der auch
   * ein beliebiges fremdes Feld treffen und den Schluessel dort ablegen
   * wuerde. fieldName landet direkt im Attribut-Selektor: enthaelt er " oder
   * ] oder \, bricht die Suche vorher ab statt einen kaputten oder
   * manipulierten Selektor zu bauen.
   */
  function locateFieldFallback(fieldName, doc) {
    if (/["\]\\]/.test(fieldName)) {
      return Promise.reject(new Error('Feldname "' + fieldName + '" enthaelt unzulaessige Zeichen'));
    }
    var field = doc.querySelector('[data-field-name="' + fieldName + '"] input');
    if (!field) {
      return Promise.reject(new Error('Feld "' + fieldName + '" steht nicht in der Ansicht - der Shifter ist der einzige Weg'));
    }
    return Promise.resolve({ field: field, dialog: null });
  }

  function setField(key, fieldName, doc, timeout) {
    var ui = getUi();
    return locateFieldInDialog(fieldName, doc, timeout)
      .catch(function () {
        return locateFieldFallback(fieldName, doc);
      })
      .then(function (target) {
        ui.setValue(target.field, key);
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
          return;
        }
        if (!ui.submitForm(target.dialog)) {
          throw new Error('Formular fuer "' + fieldName + '" nicht gefunden');
        }
        return ui.waitForGone('#modal-field-view', { root: doc, visible: true, timeout: timeout });
      })
      .catch(function (error) {
        throw stepError('field', 'Custom Field "' + fieldName + '" konnte nicht gesetzt werden: ' + error.message);
      });
  }

  /* ---------------------------------------------------------------- *
   * Oeffentliche API
   * ---------------------------------------------------------------- */

  /**
   * Setzt erst das Label, dann das Custom Field. options = { key, fieldName,
   * doc, timeout }. Schlaegt das Label fehl, bricht der Ablauf ab - es gibt
   * kein Custom Field mehr. Schlaegt nur das Custom Field fehl, bleibt das
   * Label gesetzt: der Fehler traegt dann einen Hinweis darauf in der
   * Meldung, damit der Aufrufer den Nutzer informieren kann.
   */
  function run(options) {
    var opts = options || {};
    var doc = opts.doc || document;
    var timeout = opts.timeout === undefined ? DEFAULT_TIMEOUT : opts.timeout;
    var key = opts.key;
    var fieldName = opts.fieldName;
    var ui = getUi();

    if (!ui) {
      return Promise.reject(stepError('init', 'JiraUi nicht verfuegbar'));
    }
    if (!key) {
      return Promise.reject(stepError('init', 'Kein Kunden-Schluessel angegeben'));
    }
    if (!fieldName) {
      return Promise.reject(stepError('init', 'Kein Feldname fuer den Kunden-Schluessel hinterlegt'));
    }

    return addLabel(key, doc, timeout)
      .then(function () {
        return ui.delay(STEP_DELAY);
      })
      .then(function () {
        return setField(key, fieldName, doc, timeout);
      })
      .then(function () {
        return { key: key, label: true, field: true };
      })
      .catch(function (error) {
        if (error.step === 'field') {
          var fieldError = stepError('field', error.message + ' Das Kennzeichen wurde bereits gesetzt.');
          fieldError.key = key;
          fieldError.label = true;
          fieldError.field = false;
          throw fieldError;
        }
        throw error;
      });
  }

  return {
    keysInDescription: keysInDescription,
    descriptionText: descriptionText,
    run: run
  };
});
