/**
 * markdownToJira - konvertiert Markdown (wie es Azure DevOps / GitHub erzeugt)
 * in Jira-Wiki-Markup.
 *
 * Der Konverter ist absichtlich frei von DOM-Zugriffen, damit er sowohl im
 * Content-Script als auch in Node (Tests) laufen kann.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraMarkdown = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  // Sentinel fuer Platzhalter. Kommt in echtem Text praktisch nie vor.
  var S = '\u0000';
  var PLACEHOLDER_RE = new RegExp(S + 'P(\\d+)' + S, 'g');
  var PLACEHOLDER_ONLY_RE = new RegExp('^' + S + 'P\\d+' + S + '$');
  var PLACEHOLDER_LINE_RE = new RegExp('^\\s*' + S + 'P\\d+' + S + '\\s*$');

  var DEFAULT_OPTIONS = {
    // Jira-Sonderzeichen im Fliesstext maskieren: {} und [] immer (Makro-
    // Kopf bzw. Kurzlink), dazu paarige Auszeichnungszeichen (- ~ ^ + und
    // die Folge ??), damit Jira sie nicht als Markup liest.
    escapeBraces: true,
    // Sprach-Hint aus Fenced-Code-Bloecken uebernehmen ({code:java}).
    keepCodeLanguage: true,
    // Azure-DevOps-/GitHub-Alerts (> [!NOTE]) in {panel} umwandeln.
    convertAlerts: true,
    // Einfache Inline-HTML-Tags (<br>, <b>, <code> ...) uebersetzen.
    convertHtml: true
  };

  // Sprachen, die Jira im {code}-Makro kennt. Alles andere -> {code} ohne Hint.
  var JIRA_CODE_LANGUAGES = {
    actionscript: 1, ada: 1, applescript: 1, bash: 1, c: 1, cpp: 1, css: 1,
    csharp: 1, clojure: 1, coldfusion: 1, coffeescript: 1, cmake: 1, delphi: 1,
    diff: 1, erlang: 1, fortran: 1, go: 1, groovy: 1, haskell: 1, haxe: 1,
    html: 1, java: 1, javafx: 1, javascript: 1, json: 1, jsx: 1, kotlin: 1,
    latex: 1, lua: 1, matlab: 1, objectivec: 1, perl: 1, php: 1, powershell: 1,
    puppet: 1, python: 1, r: 1, ruby: 1, rust: 1, sass: 1, scala: 1, scheme: 1,
    shell: 1, sql: 1, swift: 1, tcl: 1, text: 1, tsx: 1, typescript: 1,
    vala: 1, vb: 1, verilog: 1, vhdl: 1, xml: 1, xquery: 1, yaml: 1
  };

  // Dieselbe Liste alphabetisch als Namen - fuer Auswahllisten in der
  // Oberflaeche, damit sie nirgends ein zweites Mal gepflegt werden muss.
  var CODE_LANGUAGE_NAMES = Object.keys(JIRA_CODE_LANGUAGES).sort();

  // Aliase, die Azure DevOps / GitHub haeufig verwenden.
  var LANGUAGE_ALIASES = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    zsh: 'bash',
    console: 'bash',
    ps: 'powershell',
    ps1: 'powershell',
    cs: 'csharp',
    'c#': 'csharp',
    'c++': 'cpp',
    objc: 'objectivec',
    yml: 'yaml',
    htm: 'html',
    md: 'text',
    markdown: 'text',
    plaintext: 'text',
    txt: 'text'
  };

  var ALERT_TITLES = {
    NOTE: 'Hinweis',
    TIP: 'Tipp',
    IMPORTANT: 'Wichtig',
    WARNING: 'Warnung',
    CAUTION: 'Achtung'
  };

  /* ------------------------------------------------------------------ *
   * Ausgabeformate
   *
   * Geparst wird nur einmal; die beiden Dialekte bestimmen, was dabei
   * herauskommt:
   *   'jira' -> Wiki-Markup fuer Textfelder (Jira Server/DC, Wiki-Modus)
   *   'html' -> HTML fuer den Rich-Text-Editor, der Markup nicht deutet
   * ------------------------------------------------------------------ */

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  /**
   * Nur unbedenkliche Ziele verlinken. 'javascript:' und Verwandte werden
   * verworfen, damit aus einem kopierten Work Item kein Klickangriff wird.
   */
  function safeUrl(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (/^(?:https?|ftp|mailto):/i.test(value)) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
    return value;
  }

  // Zeichen, die Jira 9.12.2 im Fliesstext als Markup deutet:
  //   {  }  Makro-Kopf/-Ende ({code}, {color}, ...) - wirkt schon einzeln.
  //   [  ]  Kurzlink bzw. Referenz ([Text|url], [Text]) - wirkt schon einzeln.
  //   -  -  Durchstreichung, nur paarig (-text-).
  //   ~  ~  Tiefstellung, nur paarig (~text~).
  //   ^  ^  Hochstellung, nur paarig (^text^).
  //   +  +  Unterstreichung, nur paarig (+text+).
  //   ?? ?? Zitat, nur paarig (??text??).
  // {} und [] werden deshalb bedingungslos maskiert, die paarigen Zeichen
  // nur, wenn ein echtes Paar erkennbar ist (siehe escapePairedMark) - ein
  // einzelner Gedankenstrich oder ein Datum soll nicht ploetzlich rot werden.
  // Im Zweifel wird maskiert: ein ueberfluessiger Backslash bleibt in Jira
  // unsichtbar, ein fehlender faerbt den Text rot oder loest ungewolltes
  // Markup aus.
  // Ausnahmen von der bedingungslosen Klammer-Maskierung - Jira-eigene
  // Kurzformen, die sonst ihre Funktion verlieren wuerden:
  //   [~name]   Erwaehnung eines Benutzers.
  //   [^datei]  Anhangverweis.
  //   [#anker]  Ankerlink.
  var JIRA_ESCAPE_CHARS = '{}[]-~^+';
  var JIRA_LINK_FORM_RE = /\[[~^#][^\[\]\n]*\]/;
  var JIRA_UNCONDITIONAL_ESCAPE_RE = new RegExp(
    JIRA_LINK_FORM_RE.source + '|[{}\\[\\]]',
    'g'
  );
  var JIRA_PAIRED_MARKERS = ['-', '~', '^', '+', '??'];

  function isJiraEscapeChar(ch) {
    return JIRA_ESCAPE_CHARS.indexOf(ch) !== -1;
  }

  function escapeRegExpLiteral(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Innerhalb einer Zeichenklasse [^...] brauchen \, ], ^ und - eine eigene
  // Maskierung - anders als im Rest eines Regex-Musters.
  function escapeRegExpClassChar(ch) {
    return ch.replace(/[\\\]^-]/g, '\\$&');
  }

  function backslashEachChar(str) {
    return str.replace(/[\s\S]/g, function (ch) {
      return '\\' + ch;
    });
  }

  /**
   * Maskiert ein paariges Auszeichnungszeichen (oder die Folge '??'), aber
   * nur bei einem echten Paar: oeffnendes Zeichen direkt vor einem
   * Nicht-Leerzeichen, schliessendes Zeichen direkt hinter einem
   * Nicht-Leerzeichen und vor Zeilenende, Leerraum oder Satzzeichen, kein
   * Umbruch dazwischen. Das Innere darf das Markerzeichen selbst nicht
   * enthalten - sonst wuerde bei 'C++ und C++' das erste Pluspaar bis zum
   * zweiten durchgreifen, obwohl beide Vorkommen nur direkt aneinander-
   * stehende, unpaarige C++-Zeichen sind.
   */
  function escapePairedMark(text, marker) {
    var open = escapeRegExpLiteral(marker);
    var innerExclude = escapeRegExpClassChar(marker.charAt(0));
    var re = new RegExp(
      open + '(?=\\S)([^' + innerExclude + '\\n]*?[^' + innerExclude + '\\s\\n])' + open +
      '(?=$|[\\s.,;:!?)\\]}])',
      'g'
    );
    return text.replace(re, function (match, inner) {
      return backslashEachChar(marker) + inner + backslashEachChar(marker);
    });
  }

  function escapePairedMarks(text) {
    for (var i = 0; i < JIRA_PAIRED_MARKERS.length; i++) {
      text = escapePairedMark(text, JIRA_PAIRED_MARKERS[i]);
    }
    return text;
  }

  var JIRA_DIALECT = {
    name: 'jira',
    escapeLiteral: function (ch) {
      return isJiraEscapeChar(ch) ? '\\' + ch : ch;
    },
    escapeText: function (text, options) {
      if (!options.escapeBraces) return text;
      // a) paarige Auszeichnungszeichen zuerst - sie pruefen auf
      //    Nicht-Leerzeichen-Nachbarn, das duerfen die gleich danach
      //    eingefuegten Backslashes vor {}/[] nicht durcheinanderbringen.
      text = escapePairedMarks(text);
      // b) danach die unbedingten Zeichen {}/[] - ausser bei den Jira-
      //    Kurzformen [~...], [^...] und [#...] (siehe JIRA_LINK_FORM_RE),
      //    die unveraendert bleiben muessen.
      return text.replace(JIRA_UNCONDITIONAL_ESCAPE_RE, function (match) {
        if (match.length > 1) return match;
        return '\\' + match;
      });
    },
    mark: function (kind) {
      switch (kind) {
        case 'boldItalic': return { open: '*_', close: '_*' };
        case 'bold': return { open: '*', close: '*' };
        case 'italic': return { open: '_', close: '_' };
        case 'strike': return { open: '-', close: '-' };
        case 'highlight': return { open: '{color:#de350b}', close: '{color}' };
        default: return { open: '', close: '' };
      }
    },
    tag: function (kind) {
      switch (kind) {
        case 'bold': return '*';
        case 'italic': return '_';
        case 'underline': return '+';
        case 'strike': return '-';
        case 'sub': return '~';
        case 'sup': return '^';
        default: return '';
      }
    },
    hardBreak: '\\\\',
    htmlBreak: '\\\\',
    // '{{...}}' ist Jira-Monospace, aber Jira parst dessen Inhalt weiter:
    // stecken darin geschweifte Klammern, entstehen verschachtelte oder
    // unbalancierte Klammern (aus '{{key}}' wird '{{{{key}}}}'). Maskieren
    // mit '\{' traegt in 9.12.2 nicht - Jira rendert die Maskierung dann
    // woertlich mit ('{{<tt>key</tt>}}') statt sie zu entfernen. Einziger
    // Ausweg: {noformat} als Block-Ersatz, der seinen Inhalt nicht weiter
    // parst. Enthaelt der Text selbst schon '{noformat}', laesst sich
    // nichts mehr retten - dann bleibt es bei der alten (kaputten) Form,
    // statt ein zweites kaputtes Muster zu erzeugen.
    code: function (text) {
      if (/[{}]/.test(text) && text.indexOf('{noformat}') === -1) {
        return '{noformat}' + text + '{noformat}';
      }
      return '{{' + text + '}}';
    },
    link: function (label, url) {
      if (!label || label === url) return '[' + url + ']';
      // Ein schon maskierter Strich (Tabellenzelle, cellPipe) bleibt
      // einfach maskiert; nur ein roher Strich wird neu maskiert. Der
      // Trenner zwischen Label und Ziel bleibt davon unberuehrt.
      return '[' + label.replace(/\\?\|/g, '\\|') + '|' + url + ']';
    },
    // Azure DevOps legt Anhaenge unter einem relativen Pfad ab
    // ('/.attachments/<guid>' bzw. './...') - der Host ist nur in ADO
    // gueltig, in Jira waere so ein Pfad tot. '!name!' loest Jira erst nach
    // dem manuellen Hochladen ueber den Dateinamen im Ticket auf, darum
    // bleibt bei einem relativen Pfad nur der Dateiname stehen. Absolute
    // URLs (mit Schema oder protokollrelativ '//host/...') bleiben unberuehrt.
    image: function (url) {
      if (/^(?:\.\/|\/(?!\/))/.test(url)) {
        return '!' + url.split('/').pop() + '!';
      }
      return '!' + url + '!';
    },
    heading: function (level, text) {
      return text ? 'h' + level + '. ' + text : 'h' + level + '.';
    },
    rule: function () {
      return '----';
    },
    paragraph: function (lines) {
      return lines.join('\n');
    },
    codeBlock: function (language, body) {
      return (language ? '{code:' + language + '}' : '{code}') + '\n' + body + '\n{code}';
    },
    preBlock: function (body) {
      return '{noformat}\n' + body + '\n{noformat}';
    },
    quote: function (inner, title) {
      if (title) return '{panel:title=' + title + '}\n' + inner + '\n{panel}';
      if (inner.indexOf('\n') === -1) return 'bq. ' + inner;
      return '{quote}\n' + inner + '\n{quote}';
    },
    table: function (header, rows) {
      var out = ['||' + header.join('||') + '||'];
      for (var i = 0; i < rows.length; i++) {
        out.push('|' + rows[i].join('|') + '|');
      }
      return out.join('\n');
    },
    // Jira 9.12.2 liest '\|' in einer Tabellenzelle als literalen Strich -
    // ohne Maskierung wuerde er als Spaltentrenner gedeutet.
    cellPipe: '\\|',
    list: function (items) {
      var out = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var marker = '';
        if (item.task === 'done') marker = '(/) ';
        else if (item.task === 'open') marker = '(x) ';
        out.push(item.levels.join('') + ' ' + marker + item.content);
      }
      return out.join('\n');
    },
    finish: function (text) {
      return text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^\n+|\n+$/g, '');
    }
  };

  var HTML_DIALECT = {
    name: 'html',
    escapeLiteral: escapeHtml,
    escapeText: function (text) {
      return escapeHtml(text);
    },
    mark: function (kind) {
      switch (kind) {
        case 'boldItalic': return { open: '<strong><em>', close: '</em></strong>' };
        case 'bold': return { open: '<strong>', close: '</strong>' };
        case 'italic': return { open: '<em>', close: '</em>' };
        case 'strike': return { open: '<del>', close: '</del>' };
        case 'highlight': return { open: '<mark>', close: '</mark>' };
        default: return { open: '', close: '' };
      }
    },
    tag: function (kind, closing) {
      var names = {
        bold: 'strong',
        italic: 'em',
        underline: 'u',
        strike: 'del',
        sub: 'sub',
        sup: 'sup'
      };
      var name = names[kind];
      if (!name) return '';
      return closing ? '</' + name + '>' : '<' + name + '>';
    },
    // Weiche Zeilenumbrueche setzt bereits paragraph(); ein zusaetzliches
    // <br> wuerde eine Leerzeile erzeugen.
    hardBreak: '',
    htmlBreak: '<br>',
    code: function (text) {
      return '<code>' + escapeHtml(text) + '</code>';
    },
    link: function (label, url) {
      var target = safeUrl(url);
      var text = label || escapeHtml(url);
      if (!target) return text;
      return '<a href="' + escapeAttribute(target) + '">' + text + '</a>';
    },
    image: function (url, alt) {
      var target = safeUrl(url);
      if (!target) return escapeHtml(url);
      return '<img src="' + escapeAttribute(target) + '" alt="' + escapeAttribute(alt || '') + '">';
    },
    heading: function (level, text) {
      return '<h' + level + '>' + text + '</h' + level + '>';
    },
    rule: function () {
      return '<hr>';
    },
    paragraph: function (lines) {
      return '<p>' + lines.join('<br>\n') + '</p>';
    },
    // TinyMCE in 9.12 packt fremde <pre> aus, darum die Panel-Klassen -
    // so uebernimmt der Editor den Codeblock unveraendert (siehe JIRA912-Fixture).
    codeBlock: function (language, body) {
      var lang = language ? ' data-language="code-' + escapeAttribute(language) + '"' : '';
      return '<pre class="code panel" style="border-width: 1px;"' + lang + '>' +
        escapeHtml(body) + '\n</pre>';
    },
    preBlock: function (body) {
      return '<pre class="noformat panel" style="border-width: 1px;">' + escapeHtml(body) + '\n</pre>';
    },
    quote: function (inner, title) {
      var head = title ? '<p><strong>' + escapeHtml(title) + '</strong></p>\n' : '';
      return '<blockquote>\n' + head + inner + '\n</blockquote>';
    },
    table: function (header, rows) {
      var out = ['<table>', '<thead>', '<tr>'];
      var i;
      for (i = 0; i < header.length; i++) {
        out.push('<th>' + header[i] + '</th>');
      }
      out.push('</tr>', '</thead>', '<tbody>');
      for (i = 0; i < rows.length; i++) {
        out.push('<tr>');
        for (var j = 0; j < rows[i].length; j++) {
          out.push('<td>' + rows[i][j] + '</td>');
        }
        out.push('</tr>');
      }
      out.push('</tbody>', '</table>');
      return out.join('');
    },
    // Im HTML-<td> braucht ein Strich keine Maskierung.
    cellPipe: '|',
    list: function (items) {
      var out = [];
      var open = [];      // 'ul' / 'ol' je Ebene
      var itemOpen = [];  // steht auf dieser Ebene ein <li> offen?

      function closeOne() {
        if (itemOpen.pop()) out.push('</li>');
        out.push('</' + open.pop() + '>');
      }

      for (var i = 0; i < items.length; i++) {
        var levels = items[i].levels;
        var depth = levels.length;
        var tag = levels[depth - 1] === '#' ? 'ol' : 'ul';

        while (open.length > depth) closeOne();
        if (open.length === depth && open[depth - 1] !== tag) closeOne();
        while (open.length < depth) {
          // Eine tiefere Liste gehoert in das offene <li> der Ebene darueber.
          var nested = levels[open.length] === '#' ? 'ol' : 'ul';
          out.push('<' + nested + '>');
          open.push(nested);
          itemOpen.push(false);
        }
        if (itemOpen[depth - 1]) {
          out.push('</li>');
          itemOpen[depth - 1] = false;
        }
        var marker = '';
        if (items[i].task === 'done') marker = '&#9745; ';
        else if (items[i].task === 'open') marker = '&#9744; ';
        out.push('<li>' + marker + items[i].content);
        itemOpen[depth - 1] = true;
      }
      while (open.length) closeOne();
      return out.join('');
    },
    finish: function (text) {
      return text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^\n+|\n+$/g, '');
    }
  };

  var DIALECTS = { jira: JIRA_DIALECT, html: HTML_DIALECT };

  /* ------------------------------------------------------------------ *
   * Panel aus einer Vorlage
   *
   * Die Vorlagen selbst stehen in src/settings.js (PANEL_TEMPLATES) und
   * werden hier nur ausgegeben - einmal als Wiki-Markup fuer reine Textfelder,
   * einmal als HTML fuer den Rich-Text-Editor. Beide Zweige lesen dieselbe
   * Vorlage, damit Titel und Farben nicht auseinanderlaufen.
   * ------------------------------------------------------------------ */

  /**
   * Ein Titel darf das Makro nicht sprengen: '|' trennt die Attribute, '}'
   * beendet den Kopf. Beides wird durch ein Leerzeichen ersetzt.
   */
  function panelTitle(title) {
    return String(title === undefined || title === null ? '' : title)
      .replace(/[|{}\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Nur echte Hex-Farben durchlassen - alles andere faellt weg. */
  function panelColor(value) {
    var color = String(value === undefined || value === null ? '' : value).trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '';
  }

  function panelBody(template, body) {
    var text = body === undefined || body === null ? (template && template.body) : body;
    return String(text === undefined || text === null ? '' : text);
  }

  /**
   * Vorlage -> Jira-Wiki-Markup. Das {panel}-Makro mit title, borderColor und
   * bgColor ist der Weg, den der Wiki Style Renderer von Jira Server /
   * Data Center kennt; die Confluence-Makros {info}/{note}/{warning} stehen
   * dort nicht bereit.
   */
  function panelMarkup(template, body) {
    if (!template) return '';
    var head = '{panel:title=' + panelTitle(template.title);
    var border = panelColor(template.borderColor);
    var background = panelColor(template.bgColor);
    if (border) head += '|borderColor=' + border;
    if (background) head += '|bgColor=' + background;
    return head + '}\n' + panelBody(template, body) + '\n{panel}';
  }

  /**
   * Dieselbe Vorlage als HTML - fuer den Rich-Text-Editor, der Wiki-Markup
   * woertlich stehen lassen wuerde. Kein eigener Akzentbalken mehr: TinyMCE
   * in 9.12 raeumt bei jedem div ein fremdes style-Attribut ab und akzeptiert
   * nur diese Form, die es beim Speichern selbst wieder nach
   * {panel:title=...|borderColor=...|bgColor=...} zurueckwandelt.
   */
  function panelHtml(template, body) {
    if (!template) return '';
    var border = panelColor(template.borderColor) || '#dfe1e6';
    var background = panelColor(template.bgColor) || '#f4f5f7';
    var divStyle = 'background-color: ' + background + '; border-color: ' + border + '; border-width: 1px;';
    var title = panelTitle(template.title);
    var head = title ? '<panel-title style="' + escapeAttribute('border-bottom-width: 1px; border-bottom-color: ' +
      border + '; background-color: ' + background + ';') + '">' + escapeHtml(title) + '</panel-title>' : '';
    return '<div class="plain panel" style="' + escapeAttribute(divStyle) + '">' + head +
      '<p>' + escapeHtml(panelBody(template, body)) + '</p></div>';
  }

  /* ------------------------------------------------------------------ *
   * Platzhalter-Verwaltung
   * ------------------------------------------------------------------ */

  function Placeholders() {
    this.values = [];
  }

  Placeholders.prototype.add = function (value) {
    this.values.push(value);
    return S + 'P' + (this.values.length - 1) + S;
  };

  Placeholders.prototype.restore = function (text) {
    var self = this;
    var previous = null;
    // Mehrfach durchlaufen, da Platzhalter verschachtelt sein koennen.
    while (previous !== text) {
      previous = text;
      text = text.replace(PLACEHOLDER_RE, function (match, index) {
        var value = self.values[Number(index)];
        return value === undefined ? match : value;
      });
    }
    return text;
  };

  /* ------------------------------------------------------------------ *
   * Hilfsfunktionen
   * ------------------------------------------------------------------ */

  function normalize(input) {
    return String(input == null ? '' : input)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ');
  }

  function mapLanguage(raw) {
    if (!raw) return '';
    var lang = String(raw).trim().toLowerCase().split(/[\s,:]/)[0];
    lang = LANGUAGE_ALIASES[lang] || lang;
    return JIRA_CODE_LANGUAGES[lang] ? lang : '';
  }

  function indentWidth(text) {
    var width = 0;
    for (var i = 0; i < text.length; i++) {
      width += text.charAt(i) === '\t' ? 4 : 1;
    }
    return width;
  }

  function isBlank(line) {
    return /^\s*$/.test(line);
  }

  /**
   * Liest den Wert eines HTML-Attributs aus einer Attribut-Zeichenkette
   * (der Rest eines Tags nach dem Namen), einfache oder doppelte
   * Anfuehrungszeichen. Kein voller HTML-Parser - reicht fuer die schlichten
   * Tags, die Azure DevOps beim Kopieren erzeugt.
   */
  function attrValue(attrs, name) {
    var re = new RegExp(name + '\\s*=\\s*"([^"]*)"|' + name + '\\s*=\\s*\'([^\']*)\'', 'i');
    var match = re.exec(attrs || '');
    if (!match) return '';
    return match[1] !== undefined ? match[1] : match[2];
  }

  function isHorizontalRule(line) {
    return /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/.test(line);
  }

  function isListStart(line) {
    return /^\s*(?:[-*+]|\d+[.)])(?:[ \t]|$)/.test(line) && !isHorizontalRule(line);
  }

  function isTableDelimiter(line) {
    return line.indexOf('-') !== -1 &&
      /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);
  }

  function splitTableRow(line) {
    var row = line.trim();
    if (row.charAt(0) === '|') row = row.slice(1);
    if (row.charAt(row.length - 1) === '|' && !/\\\|$/.test(row)) row = row.slice(0, -1);
    var cells = [];
    var current = '';
    for (var i = 0; i < row.length; i++) {
      var ch = row.charAt(i);
      if (ch === '\\' && row.charAt(i + 1) === '|') {
        // Maskierter Strich bleibt maskiert - erst convertInline() (mit
        // gesetztem ctx.inTableCell) entscheidet, was daraus wird.
        current += '\\|';
        i++;
      } else if (ch === '|') {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  /* ------------------------------------------------------------------ *
   * Inline-Konvertierung
   * ------------------------------------------------------------------ */

  function convertInline(text, ctx) {
    if (!text) return '';
    var ph = ctx.placeholders;
    var d = ctx.dialect;

    // 1. Markdown-Escapes (\* \_ \# ...) sichern. In einer Tabellenzelle
    //    bleibt ein maskierter Strich als Trenner-Kennzeichen erhalten
    //    (cellPipe) statt als roher Strich - sonst verschiebt splitTableRow()
    //    beim naechsten Durchlauf die Spalten (Issue #94). Das gilt auch
    //    innerhalb von {{...}}, da diese Ersetzung vor Schritt 2 laeuft.
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, function (match, ch) {
      if (ch === '|' && ctx.inTableCell) return ph.add(d.cellPipe);
      return ph.add(d.escapeLiteral(ch));
    });

    // 2. Inline-Code sichern -> {{...}}
    text = text.replace(/(`+)([^\n]*?)\1/g, function (match, ticks, code) {
      var inner = code;
      if (inner.trim() !== '' && /^ [\s\S]* $/.test(inner)) {
        inner = inner.slice(1, -1);
      }
      return ph.add(d.code(inner));
    });

    // 3. Einfaches Inline-HTML.
    if (ctx.options.convertHtml) {
      var tag = function (kind) {
        return function (match) {
          return ph.add(d.tag(kind, match.charAt(1) === '/'));
        };
      };
      text = text
        .replace(/<code>([\s\S]*?)<\/code>/gi, function (match, code) {
          return ph.add(d.code(code));
        })
        .replace(/<br\s*\/?>/gi, function () { return ph.add(d.htmlBreak); })
        .replace(/<\/?(?:b|strong)>/gi, tag('bold'))
        .replace(/<\/?(?:i|em)>/gi, tag('italic'))
        .replace(/<\/?u>/gi, tag('underline'))
        .replace(/<\/?(?:s|del|strike)>/gi, tag('strike'))
        .replace(/<\/?sub>/gi, tag('sub'))
        .replace(/<\/?sup>/gi, tag('sup'));

      // Fremde Tags aus Azure DevOps (div, span, img, details, summary ...)
      // nur im Jira-Dialekt aufloesen - der HTML-Dialekt maskiert rohes HTML
      // bewusst, damit im Rich-Text-Editor kein fremdes Markup ausgefuehrt
      // wird (siehe html.test.js, 'roher HTML-Text wird nicht durchgereicht').
      if (d.name === 'jira') {
        // <img src="..." ...> -> dieselbe Bild-Regel wie beim Markdown-Bild.
        text = text.replace(/<img\b([^>]*)>/gi, function (match, attrs) {
          var src = attrValue(attrs, 'src');
          if (!src) return match;
          return ph.add(d.image(src, attrValue(attrs, 'alt')));
        });

        // <span style="color:X">...</span> -> Jira-Farbmakro. Nur ein
        // Farbwort oder #rrggbb/#rgb aus dem style-Attribut wird
        // uebernommen - alles andere im Attribut wird stillschweigend
        // verworfen, ein eigener CSS-Parser lohnt hier nicht. Nur die beiden
        // Farbmarker gehen in einen Platzhalter, der Innentext bleibt roher
        // Text im Fluss und laeuft dadurch noch durch die Schritte 4 bis 10
        // (Links, Textauszeichnungen, escapeText).
        text = text.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, function (match, attrs, inner) {
          var style = attrValue(attrs, 'style');
          var color = /color\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|[a-zA-Z]+)/.exec(style);
          if (!color) return match;
          return ph.add('{color:' + color[1] + '}') + inner + ph.add('{color}');
        });

        // Alles andere an Tags entfernen, Inhalt behalten - aber nur die
        // Tags, die Azure DevOps beim Kopieren tatsaechlich liefert. Eine
        // generische '<wort>'-Regel wuerde auch von Nutzern getippten Text
        // wie '<Name>' oder 'List<String>' verschlucken (Issue #99), darum
        // eine Positivliste statt eines allgemeinen Tag-Musters. Ein
        // schliessendes Tag wird zu einem Leerzeichen, sonst liefen
        // getrennte Elemente wie '<summary>Mehr</summary>Inhalt' zu einem
        // Wort zusammen.
        var adoTags = 'div|span|p|details|summary|table|thead|tbody|tr|th|td|ul|ol|li|font|img|a';
        text = text.replace(new RegExp('<\\/(?:' + adoTags + ')\\s*>', 'gi'), ' ');
        text = text.replace(new RegExp('<(?:' + adoTags + ')(?:\\s[^<>]*)?\\/?>', 'gi'), '');
      }
    }

    // 3b. Azure-DevOps-Erwaehnungen: ADO speichert eine @-Erwaehnung als
    //     '@<GUID>' (Format 8-4-4-4-12), Jira loest diese GUID nicht auf.
    //     Folgt direkt ein Name (Grossbuchstabe), bleibt '@Name' als
    //     einfacher Text stehen; sonst faellt die Erwaehnung samt einem
    //     folgenden Leerzeichen komplett weg. Nur diese GUID-Form ist
    //     gemeint - ein normales '@' (E-Mail, "3 @ 5") bleibt unberuehrt.
    var guidPart = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';
    text = text.replace(new RegExp('@<' + guidPart + '>[ \\t]+(?=[A-Z])', 'g'), '@');
    text = text.replace(new RegExp('@<' + guidPart + '>[ \\t]?', 'g'), '');

    // 4. Bilder: ![alt](url) -> !url!
    // Azure DevOps haengt beim Kopieren ein Groessensuffix '=BreitexHoehe'
    // an, die Hoehe ist dabei optional ('=300x' oder '=300x200') - Jira
    // 9.12 kennt das nicht, darum wird es hier nur erkannt und verworfen,
    // nicht gespeichert.
    text = text.replace(/!\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?(?:\s+=\d+x\d*)?\s*\)/g, function (match, alt, url) {
      return ph.add(d.image(url, alt));
    });

    // 5. Links: [text](url) -> [text|url]
    //    Ein Klammerpaar in der URL ist erlaubt (.../Foo_(Bar)).
    text = text.replace(/\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g, function (match, label, url) {
      return ph.add(buildLink(label, url, ctx));
    });

    // 6. Referenz-Links: [text][ref] bzw. [ref][]
    text = text.replace(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g, function (match, label, ref) {
      var key = (ref || label).trim().toLowerCase();
      var url = ctx.references[key];
      if (!url) return match;
      return ph.add(buildLink(label, url, ctx));
    });

    // 7. Verkuerzte Referenz-Links: [ref]
    text = text.replace(/\[([^\]\n]+)\]/g, function (match, label) {
      var url = ctx.references[label.trim().toLowerCase()];
      if (!url) return match;
      return ph.add(buildLink(label, url, ctx));
    });

    // 8. Autolinks: <https://...> und <mail@example.com>
    text = text.replace(/<((?:https?|ftp):\/\/[^>\s]+)>/gi, function (match, url) {
      return ph.add(d.link('', url));
    });
    text = text.replace(/<([^@<>\s]+@[^@<>\s]+\.[^@<>\s]+)>/g, function (match, mail) {
      return ph.add(d.link('', 'mailto:' + mail));
    });

    // 9. Textauszeichnungen. Die erzeugten Jira-Zeichen werden als Platzhalter
    //    eingesetzt, damit die folgenden Regeln sie nicht erneut anfassen
    //    (aus **fett** wuerde sonst _fett_ statt *fett*).
    var wrap = function (kind, inner) {
      var marks = d.mark(kind);
      return ph.add(marks.open) + inner + ph.add(marks.close);
    };
    text = text.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, function (match, marker, inner) {
      return wrap('boldItalic', inner);
    });
    text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, function (match, inner) {
      return wrap('bold', inner);
    });
    text = text.replace(/(^|[\s([{,;:!?])__(?=\S)([\s\S]*?\S)__(?=$|[\s)\]}.,;:!?])/g, function (match, before, inner) {
      return before + wrap('bold', inner);
    });
    text = text.replace(/(^|[^\w*\\])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, function (match, before, inner) {
      return before + wrap('italic', inner);
    });
    text = text.replace(/(^|[\s([{,;:!?"'])_(?=\S)([^_\n]*?\S)_(?=$|[\s)\]}.,;:!?"'])/g, function (match, before, inner) {
      return before + wrap('italic', inner);
    });
    text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, function (match, inner) {
      return wrap('strike', inner);
    });
    text = text.replace(/==(?=\S)([^=\n]*?\S)==/g, function (match, inner) {
      return wrap('highlight', inner);
    });

    // 10. Was jetzt noch als Klartext dasteht, wird fuer das Zielformat
    //     maskiert: Jira sieht sonst Makros, HTML sieht sonst Tags. Bereits
    //     erzeugtes Markup steckt in Platzhaltern und bleibt unberuehrt.
    text = d.escapeText(text, ctx.options);

    // 11. Harter Umbruch: zwei Leerzeichen am Zeilenende.
    if (d.hardBreak) {
      text = text.replace(/[ \t]{2,}$/, function () { return ph.add(d.hardBreak); });
    }

    return ph.restore(text);
  }

  function buildLink(label, url, ctx) {
    var target = url.trim();
    var hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
    if (!hasScheme && /^www\./i.test(target)) target = 'http://' + target;
    if (!hasScheme && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) target = 'mailto:' + target;
    var text = String(label == null ? '' : label).trim();
    if (!text || text === url.trim()) {
      return ctx.dialect.link('', target);
    }
    // Das Label kann selbst Markup enthalten (z. B. **fett**).
    return ctx.dialect.link(convertInline(text, ctx), target);
  }

  /* ------------------------------------------------------------------ *
   * Blockebene
   * ------------------------------------------------------------------ */

  function extractReferences(lines, ctx) {
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var match = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?\s*(?:"[^"]*"|'[^']*'|\([^)]*\))?\s*$/.exec(lines[i]);
      if (match) {
        ctx.references[match[1].trim().toLowerCase()] = match[2];
      } else {
        kept.push(lines[i]);
      }
    }
    return kept;
  }

  function protectFencedBlocks(text, ctx) {
    var ph = ctx.placeholders;
    var fence = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\n`]*)$/;
    var lines = text.split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var open = fence.exec(lines[i]);
      if (!open) {
        out.push(lines[i]);
        i++;
        continue;
      }
      var marker = open[2].charAt(0) === '`' ? '`' : '~';
      var minLength = open[2].length;
      var indent = open[1].length;
      var language = ctx.options.keepCodeLanguage ? mapLanguage(open[3]) : '';
      var closeRe = new RegExp('^[ \\t]*' + marker + '{' + minLength + ',}[ \\t]*$');
      var body = [];
      var closed = false;
      i++;
      while (i < lines.length) {
        if (closeRe.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        var current = lines[i];
        if (indent > 0 && current.slice(0, indent).trim() === '') {
          current = current.slice(indent);
        }
        body.push(current);
        i++;
      }
      if (!closed && body.length === 0) {
        // Kein echter Codeblock - Zeile unveraendert uebernehmen.
        out.push(open[0]);
        continue;
      }
      out.push(ph.add(ctx.dialect.codeBlock(language, body.join('\n'))));
    }

    return out.join('\n');
  }

  function protectIndentedCode(lines, ctx) {
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var isCode = /^(?: {4}|\t)/.test(lines[i]) && !isBlank(lines[i]);
      var previousBlank = out.length === 0 || isBlank(out[out.length - 1]);
      if (isCode && previousBlank) {
        var body = [];
        while (i < lines.length) {
          if (/^(?: {4}|\t)/.test(lines[i]) && !isBlank(lines[i])) {
            body.push(lines[i].replace(/^(?: {4}|\t)/, ''));
            i++;
            continue;
          }
          if (isBlank(lines[i])) {
            var next = lines[i + 1];
            if (next !== undefined && /^(?: {4}|\t)/.test(next) && !isBlank(next)) {
              body.push('');
              i++;
              continue;
            }
          }
          break;
        }
        out.push(ctx.placeholders.add(ctx.dialect.preBlock(body.join('\n'))));
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out;
  }

  function convertBlocks(lines, ctx) {
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var before = i;
      var line = lines[i];

      // Alle Zweige stehen in einem do-while(false)-Block: `break` verlaesst
      // den Zweig, laesst aber immer die harte Sicherung danach laufen -
      // damit kann kein Zweig (auch kein `i = xyz.next` aus Liste, Zitat
      // oder Tabelle) an der Sicherung vorbei zurueck in die Schleife.
      do {
        // Platzhalter (Codeblock) unveraendert uebernehmen.
        if (PLACEHOLDER_ONLY_RE.test(line.trim())) {
          out.push(line.trim());
          i++;
          break;
        }

        if (isBlank(line)) {
          out.push('');
          i++;
          break;
        }

        if (isHorizontalRule(line)) {
          out.push(ctx.dialect.rule());
          i++;
          break;
        }

        // Azure-DevOps-Inhaltsverzeichnis: Beim Kopieren aus dem Wiki
        // landet die Zeile '[[_TOC_]]' im Markdown. Jira baut sein
        // Inhaltsverzeichnis selbst (Makro {toc}), der Marker waere hier
        // nur toter Text - Zeile ohne Ausgabe verwerfen, finish() raeumt
        // die dadurch entstehende doppelte Leerzeile schon auf.
        if (line.trim() === '[[_TOC_]]') {
          i++;
          break;
        }

        // Rohe HTML-Tabelle aus Azure DevOps: nur im Jira-Dialekt und nur
        // bei aktivierter HTML-Umwandlung - sonst bleibt die Zeile Klartext
        // und wird wie bisher escaped (siehe html.test.js). Passt das
        // Muster nicht (verschachtelte Tabelle, colspan, kein Ende
        // gefunden), faellt der Zweig durch und die Zeile laeuft weiter
        // wie zuvor.
        if (ctx.options.convertHtml && ctx.dialect.name === 'jira' && /^<table\b/i.test(line.trim())) {
          var htmlTable = readHtmlTable(lines, i, ctx);
          if (htmlTable) {
            out.push(htmlTable.text);
            i = htmlTable.next;
            break;
          }
        }

        // ATX-Ueberschrift: # ... ###### -> h1. ... h6.
        var heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
        if (heading) {
          out.push(ctx.dialect.heading(heading[1].length, convertInline(heading[2], ctx)));
          i++;
          break;
        }
        var emptyHeading = /^ {0,3}(#{1,6})[ \t]*$/.exec(line);
        if (emptyHeading) {
          out.push(ctx.dialect.heading(emptyHeading[1].length, ''));
          i++;
          break;
        }

        // Setext-Ueberschrift (Text mit === bzw. --- darunter).
        var next = lines[i + 1];
        if (next !== undefined && !isListStart(line)) {
          if (/^ {0,3}={2,}\s*$/.test(next)) {
            out.push(ctx.dialect.heading(1, convertInline(line.trim(), ctx)));
            i += 2;
            break;
          }
          if (/^ {0,3}-{2,}\s*$/.test(next) && line.indexOf('|') === -1 && !/^ {0,3}>/.test(line)) {
            out.push(ctx.dialect.heading(2, convertInline(line.trim(), ctx)));
            i += 2;
            break;
          }
        }

        // Tabelle
        if (line.indexOf('|') !== -1 && lines[i + 1] !== undefined && isTableDelimiter(lines[i + 1])) {
          var table = readTable(lines, i, ctx);
          out.push(table.text);
          i = table.next;
          break;
        }

        // Zitat / Alert
        if (/^ {0,3}>/.test(line)) {
          var quote = readQuote(lines, i, ctx);
          out.push(quote.text);
          i = quote.next;
          break;
        }

        // Listen
        if (isListStart(line)) {
          var list = readList(lines, i, ctx);
          out.push(list.text);
          i = list.next;
          break;
        }

        // Absatz
        var paragraph = [];
        while (i < lines.length && !isBlank(lines[i]) && !isHorizontalRule(lines[i]) &&
               !/^ {0,3}#{1,6}(?:[ \t]|$)/.test(lines[i]) && !/^ {0,3}>/.test(lines[i]) &&
               !isListStart(lines[i]) && !PLACEHOLDER_ONLY_RE.test(lines[i].trim())) {
          var following = lines[i + 1];
          if (following !== undefined && (/^ {0,3}={2,}\s*$/.test(following) ||
              (/^ {0,3}-{2,}\s*$/.test(following) && lines[i].indexOf('|') === -1))) {
            break;
          }
          if (lines[i].indexOf('|') !== -1 && following !== undefined && isTableDelimiter(following)) {
            break;
          }
          paragraph.push(convertInline(lines[i], ctx));
          i++;
        }
        if (paragraph.length) {
          out.push(ctx.dialect.paragraph(paragraph));
        } else {
          // Sicherheitsnetz gegen Endlosschleifen.
          out.push(ctx.dialect.paragraph([convertInline(lines[i], ctx)]));
          i++;
        }
      } while (false);

      // Harte Sicherung: bleibt i in einem Durchlauf stehen (etwa weil
      // readList()/readQuote()/readTable() mit next === start zurueckkommen),
      // wird die Zeile als Absatz uebernommen und i erhoeht - jeder Durchlauf
      // erreicht diese Pruefung, unabhaengig vom Zweig (Issue #88, verhindert
      // das mehrsekuendige Einfrieren des Tabs).
      if (i === before) {
        out.push(ctx.dialect.paragraph([convertInline(lines[i], ctx)]));
        i++;
      }
    }

    return out;
  }

  function readTable(lines, start, ctx) {
    function cell(value) {
      ctx.inTableCell = true;
      var result = convertInline(value, ctx) || ' ';
      ctx.inTableCell = false;
      return result;
    }

    var header = splitTableRow(lines[start]).map(cell);
    var rows = [];

    var i = start + 2;
    while (i < lines.length && lines[i].indexOf('|') !== -1 && !isBlank(lines[i])) {
      rows.push(splitTableRow(lines[i]).map(cell));
      i++;
    }

    return { text: ctx.dialect.table(header, rows), next: i };
  }

  /**
   * Rohe HTML-Tabelle (<table><tr><th>...</th></tr>...</table>) aus Azure
   * DevOps in eine Jira-Tabelle uebersetzen. Sammelt Zeilen bis '</table>'
   * ein, zerlegt <tr> in Zeilen und <th>/<td> in Zellen - Zellinhalt laeuft
   * je durch convertInline. Kein Parser fuer verschachtelte Tabellen oder
   * colspan: kommt eines von beiden vor, oder fehlt das Ende, gibt es null
   * zurueck und die Zeile laeuft wie gewohnt weiter.
   */
  function readHtmlTable(lines, start, ctx) {
    var end = start;
    while (end < lines.length && lines[end].indexOf('</table>') === -1) {
      end++;
    }
    if (end >= lines.length) return null;

    var html = lines.slice(start, end + 1).join('\n');
    if ((html.match(/<table\b/gi) || []).length > 1) return null;
    if (/colspan/i.test(html)) return null;

    function cell(value) {
      ctx.inTableCell = true;
      var result = convertInline(value, ctx) || ' ';
      ctx.inTableCell = false;
      return result;
    }

    var rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    var cellRe = /<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi;
    var header = null;
    var rows = [];
    var rowMatch;
    while ((rowMatch = rowRe.exec(html))) {
      var cells = [];
      var isHeader = true;
      var cellMatch;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        if (cellMatch[1].toLowerCase() !== 'th') isHeader = false;
        cells.push(cell(cellMatch[2]));
      }
      if (!cells.length) continue;
      if (header === null && isHeader) {
        header = cells;
      } else {
        rows.push(cells);
      }
    }
    if (header === null) header = rows.shift() || [];

    return { text: ctx.dialect.table(header, rows), next: end + 1 };
  }

  function readQuote(lines, start, ctx) {
    var body = [];
    var i = start;
    while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
      body.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
      i++;
    }
    // Lazy continuation: Folgezeilen ohne '>' gehoeren noch zum Zitat.
    while (i < lines.length && !isBlank(lines[i]) && !/^ {0,3}>/.test(lines[i]) &&
           !isListStart(lines[i]) && !/^ {0,3}#{1,6}[ \t]/.test(lines[i]) &&
           !PLACEHOLDER_ONLY_RE.test(lines[i].trim())) {
      body.push(lines[i]);
      i++;
    }

    var title = null;
    if (ctx.options.convertAlerts) {
      var alert = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(body[0] || '');
      if (alert) {
        title = ALERT_TITLES[alert[1].toUpperCase()] || alert[1];
        body.shift();
        while (body.length && isBlank(body[0])) body.shift();
      }
    }

    var inner = convertWith(body.join('\n'), ctx.options, ctx.dialect);

    return { text: ctx.dialect.quote(inner, title), next: i };
  }

  function readList(lines, start, ctx) {
    var items = [];
    var extra = [];   // Codebloecke, die zwischen den Eintraegen stehen
    var stack = []; // [{ indent: number, type: '*' | '#' }]
    var i = start;

    while (i < lines.length) {
      var line = lines[i];

      if (isBlank(line)) {
        // Eine Leerzeile beendet die Liste nur, wenn danach kein Eintrag folgt.
        var lookahead = i + 1;
        while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead++;
        if (lookahead >= lines.length) break;
        if (!isListStart(lines[lookahead])) break;
        i = lookahead;
        continue;
      }

      var item = /^(\s*)([-*+]|\d+[.)])(?:[ \t]+(.*))?$/.exec(line);
      if (item && !isHorizontalRule(line)) {
        var indent = indentWidth(item[1]);
        var type = /^\d/.test(item[2]) ? '#' : '*';

        while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
          stack.pop();
        }
        if (!stack.length) {
          stack.push({ indent: indent, type: type });
        } else if (indent > stack[stack.length - 1].indent) {
          stack.push({ indent: indent, type: type });
        } else {
          stack[stack.length - 1].type = type;
        }

        var prefix = stack.map(function (level) {
          return level.type;
        });

        var content = item[3] || '';
        var task = /^\[([ xX])\][ \t]+(.*)$/.exec(content);
        var state = null;
        if (task) {
          state = task[1].toLowerCase() === 'x' ? 'done' : 'open';
          content = task[2];
        }

        items.push({
          levels: prefix.slice(),
          task: state,
          content: convertInline(content, ctx)
        });
        i++;
        continue;
      }

      // Codeblock-Platzhalter innerhalb einer Liste.
      if (PLACEHOLDER_LINE_RE.test(line)) {
        extra.push(line.trim());
        i++;
        continue;
      }

      // Fortsetzung eines Listeneintrags (eingerueckter Text ohne Marker).
      var continuation = /^(\s+)(\S[\s\S]*)$/.exec(line);
      if (continuation && items.length) {
        items[items.length - 1].content += ' ' + convertInline(continuation[2], ctx);
        i++;
        continue;
      }

      break;
    }

    var text = ctx.dialect.list(items);
    if (extra.length) {
      text += '\n' + extra.join('\n');
    }
    return { text: text, next: i };
  }

  /* ------------------------------------------------------------------ *
   * Oeffentliche API
   * ------------------------------------------------------------------ */

  function mergeOptions(userOptions) {
    var options = {};
    var key;
    for (key in DEFAULT_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, key)) {
        options[key] = DEFAULT_OPTIONS[key];
      }
    }
    if (userOptions) {
      for (key in userOptions) {
        if (Object.prototype.hasOwnProperty.call(userOptions, key) && userOptions[key] !== undefined) {
          options[key] = userOptions[key];
        }
      }
    }
    // escapeJiraSyntax ist der sprechende Alias fuer escapeBraces (der
    // Speicherschluessel in chrome.storage bleibt escapeBraces, damit
    // gespeicherte Abwahlen nicht verlorengehen). Ist er gesetzt, gewinnt er.
    if (userOptions && userOptions.escapeJiraSyntax !== undefined) {
      options.escapeBraces = userOptions.escapeJiraSyntax;
    }
    return options;
  }

  function convertWith(markdown, options, dialect) {
    var ctx = {
      options: options,
      dialect: dialect,
      placeholders: new Placeholders(),
      references: Object.create(null)
    };

    var text = normalize(markdown);
    if (!text.trim()) return '';

    text = protectFencedBlocks(text, ctx);

    var lines = text.split('\n');
    lines = extractReferences(lines, ctx);
    lines = protectIndentedCode(lines, ctx);

    var result = ctx.placeholders.restore(convertBlocks(lines, ctx).join('\n'));
    return dialect.finish(result);
  }

  /** Markdown -> Jira-Wiki-Markup (fuer Textfelder und den Wiki-Modus). */
  function convert(markdown, userOptions) {
    return convertWith(markdown, mergeOptions(userOptions), JIRA_DIALECT);
  }

  /**
   * Markdown -> HTML. Gedacht fuer den Rich-Text-Editor, der Wiki-Markup
   * woertlich stehen lassen wuerde: das HTML wird beim Einfuegen direkt als
   * formatierter Text uebernommen.
   */
  function convertToHtml(markdown, userOptions) {
    return convertWith(markdown, mergeOptions(userOptions), HTML_DIALECT);
  }

  /** Beides auf einmal - so wird nur einmal geparst. */
  function convertBoth(markdown, userOptions) {
    var options = mergeOptions(userOptions);
    return {
      jira: convertWith(markdown, options, JIRA_DIALECT),
      html: convertWith(markdown, options, HTML_DIALECT)
    };
  }

  /**
   * Heuristik: Sieht der Text nach Markdown aus? Damit kann die UI erkennen,
   * ob eine Konvertierung ueberhaupt sinnvoll ist.
   */
  function looksLikeMarkdown(text) {
    if (!text) return false;
    var patterns = [
      /^ {0,3}#{1,6}[ \t]+\S/m,
      /\*\*[^*\n]+\*\*/,
      /^ {0,3}[-*+][ \t]+\S/m,
      /^ {0,3}\d+[.)][ \t]+\S/m,
      /\[[^\]\n]+\]\([^)\s]+\)/,
      /^ {0,3}(?:`{3,}|~{3,})/m,
      /`[^`\n]+`/,
      /^ {0,3}>[ \t]?\S/m,
      /^\s*\|.*\|\s*$/m,
      /~~[^~\n]+~~/
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  /**
   * Heuristik: Sieht der Text bereits nach fertigem Jira-Wiki-Markup aus?
   * Damit laesst die Automatik echtes Jira-Markup beim Einfuegen stehen,
   * statt es kaputt zu konvertieren (Issue #92).
   *
   * Bereits maskierte Makros (escapeText haengt vor jede Klammer einen
   * Backslash, aus "{code}" wird "\{code\}") duerfen nicht anschlagen - der
   * Text ist dann schon durch die Konvertierung gelaufen und kaputt. Die
   * Makro- und Monospace-Muster verlangen deshalb, dass vor der oeffnenden
   * Klammer kein Backslash steht.
   */
  function looksLikeJiraMarkup(text) {
    if (!text) return false;
    var patterns = [
      /^h[1-6]\. \S/m,
      /(^|[^\\])\{(?:code|noformat|panel|quote|color)(?::[^}\n]*)?\}/,
      /^\s*\|\|/m,
      /\[[^\]\n]+\|(?:https?|mailto):/,
      /(^|[^\\])\{\{[^}\n]+\}\}/
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  return {
    convert: convert,
    convertToHtml: convertToHtml,
    convertBoth: convertBoth,
    markdownToJira: convert,
    markdownToHtml: convertToHtml,
    looksLikeMarkdown: looksLikeMarkdown,
    looksLikeJiraMarkup: looksLikeJiraMarkup,
    panelMarkup: panelMarkup,
    panelHtml: panelHtml,
    mapLanguage: mapLanguage,
    codeLanguages: CODE_LANGUAGE_NAMES,
    defaultOptions: DEFAULT_OPTIONS,
    dialects: DIALECTS
  };
});
