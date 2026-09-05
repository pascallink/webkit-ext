/**
 * Bearbeitungsmodus einfrieren.
 *
 * Jira beendet das Inline-Bearbeiten, sobald man neben das Feld klickt: die
 * Aenderung ist entweder weg oder liegt ungewollt als Entwurf im Vorgang.
 * Ist das Einfrieren eingeschaltet, haelt die Erweiterung das Feld offen -
 * das Schloss in der Buttonleiste ist zu - und fragt vor dem Verlassen der
 * Seite nach. Wird das Schloss geoeffnet, gilt wieder Jiras eigenes
 * Verhalten.
 *
 * Technisch: die Ereignisse, an denen Jira das Schliessen festmacht, werden
 * in der Erfassungsphase am Dokument gestoppt, bevor Jiras eigene Handler
 * sie sehen. Andere Listener am Dokument - auch unsere eigenen - laufen
 * weiter, denn stopPropagation haelt nur den Weg zu weiteren Knoten an.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraEditLock = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  // Ereignisse, mit denen Jira das Inline-Bearbeiten beendet: der Klick
  // daneben und der Fokuswechsel aus dem Feld heraus.
  var GUARDED = ['mousedown', 'mouseup', 'click', 'dblclick', 'focusin', 'focusout', 'blur'];

  var LOCKED = { glyph: '🔒', text: 'Bearbeitung eingefroren' };
  var OPEN = { glyph: '🔓', text: 'Bearbeitung einfrieren' };

  var enabled = false;
  var listening = false;
  var locks = [];      // gesperrte Felder
  var opened = [];     // per Hand geoeffnete Schloesser - die bleiben offen
  var buttons = [];    // { field: ..., button: ... }

  function editors() {
    return typeof window !== 'undefined' ? window.JiraEditors : null;
  }

  /** Was als "im Feld" gilt: der Feldblock, den Jira beim Bearbeiten aufbaut. */
  function editArea(field) {
    var api = editors();
    var container = api && api.fieldContainer ? api.fieldContainer(field) : null;
    if (container && container.contains) return container;
    return field.parentNode || field;
  }

  function inside(field, node) {
    var area = editArea(field);
    return !!(area && area.contains && area.contains(node));
  }

  /** Eigene Bedienelemente bleiben immer bedienbar. */
  function isOwnUi(node) {
    return !!(node && node.closest && node.closest('[data-jmd-ui]'));
  }

  function insideAnyLock(node) {
    for (var i = 0; i < locks.length; i++) {
      if (inside(locks[i], node)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Die Wachposten
   * ------------------------------------------------------------------ */

  function guard(event) {
    if (!locks.length) return;
    var node = event.target;
    if (!node || !node.nodeType) return;
    if (isOwnUi(node)) return;

    if (event.type === 'focusout' || event.type === 'blur') {
      // Der Fokus darf das Feld verlassen - Jira soll es nur nicht merken.
      if (insideAnyLock(node)) event.stopPropagation();
      return;
    }
    if (insideAnyLock(node)) return;
    event.stopPropagation();
  }

  /** Escape bricht das Bearbeiten in Jira ab - im eingefrorenen Feld nicht. */
  function onKeydown(event) {
    if (!locks.length || event.key !== 'Escape') return;
    if (isOwnUi(event.target)) return;
    if (insideAnyLock(event.target)) event.stopPropagation();
  }

  function onBeforeUnload(event) {
    if (!locks.length) return;
    event.preventDefault();
    // Aeltere Browser brauchen einen gesetzten Rueckgabewert.
    event.returnValue = '';
    return '';
  }

  function listen() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    for (var i = 0; i < GUARDED.length; i++) {
      document.addEventListener(GUARDED[i], guard, true);
    }
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  /* ------------------------------------------------------------------ *
   * Sperren
   * ------------------------------------------------------------------ */

  function indexIn(list, field) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === field) return i;
    }
    return -1;
  }

  function drop(list, field) {
    var at = indexIn(list, field);
    if (at !== -1) list.splice(at, 1);
  }

  function isLocked(field) {
    return indexIn(locks, field) !== -1;
  }

  /**
   * Friert ein Feld ein. Ein per Hand geoeffnetes Schloss bleibt offen -
   * sonst wuerde schon der naechste Klick ins Feld wieder einfrieren.
   */
  function lock(field) {
    if (!enabled || !field || isLocked(field)) return false;
    if (indexIn(opened, field) !== -1) return false;
    locks.push(field);
    listen();
    showState();
    return true;
  }

  function unlock(field) {
    if (!isLocked(field)) return false;
    drop(locks, field);
    showState();
    return true;
  }

  /** Der Weg ueber das Schloss: hier entscheidet der Anwender. */
  function toggle(field) {
    if (isLocked(field)) {
      opened.push(field);
      unlock(field);
      return false;
    }
    drop(opened, field);
    return lock(field);
  }

  /** Alle Sperren loesen - beim Abschalten der Einstellung. */
  function release() {
    locks = [];
    opened = [];
    showState();
  }

  /** Felder, die Jira aus der Seite genommen hat, geben ihre Sperre ab. */
  function cleanup() {
    var connected = function (field) {
      return field.isConnected;
    };
    var kept = locks.filter(connected);
    var changed = kept.length !== locks.length;
    locks = kept;
    opened = opened.filter(connected);
    buttons = buttons.filter(function (entry) {
      return entry.field.isConnected;
    });
    if (changed) showState();
  }

  function isActive() {
    return locks.length > 0;
  }

  /* ------------------------------------------------------------------ *
   * Schloss in der Buttonleiste
   * ------------------------------------------------------------------ */

  function createButton(field) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'jmd-fieldbar__btn jmd-fieldbar__btn--lock';
    button.dataset.jmdLock = '1';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      toggle(field);
    });
    buttons.push({ field: field, button: button });
    showButton(field, button);
    return button;
  }

  function showButton(field, button) {
    var locked = isLocked(field);
    var state = locked ? LOCKED : OPEN;
    button.textContent = state.glyph + ' ' + state.text;
    button.setAttribute('aria-pressed', locked ? 'true' : 'false');
    button.title = locked
      ? 'Schloss oeffnen: Jira darf das Feld beim Klick daneben wieder schliessen'
      : 'Feld einfrieren: es bleibt beim Klick daneben offen';
    button.classList.toggle('jmd-fieldbar__btn--locked', locked);
    button.hidden = !enabled;
  }

  function showState() {
    for (var i = 0; i < buttons.length; i++) {
      showButton(buttons[i].field, buttons[i].button);
    }
  }

  /**
   * options: { enabled: boolean }
   * Ausgeschaltet werden alle Sperren geloest und die Schloesser versteckt.
   */
  function configure(options) {
    var next = !!(options && options.enabled);
    if (next === enabled) {
      showState();
      return;
    }
    enabled = next;
    if (!enabled) {
      release();
      return;
    }
    showState();
  }

  return {
    configure: configure,
    createButton: createButton,
    lock: lock,
    unlock: unlock,
    toggle: toggle,
    isLocked: isLocked,
    isActive: isActive,
    cleanup: cleanup,
    release: release
  };
});
