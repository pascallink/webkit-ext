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
 * gestoppt, bevor Jiras eigene Handler sie sehen. Dazu haengen die
 * Wachposten am Fenster - dem ersten Knoten der Erfassungsphase, noch vor
 * dem Dokument - und stoppen zusaetzlich die Weitergabe an Handler am
 * selben Knoten. Nur so greift das Einfrieren auch dann, wenn Jira selbst
 * in der Erfassungsphase am Dokument lauscht: dort waere ein blosses
 * stopPropagation wirkungslos, weil Jiras Handler frueher registriert ist.
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
  // daneben und der Fokuswechsel aus dem Feld heraus. Zeigergeraete melden
  // sich vor der Maus - moderne Oberflaechen haengen daran.
  var GUARDED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
    'touchstart', 'focus', 'focusin', 'focusout', 'blur'];

  // Ereignisse, bei denen der Fokus das Feld verlaesst. Sie werden nur
  // gestoppt, wenn sie aus dem eingefrorenen Feld kommen.
  var LEAVING = { focusout: true, blur: true };

  // Unsere eigene Oberflaeche muss bedienbar bleiben - Jira muss davon aber
  // nichts mitbekommen, sonst schliesst es das Feld, sobald jemand den
  // schwebenden Editor benutzt. Durchgelassen wird darum nur der Klick, an
  // dem unsere Knoepfe haengen. Fokus, Einfuegemarke und Auswahl erledigt
  // der Browser von selbst; das haelt kein gestopptes Ereignis auf.
  var OWN_UI_PASS = { click: true, dblclick: true };

  // Rahmen, die Jira um genau ein bearbeitetes Feld legt.
  var AREA_SELECTOR = [
    '.editable-field',              // Jira Server: Inline-Bearbeitung im Vorgang
    '.inline-edit-fields',
    '.jira-wikifield',
    '.wiki-edit',
    '.aui-field-wikiedit',
    '.field-group',
    '.mce-tinymce',
    '.tox-tinymce',
    '.ak-editor-content-area',      // Jira Cloud
    '[data-testid*="inline-edit"]',
    '[data-testid*="rich-text"]'
  ].join(',');

  var LOCKED = { glyph: '🔒', text: 'Bearbeitung eingefroren' };
  var OPEN = { glyph: '🔓', text: 'Bearbeitung einfrieren' };

  var enabled = false;
  var listening = false;
  var watchers = [];   // eigene Handler, die auch gestoppte Ereignisse sehen
  var locks = [];      // gesperrte Felder
  var opened = [];     // per Hand geoeffnete Schloesser - die bleiben offen
  var buttons = [];    // { field: ..., button: ... }

  function editors() {
    return typeof window !== 'undefined' ? window.JiraEditors : null;
  }

  function matches(node, selector) {
    try {
      return !!(node.matches && node.matches(selector));
    } catch (error) {
      return false;
    }
  }

  /** Umschliesst dieser Rahmen noch ein zweites Eingabefeld? Dann ist er zu weit. */
  function holdsOtherField(node, field) {
    var api = editors();
    if (!api || !node.querySelectorAll) return false;
    var found = node.querySelectorAll(api.RICH_SELECTOR + ',' + api.TEXTAREA_SELECTOR);
    for (var i = 0; i < found.length; i++) {
      if (found[i] !== field && api.isUsable(found[i])) return true;
    }
    return false;
  }

  /**
   * Was als "im Feld" gilt: der aeusserste bekannte Rahmen um das Feld, der
   * noch kein zweites Feld umschliesst. Damit bleiben Werkzeugleiste,
   * Moduswechsel und die Knoepfe zum Speichern und Abbrechen bedienbar - die
   * liegen in Jira neben dem Eingabebereich, nicht darin - ohne dass der
   * restliche Vorgang mit hineinrutscht.
   */
  function findArea(field) {
    var area = null;
    var node = field.parentNode;
    var stop = field.ownerDocument;
    while (node && node.nodeType === 1 && node !== stop.body && node !== stop.documentElement) {
      if (holdsOtherField(node, field)) break;
      if (matches(node, AREA_SELECTOR)) area = node;
      node = node.parentNode;
    }
    return area || field.parentNode || field;
  }

  // Der Rahmen wird beim Einfrieren einmal bestimmt und erst neu gesucht,
  // wenn Jira ihn ausgetauscht hat.
  var areas = typeof WeakMap === 'function' ? new WeakMap() : null;

  function editArea(field) {
    var known = areas ? areas.get(field) : null;
    if (known && known.isConnected && known.contains && known.contains(field)) return known;
    var area = findArea(field);
    if (areas) areas.set(field, area);
    return area;
  }

  /** Der Rich-Text-Editor lebt im eigenen Rahmen mit eigenem Dokument. */
  function inRichTextFrame(field, node) {
    var api = editors();
    var frame = api && api.richTextFrame ? api.richTextFrame(field) : null;
    if (!frame) return false;
    try {
      return !!node.ownerDocument && node.ownerDocument === frame.contentDocument;
    } catch (error) {
      return false;   // fremde Herkunft - nicht unser Editor
    }
  }

  function inside(field, node) {
    var area = editArea(field);
    if (area && area.contains && area.contains(node)) return true;
    return inRichTextFrame(field, node);
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

  /**
   * Haelt das Ereignis an. stopPropagation allein reicht nicht: Jira lauscht
   * teils in derselben Phase am selben Knoten und war zuerst da.
   */
  function block(event) {
    // Was hier stehenbleibt, sehen auch unsere eigenen Wachposten am Dokument
    // nicht mehr - die bekommen es darum direkt gereicht.
    for (var i = 0; i < watchers.length; i++) {
      try {
        watchers[i](event);
      } catch (error) {
        /* ein eigener Handler darf das Einfrieren nicht aufhalten */
      }
    }
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  /** Meldet einen Handler an, der auch gestoppte Ereignisse sehen soll. */
  function watch(fn) {
    if (typeof fn === 'function') watchers.push(fn);
  }

  function guard(event) {
    if (!locks.length) return;
    var node = event.target;
    if (!node || !node.nodeType) return;
    if (isOwnUi(node)) {
      if (!OWN_UI_PASS[event.type]) block(event);
      return;
    }

    if (LEAVING[event.type]) {
      // Der Fokus darf das Feld verlassen - Jira soll es nur nicht merken.
      if (insideAnyLock(node)) block(event);
      return;
    }
    if (insideAnyLock(node)) return;
    block(event);
  }

  /** Escape bricht das Bearbeiten in Jira ab - solange eingefroren ist, nicht. */
  function onKeydown(event) {
    if (!locks.length || event.key !== 'Escape') return;
    if (isOwnUi(event.target)) return;
    block(event);
  }

  function onBeforeUnload(event) {
    if (!locks.length) return;
    event.preventDefault();
    // Aeltere Browser brauchen einen gesetzten Rueckgabewert.
    event.returnValue = '';
    return '';
  }

  /**
   * Die Wachposten haengen am Fenster und am Dokument, jeweils in der
   * Erfassungsphase: das Fenster ist der erste Knoten des Wegs, damit kommt
   * die Erweiterung noch vor Jiras eigenen Handlern am Dokument zum Zug.
   * Registriert wird gleich beim Laden - wer zuerst da ist, gewinnt - und
   * nicht erst beim ersten Einfrieren. Ohne Sperre tut der Wachposten nichts.
   */
  function listen() {
    if (listening || typeof document === 'undefined' || typeof window === 'undefined') return;
    listening = true;
    var nodes = [window, document];
    for (var n = 0; n < nodes.length; n++) {
      for (var i = 0; i < GUARDED.length; i++) {
        nodes[n].addEventListener(GUARDED[i], guard, true);
      }
      nodes[n].addEventListener('keydown', onKeydown, true);
    }
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

  /**
   * Beim Wechsel zwischen Text- und Rich-Text-Modus baut Jira den Feldblock
   * neu auf: die Textarea von eben ist weg, an ihrer Stelle steht eine neue
   * mit derselben Kennung. Ohne diesen Schritt faellt die Sperre beim
   * Moduswechsel lautlos weg.
   */
  function successorOf(field) {
    var api = editors();
    var doc = field.ownerDocument;
    if (!doc) return null;
    var next = field.id ? doc.getElementById(field.id) : null;
    if (!next && field.name) {
      next = doc.querySelector('textarea[name="' + String(field.name).replace(/["\\]/g, '\\$&') + '"]');
    }
    if (!next || next === field || !api || !api.isUsable(next)) return null;
    return next;
  }

  /** Ersetzt weggeraeumte Felder durch ihren Nachfolger, sonst fallen sie raus. */
  function follow(list) {
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      var field = list[i];
      var live = field.isConnected ? field : successorOf(field);
      if (live && indexIn(kept, live) === -1) kept.push(live);
    }
    return kept;
  }

  function sameList(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /** Felder, die Jira aus der Seite genommen hat, geben ihre Sperre ab. */
  function cleanup() {
    var next = follow(locks);
    var changed = !sameList(next, locks);
    locks = next;
    opened = follow(opened);
    buttons = buttons.filter(function (entry) {
      return entry.field.isConnected;
    });
    // Nach einem Umbau traegt das neue Feld eine frische Leiste - das
    // Schloss daran muss den uebernommenen Zustand zeigen.
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

  // Gleich beim Laden lauschen - der Wachposten muss vor Jiras eigenen
  // Handlern am Dokument stehen, nicht erst beim ersten Einfrieren.
  listen();

  return {
    configure: configure,
    createButton: createButton,
    watch: watch,
    lock: lock,
    unlock: unlock,
    toggle: toggle,
    isLocked: isLocked,
    isActive: isActive,
    cleanup: cleanup,
    release: release
  };
});
