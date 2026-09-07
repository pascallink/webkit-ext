/**
 * Node-seitiger chrome-Stub fuer Tests ausserhalb des Browsers. Bildet die
 * sync/local-Trennung aus Settings.LOCAL_KEYS nach. Browser-Tests nutzen die
 * Quelltext-Variante in test/lib/page-stub.js - beide Formen teilen den
 * gleichen Vertrag, es gibt keine dritte Kopie.
 */
'use strict';

/**
 * Setzt globalThis.chrome fuer die Dauer von fn und macht das danach wieder
 * rueckgaengig. fn wird sofort aufgerufen (kein Umweg ueber ein weiteres
 * Promise), damit chrome beim tatsaechlichen Lesen/Schreiben feststeht -
 * die Faelle laufen ohnehin nacheinander, nicht parallel.
 */
async function withChromeStub(stub, fn) {
  var previous = globalThis.chrome;
  globalThis.chrome = stub;
  try {
    return await fn();
  } finally {
    globalThis.chrome = previous;
  }
}

/**
 * Sammelt registrierte Listener, damit ein Test ein Event simulieren kann -
 * fuer onChanged, onMessage, onClicked und onCommand gleichermassen, trigger()
 * reicht alle Argumente unveraendert durch.
 */
function listenerStub() {
  var listeners = [];
  return {
    addListener: function (fn) { listeners.push(fn); },
    trigger: function () {
      var args = arguments;
      listeners.forEach(function (fn) { fn.apply(null, args); });
    }
  };
}

/** Rueckwaertskompatibler Name fuer den storage.onChanged-Stub. */
function onChangedStub() {
  return listenerStub();
}

function storageStub(syncStore, localStore) {
  return {
    runtime: { lastError: null },
    storage: {
      sync: {
        get: function (defaults, cb) {
          cb(Object.assign({}, defaults, syncStore));
        },
        set: function (values, cb) {
          Object.assign(syncStore, values);
          if (cb) cb();
        }
      },
      local: {
        get: function (defaults, cb) {
          cb(Object.assign({}, defaults, localStore));
        },
        set: function (values, cb) {
          Object.assign(localStore, values);
          if (cb) cb();
        }
      },
      onChanged: onChangedStub()
    }
  };
}

/**
 * Stub fuer background.js: storageStub plus das Mindeste, was der
 * Service-Worker beim Laden unbedingt aufruft (refreshIndicators() laeuft
 * synchron mit) und die Listener, gegen die Tests Nachrichten und Klicks
 * simulieren. chrome.tabs/scripting/permissions/action fehlen bewusst -
 * die Nachrichtenbehandlung fuer 'convert' und 'toggle-convert-on-paste'
 * braucht sie nicht.
 */
function backgroundStub(syncStore, localStore) {
  var stub = storageStub(syncStore, localStore);
  stub.runtime.onMessage = listenerStub();
  stub.runtime.onInstalled = listenerStub();
  stub.runtime.onStartup = listenerStub();
  stub.contextMenus = {
    removeAll: function (cb) { if (cb) cb(); },
    create: function (props, cb) { if (cb) cb(); },
    update: function (id, props, cb) { if (cb) cb(); },
    onClicked: listenerStub()
  };
  stub.commands = { onCommand: listenerStub() };
  return stub;
}

module.exports = {
  withChromeStub: withChromeStub,
  storageStub: storageStub,
  onChangedStub: onChangedStub,
  backgroundStub: backgroundStub
};
