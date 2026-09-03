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

    // 1. Markdown-Escapes (\* \_ \# ...) sichern.
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, function (match, ch) {
      return ph.add(ch === '{' || ch === '}' ? '\\' + ch : ch);
    });

    // 2. Inline-Code sichern -> {{...}}
    text = text.replace(/(`+)([^\n]*?)\1/g, function (match, ticks, code) {
      var inner = code;
      if (inner.trim() !== '' && /^ [\s\S]* $/.test(inner)) {
        inner = inner.slice(1, -1);
      }
      return ph.add('{{' + inner + '}}');
    });

    // 3. Einfaches Inline-HTML.
    if (ctx.options.convertHtml) {
      text = text
        .replace(/<code>([\s\S]*?)<\/code>/gi, function (match, code) {
          return ph.add('{{' + code + '}}');
        })
        .replace(/<br\s*\/?>/gi, function () { return ph.add('\\\\'); })
        .replace(/<\/?(?:b|strong)>/gi, function () { return ph.add('*'); })
        .replace(/<\/?(?:i|em)>/gi, function () { return ph.add('_'); })
        .replace(/<\/?u>/gi, function () { return ph.add('+'); })
        .replace(/<\/?(?:s|del|strike)>/gi, function () { return ph.add('-'); })
        .replace(/<\/?sub>/gi, function () { return ph.add('~'); })
        .replace(/<\/?sup>/gi, function () { return ph.add('^'); });
    }

    // 4. Bilder: ![alt](url) -> !url!
    text = text.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, function (match, alt, url) {
      return ph.add('!' + url + '!');
    });

    // 5. Links: [text](url) -> [text|url]
    text = text.replace(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, function (match, label, url) {
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
      return ph.add('[' + url + ']');
    });
    text = text.replace(/<([^@<>\s]+@[^@<>\s]+\.[^@<>\s]+)>/g, function (match, mail) {
      return ph.add('[mailto:' + mail + ']');
    });

    // 9. Textauszeichnungen. Die erzeugten Jira-Zeichen werden als Platzhalter
    //    eingesetzt, damit die folgenden Regeln sie nicht erneut anfassen
    //    (aus **fett** wuerde sonst _fett_ statt *fett*).
    text = text.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, function (match, marker, inner) {
      return ph.add('*_') + inner + ph.add('_*');
    });
    text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, function (match, inner) {
      return ph.add('*') + inner + ph.add('*');
    });
    text = text.replace(/(^|[\s([{,;:!?])__(?=\S)([\s\S]*?\S)__(?=$|[\s)\]}.,;:!?])/g, function (match, before, inner) {
      return before + ph.add('*') + inner + ph.add('*');
    });
    text = text.replace(/(^|[^\w*\\])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, function (match, before, inner) {
      return before + ph.add('_') + inner + ph.add('_');
    });
    text = text.replace(/(^|[\s([{,;:!?"'])_(?=\S)([^_\n]*?\S)_(?=$|[\s)\]}.,;:!?"'])/g, function (match, before, inner) {
      return before + ph.add('_') + inner + ph.add('_');
    });
    text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, function (match, inner) {
      return ph.add('-') + inner + ph.add('-');
    });
    text = text.replace(/==(?=\S)([^=\n]*?\S)==/g, function (match, inner) {
      return ph.add('{color:#de350b}') + inner + ph.add('{color}');
    });

    // 10. Restliche geschweifte Klammern maskieren (Jira liest sie als Makro).
    //     Bereits erzeugtes Jira-Markup steckt in Platzhaltern und bleibt
    //     davon unberuehrt.
    if (ctx.options.escapeBraces) {
      text = text.replace(/[{}]/g, function (ch) {
        return '\\' + ch;
      });
    }

    // 11. Harter Umbruch: zwei Leerzeichen am Zeilenende -> \\
    text = text.replace(/[ \t]{2,}$/, function () { return ph.add('\\\\'); });

    return ph.restore(text);
  }

  function buildLink(label, url, ctx) {
    var target = url.trim();
    var hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
    if (!hasScheme && /^www\./i.test(target)) target = 'http://' + target;
    if (!hasScheme && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) target = 'mailto:' + target;
    var text = String(label == null ? '' : label).trim();
    if (!text || text === url.trim()) {
      return '[' + target + ']';
    }
    // Das Label kann selbst Markup enthalten (z. B. **fett**).
    var inner = convertInline(text, ctx).replace(/\|/g, '\\|');
    return '[' + inner + '|' + target + ']';
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
      var openTag = language ? '{code:' + language + '}' : '{code}';
      out.push(ph.add(openTag + '\n' + body.join('\n') + '\n{code}'));
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
        out.push(ctx.placeholders.add('{noformat}\n' + body.join('\n') + '\n{noformat}'));
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
        out.push('----');
        i++;
        continue;
      }

      // ATX-Ueberschrift: # ... ###### -> h1. ... h6.
      var heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
      if (heading) {
        out.push('h' + heading[1].length + '. ' + convertInline(heading[2], ctx));
        i++;
        continue;
      }
      var emptyHeading = /^ {0,3}(#{1,6})[ \t]*$/.exec(line);
      if (emptyHeading) {
        out.push('h' + emptyHeading[1].length + '.');
        i++;
        continue;
      }

      // Setext-Ueberschrift (Text mit === bzw. --- darunter).
      var next = lines[i + 1];
      if (next !== undefined && !isListStart(line)) {
        if (/^ {0,3}={2,}\s*$/.test(next)) {
          out.push('h1. ' + convertInline(line.trim(), ctx));
          i += 2;
          continue;
        }
        if (/^ {0,3}-{2,}\s*$/.test(next) && line.indexOf('|') === -1 && !/^ {0,3}>/.test(line)) {
          out.push('h2. ' + convertInline(line.trim(), ctx));
          i += 2;
          continue;
        }
      }

      // Tabelle
      if (line.indexOf('|') !== -1 && lines[i + 1] !== undefined && isTableDelimiter(lines[i + 1])) {
        var table = readTable(lines, i, ctx);
        out.push.apply(out, table.rows);
        i = table.next;
        continue;
      }

      // Zitat / Alert
      if (/^ {0,3}>/.test(line)) {
        var quote = readQuote(lines, i, ctx);
        out.push.apply(out, quote.rows);
        i = quote.next;
        continue;
      }

      // Listen
      if (isListStart(line)) {
        var list = readList(lines, i, ctx);
        out.push.apply(out, list.rows);
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
        out.push(paragraph.join('\n'));
      } else {
        // Sicherheitsnetz gegen Endlosschleifen.
        out.push(convertInline(lines[i], ctx));
        i++;
      }
    }

    return out;
  }

  function readTable(lines, start, ctx) {
    function cell(value) {
      return convertInline(value, ctx) || ' ';
    }

    var header = splitTableRow(lines[start]);
    var rows = ['||' + header.map(cell).join('||') + '||'];

    var i = start + 2;
    while (i < lines.length && lines[i].indexOf('|') !== -1 && !isBlank(lines[i])) {
      rows.push('|' + splitTableRow(lines[i]).map(cell).join('|') + '|');
      i++;
    }

    return { rows: rows, next: i };
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

    var inner = convert(body.join('\n'), ctx.options);

    var rows;
    if (title) {
      rows = ['{panel:title=' + title + '}', inner, '{panel}'];
    } else if (inner.indexOf('\n') === -1) {
      rows = ['bq. ' + inner];
    } else {
      rows = ['{quote}', inner, '{quote}'];
    }

    return { rows: rows, next: i };
  }

  function readList(lines, start, ctx) {
    var rows = [];
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
        }).join('');

        var content = item[3];
        var task = /^\[([ xX])\][ \t]+(.*)$/.exec(content);
        var marker = '';
        if (task) {
          marker = task[1].toLowerCase() === 'x' ? '(/) ' : '(x) ';
          content = task[2];
        }

        rows.push(prefix + ' ' + marker + convertInline(content, ctx));
        i++;
        continue;
      }

      // Codeblock-Platzhalter innerhalb einer Liste.
      if (PLACEHOLDER_LINE_RE.test(line)) {
        rows.push(line.trim());
        i++;
        continue;
      }

      // Fortsetzung eines Listeneintrags (eingerueckter Text ohne Marker).
      var continuation = /^(\s+)(\S[\s\S]*)$/.exec(line);
      if (continuation && rows.length) {
        rows[rows.length - 1] += ' ' + convertInline(continuation[2], ctx);
        i++;
        continue;
      }

      break;
    }

    return { rows: rows, next: i };
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

  function convert(markdown, userOptions) {
    var options = mergeOptions(userOptions);
    var ctx = {
      options: options,
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

    return result
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/^\n+|\n+$/g, '');
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
    markdownToJira: convert,
    looksLikeMarkdown: looksLikeMarkdown,
    defaultOptions: DEFAULT_OPTIONS
  };
});
