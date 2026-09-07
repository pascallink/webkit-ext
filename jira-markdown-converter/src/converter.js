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
    // { und } im Fliesstext maskieren, damit Jira sie nicht als Makro liest.
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

  var JIRA_DIALECT = {
    name: 'jira',
    escapeLiteral: function (ch) {
      return ch === '{' || ch === '}' ? '\\' + ch : ch;
    },
    escapeText: function (text, options) {
      if (!options.escapeBraces) return text;
      return text.replace(/[{}]/g, function (ch) {
        return '\\' + ch;
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
    code: function (text) {
      return '{{' + text + '}}';
    },
    link: function (label, url) {
      if (!label || label === url) return '[' + url + ']';
      return '[' + label.replace(/\|/g, '\\|') + '|' + url + ']';
    },
    image: function (url) {
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
    codeBlock: function (language, body) {
      var open = language ? '<pre><code class="language-' + escapeAttribute(language) + '">' : '<pre><code>';
      return open + escapeHtml(body) + '</code></pre>';
    },
    preBlock: function (body) {
      return '<pre>' + escapeHtml(body) + '</pre>';
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
   * woertlich stehen lassen wuerde. Statt eines umlaufenden Rahmens traegt
   * nur die linke Kante die Statusfarbe - modernere Jira-Panels blenden den
   * vollen Rahmen ebenfalls aus.
   */
  function panelHtml(template, body) {
    if (!template) return '';
    var border = panelColor(template.borderColor) || '#dfe1e6';
    var background = panelColor(template.bgColor) || '#f4f5f7';
    var style = 'border-left: 4px solid ' + border + '; border-radius: 0 6px 6px 0;' +
      ' background-color: ' + background + '; padding: 12px 16px; margin: 12px 0;';
    var title = panelTitle(template.title);
    var head = title ? '<p><strong>' + escapeHtml(title) + '</strong></p>' : '';
    return '<div style="' + escapeAttribute(style) + '">' + head +
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
        current += '|';
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

    // 1. Markdown-Escapes (\* \_ \# ...) sichern.
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, function (match, ch) {
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
    }

    // 4. Bilder: ![alt](url) -> !url!
    text = text.replace(/!\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g, function (match, alt, url) {
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
      var line = lines[i];

      // Platzhalter (Codeblock) unveraendert uebernehmen.
      if (PLACEHOLDER_ONLY_RE.test(line.trim())) {
        out.push(line.trim());
        i++;
        continue;
      }

      if (isBlank(line)) {
        out.push('');
        i++;
        continue;
      }

      if (isHorizontalRule(line)) {
        out.push(ctx.dialect.rule());
        i++;
        continue;
      }

      // ATX-Ueberschrift: # ... ###### -> h1. ... h6.
      var heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
      if (heading) {
        out.push(ctx.dialect.heading(heading[1].length, convertInline(heading[2], ctx)));
        i++;
        continue;
      }
      var emptyHeading = /^ {0,3}(#{1,6})[ \t]*$/.exec(line);
      if (emptyHeading) {
        out.push(ctx.dialect.heading(emptyHeading[1].length, ''));
        i++;
        continue;
      }

      // Setext-Ueberschrift (Text mit === bzw. --- darunter).
      var next = lines[i + 1];
      if (next !== undefined && !isListStart(line)) {
        if (/^ {0,3}={2,}\s*$/.test(next)) {
          out.push(ctx.dialect.heading(1, convertInline(line.trim(), ctx)));
          i += 2;
          continue;
        }
        if (/^ {0,3}-{2,}\s*$/.test(next) && line.indexOf('|') === -1 && !/^ {0,3}>/.test(line)) {
          out.push(ctx.dialect.heading(2, convertInline(line.trim(), ctx)));
          i += 2;
          continue;
        }
      }

      // Tabelle
      if (line.indexOf('|') !== -1 && lines[i + 1] !== undefined && isTableDelimiter(lines[i + 1])) {
        var table = readTable(lines, i, ctx);
        out.push(table.text);
        i = table.next;
        continue;
      }

      // Zitat / Alert
      if (/^ {0,3}>/.test(line)) {
        var quote = readQuote(lines, i, ctx);
        out.push(quote.text);
        i = quote.next;
        continue;
      }

      // Listen
      if (isListStart(line)) {
        var list = readList(lines, i, ctx);
        out.push(list.text);
        i = list.next;
        continue;
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
    }

    return out;
  }

  function readTable(lines, start, ctx) {
    function cell(value) {
      return convertInline(value, ctx) || ' ';
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

      var item = /^(\s*)([-*+]|\d+[.)])[ \t]+(.*)$/.exec(line);
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

        var content = item[3];
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

  return {
    convert: convert,
    convertToHtml: convertToHtml,
    convertBoth: convertBoth,
    markdownToJira: convert,
    markdownToHtml: convertToHtml,
    looksLikeMarkdown: looksLikeMarkdown,
    panelMarkup: panelMarkup,
    panelHtml: panelHtml,
    mapLanguage: mapLanguage,
    codeLanguages: CODE_LANGUAGE_NAMES,
    defaultOptions: DEFAULT_OPTIONS,
    dialects: DIALECTS
  };
});
