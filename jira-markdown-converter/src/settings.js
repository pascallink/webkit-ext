/**
 * Gemeinsame Einstellungen fuer Content-Script, Popup und Optionsseite.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraMdSettings = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var DEFAULTS = {
    // Was wird in den Rich-Text-Editor (Jira Cloud) eingefuegt?
    //   'jira'     -> fertiges Jira-Markup (Textfelder, Wiki-Modus, Jira Server)
    //   'markdown' -> das Markdown selbst; der Cloud-Editor formatiert beim
    //                 Einfuegen mit, was dort oft das schoenere Ergebnis ist.
    richEditorFormat: 'jira',
    // Einfuegen (Strg+V) in einem Jira-Editor automatisch konvertieren.
    convertOnPaste: true,
    // Schwebenden Button auf Jira-Seiten anzeigen.
    showFloatingButton: true,
    // Kurze Bestaetigung nach einer Konvertierung einblenden.
    showToast: true,
    // Konverter-Optionen
    escapeBraces: true,
    keepCodeLanguage: true,
    convertAlerts: true,
    convertHtml: true,
    // Zusaetzliche Hosts (Jira Server / Data Center), z. B. 'jira.firma.de'.
    extraHosts: []
  };

  var CONVERTER_KEYS = ['escapeBraces', 'keepCodeLanguage', 'convertAlerts', 'convertHtml'];

  function withDefaults(stored) {
    var result = {};
    var key;
    for (key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        result[key] = DEFAULTS[key];
      }
    }
    if (stored) {
      for (key in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined && stored[key] !== null) {
          result[key] = stored[key];
        }
      }
    }
    if (!Array.isArray(result.extraHosts)) {
      result.extraHosts = [];
    }
    if (result.richEditorFormat !== 'markdown') {
      result.richEditorFormat = 'jira';
    }
    return result;
  }

  function converterOptions(settings) {
    var options = {};
    for (var i = 0; i < CONVERTER_KEYS.length; i++) {
      options[CONVERTER_KEYS[i]] = settings[CONVERTER_KEYS[i]];
    }
    return options;
  }

  function load() {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve(withDefaults(null));
        return;
      }
      chrome.storage.sync.get(DEFAULTS, function (stored) {
        if (chrome.runtime.lastError) {
          resolve(withDefaults(null));
          return;
        }
        resolve(withDefaults(stored));
      });
    });
  }

  function save(settings) {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve();
        return;
      }
      chrome.storage.sync.set(withDefaults(settings), function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function onChange(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      load().then(callback);
    });
  }

  /**
   * Normalisiert eine Host-Eingabe:
   *   'https://jira.firma.de/browse/ABC-1' -> 'jira.firma.de'
   *   'http://jira:8080/'                  -> 'jira'
   * Der Port faellt weg, weil Match-Pattern keine Ports kennen - '*://host/*'
   * gilt ohnehin fuer jeden Port.
   */
  function normalizeHost(input) {
    var value = String(input || '').trim();
    if (!value) return '';
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    value = value.split('/')[0].split('?')[0].split('#')[0];
    value = value.replace(/:\d+$/, '').toLowerCase();
    // Einzelne Namen ohne Punkt sind erlaubt (Intranet: http://jira/).
    if (!/^[a-z0-9*]([a-z0-9.*-]*[a-z0-9*])?$/.test(value)) return '';
    // Ein blankes '*' wuerde jede Seite freigeben.
    if (!/[a-z0-9]/.test(value)) return '';
    return value;
  }

  /**
   * Match-Pattern fuer chrome.scripting / chrome.permissions.
   * Beide Schemata, weil Jira Server / Data Center im Firmennetz haeufig
   * ueber http erreichbar ist.
   */
  function hostPattern(host) {
    return '*://' + host + '/*';
  }

  return {
    DEFAULTS: DEFAULTS,
    withDefaults: withDefaults,
    converterOptions: converterOptions,
    load: load,
    save: save,
    onChange: onChange,
    normalizeHost: normalizeHost,
    hostPattern: hostPattern
  };
});
