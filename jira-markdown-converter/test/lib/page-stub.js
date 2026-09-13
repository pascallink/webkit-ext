/**
 * Browser-seitiger chrome-Stub als Quelltext-String fuer page.addScriptTag
 * bzw. page.addInitScript - der Node-seitige Stub mit demselben Vertrag
 * liegt in test/lib/chrome-stub.js, es gibt keine dritte Kopie.
 */
'use strict';

var Settings = require('../../src/settings.js');

/** Stellt chrome.* so weit nach, wie das Content-Script es braucht. */
var CHROME_STUB = [
  'window.__settings = {};',
  'window.__local = {};',
  'window.chrome = {',
  '  runtime: {',
  '    lastError: null,',
  '    onMessage: { addListener: function (fn) { window.__onMessage = fn; } },',
  '    sendMessage: function () {}',
  '  },',
  '  storage: {',
  '    sync: {',
  '      get: function (defaults, cb) {',
  '        var out = Object.assign({}, defaults, window.__settings);',
  '        setTimeout(function () { cb(out); }, 0);',
  '      },',
  '      set: function (values, cb) {',
  '        Object.assign(window.__settings, values);',
  '        if (cb) setTimeout(cb, 0);',
  '      }',
  '    },',
  '    local: {',
  '      get: function (defaults, cb) {',
  '        var out = Object.assign({}, defaults, window.__local);',
  '        setTimeout(function () { cb(out); }, 0);',
  '      },',
  '      set: function (values, cb) {',
  '        Object.assign(window.__local, values);',
  '        if (cb) setTimeout(cb, 0);',
  '      }',
  '    },',
  '    onChanged: { addListener: function () {} }',
  '  },',
  // Nur fuer popup.js: checkCurrentTab() fragt beim Laden unbedingt den
  // aktiven Tab ab - ohne Stub wuerde chrome.tabs.query() sonst werfen.
  // cb([]) fuehrt in popup.js (withActiveTab) zur Statusmeldung
  // "Kein aktiver Tab." - fuer aktuelle Tests unerheblich, aber zu beachten,
  // sobald ein Test die Statuszeile prueft.
  '  tabs: {',
  '    query: function (info, cb) { cb([]); }',
  '  }',
  '};'
].join('\n');

/**
 * Teilt Einstellungen anhand von Settings.LOCAL_KEYS auf: jeder dort
 * genannte Schluessel gehoert in local - sonst ueberschreibt der leere
 * local-Standardwert die hier uebergebenen Werte beim Laden. Kommt ein
 * lokaler Schluessel bei Settings.LOCAL_KEYS dazu, muss diese Datei nicht
 * mehr angefasst werden. Eine Stelle fuer newPage und optionsPage statt
 * mehrerer fast identischer Kopien.
 */
function pageStub(settings) {
  var sync = Object.assign({}, settings || {});
  var local = {};
  for (var i = 0; i < Settings.LOCAL_KEYS.length; i++) {
    var key = Settings.LOCAL_KEYS[i];
    local[key] = Object.prototype.hasOwnProperty.call(sync, key) ? sync[key] : Settings.DEFAULTS[key];
    delete sync[key];
  }
  return { sync: sync, local: local };
}

module.exports = {
  CHROME_STUB: CHROME_STUB,
  pageStub: pageStub
};
