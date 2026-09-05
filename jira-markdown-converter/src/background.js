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
  'src/codedialog.js', 'src/editlock.js', 'src/content.js'];
var CONTENT_CSS = ['src/content.css', 'src/codedialog.css'];

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
        title: 'Markdown nach Jira - ' + state.label + '\n' + state.hint
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
 * Schickt eine Nachricht an das Content-Script und spielt es bei Bedarf
 * nach (z. B. auf einem Host, der gerade erst freigegeben wurde).
 */
function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, function () {
    if (!chrome.runtime.lastError) return;
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: CONTENT_FILES
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
