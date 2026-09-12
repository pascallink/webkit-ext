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
 * synchron mit), die Listener, gegen die Tests Nachrichten und Klicks
 * simulieren, sowie chrome.tabs/chrome.scripting fuer die Jira-Sondierung
 * in sendToTab(). Jeder tabs.sendMessage/tabs.query/scripting.executeScript/
 * scripting.insertCSS-Aufruf landet protokolliert in stub.calls, damit ein
 * Test nachvollziehen kann, welche Dateien injiziert wurden.
 * stub.failNextSendMessage() laesst genau den naechsten tabs.sendMessage-
 * Aufruf mit chrome.runtime.lastError scheitern (wie bei einem Tab ohne
 * Content-Script) und raeumt lastError danach sofort wieder weg - echtes
 * Chrome-Verhalten haelt lastError auch nur waehrend des Callbacks.
 * scripting.executeScript liefert bei einem Aufruf mit `func` (die
 * Jira-Sondierung selbst) `[{ result: stub.probeResult }]`, bei einem
 * Aufruf mit `files` (Injektion) nur ein leeres Ergebnis.
 * Jede Methode setzt chrome.runtime.lastError unmittelbar vor ihrem eigenen
 * Callback (auch auf null im Erfolgsfall) statt sich auf den Ruhezustand zu
 * verlassen: sendToTab() ruft aus einem Callback mit gesetztem lastError
 * synchron die naechste API auf (z. B. probeJira() aus dem gescheiterten
 * sendMessage-Callback heraus) - echtes Chrome liefert Callbacks stets async
 * und damit nie mit fremdem lastError im Gepaeck, der synchrone Stub muss
 * das also selbst nachbilden.
 * chrome.contextMenus.create() protokolliert seine Argumente zusaetzlich in
 * stub.menus (createMenus() haengt an Settings.load(), also braucht ein Test
 * nach onInstalled/onStartup/onChanged.trigger() einen Tick zum Abwarten).
 * chrome.scripting.getRegisteredContentScripts/registerContentScripts/
 * updateContentScripts/unregisterContentScripts sowie chrome.permissions
 * sind das Mindeste, damit syncExtraHosts() - das an denselben Ereignissen
 * haengt wie createMenus() - dabei nicht auf fehlende Stubs laeuft.
 */
function backgroundStub(syncStore, localStore) {
  var stub = storageStub(syncStore, localStore);
  stub.runtime.onMessage = listenerStub();
  stub.runtime.onInstalled = listenerStub();
  stub.runtime.onStartup = listenerStub();
  stub.menus = [];
  stub.contextMenus = {
    removeAll: function (cb) { if (cb) cb(); },
    create: function (props, cb) { stub.menus.push(props); if (cb) cb(); },
    update: function (id, props, cb) { if (cb) cb(); },
    onClicked: listenerStub()
  };
  stub.commands = { onCommand: listenerStub() };
  stub.registeredContentScripts = [];
  stub.permissions = {
    contains: function (options, cb) { cb(true); },
    onAdded: listenerStub(),
    onRemoved: listenerStub()
  };

  stub.calls = [];
  stub.probeResult = false;
  stub._failNextSendMessage = false;
  stub.failNextSendMessage = function () {
    stub._failNextSendMessage = true;
  };

  stub.tabs = {
    sendMessage: function (tabId, message, cb) {
      stub.calls.push({ api: 'tabs.sendMessage', tabId: tabId, message: message });
      if (stub._failNextSendMessage) {
        stub._failNextSendMessage = false;
        stub.runtime.lastError = { message: 'Could not establish connection.' };
        if (cb) cb();
        stub.runtime.lastError = null;
        return;
      }
      stub.runtime.lastError = null;
      if (cb) cb();
    },
    query: function (queryInfo, cb) {
      stub.calls.push({ api: 'tabs.query', queryInfo: queryInfo });
      stub.runtime.lastError = null;
      cb(stub.tabsList || []);
    }
  };

  stub.scripting = {
    executeScript: function (options, cb) {
      stub.calls.push({ api: 'scripting.executeScript', options: options });
      stub.runtime.lastError = null;
      if (!cb) return;
      if (options.func) {
        cb([{ result: stub.probeResult }]);
      } else {
        cb([]);
      }
    },
    insertCSS: function (options, cb) {
      stub.calls.push({ api: 'scripting.insertCSS', options: options });
      stub.runtime.lastError = null;
      if (cb) cb();
    },
    getRegisteredContentScripts: function (options, cb) {
      stub.calls.push({ api: 'scripting.getRegisteredContentScripts', options: options });
      if (cb) cb(stub.registeredContentScripts);
    },
    registerContentScripts: function (scripts, cb) {
      stub.calls.push({ api: 'scripting.registerContentScripts', scripts: scripts });
      if (cb) cb();
    },
    updateContentScripts: function (scripts, cb) {
      stub.calls.push({ api: 'scripting.updateContentScripts', scripts: scripts });
      if (cb) cb();
    },
    unregisterContentScripts: function (options, cb) {
      stub.calls.push({ api: 'scripting.unregisterContentScripts', options: options });
      if (cb) cb();
    }
  };

  return stub;
}

module.exports = {
  withChromeStub: withChromeStub,
  storageStub: storageStub,
  onChangedStub: onChangedStub,
  backgroundStub: backgroundStub
};
