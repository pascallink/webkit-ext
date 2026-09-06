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

/** Sammelt registrierte Listener, damit ein Test onChanged-Events simulieren kann. */
function onChangedStub() {
  var listeners = [];
  return {
    addListener: function (fn) { listeners.push(fn); },
    trigger: function (changes, area) {
      listeners.forEach(function (fn) { fn(changes, area); });
    }
  };
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

module.exports = {
  withChromeStub: withChromeStub,
  storageStub: storageStub,
  onChangedStub: onChangedStub
};
