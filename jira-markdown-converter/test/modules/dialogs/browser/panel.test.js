/**
 * Panel aus einer Vorlage: Buttonleiste, Farben je Vorlage, Einfuegen mit
 * {panel}-Markup an der Cursorposition, Menuefokus und der Rich-Text-Fall.
 * Aufruf: npm run test:dialogs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Panel aus einer Vorlage', { skip: !hasPlaywright }, function () {
  test('Buttonleiste bietet vier Vorlagen an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.waitForSelector('.jmd-panelmenu');
    var labels = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        return item.dataset.template + ':' + item.textContent;
      });
    });
    assert.deepStrictEqual(labels, ['info:Info', 'note:Hinweis', 'warning:Warnung', 'plain:Standard']);
    await page.close();
  });

  test('jede Vorlage zeigt ihre Farbe', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.waitForSelector('.jmd-panelmenu');
    var colors = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        var swatch = item.querySelector('.jmd-panelmenu__swatch');
        var style = window.getComputedStyle(swatch);
        return { bg: style.backgroundColor, border: style.borderLeftColor };
      });
    });
    // Info blau, Hinweis gelb, Warnung rot, Standard grau.
    assert.strictEqual(colors[0].border, 'rgb(0, 82, 204)', JSON.stringify(colors[0]));
    assert.strictEqual(colors[0].bg, 'rgb(222, 235, 255)', JSON.stringify(colors[0]));
    assert.strictEqual(colors[1].border, 'rgb(255, 139, 0)', JSON.stringify(colors[1]));
    assert.strictEqual(colors[2].border, 'rgb(222, 53, 11)', JSON.stringify(colors[2]));
    assert.strictEqual(colors[3].border, 'rgb(223, 225, 230)', JSON.stringify(colors[3]));
    await page.close();
  });

  test('Textfeld bekommt {panel} mit Farben', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    assert.strictEqual(await page.inputValue('#description'),
      '{panel:title=Warnung|borderColor=#de350b|bgColor=#ffebe6}\n' +
      'Hier die Warnung eintragen.\n{panel}');
    await page.close();
  });

  test('Cursor steht anschliessend im Textbereich des Panels', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var selected = await page.evaluate(function () {
      var element = document.querySelector('#description');
      return {
        text: element.value.slice(element.selectionStart, element.selectionEnd),
        focused: document.activeElement === element
      };
    });
    assert.strictEqual(selected.text, 'Hier die Information eintragen.');
    assert.strictEqual(selected.focused, true, 'das Feld hat den Fokus nicht');
    await page.close();
  });

  test('Panel landet an der gemerkten Cursorposition', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="plain"]');
    assert.strictEqual(await page.inputValue('#description'),
      'oben\n{panel:title=Titel|borderColor=#dfe1e6|bgColor=#f4f5f7}\n' +
      'Hier den Text eintragen.\n{panel}\nunten');
    await page.close();
  });

  test('Menue schliesst mit Escape und beim Klick daneben', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().getByText('Panel');
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'Escape hat nicht geschlossen');
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await page.mouse.click(5, 5);
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'Klick daneben hat nicht geschlossen');
    // Und nichts wurde eingefuegt.
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  test('Panel der Erweiterung bietet dieselben Vorlagen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#comment');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="panel-template"]');
    await page.waitForSelector('.jmd-panelmenu');
    assert.strictEqual(await page.locator('.jmd-panelmenu__item').count(), 4);
    await page.click('.jmd-panelmenu__item[data-template="note"]');
    assert.strictEqual(await page.inputValue('#comment'),
      '{panel:title=Hinweis|borderColor=#ff8b00|bgColor=#fffae6}\n' +
      'Hier den Hinweis eintragen.\n{panel}');
    await page.close();
  });

  test('Rich-Text-Editor bekommt HTML mit denselben Farben', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Einfuegen im Editor angekommen');
    assert.ok(/border-left: 4px solid #0052cc/.test(pastes[0].html), 'Rahmenfarbe fehlt: ' + pastes[0].html);
    assert.ok(/background-color: #deebff/.test(pastes[0].html), 'Fuellfarbe fehlt: ' + pastes[0].html);
    assert.ok(/<strong>Info<\/strong>/.test(pastes[0].html), 'Titel fehlt: ' + pastes[0].html);
    // Als Rueckfalltext liegt weiterhin das Wiki-Markup bereit.
    assert.ok(/^\{panel:title=Info\|borderColor=#0052cc\|bgColor=#deebff\}/.test(pastes[0].text),
      'Markup fehlt: ' + pastes[0].text);
    // Die Textarea bleibt unangetastet - geschrieben wird in den Editor.
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  test('im Rich-Text-Editor steht der Cursor im Panel-Text', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForFunction(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      var selection = doc.defaultView.getSelection();
      return selection && selection.toString() === 'Hier die Warnung eintragen.';
    }, null, { timeout: 4000 });
    await page.close();
  });

  test('mit "vorher umschalten" kommt Markup statt HTML', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { switchToMarkup: true }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('{panel:title=Info') !== -1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  /*
   * ProseMirror (Jira Cloud, neuer Full Editor in Data Center) haengt am
   * Feld selbst, ohne Textarea/iframe dazwischen - anders als der
   * TinyMCE-Fall oben. Sein Schema (ADF) kennt keinen frei gestylten
   * Div-Rahmen: das HTML aus Converter.panelHtml() wuerde dort auf nackten,
   * ungestylten Absatztext einschrumpfen (Ticket #64). Deshalb bekommt
   * dieser Editor von vornherein nur das Markup.
   */
  test('echtes ProseMirror-Feld bekommt nur Markup, kein ungestyltes HTML', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.focus('.ProseMirror');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="panel-template"]');
    await page.waitForSelector('.jmd-panelmenu');
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes,
      ['{panel:title=Info|borderColor=#0052cc|bgColor=#deebff}\nHier die Information eintragen.\n{panel}']);
    // Tragende Assertion: die Fixture baut ihre Absaetze ohnehin nur aus
    // text/plain, das kommt mit und ohne Fix identisch als Markup an. Ob der
    // Fix wirkt, zeigt sich einzig daran, dass text/html beim Paste leer
    // bleibt - mit der alten insertTemplate() waere hier das gestylte
    // Div-HTML aus Converter.panelHtml() drin gewesen.
    var pasteHtml = await page.evaluate(function () { return window.__pasteHtml; });
    assert.deepStrictEqual(pasteHtml, [''], 'HTML-Nutzlast haette leer bleiben muessen: ' + JSON.stringify(pasteHtml));
    var html = await page.innerHTML('.ProseMirror');
    assert.strictEqual(html.indexOf('style='), -1, 'Panel kam trotzdem gestylt an: ' + html);
    assert.strictEqual(html.indexOf('<div'), -1, 'Panel kam trotzdem als Div-Rahmen an: ' + html);
    var toastText = await page.textContent('.jmd-toast');
    assert.ok(/als Markup eingefuegt/.test(toastText), 'Hinweis auf unformatiertes Markup fehlt: ' + toastText);
    await page.close();
  });
});
