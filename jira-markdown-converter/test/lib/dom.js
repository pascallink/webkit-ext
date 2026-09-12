/**
 * DOM-Helfer fuer Browser-Tests: Einfuegen simulieren, Zwischenablage
 * abfangen, Cursor in Textarea und Rich-Text-Editor setzen.
 */
'use strict';

/** Simuliert Strg+V mit vorgegebenem Text. */
async function pasteInto(page, selector, text) {
  await page.focus(selector);
  await page.evaluate(function (args) {
    var element = document.querySelector(args.selector);
    var data = new DataTransfer();
    data.setData('text/plain', args.text);
    element.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
  }, { selector: selector, text: text });
}

/** Legt eine Zwischenablage unter, die nur mitschreibt. */
async function stubClipboard(page) {
  await page.evaluate(function () {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: function (text) {
          window.__copied.push({ kind: 'text', text: text });
          return Promise.resolve();
        },
        write: function (items) {
          return items[0].getType('text/html').then(function (blob) {
            return blob.text();
          }).then(function (html) {
            return items[0].getType('text/plain').then(function (blob) {
              return blob.text();
            }).then(function (text) {
              window.__copied.push({ kind: 'html', html: html, text: text });
            });
          });
        }
      }
    });
  });
}

/**
 * Simuliert eine http-Instanz ohne Clipboard-API: navigator.clipboard fehlt,
 * document.execCommand('copy') wird durch einen Stub ersetzt, der den Text
 * des gerade selektierten Feldes (oder der Seitenselektion) uebernimmt und
 * einen echten copy-Listener ausloest - so kann ein Rueckfall in content.js
 * per event.clipboardData.setData() text/html und text/plain unterbringen.
 */
async function stubLegacyClipboard(page) {
  await page.evaluate(function () {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    document.execCommand = function (command) {
      if (command !== 'copy') return false;
      var active = document.activeElement;
      var text = '';
      if (active && active.value !== undefined && typeof active.selectionStart === 'number') {
        text = active.value.substring(active.selectionStart, active.selectionEnd);
      } else {
        text = String(document.getSelection());
      }
      var event = new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      document.dispatchEvent(event);
      if (event.defaultPrevented) {
        window.__copied.push({
          kind: 'html',
          html: event.clipboardData.getData('text/html'),
          text: event.clipboardData.getData('text/plain')
        });
      } else {
        window.__copied.push({ kind: 'text', text: text });
      }
      return true;
    };
  });
}

/** Setzt den Cursor an eine feste Stelle im Beschreibungsfeld. */
async function setCaret(page, index) {
  await page.evaluate(function (at) {
    var element = document.querySelector('#description');
    element.focus();
    element.setSelectionRange(at, at);
    document.dispatchEvent(new Event('selectionchange'));
  }, index);
}

/**
 * Setzt den Cursor im Rich-Text-Editor: Inhalt setzen, dann die Marke in den
 * Absatz mit dieser Kennung stellen.
 */
async function setRichCaret(page, html, id, offset) {
  await page.evaluate(function (args) {
    var doc = document.querySelector('#description_ifr').contentDocument;
    doc.body.innerHTML = args.html;
    var node = doc.getElementById(args.id).firstChild;
    var range = doc.createRange();
    range.setStart(node, args.offset);
    range.collapse(true);
    var selection = doc.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new Event('selectionchange'));
  }, { html: html, id: id, offset: offset });
}

module.exports = {
  pasteInto: pasteInto,
  stubClipboard: stubClipboard,
  stubLegacyClipboard: stubLegacyClipboard,
  setCaret: setCaret,
  setRichCaret: setRichCaret
};
