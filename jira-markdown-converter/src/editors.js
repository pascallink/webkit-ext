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
    '[placeholder*="search" i]'
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

  // Umschalter zwischen Rich-Text und Markup. Jira benennt ihn je nach
  // Version anders, darum erst bekannte Selektoren, dann Beschriftungen.
  var MODE_TOGGLE_SELECTOR = [
    '.jira-wikifield .rte-toggle',
    '.wiki-edit .rte-toggle',
    'button.rte-button-source',
    'a.switch-to-source',
    '[data-mode="source"]',
    '[data-editor-mode]'
  ].join(',');

  var MODE_TOGGLE_TEXT = /markup|quelltext|source|klartext|plain\s*text|text-?modus|bearbeitungsmodus|wysiwyg|visual/i;

  function findModeToggle(field) {
    var container = fieldContainer(field);
    if (!container.querySelector) return null;

    var direct = container.querySelector(MODE_TOGGLE_SELECTOR);
    if (direct && !isIgnored(direct)) return direct;

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
    var owner = fieldForSurface(element);
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
      setTextareaValue(element, text);
      element.setSelectionRange(text.length, text.length);
      return true;
    }

    var before = value.slice(0, start);
    var after = value.slice(end);
    var payload = mode === 'block' ? asOwnLines(text, before, after) : text;
    var next = before + payload + after;
    setTextareaValue(element, next);
    var caret = start + payload.length;
    element.setSelectionRange(caret, caret);
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

  /**
   * Fuegt Text in einen ProseMirror-Editor ein. Wir schicken ein synthetisches
   * paste-Event: der Editor verarbeitet es wie eine echte Einfuege-Aktion,
   * inklusive Undo-Historie.
   */
  function insertIntoRich(element, text, html, mode) {
    var live = surfaceHasFocus(element);
    focusSurface(element);
    if (!live) restoreCaret(element);
    var view = element.ownerDocument.defaultView;

    if (mode === 'replace') {
      selectAll(element);
    }

    if (dispatchPaste(element, text, html)) return true;

    // Fallback 0: formatiert einfuegen, wenn HTML gewuenscht ist.
    if (html) {
      try {
        if (element.ownerDocument.execCommand('insertHTML', false, html)) return true;
      } catch (error) {
        /* weiter zum naechsten Fallback */
      }
    }

    // Fallback 1: execCommand fuellt den Editor ueber beforeinput/input.
    try {
      if (element.ownerDocument.execCommand('insertText', false, text)) return true;
    } catch (error) {
      /* weiter zum naechsten Fallback */
    }

    // Fallback 2: direkt in die Selektion schreiben.
    try {
      var selection = view.getSelection();
      if (selection && selection.rangeCount) {
        var range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(element.ownerDocument.createTextNode(text));
        selection.collapseToEnd();
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    } catch (error) {
      /* aufgeben */
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
    richTextFrame: richTextFrame,
    richTextBody: richTextBody,
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
