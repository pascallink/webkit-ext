/**
 * Tests fuer den geteilten Storage: sync/local-Aufteilung und den
 * onChange-Debounce. Die uebrigen Settings-Tests stehen in settings.test.js.
 * Aufruf: npm run test:settings --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var Settings = require(path.join(__dirname, '..', '..', '..', 'src', 'settings.js'));
var chromeStub = require(path.join(__dirname, '..', '..', 'lib', 'chrome-stub.js'));
var withChromeStub = chromeStub.withChromeStub;
var storageStub = chromeStub.storageStub;

describe('Geteilter Storage', function () {
  test('save() legt customTemplates nur in local ab', async function () {
    var syncStore = {};
    var localStore = {};
    await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.save({ customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(syncStore, 'customTemplates'));
    assert.strictEqual(localStore.customTemplates.length, 1);
  });

  test('save() legt convertOnPaste nur in sync ab', async function () {
    var syncStore = {};
    var localStore = {};
    await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.save({ convertOnPaste: false });
    });
    assert.strictEqual(syncStore.convertOnPaste, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(localStore, 'convertOnPaste'));
  });

  test('load() fuehrt beide Bereiche zusammen', async function () {
    var syncStore = { convertOnPaste: false };
    var localStore = { customTemplates: [{ id: 'a', title: 'T', templateMarkup: 'x', placeholders: [] }] };
    var settings = await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.load();
    });
    assert.strictEqual(settings.convertOnPaste, false);
    assert.strictEqual(settings.customTemplates.length, 1);
    assert.strictEqual(settings.customTemplates[0].title, 'T');
  });

  test('ein lastError in local laesst die uebrigen Einstellungen unberuehrt', async function () {
    var stub = storageStub({ convertOnPaste: false }, {});
    stub.storage.local.get = function (defaults, cb) {
      stub.runtime.lastError = { message: 'kaputt' };
      cb(defaults);
      stub.runtime.lastError = null;
    };
    var settings = await withChromeStub(stub, function () {
      return Settings.load();
    });
    assert.strictEqual(settings.convertOnPaste, false);
    assert.deepStrictEqual(settings.customTemplates, []);
  });

  test('ohne chrome liefert load() weiterhin die Defaults', async function () {
    var previous = globalThis.chrome;
    delete globalThis.chrome;
    var settings;
    try {
      settings = await Settings.load();
    } finally {
      globalThis.chrome = previous;
    }
    assert.strictEqual(settings.convertOnPaste, true);
    assert.deepStrictEqual(settings.customTemplates, []);
  });

  test('fehlender local-Bereich laesst sync trotzdem schreiben', async function () {
    var syncStore = {};
    var stub = storageStub(syncStore, {});
    delete stub.storage.local;
    await withChromeStub(stub, function () {
      return Settings.save({ convertOnPaste: false, customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.strictEqual(syncStore.convertOnPaste, false);
  });

  test('fehlender sync-Bereich laesst local trotzdem schreiben', async function () {
    var localStore = {};
    var stub = storageStub({}, localStore);
    delete stub.storage.sync;
    await withChromeStub(stub, function () {
      return Settings.save({ customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.strictEqual(localStore.customTemplates.length, 1);
  });

  test('zwei onChanged-Events pro save() loesen nur ein load() aus', async function () {
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'sync');
        stub.storage.onChanged.trigger({}, 'local');
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });

  test('onChanged-Events in getrennten Macrotasks loesen ein load aus', async function () {
    // sync und local sind zwei getrennte IPC-Runden - die Events treffen
    // im Browser regelmaessig einige Millisekunden auseinander ein, nicht
    // im selben Macrotask. Genau das bildet dieser Test nach.
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'sync');
        setTimeout(function () {
          stub.storage.onChanged.trigger({}, 'local');
        }, 5);
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });

  test('ein einzelnes onChanged-Event loest genau ein load() aus', async function () {
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'local');
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });
});
