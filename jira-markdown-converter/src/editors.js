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

  var TEXTAREA_SELECTOR = [
    'textarea#description',
    'textarea#comment',
    'textarea#environment',
    'textarea.textarea',
    'textarea[name="description"]',
    'textarea[name="comment"]',
    'textarea[id^="customfield_"]',
    'textarea'
  ].join(',');

  // Felder, die wir nie anfassen (eigene Oberflaeche, Suche, Login, Filter ...).
  var IGNORED_SELECTOR = [
    '[data-jmd-ui]',
    'input[type="password"]',
    '[data-test-id="search-dialog"] *',
    '#quickSearchInput',
    '[aria-label*="Suche" i]',
    '[aria-label*="search" i]',
    '[placeholder*="Suche" i]',
    '[placeholder*="search" i]'
  ].join(',');

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.disabled || element.readOnly) return false;
    var rects = element.getClientRects();
    if (!rects.length) return false;
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
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
    return editable && isVisible(editable) ? editable : null;
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
      if (!isVisible(node) || isIgnored(node)) continue;
      if (!isTextarea(node) && !isRich(node)) continue;
      var rect = node.getBoundingClientRect();
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
      if (!isVisible(node) || isIgnored(node)) continue;
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
    var kind = isTextarea(element) ? 'Textfeld' : 'Rich-Text-Editor';
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
    element.focus();
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
    var next = before + text + after;
    setTextareaValue(element, next);
    var caret = start + text.length;
    element.setSelectionRange(caret, caret);
    return true;
  }

  /**
   * Fuegt Text in einen ProseMirror-Editor ein. Wir schicken ein synthetisches
   * paste-Event: der Editor verarbeitet es wie eine echte Einfuege-Aktion,
   * inklusive Undo-Historie.
   */
  function insertIntoRich(element, text, mode) {
    element.focus();
    var view = element.ownerDocument.defaultView;

    if (mode === 'replace') {
      selectAll(element);
    }

    if (dispatchPaste(element, text)) return true;

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

  function dispatchPaste(element, text) {
    if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined') return false;
    try {
      var data = new DataTransfer();
      data.setData('text/plain', text);
      var event = new ClipboardEvent('paste', {
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
   * mode: 'insert' (an der Cursorposition) oder 'replace' (Feldinhalt ersetzen).
   */
  function insert(element, text, mode) {
    if (!element || !text) return false;
    if (isTextarea(element) || element.tagName === 'INPUT') {
      return insertIntoTextarea(element, text, mode || 'insert');
    }
    if (element.isContentEditable) {
      return insertIntoRich(element, text, mode || 'insert');
    }
    return false;
  }

  return {
    RICH_SELECTOR: RICH_SELECTOR,
    TEXTAREA_SELECTOR: TEXTAREA_SELECTOR,
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
