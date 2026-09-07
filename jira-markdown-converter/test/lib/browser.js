/**
 * Playwright-Fundament fuer die Browser-Module: ein Chromium je Testdatei,
 * Seiten mit eingebautem chrome-Stub und Content-Script, SOURCES/STYLES aus
 * manifest.json statt hart verdrahtet - eine neue Content-Script-Datei im
 * Manifest reicht, damit sie in allen Browser-Tests mitlaeuft.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var after = require('node:test').after;
var pageStubLib = require('./page-stub');
var fixtures = require('./fixtures');

var CHROME_STUB = pageStubLib.CHROME_STUB;
var pageStub = pageStubLib.pageStub;

var root = path.join(__dirname, '..', '..');
var manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Nur der erste content_scripts-Block wird geladen (Jira-Skripte). Mit Issue #17
// (OTRS Link Helper) kommt ein zweiter Block mit anderem matches-Muster dazu -
// dessen Skripte laden diese Helfer nicht mit. Notwendig waere dann eine eigene
// Seitenfabrik fuer das OTRS-Fixture, keine Erweiterung dieser Liste.
var SOURCES = manifest.content_scripts[0].js;
var STYLES = manifest.content_scripts[0].css;

function hasPlaywright() {
  try {
    require.resolve('playwright');
    return true;
  } catch (error) {
    return false;
  }
}

function readSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

/**
 * Startet einen Chromium fuer die Dauer der Testdatei und schliesst ihn im
 * globalen after() der Datei - ein Browser je Datei statt je Fall. Erst
 * beim Aufruf wird `playwright` geladen, damit Dateien ohne installierte
 * Abhaengigkeit ueber { skip: !hasPlaywright() } uebersprungen werden
 * koennen, statt beim require() zu scheitern. Die Umgebungsvariable
 * CHROMIUM_PATH setzt optional den Pfad zu einem vorhandenen Chromium
 * (lokal hilfreich, wenn Playwright den Browser nicht selbst gezogen hat);
 * ungesetzt bleibt das Verhalten unveraendert.
 */
function withBrowser() {
  var chromium = require('playwright').chromium;
  var options = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  var browser = null;
  var ready = chromium.launch(options).then(function (instance) {
    browser = instance;
    return browser;
  });
  after(function () {
    return ready.then(function () {
      return browser.close();
    });
  });
  return ready;
}

async function newPage(browser, settings, fixture) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto('file://' + path.join(root, 'test', 'fixtures', fixture || fixtures.CLOUD));
  for (var s = 0; s < STYLES.length; s++) {
    await page.addStyleTag({ content: readSource(STYLES[s]) });
  }
  await page.addScriptTag({ content: CHROME_STUB });
  if (settings) {
    var split = pageStub(settings);
    await page.evaluate(function (values) {
      window.__settings = values.sync;
      window.__local = values.local;
    }, split);
  }
  for (var i = 0; i < SOURCES.length; i++) {
    await page.addScriptTag({ content: readSource(SOURCES[i]) });
  }
  // Das Content-Script startet asynchron (Settings werden geladen).
  await page.waitForFunction(function () {
    return !!document.querySelector('.jmd-fab');
  }, null, { timeout: 5000 });
  return page;
}

/**
 * Laedt die Optionsseite. settings.customTemplates (falls gesetzt) landet im
 * local-Bereich des Stubs, alles andere im sync-Bereich - wie in der echten
 * Aufteilung. Der Stub muss per addInitScript vor page.goto stehen, weil die
 * Seite settings.js selbst per <script> laedt.
 */
async function optionsPage(browser, settings) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.addInitScript({ content: CHROME_STUB });
  if (settings) {
    var split = pageStub(settings);
    await page.addInitScript({
      content: 'window.__settings = ' + JSON.stringify(split.sync) + ';' +
        'window.__local = ' + JSON.stringify(split.local) + ';'
    });
  }
  await page.goto('file://' + path.join(root, 'options', 'options.html'));
  // #templateList steht statisch im HTML - erst ein Kind zeigt, dass
  // renderTemplates() (nach Settings.load()) tatsaechlich gelaufen ist.
  await page.waitForSelector('#templateList > *');
  return page;
}

/**
 * Laedt die Popup-Seite. Gleicher Stub-Aufbau wie optionsPage() - der Stub
 * muss per addInitScript vor page.goto stehen, weil popup.html settings.js
 * selbst per <script> laedt.
 */
async function popupPage(browser, settings) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.addInitScript({ content: CHROME_STUB });
  if (settings) {
    var split = pageStub(settings);
    await page.addInitScript({
      content: 'window.__settings = ' + JSON.stringify(split.sync) + ';' +
        'window.__local = ' + JSON.stringify(split.local) + ';'
    });
  }
  await page.goto('file://' + path.join(root, 'popup', 'popup.html'));
  // input.focus() ist der letzte synchrone Schritt in Settings.load().then(),
  // danach steht der Popup-Zustand (Schalter, Vorschau) fest.
  await page.waitForFunction(function () {
    return document.activeElement === document.getElementById('input');
  });
  return page;
}

module.exports = {
  hasPlaywright: hasPlaywright,
  readSource: readSource,
  withBrowser: withBrowser,
  newPage: newPage,
  optionsPage: optionsPage,
  popupPage: popupPage,
  SOURCES: SOURCES,
  STYLES: STYLES,
  CHROME_STUB: CHROME_STUB
};
