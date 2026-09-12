/**
 * Erkennt die verschiedenen Jira-Eingabefelder und schreibt Text hinein.
 *
 * Jira kommt in drei Geschmacksrichtungen vor:
 *   1. <textarea> (Jira Server/Data Center, Wiki-Markup-Modus, alte Dialoge)
 *   2. ProseMirror-Editor (Jira Cloud, "contenteditable")
 *   3. CodeMirror/Ace in einzelnen Add-ons (wird wie 2. behandelt)
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraEditors = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  // Felder, die als Jira-Eingabe in Frage kommen.
  var RICH_SELECTOR = [
    '.ProseMirror[contenteditable="true"]',
    '[data-testid="ak-editor-main-toolbar"] ~ * [contenteditable="true"]',
    '.ak-editor-content-area [contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]'
  ].join(',');

  // Jira Server / Data Center (9.x) benutzt ausschliesslich Textareas, die in
  // einem Wiki-Feld mit den Reitern "Schreiben"/"Vorschau" stecken.
  var TEXTAREA_SELECTOR = [
    'textarea#description',
    'textarea#comment',
    'textarea#environment',
    'textarea.textarea',
    'textarea.long-field',
    '.jira-wikifield textarea',
    '.wiki-edit textarea',
    'textarea[name="description"]',
    'textarea[name="comment"]',
    'textarea[name="environment"]',
    'textarea[id^="customfield_"]',
    'textarea[name^="customfield_"]',
    'textarea'
  ].join(',');

  // Felder, die wir nie anfassen (eigene Oberflaeche, Suche, Login, Filter ...).
  var IGNORED_SELECTOR = [
    '[data-jmd-ui]',
    'input[type="password"]',
    '[data-test-id="search-dialog"] *',
    // Jira Cloud
    '#quickSearchInput',
    // Jira Server / Data Center: Schnellsuche und JQL-Eingaben
    '#searcher-query',
    '#jqltext',
    '#advanced-search',
    '.search-entry-link',
    '[aria-label*="Suche" i]',
    '[aria-label*="search" i]',
    '[placeholder*="Suche" i]',
    '[placeholder*="search" i]',
    // Picker-Textareas (Labels, Versionen, Verknuepfungen ...): keine
    // Wiki-Bearbeitung, sondern eine Auswahl mit Vorschlagsliste (#111)
    '.jira-multi-select textarea',
    'textarea[role="combobox"]'
  ].join(',');

  /* ------------------------------------------------------------------ *
   * Rich-Text-Editor von Jira Server / Data Center
   *
   * Ist 'jira.rte.enabled' gesetzt, blendet Jira die Textarea aus und legt
   * einen TinyMCE-Editor darueber. Geschrieben wird dann nicht in die
   * Textarea, sondern in den Body des Editor-Rahmens.
   * ------------------------------------------------------------------ */

  var RICH_TEXT_FRAME_SELECTOR = [
    'iframe.tox-edit-area__iframe',
    'iframe.mce-edit-area iframe',
    'iframe[id$="_ifr"]'
  ].join(',');

  var FIELD_CONTAINER_SELECTOR = '.jira-wikifield, .wiki-edit, .field-group, .aui-field-wikiedit';

  function fieldContainer(element) {
    try {
      return element.closest(FIELD_CONTAINER_SELECTOR) || element.parentNode || element.ownerDocument;
    } catch (error) {
      return element.ownerDocument;
    }
  }

  /** Der TinyMCE-Rahmen, der zu diesem Feld gehoert. */
  function richTextFrame(field) {
    if (!field || field.tagName !== 'TEXTAREA') return null;
    var doc = field.ownerDocument;
    var frame = field.id ? doc.getElementById(field.id + '_ifr') : null;
    if (!frame) {
      var container = fieldContainer(field);
      frame = container.querySelector ? container.querySelector(RICH_TEXT_FRAME_SELECTOR) : null;
    }
    return frame && frame.tagName === 'IFRAME' ? frame : null;
  }

  /**
   * Zu einem Editor-Rahmen das Feld, zu dem er gehoert. Klickt der Nutzer in
   * den Rich-Text-Editor, ist das Ziel im Hauptdokument naemlich der Rahmen -
   * gemeint ist aber die Textarea darunter.
   */
  function fieldForFrame(element) {
    if (!element || element.tagName !== 'IFRAME') return null;
    try {
      if (!element.matches(RICH_TEXT_FRAME_SELECTOR)) return null;
    } catch (error) {
      return null;
    }
    var doc = element.ownerDocument;
    var id = String(element.id || '').replace(/_ifr$/, '');
    var field = id ? doc.getElementById(id) : null;
    if (!field) {
      var container = fieldContainer(element);
      field = container && container.querySelector ? container.querySelector('textarea') : null;
    }
    if (!field || field.tagName !== 'TEXTAREA' || isIgnored(field)) return null;
    return field;
  }

  /** Der beschreibbare Body im Editor-Rahmen (gleiche Herkunft, sonst null). */
  function richTextBody(field) {
    var frame = richTextFrame(field);
    if (!frame) return null;
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.body) return null;
      return doc.body.isContentEditable ? doc.body : null;
    } catch (error) {
      return null;   // fremde Herkunft - nicht unser Editor
    }
  }

  /** Laeuft dieses Feld gerade im Rich-Text-Modus? */
  function isRichTextActive(field) {
    var body = richTextBody(field);
    if (!body) return false;
    var frame = richTextFrame(field);
    return !!frame && frame.getClientRects().length > 0;
  }

  /**
   * Die Flaeche, in die tatsaechlich geschrieben wird. Nur solange der
   * Rich-Text-Editor sichtbar ist - nach dem Umschalten auf den Markup-Modus
   * bleibt der Rahmen im DOM stehen, ist aber nicht mehr das Ziel.
   */
  function editingSurface(field) {
    return isRichTextActive(field) ? richTextBody(field) : field;
  }

  // Umschalter zwischen Rich-Text und Markup. Zuerst der Umschalter von Jira
  // 9.12 (Reiter "Text" in nav.editor-toggle-tabs - der Handler haengt nur
  // am Button, das umgebende <li> traegt bloss data-mode), danach aeltere
  // bzw. angepasste Faelle als Rueckfall. `container.querySelector()` mit
  // einer kommagetrennten Liste liefert den ersten Treffer in Dokumentreihenfolge,
  // nicht den der Listenreihenfolge - darum werden die Eintraege einzeln und
  // in dieser Reihenfolge abgefragt. `[data-mode="source"]` und
  // `[data-editor-mode]` sind ersatzlos gestrichen: sie treffen den
  // Container (<li> bzw. <nav>) statt das Bedienelement.
  var MODE_TOGGLE_SELECTORS = [
    '.editor-toggle-tabs li[data-mode="source"] button',
    '.jira-wikifield .rte-toggle',
    '.wiki-edit .rte-toggle',
    'button.rte-button-source',
    'a.switch-to-source'
  ];

  // Beschriftungs-Suche nur noch fuer den Weg in den Textmodus - "wysiwyg"
  // und "visual" sind gestrichen, weil sie sonst auch den Weg zurueck in den
  // Rich-Text-Modus treffen wuerden.
  var MODE_TOGGLE_TEXT = /markup|quelltext|source|klartext|plain\s*text|text-?modus|bearbeitungsmodus/i;

  function findModeToggle(field) {
    var container = fieldContainer(field);
    if (!container.querySelector) return null;

    for (var s = 0; s < MODE_TOGGLE_SELECTORS.length; s++) {
      var direct = container.querySelector(MODE_TOGGLE_SELECTORS[s]);
      if (direct && !isIgnored(direct)) return direct;
    }

    var candidates = container.querySelectorAll('button, a, [role="button"]');
    for (var i = 0; i < candidates.length; i++) {
      var element = candidates[i];
      if (isIgnored(element)) continue;      // nie unsere eigenen Buttons
      var label = [
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.getAttribute('data-mode') || '',
        typeof element.className === 'string' ? element.className : '',
        (element.textContent || '').slice(0, 60)
      ].join(' ');
      if (MODE_TOGGLE_TEXT.test(label)) return element;
    }
    return null;
  }

  function waitUntil(check, timeout) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + (timeout || 1500);
      (function poll() {
        if (check()) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(poll, 50);
      })();
    });
  }

  /**
   * Schaltet das Feld vom Rich-Text- in den Markup-Modus, damit fertiges
   * Jira-Markup eingefuegt werden kann. Liefert false, wenn kein Umschalter
   * gefunden wurde oder er nicht gegriffen hat.
   */
  function switchToMarkup(field) {
    if (!isRichTextActive(field)) return Promise.resolve(true);
    var toggle = findModeToggle(field);
    if (!toggle) return Promise.resolve(false);
    try {
      toggle.click();
    } catch (error) {
      return Promise.resolve(false);
    }
    return waitUntil(function () {
      return !isRichTextActive(field) && isVisible(field);
    }, 2000);
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.disabled || element.readOnly) return false;
    var rects = element.getClientRects();
    if (!rects.length) return false;
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  /**
   * Bedienbar ist ein Feld auch dann, wenn die Textarea selbst versteckt ist,
   * der Rich-Text-Editor darueber aber sichtbar ist.
   */
  function isUsable(element) {
    return isVisible(element) || isRichTextActive(element);
  }

  function isIgnored(element) {
    try {
      return !!(element.closest && element.closest(IGNORED_SELECTOR));
    } catch (error) {
      return false;
    }
  }

  function isTextarea(element) {
    return !!element && element.tagName === 'TEXTAREA';
  }

  function isRich(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.isContentEditable !== true) return false;
    try {
      return element.matches(RICH_SELECTOR) || !!element.closest('.ProseMirror, .ak-editor-content-area');
    } catch (error) {
      return false;
    }
  }

  /** Liefert das schreibbare Element zu einem beliebigen Knoten (z. B. Klickziel). */
  function editableFrom(node) {
    var element = node;
    while (element && element.nodeType !== 1) {
      element = element.parentNode;
    }
    if (!element) return null;
    if (isTextarea(element) && !isIgnored(element)) return element;
    // Klick im Rich-Text-Rahmen: das zugehoerige Feld ist die Textarea.
    var owner = fieldForSurface(element) || fieldForFrame(element);
    if (owner) return owner;
    if (element.isContentEditable) {
      var host = element.closest('.ProseMirror') || element.closest('[contenteditable="true"]') || element;
      return isIgnored(host) ? null : host;
    }
    return null;
  }

  /** Aktuell fokussiertes Eingabefeld, auch in Shadow DOM / iframes. */
  function activeEditor(doc) {
    var document_ = doc || document;
    var active = document_.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    var editable = editableFrom(active);
    return editable && isUsable(editable) ? editable : null;
  }

  /**
   * Bestes Zielfeld auf der Seite: erst das fokussierte, sonst der groesste
   * sichtbare Editor (das ist in Jira in aller Regel Beschreibung oder Kommentar).
   */
  function findTarget(doc) {
    var document_ = doc || document;
    var active = activeEditor(document_);
    if (active) return active;

    var candidates = [];
    var nodes = document_.querySelectorAll(RICH_SELECTOR + ',' + TEXTAREA_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isUsable(node) || isIgnored(node)) continue;
      if (!isTextarea(node) && !isRich(node)) continue;
      var box = isRichTextActive(node) ? richTextFrame(node) : node;
      var rect = box.getBoundingClientRect();
      candidates.push({ element: node, area: rect.width * rect.height });
    }
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      return b.area - a.area;
    });
    return candidates[0].element;
  }

  /** Alle sichtbaren Zielfelder (fuer die Feldauswahl im Panel). */
  function findAllTargets(doc) {
    var document_ = doc || document;
    var nodes = document_.querySelectorAll(RICH_SELECTOR + ',' + TEXTAREA_SELECTOR);
    var result = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isUsable(node) || isIgnored(node)) continue;
      if (!isTextarea(node) && !isRich(node)) continue;
      if (result.indexOf(node) === -1) result.push(node);
    }
    return result;
  }

  /** Sprechender Name eines Zielfelds fuer die Oberflaeche. */
  function describe(element) {
    if (!element) return 'kein Feld gefunden';
    var label = element.getAttribute('aria-label') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('data-testid') ||
      element.getAttribute('name') ||
      element.id;
    var kind = 'Rich-Text-Editor';
    if (isTextarea(element)) {
      kind = isRichTextActive(element) ? 'Rich-Text-Editor' : 'Textfeld';
    }
    return label ? kind + ' (' + String(label).slice(0, 40) + ')' : kind;
  }

  /* ------------------------------------------------------------------ *
   * Lesen
   * ------------------------------------------------------------------ */

  function getText(element) {
    if (!element) return '';
    if (isTextarea(element) || element.tagName === 'INPUT') {
      return element.value || '';
    }
    return contentEditableToText(element);
  }

  function getSelectedText(element) {
    if (!element) return '';
    if (isTextarea(element) || element.tagName === 'INPUT') {
      var start = element.selectionStart;
      var end = element.selectionEnd;
      if (start === null || start === end) return '';
      return String(element.value || '').slice(start, end);
    }
    var view = element.ownerDocument.defaultView;
    var selection = view.getSelection();
    if (!selection || selection.isCollapsed) return '';
    return selection.toString();
  }

  /** contenteditable -> Text mit sinnvollen Zeilenumbruechen. */
  function contentEditableToText(element) {
    var lines = [];
    var blocks = element.children;
    if (!blocks.length) {
      return element.textContent || '';
    }
    for (var i = 0; i < blocks.length; i++) {
      lines.push(blockText(blocks[i]));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function blockText(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.tagName === 'BR') return '\n';
    var text = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      text += blockText(node.childNodes[i]);
    }
    return text;
  }

  /**
   * Zu einer Schreibflaeche (Body eines Editor-Rahmens) das Feld finden,
   * unter dem sie haengt.
   */
  function fieldForSurface(element) {
    var doc = element.ownerDocument;
    if (!doc || doc === document) return null;
    var frame = doc.defaultView && doc.defaultView.frameElement;
    if (!frame) return null;
    var id = String(frame.id || '').replace(/_ifr$/, '');
    if (!id) return null;
    var field = document.getElementById(id);
    return field && field.tagName === 'TEXTAREA' ? field : null;
  }

  /* ------------------------------------------------------------------ *
   * Cursorposition merken
   *
   * Sobald der Nutzer ins Panel klickt, ist die Auswahl im Jira-Feld weg.
   * Darum wird sie vorher gesichert und vor dem Einfuegen wiederhergestellt.
   * ------------------------------------------------------------------ */

  var carets = typeof WeakMap === 'function' ? new WeakMap() : null;

  function rememberCaret(element) {
    if (!carets || !element) return false;
    var surface = editingSurface(element);

    if (isTextarea(surface) || surface.tagName === 'INPUT') {
      if (surface.selectionStart === null || surface.selectionStart === undefined) return false;
      carets.set(element, {
        type: 'text',
        start: surface.selectionStart,
        end: surface.selectionEnd
      });
      return true;
    }

    if (surface.isContentEditable) {
      var view = surface.ownerDocument.defaultView;
      var selection = view && view.getSelection();
      if (!selection || !selection.rangeCount) return false;
      var range = selection.getRangeAt(0);
      if (!surface.contains(range.commonAncestorContainer)) return false;
      carets.set(element, { type: 'range', range: range.cloneRange() });
      return true;
    }
    return false;
  }

  /** Liefert true, wenn eine gemerkte Position wiederhergestellt wurde. */
  function restoreCaret(element) {
    if (!carets || !element) return false;
    var saved = carets.get(element);
    if (!saved) return false;
    var surface = editingSurface(element);

    if (saved.type === 'text') {
      if (!isTextarea(surface) && surface.tagName !== 'INPUT') return false;
      var length = String(surface.value || '').length;
      try {
        surface.setSelectionRange(Math.min(saved.start, length), Math.min(saved.end, length));
        return true;
      } catch (error) {
        return false;
      }
    }

    if (!surface.isContentEditable) return false;
    try {
      // Der Bereich kann durch zwischenzeitlichen DOM-Umbau ungueltig sein.
      if (!surface.contains(saved.range.commonAncestorContainer)) return false;
      var view = surface.ownerDocument.defaultView;
      var selection = view && view.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(saved.range);
      return true;
    } catch (error) {
      return false;
    }
  }

  function forgetCaret(element) {
    if (carets && element) carets.delete(element);
  }

  /**
   * Liegt der Fokus gerade wirklich auf dieser Schreibflaeche? Nur wenn nicht,
   * darf die gemerkte Position wieder eingesetzt werden - sonst wuerde eine
   * alte Marke die Auswahl ueberschreiben, die der Nutzer eben gesetzt hat.
   */
  function surfaceHasFocus(surface) {
    var doc = surface.ownerDocument;
    if (doc.activeElement !== surface && !surface.contains(doc.activeElement)) return false;
    var view = doc.defaultView;
    var frame = view && view.frameElement;
    if (frame) {
      // Im Editor-Rahmen zaehlt zusaetzlich, ob die Seite den Rahmen fokussiert.
      return frame.ownerDocument.activeElement === frame;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Schreiben
   * ------------------------------------------------------------------ */

  var nativeTextareaValue = (function () {
    if (typeof HTMLTextAreaElement === 'undefined') return null;
    var descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    return descriptor && descriptor.set ? descriptor.set : null;
  })();

  /**
   * Setzt den Wert einer Textarea so, dass React/Backbone die Aenderung
   * mitbekommt (der native Setter umgeht Reacts Value-Tracker).
   */
  function setTextareaValue(element, value) {
    if (nativeTextareaValue) {
      nativeTextareaValue.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Schreibt ueber execCommand('insertText'), damit die Aenderung im
   * Undo-Stack der Textarea landet (der native Value-Setter in
   * setTextareaValue() loescht den Verlauf ersatzlos). Geht nur, solange das
   * Feld wirklich fokussiert ist - execCommand wirkt sonst auf die falsche
   * Auswahl oder gar nicht. Liefert true nur, wenn der Browser den Befehl
   * bestaetigt UND der Wert danach wie erwartet aussieht; sonst (und bei
   * jedem Wurf) faellt insertIntoTextarea() auf den nativen Setter zurueck.
   */
  function insertViaCommand(element, payload, expected, mode) {
    if (!payload) return false;
    if (element.ownerDocument.activeElement !== element) return false;
    try {
      if (mode === 'replace') {
        element.select();
      } else {
        element.setSelectionRange(element.selectionStart, element.selectionEnd);
      }
      var ok = element.ownerDocument.execCommand('insertText', false, payload);
      if (!ok || String(element.value || '') !== expected) return false;
      // Kein input-Event nachschieben - execCommand feuert es selbst; Jiras
      // eigene Aenderungserkennung braucht zusaetzlich das change-Event, das
      // React/Backbone bei einem echten Tastaturereignis erst beim
      // Verlassen des Feldes bekaemen.
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /** Fuegt Text an der Cursorposition einer Textarea ein. */
  function insertIntoTextarea(element, text, mode) {
    // Steht der Cursor noch im Feld, gilt die aktuelle Auswahl. Erst wenn der
    // Fokus weg ist (Panel, Popup), kommt die gemerkte Position zum Zug.
    var live = surfaceHasFocus(element);
    element.focus();
    if (!live) restoreCaret(element);
    var value = String(element.value || '');
    var start = element.selectionStart;
    var end = element.selectionEnd;

    if (mode === 'replace' || start === null || start === undefined) {
      if (!insertViaCommand(element, text, text, mode)) {
        setTextareaValue(element, text);
      }
      element.setSelectionRange(text.length, text.length);
      // Sofort merken statt auf selectionchange zu warten - das kommt
      // asynchron und sieht das Feld womoeglich schon unfokussiert (naechster
      // Klick auf Panel oder Dialog).
      rememberCaret(element);
      return true;
    }

    var before = value.slice(0, start);
    var after = value.slice(end);
    var payload = mode === 'block' ? asOwnLines(text, before, after) : text;
    var next = before + payload + after;
    if (!insertViaCommand(element, payload, next, mode)) {
      setTextareaValue(element, next);
    }
    var caret = start + payload.length;
    element.setSelectionRange(caret, caret);
    // Sofort merken statt auf selectionchange zu warten - das kommt
    // asynchron und sieht das Feld womoeglich schon unfokussiert (naechster
    // Klick auf Panel oder Dialog).
    rememberCaret(element);
    return true;
  }

  /**
   * Blockmakros ({code}, {panel} ...) deutet Jira nur, wenn sie am
   * Zeilenanfang stehen und die naechste Zeile nicht angehaengt ist. Steht
   * links vom Cursor schon Text, kommt darum ein Zeilenumbruch davor; folgt
   * rechts direkt Text, einer dahinter.
   */
  function asOwnLines(text, before, after) {
    var out = text;
    if (before && !/\n$/.test(before)) out = '\n' + out;
    if (after && !/^\n/.test(after)) out += '\n';
    return out;
  }

  // Blockelemente, die im Rich-Text-Editor eine eigene Zeile bilden.
  var BLOCK_TAGS = /^(?:P|DIV|LI|TD|TH|PRE|BLOCKQUOTE|H[1-6]|SECTION|ARTICLE|BODY|DD|DT|FIGCAPTION)$/;

  // Bloecke, deren echte Teilung gefahrlos ist: Absatz und Ueberschrift haben
  // im Elterncontainer immer Platz fuer ein weiteres Geschwister. Bei LI, TD,
  // TH, DD, DT wuerde der Klon aus splitBlockAtCaret() dagegen einen
  // zusaetzlichen Listenpunkt bzw. eine zusaetzliche Zelle erzeugen, und die
  // Blockgrenze laege in <ul>/<ol>/<tr>, wo ein Blockmakro keinen gueltigen
  // Platz hat - fuer PRE, BLOCKQUOTE, DIV & Co. bleibt darum ebenfalls die
  // Rueckfallebene mit BLOCK_SEPARATOR zustaendig.
  var SPLITTABLE_BLOCK_TAGS = /^(?:P|H[1-6])$/;

  // Leerer Absatz als Trenner: er sorgt dafuer, dass der Editor den Block
  // wirklich als Block uebernimmt, bleibt aber als leerer Absatz im Editor
  // stehen. Nur noch die Rueckfallebene, wenn splitBlockAtCaret() nicht
  // greift (siehe asOwnBlocks()).
  var BLOCK_SEPARATOR = '<p></p>';

  /** Der Block (Absatz, Listenpunkt, Zelle ...), in dem dieser Knoten steckt. */
  function blockAround(node, surface) {
    var element = node && node.nodeType === 1 ? node : node && node.parentNode;
    while (element && element !== surface) {
      if (BLOCK_TAGS.test(element.tagName || '')) return element;
      element = element.parentNode;
    }
    return surface;
  }

  /**
   * Steht die Einfuegemarke am Anfang bzw. am Ende ihres Blocks? Nur dann
   * darf ein Blockmakro ohne Trenner eingefuegt werden.
   */
  function blockEdges(surface) {
    var edges = { start: true, end: true };
    try {
      var doc = surface.ownerDocument;
      var view = doc.defaultView;
      var selection = view && view.getSelection();
      if (!selection || !selection.rangeCount) return edges;
      var range = selection.getRangeAt(0);
      if (!surface.contains(range.commonAncestorContainer)) return edges;

      var block = blockAround(range.startContainer, surface);
      var before = doc.createRange();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);

      block = blockAround(range.endContainer, surface);
      var after = doc.createRange();
      after.selectNodeContents(block);
      after.setStart(range.endContainer, range.endOffset);

      edges.start = !before.toString().trim();
      edges.end = !after.toString().trim();
    } catch (error) {
      /* Bereich nicht auswertbar - lieber ohne Trenner einfuegen */
    }
    return edges;
  }

  /**
   * Loest die Marke aus ihrem Block, damit ein Blockmakro als eigenstaendiges
   * Element ankommt statt in fremden Inhalt eingemischt zu werden - ganz ohne
   * Trenner-Absatz:
   *   - steht sie mitten im Block (Text davor und dahinter), wird der Block
   *     an dieser Stelle echt geteilt: der Teil nach der Marke wandert in ein
   *     neues Element hinter dem Block, die Selektion landet auf der neuen
   *     Blockgrenze;
   *   - steht sie schon am Blockanfang bzw. -ende, genuegt es, die Selektion
   *     vor bzw. hinter den Block zu ruecken - ohne den Block selbst
   *     anzufassen. Sonst haengt ein direkt am Rand eingefuegtes Element
   *     (z. B. <pre> vor "Referenz" in einer Ueberschrift) im umgebenden
   *     Element fest, statt daneben zu stehen (siehe JIRA912-Fixture).
   * Ist der Block ohnehin leer, bleibt die Marke unangetastet - dafuer reicht
   * die alte Rueckfallebene mit BLOCK_SEPARATOR. Schlaegt die Auswertung fehl
   * (kein Bereich, kein eindeutiger Block, Blocktyp nicht in
   * SPLITTABLE_BLOCK_TAGS ...), faellt der Aufrufer ebenfalls auf
   * BLOCK_SEPARATOR zurueck.
   *
   * Liefert bei Erfolg ein Objekt mit `undo` zurueck: steht sie mitten im
   * Block, ist das die Funktion, die den echten Split wieder rueckgaengig
   * macht (siehe insertIntoRich()); an den Blockraendern ist `undo` null,
   * da dort nur die Selektion verschoben wurde, ohne das Dokument zu
   * aendern.
   */
  function splitBlockAtCaret(surface) {
    try {
      var doc = surface.ownerDocument;
      var view = doc.defaultView;
      var selection = view && view.getSelection();
      if (!selection || !selection.rangeCount) return false;
      var range = selection.getRangeAt(0);
      if (!range.collapsed) return false;
      if (!surface.contains(range.startContainer)) return false;

      var block = blockAround(range.startContainer, surface);
      if (block === surface || !block.parentNode) return false;
      if (!SPLITTABLE_BLOCK_TAGS.test(block.tagName || '')) return false;

      var before = doc.createRange();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);

      var after = doc.createRange();
      after.selectNodeContents(block);
      after.setStart(range.startContainer, range.startOffset);

      var beforeEmpty = !before.toString().trim();
      var afterEmpty = !after.toString().trim();
      var boundary = doc.createRange();
      var undo = null;

      if (beforeEmpty && afterEmpty) {
        return false;   // Block ist ohnehin leer - Rueckfallebene reicht
      } else if (afterEmpty) {
        boundary.setStartAfter(block);
      } else if (beforeEmpty) {
        boundary.setStartBefore(block);
      } else {
        // Die urspruengliche Marke merken, um den Split rueckgaengig machen
        // zu koennen, wenn hinterher kein Einfuegeweg erfolgreich war.
        var originalRange = range.cloneRange();
        var fragment = after.extractContents();
        var next = block.cloneNode(false);
        next.removeAttribute('id');
        next.appendChild(fragment);
        block.parentNode.insertBefore(next, block.nextSibling);
        boundary.setStartAfter(block);
        undo = function () {
          while (next.firstChild) {
            block.appendChild(next.firstChild);
          }
          if (next.parentNode) next.parentNode.removeChild(next);
          selection.removeAllRanges();
          selection.addRange(originalRange);
        };
      }
      boundary.collapse(true);
      selection.removeAllRanges();
      selection.addRange(boundary);
      return { undo: undo };
    } catch (error) {
      return false;
    }
  }

  /**
   * Blockmakros im Rich-Text-Editor: steht die Marke mitten in fremdem
   * Inhalt, zieht der Editor den eingefuegten Block sonst dort hinein - aus
   * dem Codeblock wird dann eine Zeile mit geschweiften Klammern bzw. Text
   * mit Code-Auszeichnung, oder er haengt in einer Ueberschrift fest. Darum
   * loest splitBlockAtCaret die Marke zuerst aus ihrem Block - der Block
   * kommt so ohne Trenner-Absaetze an. Nur wenn das misslingt, greift die
   * alte Rueckfallebene mit BLOCK_SEPARATOR.
   */
  function asOwnBlocks(surface, text, html) {
    var edges = blockEdges(surface);
    var split = html ? splitBlockAtCaret(surface) : false;
    // Nach erfolgreichem Teilen steht die Marke bereits auf einer
    // Blockgrenze - die zusaetzlichen \n aus edges braucht dann nur noch
    // der Text-Zweig, wenn das Teilen nicht gegriffen hat.
    var atBoundary = !!split;
    return {
      text: (atBoundary || edges.start ? '' : '\n') + text + (atBoundary || edges.end ? '' : '\n'),
      html: !html || split
        ? html
        : (edges.start ? '' : BLOCK_SEPARATOR) + html + (edges.end ? '' : BLOCK_SEPARATOR),
      undoSplit: split && split.undo ? split.undo : null
    };
  }

  /**
   * Fuegt Text in einen ProseMirror-Editor ein. Wir schicken ein synthetisches
   * paste-Event: der Editor verarbeitet es wie eine echte Einfuege-Aktion,
   * inklusive Undo-Historie.
   *
   * Merkt die Position hier bewusst nicht sofort wie insertIntoTextarea() das
   * jetzt tut - der visuelle Rich-Text-Modus hat seinen eigenen Fehlerkreis
   * (Issues #107-#109) und bleibt darum unveraendert.
   */
  function insertIntoRich(element, text, html, mode) {
    var live = surfaceHasFocus(element);
    focusSurface(element);
    if (!live) restoreCaret(element);
    var view = element.ownerDocument.defaultView;

    if (mode === 'replace') {
      selectAll(element);
    }

    // Blockmakros brauchen einen eigenen Block, sonst landen sie im Absatz.
    var payload = mode === 'block' ? asOwnBlocks(element, text, html) : { text: text, html: html };

    if (dispatchPaste(element, payload.text, payload.html)) return true;

    // Fallback 0: formatiert einfuegen, wenn HTML gewuenscht ist.
    if (payload.html) {
      try {
        if (element.ownerDocument.execCommand('insertHTML', false, payload.html)) return true;
      } catch (error) {
        /* weiter zum naechsten Fallback */
      }
    }

    // Fallback 1: execCommand fuellt den Editor ueber beforeinput/input.
    try {
      if (element.ownerDocument.execCommand('insertText', false, payload.text)) return true;
    } catch (error) {
      /* weiter zum naechsten Fallback */
    }

    // Fallback 2: direkt in die Selektion schreiben.
    try {
      var selection = view.getSelection();
      if (selection && selection.rangeCount) {
        var range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(element.ownerDocument.createTextNode(payload.text));
        selection.collapseToEnd();
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    } catch (error) {
      /* aufgeben */
    }

    // Kein Einfuegeweg war erfolgreich - einen vorab geteilten Block wieder
    // zusammenfuehren, damit kein halb geteilter Block ohne Blockmakro
    // zurueckbleibt.
    if (payload.undoSplit) {
      try {
        payload.undoSplit();
      } catch (error) {
        /* aufgeben */
      }
    }
    return false;
  }

  var SYNTHETIC = '__jiraMdSynthetic';

  function dispatchPaste(element, text, html) {
    var view = element.ownerDocument.defaultView || window;
    var Transfer = view.DataTransfer || DataTransfer;
    var Clipboard = view.ClipboardEvent || ClipboardEvent;
    if (typeof Transfer === 'undefined' || typeof Clipboard === 'undefined') return false;
    try {
      var data = new Transfer();
      data.setData('text/plain', text);
      // Editoren bevorzugen text/html - damit kommt der Text formatiert an.
      if (html) data.setData('text/html', html);
      var event = new Clipboard('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true
      });
      event[SYNTHETIC] = true;
      // Manche Browser liefern clipboardData im Konstruktor nicht durch.
      if (!event.clipboardData || event.clipboardData.getData('text/plain') !== text) {
        Object.defineProperty(event, 'clipboardData', { value: data });
      }
      var handled = element.dispatchEvent(event);
      // defaultPrevented === der Editor hat das Einfuegen uebernommen.
      return handled === false;
    } catch (error) {
      return false;
    }
  }

  function isSynthetic(event) {
    return !!(event && event[SYNTHETIC]);
  }

  function focusSurface(element) {
    var view = element.ownerDocument.defaultView;
    try {
      if (view && view.frameElement) view.focus();
    } catch (error) {
      /* Rahmen nicht fokussierbar - egal */
    }
    element.focus();
  }

  function selectAll(element) {
    var view = element.ownerDocument.defaultView;
    var selection = view.getSelection();
    if (!selection) return;
    var range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * Schreibt Text in ein beliebiges Zielfeld.
   * mode: 'insert' (an der Cursorposition), 'block' (wie 'insert', aber auf
   * eigenen Zeilen) oder 'replace' (Feldinhalt ersetzen).
   */
  function insert(element, text, mode) {
    return insertFormatted(element, text, null, mode);
  }

  /**
   * Schreibt in ein Zielfeld. Ist html gesetzt und die Schreibflaeche ein
   * Rich-Text-Editor, kommt der Text dort formatiert an statt als Markup.
   * mode: 'insert' (an der Cursorposition), 'block' (Blockmakro auf eigenen
   * Zeilen) oder 'replace' (Feld ersetzen).
   */
  function insertFormatted(element, text, html, mode) {
    if (!element || (!text && !html)) return false;
    var surface = editingSurface(element);
    var where = mode || 'insert';

    if (isTextarea(surface) || surface.tagName === 'INPUT') {
      // Reines Textfeld: immer Markup, HTML waere hier sinnlos.
      return insertIntoTextarea(surface, text, where);
    }
    if (surface.isContentEditable) {
      // Position wurde am Feld gemerkt, geschrieben wird auf der Flaeche.
      if (surface !== element && carets && carets.has(element) && !carets.has(surface)) {
        carets.set(surface, carets.get(element));
      }
      return insertIntoRich(surface, text, html, where);
    }
    return false;
  }

  return {
    RICH_SELECTOR: RICH_SELECTOR,
    TEXTAREA_SELECTOR: TEXTAREA_SELECTOR,
    fieldContainer: fieldContainer,
    richTextFrame: richTextFrame,
    richTextBody: richTextBody,
    fieldForFrame: fieldForFrame,
    isRichTextActive: isRichTextActive,
    editingSurface: editingSurface,
    findModeToggle: findModeToggle,
    switchToMarkup: switchToMarkup,
    rememberCaret: rememberCaret,
    restoreCaret: restoreCaret,
    forgetCaret: forgetCaret,
    insertFormatted: insertFormatted,
    isUsable: isUsable,
    activeEditor: activeEditor,
    editableFrom: editableFrom,
    findTarget: findTarget,
    findAllTargets: findAllTargets,
    describe: describe,
    getText: getText,
    getSelectedText: getSelectedText,
    insert: insert,
    isRich: isRich,
    isTextarea: isTextarea,
    isVisible: isVisible,
    isSynthetic: isSynthetic
  };
});
