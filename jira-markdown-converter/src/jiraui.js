/**
 * JiraUi - generische DOM-Helfer gegen die klassische AUI-Oberflaeche von
 * Jira Server / Data Center: auf Elemente warten (MutationObserver statt
 * Polling), Werte so setzen, dass Jiras eigene Handler sie mitbekommen,
 * Tastendruecke und Klicks nachbilden.
 *
 * Kennt OTRS nicht - reine DOM-Mechanik, wiederverwendbar fuer jeden
 * Automationsschritt gegen AUI-Dialoge.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraUi = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var DEFAULT_TIMEOUT = 5000;

  var NAMED_KEY_CODES = {
    Enter: 13,
    Escape: 27,
    Tab: 9,
    Backspace: 8,
    ArrowUp: 38,
    ArrowDown: 40
  };

  var NAMED_CODES = {
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    '.': 'Period',
    ' ': 'Space'
  };

  /** Rechteck mit Flaeche > 0 - Rueckfall fuer Elemente ohne offsetParent (z.B. position: fixed). */
  function hasSize(element) {
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Sichtbar, wenn im Layout verankert (offsetParent) oder ein Rechteck > 0 hat. */
  function visible(element) {
    if (!element) return false;
    if (element.offsetParent !== null) return true;
    return hasSize(element);
  }

  function findMatch(selector, root, needsVisible) {
    var element = root.querySelector(selector);
    if (!element) return null;
    if (needsVisible && !visible(element)) return null;
    return element;
  }

  /**
   * Gemeinsamer Wartemechanismus fuer waitForElement/waitForGone: prueft
   * sofort per querySelector, sonst per MutationObserver auf
   * { childList, subtree, attributes } - attributes, weil AUI-Dialoge oft
   * schon im DOM stehen und nur per Klasse oder style sichtbar bzw.
   * unsichtbar werden. Observer und Timer werden in jedem Ausgang (Treffer,
   * Timeout) abgeraeumt. isSatisfied() entscheidet Treffer vs. Warten
   * weiter, resolveValue() liefert den Wert, mit dem das Promise aufgeloest
   * wird.
   */
  function waitFor(selector, options, isSatisfied, resolveValue, timeoutMessage) {
    var opts = options || {};
    var root = opts.root || document;
    var timeout = opts.timeout === undefined ? DEFAULT_TIMEOUT : opts.timeout;
    var needsVisible = !!opts.visible;

    return new Promise(function (resolve, reject) {
      var initialMatch = findMatch(selector, root, needsVisible);
      if (isSatisfied(initialMatch)) {
        resolve(resolveValue(initialMatch));
        return;
      }

      var observer = null;
      var timer = null;

      function cleanup() {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      }

      observer = new MutationObserver(function () {
        var match = findMatch(selector, root, needsVisible);
        if (!isSatisfied(match)) return;
        cleanup();
        resolve(resolveValue(match));
      });
      observer.observe(root === document ? document.documentElement : root, {
        childList: true,
        subtree: true,
        attributes: true
      });

      timer = setTimeout(function () {
        cleanup();
        reject(new Error(timeoutMessage));
      }, timeout);
    });
  }

  function isElement(match) {
    return !!match;
  }

  function isGone(match) {
    return !match;
  }

  function identity(match) {
    return match;
  }

  function noValue() {
    return undefined;
  }

  /** Wartet auf ein Element; loest mit ihm auf, lehnt nach Ablauf des Timeouts ab. */
  function waitForElement(selector, options) {
    return waitFor(selector, options, isElement, identity, 'Element nicht gefunden: ' + selector);
  }

  /** Wartet, bis ein Element verschwindet (bzw. unsichtbar wird) - fuer geschlossene Modale. */
  function waitForGone(selector, options) {
    return waitFor(selector, options, isGone, noValue, 'Element wurde nicht entfernt: ' + selector);
  }

  /** Natives value-Set ueber den Prototyp-Setter, damit AUI/jQuery-Handler reagieren. */
  function nativeSetter(element) {
    var proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    return descriptor && descriptor.set;
  }

  /**
   * Setzt den Wert eines Feldes ueber den nativen Setter statt
   * element.value = ... - letzteres wuerde an jQuery-/AUI-Bindings
   * vorbeischreiben. Feuert danach input und change als bubbelnde Events,
   * damit Jiras eigene Handler den neuen Wert mitbekommen.
   */
  function setValue(field, value) {
    var setter = nativeSetter(field);
    if (setter) {
      setter.call(field, value);
    } else {
      field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function keyCodeFor(key) {
    if (Object.prototype.hasOwnProperty.call(NAMED_KEY_CODES, key)) return NAMED_KEY_CODES[key];
    if (key.length === 1) return key.toUpperCase().charCodeAt(0);
    return 0;
  }

  function codeFor(key) {
    if (Object.prototype.hasOwnProperty.call(NAMED_CODES, key)) return NAMED_CODES[key];
    if (/^[a-zA-Z]$/.test(key)) return 'Key' + key.toUpperCase();
    if (/^[0-9]$/.test(key)) return 'Digit' + key;
    return key;
  }

  /**
   * Sendet keydown, keypress, keyup fuer eine Taste an target - AUI haengt
   * seine Tastaturkuerzel (l, . ...) an keydown am document auf.
   */
  function sendKey(target, key, options) {
    var opts = options || {};
    var keyCode = opts.keyCode === undefined ? keyCodeFor(key) : opts.keyCode;
    var code = opts.code || codeFor(key);
    var types = ['keydown', 'keypress', 'keyup'];
    for (var i = 0; i < types.length; i++) {
      target.dispatchEvent(new KeyboardEvent(types[i], {
        key: key,
        code: code,
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        ctrlKey: !!opts.ctrlKey,
        shiftKey: !!opts.shiftKey,
        altKey: !!opts.altKey
      }));
    }
  }

  /** Fokussiert und klickt ein Element echt (MouseEvent statt element.click()). */
  function click(element) {
    if (typeof element.focus === 'function') element.focus();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  return {
    waitForElement: waitForElement,
    waitForGone: waitForGone,
    setValue: setValue,
    sendKey: sendKey,
    click: click,
    visible: visible,
    delay: delay
  };
});
