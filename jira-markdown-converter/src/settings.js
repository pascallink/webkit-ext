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
    // Bearbeitetes Jira-Feld offen halten, statt es von Jira beim Klick
    // daneben schliessen zu lassen (Schloss in der Buttonleiste).
    freezeEditMode: true,
    // Konverter-Optionen
    escapeBraces: true,
    keepCodeLanguage: true,
    convertAlerts: true,
    convertHtml: true,
    // Zusaetzliche Hosts (Jira Server / Data Center), z. B. 'jira.firma.de'.
    extraHosts: [],
    // Eigene Vorlagen mit Platzhaltern (${Name}), siehe
    // docs/plans/issue-31-vorlagen.md. Liegen in chrome.storage.local, nicht
    // in sync - LOCAL_KEYS weiter unten haelt fest, warum.
    customTemplates: []
  };

  var CONVERTER_KEYS = ['escapeBraces', 'keepCodeLanguage', 'convertAlerts', 'convertHtml'];

  // customTemplates gehoert nicht nach chrome.storage.sync: der Bereich
  // erlaubt nur 8192 Byte je Item, und customTemplates waere ein einziges
  // Item - nach wenigen Vorlagen ein stilles, unsichtbares Limit.
  var LOCAL_KEYS = ['customTemplates'];

  var MAX_TEMPLATES = 50;
  var MAX_PLACEHOLDERS = 5;
  var MAX_TEMPLATE_LENGTH = 5000;
  var MAX_TITLE_LENGTH = 60;
  var MAX_PLACEHOLDER_LENGTH = 40;
  var MAX_ID_LENGTH = 64;
  var CHANGE_DEBOUNCE_MS = 50;

  var PLACEHOLDER_SOURCE = '\\$\\{\\s*([^}\\r\\n]{1,' + MAX_PLACEHOLDER_LENGTH + '}?)\\s*\\}';

  /** Frisches RegExp je Aufruf - ein globales RegExp haelt sonst lastIndex. */
  function placeholderRegex() {
    return new RegExp(PLACEHOLDER_SOURCE, 'g');
  }

  function newTemplateId() {
    return 'tpl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
  }

  /**
   * Reiht die im Markup vorkommenden Platzhalternamen an - Wahrheit ist das
   * Markup, `hint` (die frueher gespeicherte placeholders-Liste) legt nur
   * fest, in welcher Reihenfolge Namen auftauchen, die auch im Markup stehen.
   * `Object.create(null)` statt `{}`: sonst waeren Namen wie `constructor`
   * oder `toString` ueber die Prototype-Kette sofort "gesehen".
   */
  function normalizePlaceholders(markupNames, hint) {
    var markupSet = Object.create(null);
    for (var m = 0; m < markupNames.length; m++) {
      markupSet[markupNames[m]] = true;
    }
    var seen = Object.create(null);
    var result = [];
    if (Array.isArray(hint)) {
      for (var i = 0; i < hint.length && result.length < MAX_PLACEHOLDERS; i++) {
        if (typeof hint[i] !== 'string') continue;
        var name = hint[i].trim().slice(0, MAX_PLACEHOLDER_LENGTH);
        if (!name || seen[name] || !markupSet[name]) continue;
        seen[name] = true;
        result.push(name);
      }
    }
    for (var j = 0; j < markupNames.length && result.length < MAX_PLACEHOLDERS; j++) {
      if (seen[markupNames[j]]) continue;
      seen[markupNames[j]] = true;
      result.push(markupNames[j]);
    }
    return result;
  }

  /** Liefert einen sauberen Vorlageneintrag oder null bei fehlendem Titel/Markup. */
  function normalizeTemplate(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var title = String(entry.title || '').trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) return null;
    var templateMarkup = String(entry.templateMarkup || '').replace(/\r\n/g, '\n').slice(0, MAX_TEMPLATE_LENGTH);
    if (!templateMarkup) return null;
    var id = typeof entry.id === 'string' ? entry.id.trim().slice(0, MAX_ID_LENGTH) : '';
    return {
      id: id || newTemplateId(),
      title: title,
      templateMarkup: templateMarkup,
      placeholders: normalizePlaceholders(placeholdersInMarkup(templateMarkup), entry.placeholders)
    };
  }

  function normalizeTemplates(list) {
    if (!Array.isArray(list)) return [];
    var seenIds = Object.create(null);
    var result = [];
    for (var i = 0; i < list.length && result.length < MAX_TEMPLATES; i++) {
      var normalized = normalizeTemplate(list[i]);
      if (!normalized) continue;
      while (seenIds[normalized.id]) {
        normalized.id = newTemplateId();
      }
      seenIds[normalized.id] = true;
      result.push(normalized);
    }
    return result;
  }

  /** Vorlage zu einer Kennung, sonst null (Muster: panelTemplate). */
  function templateById(list, id) {
    var templates = Array.isArray(list) ? list : [];
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].id === id) return templates[i];
    }
    return null;
  }

  /**
   * Haertet eine Platzhalter-Eingabe gegen das Jira-Markup: { und } starten
   * Makros, [ und ] Links, | trennt Tabellenzellen - alle fuenf werden mit
   * Backslash maskiert (Backslash zuerst, sonst maskiert der zweite Schritt
   * seine eigene Maskierung erneut).
   */
  function escapeValue(value) {
    var text = value === undefined || value === null ? '' : String(value);
    text = text.replace(/[\r\n\t]/g, ' ');
    text = text.replace(/\\/g, '\\\\');
    text = text.replace(/\{/g, '\\{');
    text = text.replace(/\}/g, '\\}');
    text = text.replace(/\[/g, '\\[');
    text = text.replace(/\]/g, '\\]');
    text = text.replace(/\|/g, '\\|');
    return text;
  }

  /**
   * Ersetzt jedes ${Name} durch den (maskierten) Wert. Unbelegte Namen
   * fallen auf sich selbst zurueck, damit im Ticket nie ${...} stehen
   * bleibt. Einmaliger Durchlauf - ein Wert, der selbst wie ein Platzhalter
   * aussieht, wird nicht erneut ersetzt.
   */
  function fillPlaceholders(markup, values) {
    var source = String(markup || '');
    var input = values || {};
    return source.replace(placeholderRegex(), function (match, name) {
      var value = Object.prototype.hasOwnProperty.call(input, name) ? input[name] : undefined;
      if (value === undefined || value === null || value === '') return escapeValue(name);
      return escapeValue(value);
    });
  }

  /** Liste der im Markup vorkommenden Platzhalternamen, ohne Duplikate. */
  function placeholdersInMarkup(markup) {
    var source = String(markup || '');
    var regex = placeholderRegex();
    var seen = Object.create(null);
    var result = [];
    var match;
    while ((match = regex.exec(source)) !== null) {
      if (seen[match[1]]) continue;
      seen[match[1]] = true;
      result.push(match[1]);
    }
    return result;
  }

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
    result.customTemplates = normalizeTemplates(result.customTemplates);
    return result;
  }

  /** Verteilt Schluessel auf sync (Einstellungen) und local (Vorlagen). */
  function splitKeys(source) {
    var sync = {};
    var local = {};
    var key;
    for (key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (LOCAL_KEYS.indexOf(key) !== -1) {
        local[key] = source[key];
      } else {
        sync[key] = source[key];
      }
    }
    return { sync: sync, local: local };
  }

  var DEFAULTS_SPLIT = splitKeys(DEFAULTS);
  var SYNC_DEFAULTS = DEFAULTS_SPLIT.sync;
  var LOCAL_DEFAULTS = DEFAULTS_SPLIT.local;

  /** Liest einen Storage-Bereich als Promise; ein Fehler liefert die Defaults. */
  function readArea(area, defaults) {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage[area]) {
        resolve(defaults);
        return;
      }
      chrome.storage[area].get(defaults, function (stored) {
        if (chrome.runtime.lastError) {
          resolve(defaults);
          return;
        }
        resolve(stored);
      });
    });
  }

  /** Schreibt einen Storage-Bereich als Promise; ein fehlender Bereich wird uebersprungen. */
  function writeArea(area, values) {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage[area]) {
        resolve();
        return;
      }
      chrome.storage[area].set(values, function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function converterOptions(settings) {
    var options = {};
    for (var i = 0; i < CONVERTER_KEYS.length; i++) {
      options[CONVERTER_KEYS[i]] = settings[CONVERTER_KEYS[i]];
    }
    return options;
  }

  function load() {
    return Promise.all([
      readArea('sync', SYNC_DEFAULTS),
      readArea('local', LOCAL_DEFAULTS)
    ]).then(function (parts) {
      return withDefaults(Object.assign({}, parts[0], parts[1]));
    });
  }

  function save(settings) {
    var split = splitKeys(withDefaults(settings));
    return Promise.all([
      writeArea('sync', split.sync),
      writeArea('local', split.local)
    ]).then(function () {});
  }

  /**
   * save() schreibt sync und local einzeln - zwei getrennte IPC-Runden zum
   * Browser-Prozess, bei sync zusaetzlich ans Sync-Backend gebunden. Die
   * beiden onChanged-Events treffen darum nicht im selben Macrotask ein,
   * sondern typischerweise einige Millisekunden auseinander. Ein Fenster von
   * 0 ms faengt das nicht ab: es feuert laengst, bevor das zweite Event da
   * ist, und der Callback (baut z. B. den FAB neu auf) liefe zweimal je
   * Speichervorgang. CHANGE_DEBOUNCE_MS ueberdeckt diese Luecke sicher, ohne
   * bei einem Einstellungs-Callback spuerbar zu verzoegern.
   */
  function onChange(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
    var timer = null;
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync' && area !== 'local') return;
      if (timer !== null) return;
      timer = setTimeout(function () {
        timer = null;
        load().then(callback);
      }, CHANGE_DEBOUNCE_MS);
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
    hostPattern: hostPattern,
    MAX_TEMPLATES: MAX_TEMPLATES,
    MAX_PLACEHOLDERS: MAX_PLACEHOLDERS,
    MAX_TEMPLATE_LENGTH: MAX_TEMPLATE_LENGTH,
    MAX_TITLE_LENGTH: MAX_TITLE_LENGTH,
    MAX_PLACEHOLDER_LENGTH: MAX_PLACEHOLDER_LENGTH,
    normalizeTemplate: normalizeTemplate,
    normalizeTemplates: normalizeTemplates,
    templateById: templateById,
    escapeValue: escapeValue,
    fillPlaceholders: fillPlaceholders,
    placeholdersInMarkup: placeholdersInMarkup
  };
});
