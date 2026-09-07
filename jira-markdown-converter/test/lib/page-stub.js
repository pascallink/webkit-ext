/**
 * Browser-seitiger chrome-Stub als Quelltext-String fuer page.addScriptTag
 * bzw. page.addInitScript - der Node-seitige Stub mit demselben Vertrag
 * liegt in test/lib/chrome-stub.js, es gibt keine dritte Kopie.
 */
'use strict';

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
  '  tabs: {',
  '    query: function (info, cb) { cb([]); }',
  '  }',
  '};'
].join('\n');

/**
 * Teilt Einstellungen wie Settings.LOCAL_KEYS es vorsieht: customTemplates
 * gehoert in local - sonst ueberschreibt der leere local-Standardwert die
 * hier uebergebenen Vorlagen beim Laden. Eine Stelle fuer newPage und
 * optionsPage statt zwei fast identischer Kopien.
 */
function pageStub(settings) {
  var sync = Object.assign({}, settings || {});
  var local = { customTemplates: sync.customTemplates || [] };
  delete sync.customTemplates;
  return { sync: sync, local: local };
}

module.exports = {
  CHROME_STUB: CHROME_STUB,
  pageStub: pageStub
};
