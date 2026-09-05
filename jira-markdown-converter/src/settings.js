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
    // Was passiert, wenn das Feld kein reines Textfeld ist, sondern ein
    // Rich-Text-Editor (Jira Server mit jira.rte.enabled, Jira Cloud)?
    //   'html'     -> aus dem Markdown erzeugtes HTML einfuegen; der Text
    //                 kommt fertig formatiert an (Standard)
    //   'jira'     -> Jira-Markup als Text einfuegen
    //   'markdown' -> das Markdown unveraendert durchreichen
    richEditorFormat: 'html',
    // Ist der Rich-Text-Editor aktiv: vorher auf den Markup-Modus umschalten
    // und dann Jira-Markup einfuegen (nur Jira Server / Data Center).
    switchToMarkup: false,
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
    if (['html', 'jira', 'markdown'].indexOf(result.richEditorFormat) === -1) {
      result.richEditorFormat = 'html';
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
   * Wie der Schalter fuer die Einfuege-Automatik ueberall dargestellt wird:
   * gruen wenn an, grau wenn aus. Eine Quelle fuer Popup, Optionsseite,
   * Panel, Badge am Symbol und Kontextmenue.
   */
  var TOGGLE = {
    on: {
      label: 'Automatik ist an',
      hint: 'Eingefuegtes Markdown wird umgewandelt.',
      badge: 'AN',
      color: '#36b37e'
    },
    off: {
      label: 'Automatik ist aus',
      hint: 'Eingefuegter Text bleibt unveraendert.',
      badge: 'AUS',
      color: '#8993a4'
    }
  };

  function toggleState(settings) {
    return settings && settings.convertOnPaste ? TOGGLE.on : TOGGLE.off;
  }

  /**
   * Vorlagen fuer den Panel-Button an Feld und Panel. Eine Quelle fuer beide
   * Ausgabezweige (Wiki-Markup und HTML), damit Titel und Farben nicht
   * auseinanderlaufen - so wie TOGGLE fuer den Schalter.
   *
   * Warum {panel} und nicht {info}/{note}/{warning}: Der Wiki Style Renderer
   * von Jira Server / Data Center kennt {panel} samt borderColor und bgColor.
   * Die Makros {info}, {note} und {warning} stammen aus Confluence und stehen
   * in Jira in aller Regel nicht bereit - sie wuerden woertlich im Ticket
   * stehen. Die Farbe steckt darum in der Vorlage, nicht im Makronamen.
   */
  var PANEL_TEMPLATES = [
    {
      id: 'info',
      label: 'Info',
      hint: 'Blaues Panel fuer Zusatzinformationen.',
      title: 'Info',
      body: 'Hier die Information eintragen.',
      borderColor: '#0052cc',
      bgColor: '#deebff'
    },
    {
      id: 'note',
      label: 'Hinweis',
      hint: 'Gelbes Panel fuer Hinweise, auf die man achten sollte.',
      title: 'Hinweis',
      body: 'Hier den Hinweis eintragen.',
      borderColor: '#ff8b00',
      bgColor: '#fffae6'
    },
    {
      id: 'warning',
      label: 'Warnung',
      hint: 'Rotes Panel fuer Warnungen und Risiken.',
      title: 'Warnung',
      body: 'Hier die Warnung eintragen.',
      borderColor: '#de350b',
      bgColor: '#ffebe6'
    },
    {
      id: 'plain',
      label: 'Standard',
      hint: 'Graues Panel ohne besondere Bedeutung.',
      title: 'Titel',
      body: 'Hier den Text eintragen.',
      borderColor: '#dfe1e6',
      bgColor: '#f4f5f7'
    }
  ];

  /** Vorlage zu einer Kennung, sonst null. */
  function panelTemplate(id) {
    for (var i = 0; i < PANEL_TEMPLATES.length; i++) {
      if (PANEL_TEMPLATES[i].id === id) return PANEL_TEMPLATES[i];
    }
    return null;
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
    TOGGLE: TOGGLE,
    toggleState: toggleState,
    PANEL_TEMPLATES: PANEL_TEMPLATES,
    panelTemplate: panelTemplate,
    withDefaults: withDefaults,
    converterOptions: converterOptions,
    load: load,
    save: save,
    onChange: onChange,
    normalizeHost: normalizeHost,
    hostPattern: hostPattern
  };
});
