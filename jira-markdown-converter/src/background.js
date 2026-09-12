/**
 * Service-Worker: Tastenkuerzel, Kontextmenue und das Nachruesten weiterer
 * Jira-Hosts (Jira Server / Data Center), die der Nutzer selbst eintraegt.
 */
'use strict';

importScripts('settings.js', 'converter.js');

var Settings = self.JiraMdSettings;
var Converter = self.JiraMarkdown;

var CONTENT_SCRIPT_ID = 'jira-markdown-extra-hosts';
var CONTENT_FILES = ['src/settings.js', 'src/converter.js', 'src/editors.js',
  'src/codedialog.js', 'src/templatedialog.js', 'src/editlock.js',
  'src/otrslink.js', 'src/jiraui.js', 'src/otrsflow.js', 'src/otrsdialog.js',
  'src/content.js'];
var CONTENT_CSS = ['src/content.css', 'src/codedialog.css', 'src/otrsdialog.css'];

// Fuer Seiten, die die Sondierung nicht als Jira erkennt: ohne Sperr-
// Infrastruktur (editlock.js) und ohne die OTRS-Anbindung, die ohnehin nur
// im Jira-Vorgang Sinn ergibt. content.js erkennt selbst per
// window.__jiraMarkdownStandalone, dass es im schlanken Modus laeuft.
var STANDALONE_FILES = CONTENT_FILES.filter(function (file) {
  return file !== 'src/editlock.js' && file !== 'src/otrslink.js' &&
    file !== 'src/jiraui.js' && file !== 'src/otrsflow.js' &&
    file !== 'src/otrsdialog.js';
});

/* -------------------------------------------------------------------- *
 * Kontextmenue
 * -------------------------------------------------------------------- */

var TOGGLE_MENU_ID = 'toggle-convert-on-paste';

function createMenus() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'convert-selection',
      title: 'Markdown in Jira-Markup umwandeln',
      contexts: ['selection', 'editable']
    });
    chrome.contextMenus.create({
      id: 'open-panel',
      title: 'Markdown-Konverter oeffnen',
      contexts: ['editable', 'page']
    });
    // Direkt am Symbol der Erweiterung erreichbar (Rechtsklick darauf).
    chrome.contextMenus.create({
      id: TOGGLE_MENU_ID,
      title: 'Beim Einfuegen automatisch umwandeln',
      type: 'checkbox',
      checked: true,
      contexts: ['action', 'editable', 'page']
    }, function () {
      void chrome.runtime.lastError;
      refreshIndicators();
    });
  });
}

/* -------------------------------------------------------------------- *
 * Zustand der Einfuege-Automatik anzeigen
 * -------------------------------------------------------------------- */

/**
 * Badge am Symbol und Haken im Kontextmenue nachziehen, damit der Zustand
 * ohne Klick erkennbar ist: gruen = an, grau = aus.
 */
function refreshIndicators() {
  Settings.load().then(function (settings) {
    var state = Settings.toggleState(settings);

    if (chrome.action) {
      chrome.action.setBadgeText({ text: state.badge }, function () {
        void chrome.runtime.lastError;
      });
      chrome.action.setBadgeBackgroundColor({ color: state.color }, function () {
        void chrome.runtime.lastError;
      });
      if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ color: '#ffffff' }, function () {
          void chrome.runtime.lastError;
        });
      }
      chrome.action.setTitle({
        title: 'PowerEdit for Jira - ' + state.label + '\n' + state.hint
      }, function () {
        void chrome.runtime.lastError;
      });
    }

    chrome.contextMenus.update(TOGGLE_MENU_ID, {
      checked: !!settings.convertOnPaste
    }, function () {
      void chrome.runtime.lastError;
    });
  });
}

/** Schaltet die Einfuege-Automatik um; liefert den neuen Zustand. */
function toggleConvertOnPaste(force) {
  return Settings.load().then(function (settings) {
    settings.convertOnPaste = force === undefined ? !settings.convertOnPaste : !!force;
    return Settings.save(settings).then(function () {
      return settings.convertOnPaste;
    });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  createMenus();
  syncExtraHosts();
});

chrome.runtime.onStartup.addListener(function () {
  createMenus();
  syncExtraHosts();
});

// Auch beim blossen Aufwachen des Service-Workers stimmt das Badge dann.
refreshIndicators();

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === TOGGLE_MENU_ID) {
    // 'checked' kommt vom Menue - der gespeicherte Wert folgt ihm.
    toggleConvertOnPaste(info.checked);
    return;
  }
  if (!tab || tab.id === undefined) return;
  if (info.menuItemId === 'convert-selection') {
    sendToTab(tab.id, { type: 'convert-context-selection', text: info.selectionText || '' });
  } else if (info.menuItemId === 'open-panel') {
    sendToTab(tab.id, { type: 'open-panel', text: info.selectionText || '' });
  }
});

/* -------------------------------------------------------------------- *
 * Tastenkuerzel
 * -------------------------------------------------------------------- */

chrome.commands.onCommand.addListener(function (command) {
  if (command !== 'convert-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs.length) return;
    sendToTab(tabs[0].id, { type: 'convert-selection' });
  });
});

/**
 * Laeuft im Tab (isolierte Welt) und meldet, ob die Seite eine Jira Server /
 * Data Center-Instanz ist. Ohne Abhaengigkeiten, weil chrome.scripting sie
 * per toString() in den Tab schickt - kein Zugriff auf Variablen aus
 * background.js oder auf Seiten-Globals wie window.JIRA/AJS/jQuery.
 */
function detectJira() {
  if (document.querySelector('meta[name="ajs-version-number"]')) return true;
  if (document.getElementById('jira')) return true;
  if (document.body && document.body.id === 'jira') return true;
  return false;
}

/**
 * Sondiert per chrome.scripting.executeScript im Hauptrahmen des Tabs, ob es
 * sich um Jira handelt - allFrames bleibt aus, ein einzelnes iframe mit
 * eigenem ajs-Meta soll die ganze Seite nicht als Jira durchgehen lassen.
 * lastError oder ein leeres Ergebnis (z. B. chrome://-Seiten, PDF-Viewer)
 * gilt konservativ als Nicht-Jira.
 */
function probeJira(tabId, done) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: detectJira
  }, function (results) {
    if (chrome.runtime.lastError || !results || !results.length) {
      done(false);
      return;
    }
    done(!!results[0].result);
  });
}

/**
 * Setzt in jedem Frame der isolierten Welt das Signal fuer den schlanken
 * Modus, bevor content.js dort ueberhaupt laeuft (Reihenfolge in
 * injectFiles()) - content.js liest es beim Start und laesst Feldleisten,
 * schwebenden Button und Einfrieren aus.
 */
function markStandalone() {
  window.__jiraMarkdownStandalone = true;
}

/** Spielt die uebergebenen Dateien plus CONTENT_CSS ein und schickt danach die Nachricht nach. */
function injectFiles(tabId, message, files) {
  chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    files: files
  }, function () {
    if (chrome.runtime.lastError) return;
    chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: CONTENT_CSS
    }, function () {
      if (chrome.runtime.lastError) return;
      chrome.tabs.sendMessage(tabId, message, function () {
        void chrome.runtime.lastError;
      });
    });
  });
}

/**
 * Schickt eine Nachricht an das Content-Script und spielt es bei Bedarf nach
 * (z. B. auf einem Host, der gerade erst freigegeben wurde). Antwortet der
 * Tab nicht, entscheidet die Jira-Sondierung ueber den Funktionsumfang:
 * auf Jira wie bisher CONTENT_FILES komplett, sonst STANDALONE_FILES ohne
 * Sperr-Infrastruktur und OTRS-Anbindung, dafuer erst das Standalone-Signal
 * in der isolierten Welt gesetzt.
 */
function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, function () {
    if (!chrome.runtime.lastError) return;
    probeJira(tabId, function (isJira) {
      if (isJira) {
        injectFiles(tabId, message, CONTENT_FILES);
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: markStandalone
      }, function () {
        void chrome.runtime.lastError;
        injectFiles(tabId, message, STANDALONE_FILES);
      });
    });
  });
}

/* -------------------------------------------------------------------- *
 * Zusaetzliche Hosts (Jira Server / Data Center)
 * -------------------------------------------------------------------- */

function syncExtraHosts() {
  Settings.load().then(function (settings) {
    var patterns = (settings.extraHosts || [])
      .map(Settings.normalizeHost)
      .filter(Boolean)
      .map(Settings.hostPattern);

    chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] }, function (existing) {
      void chrome.runtime.lastError;
      var registered = existing && existing.length;

      if (!patterns.length) {
        if (registered) {
          chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }, function () {
            void chrome.runtime.lastError;
          });
        }
        return;
      }

      // Nur Hosts registrieren, fuer die der Nutzer die Freigabe erteilt hat.
      chrome.permissions.contains({ origins: patterns }, function (granted) {
        if (!granted) return;

        var script = {
          id: CONTENT_SCRIPT_ID,
          matches: patterns,
          js: CONTENT_FILES,
          css: CONTENT_CSS,
          // Frueh genug, um beim Einfrieren vor Jiras eigenen Handlern zu
          // stehen; die Oberflaeche wartet ohnehin auf das fertige Dokument.
          runAt: 'document_start',
          allFrames: true
        };

        var done = function () {
          void chrome.runtime.lastError;
        };

        if (registered) {
          chrome.scripting.updateContentScripts([script], done);
        } else {
          chrome.scripting.registerContentScripts([script], done);
        }
      });
    });
  });
}

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'sync') return;
  if (changes.extraHosts) {
    syncExtraHosts();
  }
  if (changes.convertOnPaste) {
    refreshIndicators();
  }
});

if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(syncExtraHosts);
  chrome.permissions.onRemoved.addListener(syncExtraHosts);
}

/* -------------------------------------------------------------------- *
 * Konvertierung fuer Popup/Optionsseite
 * -------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return;

  if (message.type === 'convert') {
    Settings.load().then(function (settings) {
      sendResponse({
        ok: true,
        text: Converter.convert(message.text, Settings.converterOptions(settings))
      });
    });
    return true;
  }

  if (message.type === 'toggle-convert-on-paste') {
    toggleConvertOnPaste(message.value).then(function (value) {
      sendResponse({ ok: true, convertOnPaste: value });
    });
    return true;
  }
});
