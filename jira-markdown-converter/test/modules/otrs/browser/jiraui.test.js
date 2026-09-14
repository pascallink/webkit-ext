/**
 * Tests fuer JiraUi (src/jiraui.js) gegen die AUI-Fixture mock-jira-otrs.html:
 * Elemente werden per MutationObserver statt Polling gefunden, auch wenn sie
 * erst verzoegert (setTimeout 120 ms) ins DOM kommen.
 * Aufruf: npm run test:otrs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var OTRS_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.OTRS);
var JIRA912_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.JIRA912);

/**
 * Laedt die OTRS-Fixture mit nur settings.js und jiraui.js - nicht newPage()
 * aus lib/browser: das laedt den vollen Content-Script-Stack aus
 * content_scripts[0] und wartet auf .jmd-fab, beides fuer diesen reinen
 * DOM-Helfer unnoetig und auf der Server-Fixture auch nicht vorhanden.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  return page;
}

/**
 * Wie loadPage(), aber gegen den Nachbau von Jira 9.12 (JIRA912) - dort
 * liegen die Legacy-Dialoge dauerhaft im DOM und werden nur per Klasse
 * jira-dialog-open sichtbar (siehe docs/jira-dialogs-referenz.md).
 */
async function loadPage912(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(JIRA912_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  return page;
}

describe('JiraUi - DOM-Helfer gegen AUI-Dialoge', { skip: !hasPlaywright }, function () {
  test('waitForElement findet ein sofort vorhandenes Element', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var text = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#key-val', { timeout: 500 }).then(function (element) {
        return element.textContent;
      });
    });
    assert.strictEqual(text, 'PROJ-123');
    await page.close();
  });

  test('waitForElement findet ein nach 120 ms eingefuegtes Element', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var found = await page.evaluate(function () {
      window.JiraUi.sendKey(document.body, '.');
      return window.JiraUi.waitForElement('#quick-search-dialog', { timeout: 1000 }).then(function () {
        return true;
      });
    });
    assert.strictEqual(found, true);
    await page.close();
  });

  test('waitForElement laeuft bei timeout: 200 auf einen Fehler', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var message = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#nie-vorhanden', { timeout: 200 }).then(function () {
        return 'aufgeloest statt abgelehnt';
      }, function (error) {
        return error.message;
      });
    });
    assert.strictEqual(message, 'Element nicht gefunden: #nie-vorhanden');
    await page.close();
  });

  /*
   * Sichert das Geruest der Fixture, nicht JiraUi: der vorbelegte Wert des
   * Custom-Field-Dialogs wird als Eigenschaft gesetzt, nicht in das
   * value-Attribut konkateniert. Mit einem Anfuehrungszeichen im Wert bricht
   * die Konkatenation aus dem Attribut aus und der Wert kommt verstuemmelt an.
   */
  test('vorbelegter Wert ueberlebt ein Anfuehrungszeichen', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var value = await page.evaluate(function () {
      window.__setCustomFieldValue('Ticket#4711 "Modul A" zu B');
      window.__openCustomFieldDialog();
      return window.JiraUi.waitForElement('#customfield_11000', { timeout: 1000 })
        .then(function (field) { return field.value; });
    });
    assert.strictEqual(value, 'Ticket#4711 "Modul A" zu B');
    await page.close();
  });

  test('setValue schreibt den Wert und loest genau ein input-Ereignis aus', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__openCustomFieldDialog();
    });
    var result = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#customfield_11000', { timeout: 1000 }).then(function (field) {
        var inputEvents = 0;
        field.addEventListener('input', function () {
          inputEvents++;
        });
        window.JiraUi.setValue(field, 'Neuer Wert');
        return { value: field.value, inputEvents: inputEvents };
      });
    });
    assert.strictEqual(result.value, 'Neuer Wert');
    assert.strictEqual(result.inputEvents, 1);
    await page.close();
  });

  test("sendKey(document.body, 'l') blendet das Label-Modal ein", async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var found = await page.evaluate(function () {
      window.JiraUi.sendKey(document.body, 'l');
      return window.JiraUi.waitForElement('#edit-labels-dialog', { timeout: 1000 }).then(function () {
        return true;
      });
    });
    assert.strictEqual(found, true);
    await page.close();
  });

  test('waitForElement mit visible: true findet den sichtbaren Treffer hinter einem unsichtbaren', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var foundId = await page.evaluate(function () {
      var hidden = document.createElement('div');
      hidden.id = 'hidden-dialog';
      hidden.className = 'aui-dialog2';
      hidden.style.display = 'none';
      document.body.appendChild(hidden);

      var shown = document.createElement('div');
      shown.id = 'visible-dialog';
      shown.className = 'aui-dialog2';
      document.body.appendChild(shown);

      return window.JiraUi.waitForElement('.aui-dialog2', { visible: true, timeout: 500 }).then(function (element) {
        return element.id;
      });
    });
    assert.strictEqual(foundId, 'visible-dialog');
    await page.close();
  });

  test('waitForGone mit visible: true wartet auf das Ausblenden, nicht nur das Entfernen', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var result = await page.evaluate(function () {
      var dialog = document.createElement('div');
      dialog.className = 'aui-dialog2';
      document.body.appendChild(dialog);

      var settled = false;
      var gonePromise = window.JiraUi.waitForGone('.aui-dialog2', { visible: true, timeout: 1000 });
      gonePromise.then(function () {
        settled = true;
      });

      return new Promise(function (resolve) {
        setTimeout(function () {
          // Der Dialog steht noch sichtbar im DOM - waitForGone darf hier
          // noch nicht aufgeloest haben.
          var settledWhileVisible = settled;
          dialog.style.display = 'none';
          gonePromise.then(function () {
            resolve({ settledWhileVisible: settledWhileVisible, settledAfterAusblenden: settled });
          });
        }, 200);
      });
    });
    assert.strictEqual(result.settledWhileVisible, false, 'waitForGone hat aufgeloest, obwohl der Dialog noch sichtbar war');
    assert.strictEqual(result.settledAfterAusblenden, true, 'waitForGone hat nach dem Ausblenden nicht aufgeloest');
    await page.close();
  });

  test('setValue auf einem <select> setzt den Wert und wirft nicht', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__openLabelDialog();
    });
    var result = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#labels-multi-select', { timeout: 1000 }).then(function (select) {
        var option = document.createElement('option');
        option.value = 'wartung';
        option.textContent = 'Wartung';
        select.appendChild(option);

        var threw = false;
        try {
          window.JiraUi.setValue(select, 'wartung');
        } catch (error) {
          threw = true;
        }
        return { threw: threw, value: select.value };
      });
    });
    assert.strictEqual(result.threw, false, 'setValue hat auf dem <select> geworfen');
    assert.strictEqual(result.value, 'wartung');
    await page.close();
  });

  test('sendKey liefert die echten Keycodes fuer l, . und Enter', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var result = await page.evaluate(function () {
      function capture(key) {
        var seen = { keydown: null, keypress: null };
        function onKeydown(event) {
          seen.keydown = event.keyCode;
        }
        function onKeypress(event) {
          seen.keypress = event.keyCode;
        }
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('keypress', onKeypress);
        window.JiraUi.sendKey(document.body, key);
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('keypress', onKeypress);
        return seen;
      }
      return {
        l: capture('l'),
        punkt: capture('.'),
        enter: capture('Enter')
      };
    });
    // keydown/keyup tragen den Layout-Keycode der physischen Taste,
    // keypress den Literal-Code des erzeugten Zeichens - beide weichen bei
    // 'l' und '.' voneinander ab, nur bei benannten Tasten wie Enter nicht.
    assert.strictEqual(result.l.keydown, 76);
    assert.strictEqual(result.l.keypress, 108);
    assert.strictEqual(result.punkt.keydown, 190);
    assert.strictEqual(result.punkt.keypress, 46);
    assert.strictEqual(result.enter.keydown, 13);
    assert.strictEqual(result.enter.keypress, 13);
    await page.close();
  });
});

describe('JiraUi gegen den Nachbau von 9.12 (JIRA912)', { skip: !hasPlaywright }, function () {
  test('submitForm schickt das Formular des Labels-Dialogs ab', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var result = await page.evaluate(function () {
      var dialog = document.getElementById('edit-labels-dialog');
      dialog.classList.add('jira-dialog-open');
      var textarea = document.getElementById('labels-textarea');
      window.JiraUi.setValue(textarea, 'wartung');
      // dialog ist selbst nicht formularassoziiert und kein Vorfahre des
      // Formulars - das ist der Fall, den submitForm() ueber
      // element.querySelector('form') abdecken muss.
      var ok = window.JiraUi.submitForm(dialog);
      return {
        ok: ok,
        labels: window.__mock.saved.labels,
        stillOpen: dialog.classList.contains('jira-dialog-open')
      };
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.labels, 'wartung');
    assert.strictEqual(result.stillOpen, false, 'Dialog blieb nach submitForm offen');
    await page.close();
  });

  test('waitForElement mit visible wartet, bis jira-dialog-open gesetzt ist', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var result = await page.evaluate(function () {
      // #edit-labels-dialog steht in 9.12 dauerhaft im DOM und ist nur per
      // CSS (display: none ohne die Klasse jira-dialog-open) unsichtbar -
      // ein blosses waitForElement ohne { visible: true } wuerde sofort mit
      // dem noch verborgenen Dialog aufloesen.
      var dialog = document.getElementById('edit-labels-dialog');
      var settled = false;
      var promise = window.JiraUi.waitForElement('#edit-labels-dialog', { visible: true, timeout: 1000 });
      promise.then(function () {
        settled = true;
      });
      return new Promise(function (resolve) {
        setTimeout(function () {
          var settledWhileHidden = settled;
          dialog.classList.add('jira-dialog-open');
          promise.then(function () {
            resolve({ settledWhileHidden: settledWhileHidden, settledAfterOpen: settled });
          });
        }, 200);
      });
    });
    assert.strictEqual(result.settledWhileHidden, false, 'waitForElement hat aufgeloest, obwohl der Dialog noch verborgen war');
    assert.strictEqual(result.settledAfterOpen, true, 'waitForElement hat nach jira-dialog-open nicht aufgeloest');
    await page.close();
  });
  /**
   * Regressionsfall aus der Instanz (DBREFI-10549): der Shifter zeigt seine
   * Trefferliste schon vor der Eingabe und filtert erst im keyup-Handler.
   * Ein programmatisch gesetzter Wert allein aendert an der Liste nichts,
   * und der erste Eintrag ist "Summary" - wer ihn blind klickt, oeffnet das
   * falsche #modal-field-view und bricht die Kette ab.
   */
  test('shifterAction waehlt den Treffer zum Suchbegriff, nicht den ersten Eintrag', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var result = await page.evaluate(function () {
      return window.JiraUi.shifterAction('Kunden Referenz', '#modal-field-view', { timeout: 2000 })
        .then(function (dialog) {
          return {
            titel: dialog.querySelector('#modal-field-view-title').textContent,
            hatCustomField: !!dialog.querySelector('input[id^="customfield_"]'),
            gewaehlt: window.__mock.log.filter(function (zeile) {
              return zeile.indexOf('shifter ->') !== -1;
            })
          };
        });
    });
    assert.deepStrictEqual(result.gewaehlt, ['shifter -> Kunden Referenz']);
    assert.ok(/Kunden Referenz/.test(result.titel), 'falscher Dialog: ' + result.titel);
    assert.strictEqual(result.hatCustomField, true);
    await page.close();
  });

  test('shifterAction filtert die Liste - der Suchbegriff kommt als Tastendruck an', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var result = await page.evaluate(function () {
      return window.JiraUi.shifterAction('Link', '#link-issue-dialog', { timeout: 2000 })
        .then(function () {
          var sichtbar = Array.prototype.filter.call(
            document.querySelectorAll('#shifter-dialog-suggestions .aui-list-item'),
            function (li) { return li.style.display !== 'none'; }
          ).map(function (li) { return li.textContent.trim(); });
          return { feld: document.getElementById('shifter-dialog-field').value, sichtbar: sichtbar };
        });
    });
    assert.strictEqual(result.feld, 'Link');
    assert.deepStrictEqual(result.sichtbar, ['Link'], 'die Trefferliste wurde nicht gefiltert');
    await page.close();
  });

  test('shifterAction faellt ohne abgeleitete Klasse auf den Text zurueck', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var titel = await page.evaluate(function () {
      // Instanz ohne die Klasse li.aui-list-item-li-<slug> (anderer Feldname,
      // andere Ableitung): der Treffer muss ueber seinen Text gefunden werden.
      document.getElementById('kunden-referenz-35').classList.remove('aui-list-item-li-kunden-referenz');
      return window.JiraUi.shifterAction('Kunden Referenz', '#modal-field-view', { timeout: 800 })
        .then(function (dialog) {
          return dialog.querySelector('#modal-field-view-title').textContent;
        });
    });
    assert.ok(/Kunden Referenz/.test(titel), 'falscher Dialog: ' + titel);
    await page.close();
  });

  test('shifterAction lehnt ab, wenn kein Eintrag zum Suchbegriff passt', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var fehler = await page.evaluate(function () {
      return window.JiraUi.shifterAction('Gibt Es Nicht', '#modal-field-view', { timeout: 800 })
        .then(function () { return null; })
        .catch(function (error) { return error.message; });
    });
    assert.match(fehler, /Kein Shifter-Treffer/);
    await page.close();
  });

  test('typeValue setzt den Wert und schickt einen echten Tastendruck hinterher', async function () {
    var browser = await browserPromise;
    var page = await loadPage912(browser);
    var result = await page.evaluate(function () {
      // Der Shifter muss offen sein, sonst laeuft focus() auf ein per CSS
      // verborgenes Feld und das Fenster behaelt den alten Fokus.
      window.JiraUi.sendKey(document.body, '.');
      var feld = document.getElementById('shifter-dialog-field');
      var ereignisse = [];
      ['input', 'change', 'keydown', 'keypress', 'keyup'].forEach(function (typ) {
        feld.addEventListener(typ, function (event) {
          ereignisse.push(typ + ':' + (event.key === undefined ? '' : event.key) + ':' + feld.value);
        });
      });
      window.JiraUi.typeValue(feld, 'Link');
      return { wert: feld.value, ereignisse: ereignisse, fokussiert: document.activeElement === feld };
    });
    assert.strictEqual(result.wert, 'Link');
    assert.strictEqual(result.fokussiert, true);
    // keyup traegt den vollstaendigen Feldwert - genau das liest der Filter.
    assert.deepStrictEqual(result.ereignisse, [
      'input::Link',
      'change::Link',
      'keydown:k:Link',
      'keypress:k:Link',
      'keyup:k:Link'
    ]);
    await page.close();
  });
});
