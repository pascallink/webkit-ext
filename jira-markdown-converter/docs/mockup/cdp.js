// Verbindet sich per CDP mit dem Edge aus edge-harness.js und liefert
// Browser, Context und Hilfen. Jedes Szenario-Skript nutzt withPage().
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Volumes/sources/tools/webkit-ext/jira-markdown-converter/node_modules/playwright');
const S = __dirname;
const EXT_ID = fs.readFileSync(path.join(S, 'ext-id.txt'), 'utf8').trim();

async function connect() {
  const browser = await chromium.connectOverCDP('http://localhost:9333');
  const context = browser.contexts()[0];
  return { browser, context };
}

async function withPage(url, fn, opts) {
  const { browser, context } = await connect();
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('dialog', d => { logs.push('[dialog] ' + d.type() + ': ' + d.message()); d.accept().catch(() => {}); });
  try {
    if (url) await page.goto(url, { waitUntil: 'load' });
    await fn(page, { context, browser, logs, EXT_ID });
  } finally {
    if (!(opts && opts.keep)) await page.close();
    await browser.close();
  }
}

async function shot(page, name, opts) {
  const file = path.join(S, 'shots', name + '.png');
  await page.screenshot(Object.assign({ path: file }, opts || {}));
  return file;
}

module.exports = { connect, withPage, shot, EXT_ID, S };
