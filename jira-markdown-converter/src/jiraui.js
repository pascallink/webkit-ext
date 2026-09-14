/**
 * JiraUi - generische DOM-Helfer gegen die klassische AUI-Oberflaeche von
 * Jira Server / Data Center: auf Elemente warten (MutationObserver statt
 * Polling), Werte so setzen, dass Jiras eigene Handler sie mitbekommen,
 * Tastendruecke und Klicks nachbilden.
 *
 * Kennt OTRS nicht - reine DOM-Mechanik, wiederverwendbar fuer jeden
 * Automationsschritt gegen AUI-Dialoge. Dazu gehoert der Shifter (Taste .)
 * als einziger Weg in ein Custom Field ohne Wert: shifterAction() tippt den
 * Suchbegriff mit echten Tastatur-Ereignissen und waehlt den passenden
 * Treffer - beides zusammen ersetzt die frueheren Kopien in otrsflow.js und
 * keysync.js.
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
  var DEFAULT_SHORTCUT_TIMEOUT = 1500;
  // Erster Anlauf auf den Klassen-Anker: laesst der Slug den Treffer nicht
  // finden, greift der Textabgleich nach dieser Frist statt erst nach dem
  // vollen Budget - mit offenem Shifter ueber der Seite ist Leerlauf teuer.
  var SUGGESTION_ANCHOR_TIMEOUT = 1500;

  var SHIFTER_DIALOG = '#shifter-dialog';
  var SHIFTER_FIELD = '#shifter-dialog-field';
  var SHIFTER_SUGGESTIONS = '#shifter-dialog-suggestions';
  var SHIFTER_ITEM = '.aui-list-item';

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

  /**
   * Schreibt einen Suchbegriff so in ein Feld, dass auch Widgets reagieren,
   * die an Tastatur-Ereignissen haengen statt an input: der Shifter filtert
   * seine Trefferliste im keyup-Handler (AUI QueryableDropdownSelect) und
   * sieht ein blosses input-Ereignis nie. Der Nachschlag ist das letzte
   * Zeichen des Begriffs - der Handler liest den Feldwert, nicht die Taste.
   */
  function typeValue(field, text) {
    var value = String(text === undefined || text === null ? '' : text);
    if (typeof field.focus === 'function') field.focus();
    setValue(field, value);
    if (value) sendKey(field, value.charAt(value.length - 1));
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

  /**
   * 'Kunden Referenz' -> 'kunden-referenz': Jira leitet die Klasse eines
   * Shifter-Treffers (li.aui-list-item-li-<slug>) aus dem Namen ab - der
   * belastbarste Anker, stabiler als Position und id
   * (siehe docs/jira-dialogs-referenz.md).
   */
  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * Sichtbarer Shifter-Treffer zum Suchbegriff: exakter Text vor Teiltreffer.
   * Ohne Treffer null - der Aufrufer entscheidet, ob das ein Fehler ist.
   */
  function matchSuggestion(root, query) {
    var items = root.querySelectorAll(SHIFTER_SUGGESTIONS + ' ' + SHIFTER_ITEM);
    var needle = String(query).trim().toLowerCase();
    var partial = null;
    for (var i = 0; i < items.length; i++) {
      if (!visible(items[i])) continue;
      var text = items[i].textContent.trim().toLowerCase();
      if (text === needle) return items[i];
      if (!partial && needle && text.indexOf(needle) !== -1) partial = items[i];
    }
    return partial;
  }

  /**
   * Wartet auf den Treffer zum Suchbegriff - nie auf den ersten Eintrag der
   * Liste: der Shifter zeigt seine Vorschlaege schon vor der Eingabe, ein
   * blindes querySelector('.aui-list-item') greift damit den falschen
   * (z.B. "Summary") und oeffnet den falschen Dialog.
   *
   * Reihenfolge: kurzer Anlauf auf den Klassen-Anker, dann Textabgleich,
   * dann das Restbudget nochmal auf den Anker. Der Textabgleich braucht
   * seinen fruehen Platz, weil slugify() jedes Zeichen ausserhalb [a-z0-9]
   * wegwirft - ein Feldname mit Umlaut ergibt einen Slug, den Jira so nicht
   * ableitet. Der zweite Wait bleibt, damit eine langsam aufgebaute
   * Trefferliste nicht vorzeitig als "kein Treffer" gilt.
   */
  function waitForSuggestion(query, root, timeout) {
    var slug = slugify(query);
    if (!slug) {
      var direkt = matchSuggestion(root, query);
      if (direkt) return Promise.resolve(direkt);
      return Promise.reject(new Error('Kein Shifter-Treffer fuer "' + query + '"'));
    }

    var selector = SHIFTER_SUGGESTIONS + ' li.aui-list-item-li-' + slug;
    var ersteFrist = Math.min(timeout, SUGGESTION_ANCHOR_TIMEOUT);
    var restFrist = timeout - ersteFrist;

    function ueberText() {
      var match = matchSuggestion(root, query);
      if (!match) throw new Error('Kein Shifter-Treffer fuer "' + query + '"');
      return match;
    }

    return waitForElement(selector, { root: root, visible: true, timeout: ersteFrist })
      .catch(function () {
        try {
          return ueberText();
        } catch (error) {
          if (restFrist <= 0) throw error;
          return waitForElement(selector, { root: root, visible: true, timeout: restFrist })
            .catch(ueberText);
        }
      });
  }

  /**
   * Oeffnet den Shifter (Taste .), tippt query in #shifter-dialog-field und
   * waehlt den passenden Treffer per Klick, nicht per Enter: ein
   * synthetisches KeyboardEvent loest in 9.12 keinen Formular-Submit aus.
   * Loest mit dem per targetSelector gefundenen Folge-Dialog auf
   * ({ visible: true }, die Legacy-Dialoge stehen dauerhaft im DOM).
   * options = { root, timeout, shortcutTimeout }.
   */
  function shifterAction(query, targetSelector, options) {
    var opts = options || {};
    var root = opts.root || document;
    var timeout = opts.timeout === undefined ? DEFAULT_TIMEOUT : opts.timeout;
    var shortcutTimeout = opts.shortcutTimeout === undefined ? DEFAULT_SHORTCUT_TIMEOUT : opts.shortcutTimeout;
    var body = root.body || (root.ownerDocument && root.ownerDocument.body) || root;

    sendKey(body, '.');
    return waitForElement(SHIFTER_DIALOG, { root: root, visible: true, timeout: shortcutTimeout })
      .then(function () {
        var field = findMatch(SHIFTER_FIELD, root, false);
        if (!field) throw new Error('Shifter-Eingabefeld nicht gefunden');
        typeValue(field, query);
        return waitForSuggestion(query, root, timeout);
      })
      .then(function (suggestion) {
        click(suggestion);
        return waitForElement(targetSelector, { root: root, visible: true, timeout: timeout });
      });
  }

  /** Formular zu element: erst element.form (Feld), dann Vorfahre, dann Nachfahre. */
  function findForm(element) {
    if (element.form) return element.form;
    var ancestor = typeof element.closest === 'function' ? element.closest('form') : null;
    if (ancestor) return ancestor;
    return element.querySelector ? element.querySelector('form') : null;
  }

  /**
   * Schickt das Formular zu element ab, ohne einen Primaerbutton zu suchen -
   * jeder Dialog in 9.12 hat einen anderen (button#submit, input.button[type
   * =submit], input[name="Link"]), das Formular ist die einzige gemeinsame
   * Klammer. Bevorzugt form.requestSubmit() (feuert den echten submit-Event
   * inkl. eingebauter Validierung), faellt sonst auf einen Klick auf den
   * Submit-Button zurueck und zuletzt auf form.submit(). Liefert false ohne
   * gefundenes Formular, sonst true.
   */
  function submitForm(element) {
    var form = findForm(element);
    if (!form) return false;
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      var submitControl = form.querySelector('input[type="submit"], button[type="submit"]');
      if (submitControl) {
        click(submitControl);
      } else {
        form.submit();
      }
    }
    return true;
  }

  return {
    waitForElement: waitForElement,
    waitForGone: waitForGone,
    setValue: setValue,
    typeValue: typeValue,
    sendKey: sendKey,
    shifterAction: shifterAction,
    click: click,
    submitForm: submitForm,
    visible: visible,
    delay: delay
  };
});
