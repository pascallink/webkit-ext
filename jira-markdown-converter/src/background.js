/**
 * Service-Worker: Tastenkuerzel, Kontextmenue und das Nachruesten weiterer
 * Jira-Hosts (Jira Server / Data Center), die der Nutzer selbst eintraegt.
 */
'use strict';

importScripts('settings.js', 'converter.js');

var Settings = self.JiraMdSettings;
var Converter = self.JiraMarkdown;

var CONTENT_SCRIPT_ID = 'jira-markdown-extra-hosts';
var CONTENT_FILES = ['src/settings.js', 'src/converter.js', 'src/editors.js', 'src/content.js'];
var CONTENT_CSS = ['src/content.css'];

/* -------------------------------------------------------------------- *
 * Kontextmenue
 * -------------------------------------------------------------------- */

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
  });
}

chrome.runtime.onInstalled.addListener(function () {
  createMenus();
  syncExtraHosts();
});

chrome.runtime.onStartup.addListener(function () {
  syncExtraHosts();
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
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
          runAt: 'document_idle',
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
  if (area === 'sync' && changes.extraHosts) {
    syncExtraHosts();
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
  if (!message || message.type !== 'convert') return;
  Settings.load().then(function (settings) {
    sendResponse({
      ok: true,
      text: Converter.convert(message.text, Settings.converterOptions(settings))
    });
  });
  return true;
});
