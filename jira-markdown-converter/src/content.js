/**
 * Content-Script: baut die Bedienelemente in Jira ein und uebernimmt das
 * Konvertieren und Einfuegen.
 */
(function () {
  'use strict';

  if (window.__jiraMarkdownConverterLoaded) return;
  window.__jiraMarkdownConverterLoaded = true;

  var Converter = window.JiraMarkdown;
  var Editors = window.JiraEditors;
  var Settings = window.JiraMdSettings;

  var settings = Settings.DEFAULTS;
  var panel = null;
  var fab = null;
  var target = null;         // gemerktes Zielfeld
  var pickingTarget = false;
  var toastTimer = null;

  /* ------------------------------------------------------------------ *
   * Konvertierung
   * ------------------------------------------------------------------ */

  function convert(markdown) {
    return Converter.convert(markdown, Settings.converterOptions(settings));
  }

  /**
   * Welcher Text soll in dieses Feld? In den Rich-Text-Editor von Jira Cloud
   * kann wahlweise das Markdown selbst wandern (der Editor formatiert beim
   * Einfuegen mit) oder fertiges Jira-Markup.
   */
  function outputFor(element, markdown) {
    if (Editors.isTextarea(element)) return convert(markdown);
    if (settings.richEditorFormat === 'markdown') return markdown;
    return convert(markdown);
  }

  function currentTarget() {
    if (target && Editors.isVisible(target)) return target;
    target = Editors.findTarget();
    return target;
  }

  /** Wandelt Auswahl bzw. gesamten Inhalt des aktiven Feldes an Ort und Stelle um. */
  function convertInPlace(element) {
    var field = element || Editors.activeEditor() || currentTarget();
    if (!field) {
      toast('Kein Jira-Eingabefeld gefunden.', true);
      return false;
    }

    var selected = Editors.getSelectedText(field);
    var source = selected || Editors.getText(field);
    if (!source.trim()) {
      toast('Das Feld ist leer.', true);
      return false;
    }

    var output = outputFor(field, source);
    if (output === source) {
      toast('Nichts zu konvertieren.', true);
      return false;
    }

    if (selected) {
      // Der Konverter schneidet Rand-Leerzeichen ab. Bei einer Auswahl mitten
      // im Text muessen sie erhalten bleiben, sonst kleben Zeilen zusammen.
      output = /^\s*/.exec(source)[0] + output + /\s*$/.exec(source)[0];
    }

    var done = Editors.insert(field, output, selected ? 'insert' : 'replace');
    toast(done ? 'In Jira-Markup umgewandelt.' : 'Einfuegen nicht moeglich.', !done);
    return done;
  }

  /* ------------------------------------------------------------------ *
   * Einfuegen abfangen (Strg+V)
   * ------------------------------------------------------------------ */

  function onPaste(event) {
    if (!settings.convertOnPaste) return;
    if (Editors.isSynthetic(event)) return;

    var field = Editors.editableFrom(event.target) || Editors.activeEditor();
    if (!field) return;

    var clipboard = event.clipboardData;
    if (!clipboard) return;
    var text = clipboard.getData('text/plain');
    if (!text || !Converter.looksLikeMarkdown(text)) return;

    var output = outputFor(field, text);
    if (output === text) return;

    event.preventDefault();
    event.stopPropagation();
    target = field;
    if (Editors.insert(field, output, 'insert')) {
      toast('Markdown in Jira-Markup umgewandelt.');
    }
  }

  /* ------------------------------------------------------------------ *
   * Oberflaeche: schwebender Button
   * ------------------------------------------------------------------ */

  function createFab() {
    if (fab || !settings.showFloatingButton) return;
    // In iframes (Jira Server bettet Editoren ein) wuerde sonst pro Rahmen
    // ein weiterer Button erscheinen.
    if (!isTopFrame()) return;
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'jmd-fab';
    fab.dataset.jmdUi = 'fab';
    fab.textContent = 'MD';
    fab.title = 'Markdown nach Jira umwandeln';
    fab.setAttribute('aria-label', 'Markdown nach Jira umwandeln');
    fab.addEventListener('click', function () {
      togglePanel();
    });
    document.body.appendChild(fab);
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch (error) {
      return false;
    }
  }

  function removeFab() {
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
    fab = null;
  }

  /* ------------------------------------------------------------------ *
   * Oberflaeche: Panel
   * ------------------------------------------------------------------ */

  var PANEL_HTML = [
    '<div class="jmd-panel__head">',
    '  <span class="jmd-panel__title">Markdown nach Jira</span>',
    '  <button type="button" class="jmd-icon-btn" data-action="close" title="Schliessen" aria-label="Schliessen">x</button>',
    '</div>',
    '<div class="jmd-panel__body">',
    '  <label class="jmd-label" for="jmd-input">Markdown aus Azure DevOps</label>',
    '  <textarea id="jmd-input" class="jmd-textarea" rows="7" spellcheck="false"',
    '            placeholder="Markdown hier einfuegen (Strg+V) ..."></textarea>',
    '  <div class="jmd-row">',
    '    <button type="button" class="jmd-btn" data-action="from-clipboard">Aus Zwischenablage</button>',
    '    <button type="button" class="jmd-btn" data-action="from-field">Aus Zielfeld</button>',
    '    <button type="button" class="jmd-btn" data-action="clear">Leeren</button>',
    '  </div>',
    '  <label class="jmd-label" for="jmd-output">Jira-Markup</label>',
    '  <textarea id="jmd-output" class="jmd-textarea jmd-textarea--output" rows="7" spellcheck="false" readonly></textarea>',
    '  <div class="jmd-target">',
    '    <span class="jmd-target__text">Ziel: <b data-role="target">-</b></span>',
    '    <button type="button" class="jmd-link-btn" data-action="pick">Feld waehlen</button>',
    '  </div>',
    '  <div class="jmd-row jmd-row--main">',
    '    <button type="button" class="jmd-btn jmd-btn--primary" data-action="insert">Ins Ticket einfuegen</button>',
    '    <button type="button" class="jmd-btn" data-action="replace">Feld ersetzen</button>',
    '    <button type="button" class="jmd-btn" data-action="copy">Kopieren</button>',
    '  </div>',
    '  <div class="jmd-options">',
    '    <label class="jmd-check"><input type="checkbox" data-option="convertOnPaste"> Beim Einfuegen automatisch umwandeln</label>',
    '    <label class="jmd-check"><input type="checkbox" data-option="richEditorFormat"> Im Rich-Text-Editor Markdown durchreichen</label>',
    '  </div>',
    '</div>'
  ].join('\n');

  function createPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'jmd-panel';
    panel.dataset.jmdUi = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Markdown nach Jira');
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);

    var input = panel.querySelector('#jmd-input');
    var output = panel.querySelector('#jmd-output');

    input.addEventListener('input', refreshPreview);
    input.addEventListener('paste', function (event) {
      // Im eigenen Panel nie die globale Auto-Konvertierung anwenden.
      event.stopPropagation();
    }, true);

    panel.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]');
      if (!button) return;
      handleAction(button.getAttribute('data-action'), input, output);
    });

    panel.addEventListener('change', function (event) {
      var option = event.target.getAttribute && event.target.getAttribute('data-option');
      if (!option) return;
      var update = {};
      if (option === 'richEditorFormat') {
        update.richEditorFormat = event.target.checked ? 'markdown' : 'jira';
      } else {
        update[option] = event.target.checked;
      }
      settings = Settings.withDefaults(Object.assign({}, settings, update));
      Settings.save(settings);
      refreshPreview();
    });

    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closePanel();
      }
    });

    syncPanelState();
    return panel;
  }

  function handleAction(action, input, output) {
    switch (action) {
      case 'close':
        closePanel();
        break;
      case 'clear':
        input.value = '';
        refreshPreview();
        input.focus();
        break;
      case 'from-clipboard':
        readClipboard().then(function (text) {
          if (!text) {
            toast('Zwischenablage ist leer oder nicht lesbar.', true);
            return;
          }
          input.value = text;
          refreshPreview();
        });
        break;
      case 'from-field':
        var field = currentTarget();
        if (!field) {
          toast('Kein Jira-Eingabefeld gefunden.', true);
          return;
        }
        input.value = Editors.getSelectedText(field) || Editors.getText(field);
        refreshPreview();
        break;
      case 'pick':
        startPicking();
        break;
      case 'copy':
        copyText(output.value);
        break;
      case 'insert':
        insertFromPanel(output.value, 'insert');
        break;
      case 'replace':
        insertFromPanel(output.value, 'replace');
        break;
      default:
        break;
    }
  }

  function insertFromPanel(text, mode) {
    if (!text) {
      toast('Es gibt noch nichts einzufuegen.', true);
      return;
    }
    var field = currentTarget();
    if (!field) {
      toast('Kein Jira-Eingabefeld gefunden. Bitte Feld waehlen.', true);
      return;
    }
    if (Editors.insert(field, text, mode)) {
      toast(mode === 'replace' ? 'Feldinhalt ersetzt.' : 'In Jira eingefuegt.');
    } else {
      toast('Einfuegen nicht moeglich - bitte Text kopieren.', true);
    }
  }

  function refreshPreview() {
    if (!panel) return;
    var input = panel.querySelector('#jmd-input');
    var output = panel.querySelector('#jmd-output');
    var field = currentTarget();
    output.value = input.value ? outputFor(field, input.value) : '';
    updateTargetLabel();
  }

  function updateTargetLabel() {
    if (!panel) return;
    var label = panel.querySelector('[data-role="target"]');
    var field = currentTarget();
    label.textContent = Editors.describe(field);
  }

  function syncPanelState() {
    if (!panel) return;
    var paste = panel.querySelector('[data-option="convertOnPaste"]');
    var rich = panel.querySelector('[data-option="richEditorFormat"]');
    if (paste) paste.checked = !!settings.convertOnPaste;
    if (rich) rich.checked = settings.richEditorFormat === 'markdown';
    updateTargetLabel();
  }

  function openPanel(prefill) {
    createPanel();
    panel.classList.add('jmd-panel--open');
    syncPanelState();
    var input = panel.querySelector('#jmd-input');
    if (prefill) {
      input.value = prefill;
    }
    refreshPreview();
    input.focus();
  }

  function closePanel() {
    stopPicking();
    if (panel) panel.classList.remove('jmd-panel--open');
  }

  function togglePanel() {
    if (panel && panel.classList.contains('jmd-panel--open')) {
      closePanel();
      return;
    }
    // Beim Oeffnen das aktuell fokussierte Feld als Ziel merken.
    var active = Editors.activeEditor();
    if (active) target = active;
    openPanel();
  }

  /* ------------------------------------------------------------------ *
   * Zielfeld per Klick waehlen
   * ------------------------------------------------------------------ */

  function startPicking() {
    if (pickingTarget) return;
    pickingTarget = true;
    document.body.classList.add('jmd-picking');
    Editors.findAllTargets().forEach(function (element) {
      element.classList.add('jmd-pick-candidate');
    });
    document.addEventListener('mousedown', onPickClick, true);
    toast('Bitte das gewuenschte Jira-Feld anklicken.');
  }

  function stopPicking() {
    if (!pickingTarget) return;
    pickingTarget = false;
    document.body.classList.remove('jmd-picking');
    var marked = document.querySelectorAll('.jmd-pick-candidate');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove('jmd-pick-candidate');
    }
    document.removeEventListener('mousedown', onPickClick, true);
  }

  function onPickClick(event) {
    if (panel && panel.contains(event.target)) return;
    var field = Editors.editableFrom(event.target);
    event.preventDefault();
    event.stopPropagation();
    stopPicking();
    if (field) {
      target = field;
      updateTargetLabel();
      toast('Zielfeld: ' + Editors.describe(field));
    } else {
      toast('Das ist kein Eingabefeld.', true);
    }
  }

  /* ------------------------------------------------------------------ *
   * Button direkt am Editor
   * ------------------------------------------------------------------ */

  var BUTTON_FLAG = 'jmdButtonAttached';

  function attachFieldButtons() {
    var fields = Editors.findAllTargets();
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.dataset[BUTTON_FLAG]) continue;
      var rect = field.getBoundingClientRect();
      // Nur an echte Eingabebereiche, nicht an winzige Einzeiler.
      if (rect.height < 48) continue;
      field.dataset[BUTTON_FLAG] = '1';
      addButtonBar(field);
    }
  }

  function addButtonBar(field) {
    var host = field.closest('.ak-editor-content-area') || field;
    var parent = host.parentNode;
    if (!parent) return;

    var bar = document.createElement('div');
    bar.className = 'jmd-fieldbar';
    bar.dataset.jmdUi = 'fieldbar';

    var convertButton = document.createElement('button');
    convertButton.type = 'button';
    convertButton.className = 'jmd-fieldbar__btn';
    convertButton.textContent = 'Markdown in Jira-Markup umwandeln';
    convertButton.title = 'Inhalt bzw. Auswahl dieses Feldes umwandeln';
    convertButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      convertInPlace(field);
    });

    var pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'jmd-fieldbar__btn';
    pasteButton.textContent = 'Aus Zwischenablage einfuegen';
    pasteButton.title = 'Markdown aus der Zwischenablage konvertiert einfuegen';
    pasteButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      readClipboard().then(function (text) {
        if (!text) {
          toast('Zwischenablage ist leer oder nicht lesbar.', true);
          return;
        }
        var output = outputFor(field, text);
        if (Editors.insert(field, output, 'insert')) {
          toast('Aus der Zwischenablage eingefuegt.');
        } else {
          toast('Einfuegen nicht moeglich.', true);
        }
      });
    });

    var panelButton = document.createElement('button');
    panelButton.type = 'button';
    panelButton.className = 'jmd-fieldbar__btn jmd-fieldbar__btn--ghost';
    panelButton.textContent = 'Editor oeffnen';
    panelButton.title = 'Markdown eingeben und Vorschau ansehen';
    panelButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      openPanel();
    });

    bar.appendChild(convertButton);
    bar.appendChild(pasteButton);
    bar.appendChild(panelButton);
    parent.insertBefore(bar, host);
  }

  /* ------------------------------------------------------------------ *
   * Hilfen
   * ------------------------------------------------------------------ */

  function readClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      return Promise.resolve('');
    }
    return navigator.clipboard.readText().catch(function () {
      return '';
    });
  }

  function copyText(text) {
    if (!text) {
      toast('Es gibt noch nichts zu kopieren.', true);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('Jira-Markup kopiert.');
      }, function () {
        toast('Kopieren nicht moeglich.', true);
      });
      return;
    }
    toast('Kopieren nicht moeglich.', true);
  }

  function toast(message, isError) {
    if (!settings.showToast && !isError) return;
    var node = document.querySelector('.jmd-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'jmd-toast';
      node.dataset.jmdUi = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.toggle('jmd-toast--error', !!isError);
    node.classList.add('jmd-toast--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('jmd-toast--visible');
    }, 2600);
  }

  /* ------------------------------------------------------------------ *
   * Nachrichten aus Hintergrund-Skript / Popup
   * ------------------------------------------------------------------ */

  function onMessage(message, sender, sendResponse) {
    if (!message || !message.type) return;
    switch (message.type) {
      case 'convert-selection':
        sendResponse({ ok: convertInPlace(null) });
        break;
      case 'open-panel':
        openPanel(message.text);
        sendResponse({ ok: true });
        break;
      case 'insert-text':
        var field = currentTarget();
        if (!field) {
          sendResponse({ ok: false, reason: 'no-target' });
          return;
        }
        sendResponse({ ok: Editors.insert(field, message.text, message.mode || 'insert') });
        break;
      case 'convert-context-selection':
        handleContextSelection(message.text);
        sendResponse({ ok: true });
        break;
      case 'ping':
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  }

  function handleContextSelection(text) {
    var field = Editors.activeEditor();
    if (field) {
      convertInPlace(field);
      return;
    }
    openPanel(text || '');
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  var scanTimer = null;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      try {
        attachFieldButtons();
        if (panel && panel.classList.contains('jmd-panel--open')) {
          updateTargetLabel();
        }
      } catch (error) {
        /* Jira baut viel um - Fehler hier nie hochblubbern lassen */
      }
    }, 400);
  }

  function start() {
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('focusin', function (event) {
      var field = Editors.editableFrom(event.target);
      if (field) target = field;
    }, true);

    createFab();
    attachFieldButtons();

    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(onMessage);
    }

    Settings.onChange(function (next) {
      settings = next;
      if (settings.showFloatingButton) {
        createFab();
      } else {
        removeFab();
      }
      syncPanelState();
      refreshPreview();
    });
  }

  Settings.load().then(function (loaded) {
    settings = loaded;
    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  });
})();
