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
    ArrowDown: 40,
    '.': 190
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

  /**
   * Erster Treffer, bzw. (needsVisible) erster SICHTBARER Treffer - AUI
   * laesst beim Oeffnen eines Dialogs oft einen alten, ausgeblendeten
   * .aui-dialog2-Knoten vor dem neuen stehen. Ein querySelector() auf den
   * blossen ersten Treffer wuerde options.visible wirkungslos machen.
   */
  function findMatch(selector, root, needsVisible) {
    var elements = root.querySelectorAll(selector);
    if (!needsVisible) return elements.length ? elements[0] : null;
    for (var i = 0; i < elements.length; i++) {
      if (visible(elements[i])) return elements[i];
    }
    return null;
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

  /**
   * Natives value-Set ueber den Prototyp-Setter, damit AUI/jQuery-Handler
   * reagieren. Der Prototyp kommt vom Element selbst (Object.getPrototypeOf)
   * statt erraten zu werden - sonst wirft der Setter von HTMLInputElement
   * auf einem <select> (z.B. #labels-multi-select) "Illegal invocation".
   */
  function nativeSetter(element) {
    var proto = Object.getPrototypeOf(element);
    var descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
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

  /**
   * keyCode/which fuer keydown/keyup - der Layout-Code der physischen
   * Taste, unabhaengig von Gross-/Kleinschreibung (z.B. 'l' und 'L' beide
   * 76). Benannte Tasten stehen explizit in NAMED_KEY_CODES, auch '.'
   * (190) - eine Ableitung aus dem Zeichen selbst traefe hier daneben
   * (charCodeAt('.') ist 46, der echte Layout-Code aber 190).
   */
  function layoutKeyCode(key) {
    if (Object.prototype.hasOwnProperty.call(NAMED_KEY_CODES, key)) return NAMED_KEY_CODES[key];
    if (key.length === 1) return key.toUpperCase().charCodeAt(0);
    return 0;
  }

  /**
   * keyCode/which fuer keypress - der Literal-Code des erzeugten Zeichens,
   * gross-/kleinschreibungsabhaengig (z.B. 'l' 108, nicht 76). Fuer
   * Steuertasten ohne Zeichen (Enter, Escape, ...) bleibt NAMED_KEY_CODES
   * die Quelle, genau wie bei layoutKeyCode.
   */
  function charKeyCode(key) {
    if (key.length === 1) return key.charCodeAt(0);
    if (Object.prototype.hasOwnProperty.call(NAMED_KEY_CODES, key)) return NAMED_KEY_CODES[key];
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
   * seine Tastaturkuerzel (l, . ...) an keydown am document auf. keydown/
   * keyup bekommen den Layout-Keycode, keypress den Literal-Code des
   * Zeichens - ein expliziter options.keyCode ueberschreibt beide Faelle
   * gleich, so wie zuvor. Bricht die Kette ab, sobald dispatchEvent false
   * liefert (ein Handler hat preventDefault() aufgerufen) - der Browser
   * wuerde in diesem Fall die folgenden Tastatur-Ereignisse ebenfalls nicht
   * mehr feuern.
   */
  function sendKey(target, key, options) {
    var opts = options || {};
    var code = opts.code || codeFor(key);
    var types = ['keydown', 'keypress', 'keyup'];
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var keyCode = opts.keyCode !== undefined ? opts.keyCode :
        (type === 'keypress' ? charKeyCode(key) : layoutKeyCode(key));
      var dispatched = target.dispatchEvent(new KeyboardEvent(type, {
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
      if (!dispatched) return;
    }
  }

  /** Fokussiert und klickt ein Element echt (MouseEvent statt element.click()). */
  function click(element) {
    if (typeof element.focus === 'function') element.focus();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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
