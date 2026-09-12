/**
 * chrome.storage ueber zwei echte Erweiterungs-Kontexte hinweg: die
 * Optionsseite schreibt, das Content-Script im Fixture-Tab liest ueber
 * chrome.storage.onChanged mit. test/lib/browser.js (CHROME_STUB) kann das
 * nicht zeigen - dort ist chrome.storage ein In-Memory-Stub ohne eigenen
 * Prozess auf der anderen Seite.
 * Aufruf: npm run test:ext --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var after = nodeTest.after;
var extLib = require('../../../lib/extension');
var fixtures = require('../../../lib/fixtures');

// save() schreibt sync und local einzeln (settings.js:303-309) - zwei
// writeArea()-Aufrufe, je ein moeglicher storage.onChanged-Treffer. Der
// 50-ms-Debounce in Settings.onChange() (settings.js:311-328) soll daraus
// eine einzige sichtbare Auswirkung machen. Das Fenster hier deckt Debounce
// plus reale IPC-Laufzeit zwischen den beiden Erweiterungs-Kontexten ab.
var SETTLE_TIMEOUT = 5000;

describe('Storage ueber Erweiterungsseiten hinweg', function () {
  var readyPromise = extLib.canRunExtension();
  var ready = null;

  after(async function () {
    if (ready && ready.ok) await ready.teardown();
  });

  test('Aenderung auf der Optionsseite erreicht den offenen Tab', async function (t) {
    ready = await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var fixturePage = ready.context.pages()[0] || await ready.context.newPage();
    await fixturePage.goto('http://127.0.0.1:' + ready.port + '/' + fixtures.JIRA912);
    // showFloatingButton ist per Default an (settings.js DEFAULTS) - der FAB
    // steht, sobald das Content-Script seine Einstellungen geladen hat.
    await fixturePage.waitForSelector('.jmd-fab', { timeout: 10000 });

    var optionsPage = await extLib.extensionPage(ready.context, ready.extensionId, 'options/options.html');
    await optionsPage.waitForSelector('#showFloatingButton');
    assert.strictEqual(await optionsPage.isChecked('#showFloatingButton'), true);

    await optionsPage.uncheck('#showFloatingButton');
    await fixturePage.waitForSelector('.jmd-fab', { state: 'detached', timeout: SETTLE_TIMEOUT });

    await optionsPage.check('#showFloatingButton');
    await fixturePage.waitForSelector('.jmd-fab', { timeout: SETTLE_TIMEOUT });

    await optionsPage.close();
    await fixturePage.close();
  });
});
