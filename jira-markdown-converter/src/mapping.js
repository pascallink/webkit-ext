/**
 * JiraMapping - Zuordnung von Kunden-Schluesseln (z. B. ROV-1234) auf
 * interne Jira-Keys, Musterpruefung und Textanreicherung.
 *
 * DOM-frei, damit der Node-Runner das Modul direkt laden kann - dieselbe
 * Regel wie bei converter.js und otrslink.js. Reine Textlogik, keine
 * Abhaengigkeit zu settings.js (Ladereihenfolge: settings.js zuerst).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraMapping = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var DEFAULT_PATTERN = '(ROV|REFI)-\\d+';

  var MAX_PATTERN_LENGTH = 120;
  var MAX_KEYS = 2000;
  var MAX_TARGETS = 20;
  var MAX_KEY_LENGTH = 64;

  // Geschuetzte Bereiche, in denen ein Treffer liegen bleibt: Fenced-Code
  // ({code}/{code:...}), {noformat} und Inline-Monospace ({{...}}). Die
  // beiden letzten Alternativen vor {{...}} greifen erst, wenn kein
  // geschlossener Block gefunden wird - ein nicht geschlossener {code}-
  // oder {noformat}-Block schuetzt sonst gar nichts, obwohl Jira den Rest
  // des Textes trotzdem als Block darstellt.
  var PROTECTED_RE = /\{code(?::[^}\r\n]*)?\}[\s\S]*?\{code\}|\{noformat\}[\s\S]*?\{noformat\}|\{code(?::[^}\r\n]*)?\}[\s\S]*$|\{noformat\}[\s\S]*$|\{\{[\s\S]*?\}\}/g;

  // Direkt hinter dem Treffer - optional durch genau ein Leerzeichen getrennt -
  // bereits eine runde Klammer: dann gilt der Treffer als schon angereichert.
  var ALREADY_ENRICHED_RE = /^ ?\(/;

  /** Prueft, ob das Zeichen an index durch eine ungerade Zahl Backslashes maskiert ist. */
  function isEscapedAt(text, index) {
    var count = 0;
    var i = index - 1;
    while (i >= 0 && text.charAt(i) === '\\') {
      count++;
      i--;
    }
    return (count % 2) === 1;
  }

  /**
   * Erkennt eine quantifizierte Gruppe mit gefaehrlichem Inhalt, etwa
   * (a+)+ - so ein Muster fuehrt bei laengeren Eingaben zu katastrophalem
   * Backtracking und laesst findKeys()/enrich() minutenlang haengen. Sucht
   * ein schliessendes ')' direkt gefolgt von einem Quantor, zaehlt
   * rueckwaerts bis zur zugehoerigen oeffnenden Klammer (mit Backslash
   * maskierte Klammern zaehlen nicht mit) und prueft den so gefundenen
   * Gruppeninhalt auf einen weiteren unmaskierten Quantor oder eine
   * Alternative.
   */
  function hasCatastrophicBacktracking(text) {
    var i, j, k;
    for (i = 0; i < text.length; i++) {
      if (text.charAt(i) !== ')' || isEscapedAt(text, i)) continue;
      var next = text.charAt(i + 1);
      if (next !== '*' && next !== '+' && next !== '?' && next !== '{') continue;

      var depth = 1;
      var openIndex = -1;
      for (j = i - 1; j >= 0; j--) {
        var ch = text.charAt(j);
        if (isEscapedAt(text, j)) continue;
        if (ch === ')') {
          depth++;
        } else if (ch === '(') {
          depth--;
          if (depth === 0) {
            openIndex = j;
            break;
          }
        }
      }
      if (openIndex === -1) continue;

      var inner = text.slice(openIndex + 1, i);
      for (k = 0; k < inner.length; k++) {
        var innerChar = inner.charAt(k);
        if ((innerChar === '*' || innerChar === '+' || innerChar === '{' || innerChar === '|') && !isEscapedAt(inner, k)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Liefert den getrimmten Musterstring, oder '' wenn er leer, zu lang,
   * nicht als RegExp kompilierbar ist oder eine quantifizierte Gruppe mit
   * katastrophalem Backtracking enthaelt. Wirft nie.
   */
  function normalizePattern(source) {
    var text = typeof source === 'string' ? source.trim() : '';
    if (!text || text.length > MAX_PATTERN_LENGTH) return '';
    try {
      new RegExp(text);
    } catch (error) {
      return '';
    }
    if (hasCatastrophicBacktracking(text)) return '';
    return text;
  }

  /**
   * Liefert ein frisches RegExp (Flag 'g') fuer das Muster - ist es ungueltig,
   * greift DEFAULT_PATTERN. Wirft nie. Jeder Aufruf liefert ein neues Objekt,
   * damit lastIndex nicht zwischen Aufrufen haengen bleibt.
   */
  function compile(source) {
    var normalized = normalizePattern(source);
    return new RegExp(normalized || DEFAULT_PATTERN, 'g');
  }

  /** Zerlegt einen Ziel-Wert (String oder Array) in getrimmte Eintraege. */
  function splitTargetValue(value) {
    if (typeof value === 'string') {
      return value.split(/[,\s]+/);
    }
    if (Array.isArray(value)) {
      return value.map(function (entry) {
        return typeof entry === 'string' ? entry : String(entry);
      });
    }
    return [];
  }

  /**
   * Normalisiert eine beliebige Eingabe zur Zuordnungstabelle. Schluessel in
   * Grossschreibung, Werte immer ein Array ohne Duplikate. Rueckgabe ist
   * immer ein normales Objekt (JSON-/storage-tauglich), nie null.
   * `Object.create(null)` nur fuer die interne Duplikatspruefung der
   * Schluessel - sonst wuerden Namen wie 'constructor' ueber die Prototype-
   * Kette sofort als "schon gesehen" gelten.
   */
  function normalizeMap(raw) {
    var result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;

    var seenKeys = Object.create(null);
    var count = 0;
    var key;
    for (key in raw) {
      if (count >= MAX_KEYS) break;
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;

      var normalizedKey = String(key).trim().toUpperCase();
      if (!normalizedKey || normalizedKey.length > MAX_KEY_LENGTH) continue;
      if (seenKeys[normalizedKey]) continue;

      var rawTargets = splitTargetValue(raw[key]);
      var seenTargets = Object.create(null);
      var targets = [];
      for (var i = 0; i < rawTargets.length && targets.length < MAX_TARGETS; i++) {
        var target = rawTargets[i].trim();
        if (!target) continue;
        var targetKey = target.toUpperCase();
        if (seenTargets[targetKey]) continue;
        seenTargets[targetKey] = true;
        targets.push(target);
      }
      if (!targets.length) continue;

      seenKeys[normalizedKey] = true;
      result[normalizedKey] = targets;
      count++;
    }
    return result;
  }

  /** Liefert die Ziel-Keys zu einem Kunden-Schluessel, sonst ein leeres Array. */
  function targetsFor(map, key) {
    if (!map || typeof map !== 'object') return [];
    var lookup = String(key || '').trim().toUpperCase();
    if (!lookup) return [];
    if (!Object.prototype.hasOwnProperty.call(map, lookup)) return [];
    var targets = map[lookup];
    return Array.isArray(targets) ? targets : [];
  }

  /** Liefert die im Text gefundenen Kunden-Schluessel, ohne Duplikate, in Fundreihenfolge. */
  function findKeys(text, pattern) {
    var source = typeof text === 'string' ? text : String(text || '');
    if (!source) return [];
    var regex = compile(pattern);
    var seen = Object.create(null);
    var result = [];
    var match;
    while ((match = regex.exec(source)) !== null) {
      var value = match[0];
      // Ein Treffer der Laenge 0 ist kein echter Schluessel und faellt raus.
      if (value !== '' && !seen[value]) {
        seen[value] = true;
        result.push(value);
      }
      // Endlosschleife bei einem Treffer der Laenge 0 vermeiden.
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
    return result;
  }

  /** Liste der Start/Ende-Bereiche, die vor einer Anreicherung geschuetzt sind. */
  function protectedRanges(text) {
    var regex = new RegExp(PROTECTED_RE.source, 'g');
    var ranges = [];
    var match;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
    return ranges;
  }

  function isProtected(index, ranges) {
    for (var i = 0; i < ranges.length; i++) {
      if (index >= ranges[i].start && index < ranges[i].end) return true;
    }
    return false;
  }

  /**
   * Reichert einen Text um die zugeordneten Jira-Keys an. Liefert
   * { text, count }. Wirft nie - eine leere Eingabe, eine leere Tabelle oder
   * ein ungueltiges Muster geben die Eingabe unveraendert zurueck.
   */
  function enrich(text, map, pattern) {
    var source = typeof text === 'string' ? text : String(text || '');
    var normalizedMap = map && typeof map === 'object' ? map : {};
    if (!source) return { text: source, count: 0 };

    var regex = compile(pattern);
    var ranges = protectedRanges(source);
    var count = 0;
    var out = '';
    var lastEnd = 0;
    var match;

    while ((match = regex.exec(source)) !== null) {
      var value = match[0];
      var index = match.index;
      var end = index + value.length;

      if (match.index === regex.lastIndex) regex.lastIndex++;

      if (isProtected(index, ranges)) continue;

      var targets = targetsFor(normalizedMap, value);
      if (!targets.length) continue;

      // Steht direkt (oder mit genau einem trennenden Leerzeichen) dahinter
      // schon eine runde Klammer, gilt der Treffer als schon angereichert -
      // die Funktion bleibt so idempotent.
      if (ALREADY_ENRICHED_RE.test(source.slice(end, end + 2))) continue;

      out += source.slice(lastEnd, end);
      out += ' (' + targets.join(', ') + ')';
      lastEnd = end;
      count++;
    }
    out += source.slice(lastEnd);

    return { text: count ? out : source, count: count };
  }

  /**
   * Zerlegt einen JSON-Importtext in eine normalisierte Tabelle.
   * { map, error }: error ist '' bei Erfolg, sonst eine deutsche Meldung
   * ohne Umlaute.
   */
  function parseImport(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text || ''));
    } catch (error) {
      return { map: null, error: 'Kein gueltiges JSON.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { map: null, error: 'Die Eingabe muss ein JSON-Objekt sein.' };
    }
    var map = normalizeMap(parsed);
    if (!Object.keys(map).length) {
      return { map: null, error: 'Kein gueltiger Eintrag gefunden.' };
    }
    return { map: map, error: '' };
  }

  /** Exportiert eine Tabelle als lesbaren, wieder importierbaren JSON-Text. */
  function toExportText(map) {
    return JSON.stringify(normalizeMap(map), null, 2);
  }

  return {
    DEFAULT_PATTERN: DEFAULT_PATTERN,
    MAX_PATTERN_LENGTH: MAX_PATTERN_LENGTH,
    MAX_KEYS: MAX_KEYS,
    MAX_TARGETS: MAX_TARGETS,
    MAX_KEY_LENGTH: MAX_KEY_LENGTH,
    normalizePattern: normalizePattern,
    compile: compile,
    normalizeMap: normalizeMap,
    targetsFor: targetsFor,
    findKeys: findKeys,
    enrich: enrich,
    parseImport: parseImport,
    toExportText: toExportText
  };
});
