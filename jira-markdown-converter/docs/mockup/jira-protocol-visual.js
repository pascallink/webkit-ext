// Testprotokoll Teil 2: Strg+V mitten in der Zeile (Text), dann visueller
// Modus (TinyMCE): formatiertes Einfuegen, Code, Panel, Umschalten-Option,
// Sperre der Beschreibung. Am Ende: Editor wieder auf Visuell (Ausgangslage),
// switchToMarkup wieder aus. Kommentare werden nur abgebrochen.
'use strict';
const { execSync } = require('child_process');
const { withPage, shot, extState, skeleton, logger } = require('./jira-lib');
const { EXT_ID } = require('./cdp');
const cdp = require('./cdp');
const log = logger('jira-protocol-visual.out');
const URL = 'http://jira.inxire.com/browse/DBREFI-10549';
const MOD = 'Meta';
let h = null;
async function fresh(page) { await page.goto(URL, { waitUntil: 'load' }); await page.waitForSelector('.jmd-fab', { timeout: 10000 }); await page.waitForTimeout(1200); }
function clip(text) { execSync('pbcopy', { input: text }); }
const mode = (page, scope) => page.evaluate(s => (document.querySelector(s + ' .editor-toggle-tabs li.aui-nav-selected') || {}).getAttribute('data-mode'), scope);
async function setMode(page, scope, m) {
  if ((await mode(page, scope)) === m) return;
  await page.click(scope + ' .editor-toggle-tabs li[data-mode="' + m + '"] button');
  await page.waitForTimeout(1500);
}
async function openComment(page, m) {
  await page.click('#footer-comment-button');
  await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 8000 });
  await page.waitForTimeout(1000);
  await setMode(page, '#addcomment', m);
  await page.waitForTimeout(800);
}
const frameBody = page => page.frameLocator('#addcomment iframe.tox-edit-area__iframe').locator('body');
async function bodyHtml(page) { return page.evaluate(() => { const f = document.querySelector('#addcomment iframe.tox-edit-area__iframe'); return f && f.contentDocument ? f.contentDocument.body.innerHTML : null; }); }
async function clickFrame(page, scope) {
  const box = await page.evaluate(s => { const f = document.querySelector(s + ' iframe.tox-edit-area__iframe'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 25 }; }, scope);
  if (box) await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(400);
  return !!box;
}
const bar = page => page.locator('#addcomment .jmd-fieldbar');
async function setOption(context, key, on) {
  const opt = await context.newPage();
  await opt.goto('chrome-extension://' + EXT_ID + '/options/options.html');
  await opt.waitForSelector('#templateList > *');
  const cb = opt.locator('#' + key);
  if ((await cb.isChecked()) !== on) { await cb.click(); await opt.waitForTimeout(800); }
  const v = await cb.isChecked();
  await opt.close();
  return v;
}

(async () => {
  await withPage(null, async (page, hh) => {
    h = hh;
    // T1 Strg+V mitten in der Zeile (Textmodus)
    await fresh(page);
    await openComment(page, 'source');
    await page.click('#comment');
    await page.fill('#comment', 'Satz eins. Satz zwei.');
    await page.evaluate(() => { const t = document.querySelector('#comment'); t.focus(); t.setSelectionRange(11, 11); });
    clip('## Neu\n\n- a\n- b');
    await page.keyboard.press(MOD + '+V');
    await page.waitForTimeout(800);
    log('T1 strg+v mitten in zeile: ' + JSON.stringify(await page.inputValue('#comment')));
    // Einfuegen-Button: Toast pruefen (Clipboard-Berechtigung)
    await bar(page).getByText('Einfuegen', { exact: true }).click();
    await page.waitForTimeout(1200);
    log('T1 einfuegen-button toast: ' + (await extState(page)).toast + ' value=' + JSON.stringify(await page.inputValue('#comment')));
    await shot(page, '44-jira-clipboard-button');

    // V1 Visueller Modus: Panel -> formatiert einfuegen
    await fresh(page);
    await openComment(page, 'wysiwyg');
    log('V1 mode=' + await mode(page, '#addcomment') + ' ext=' + JSON.stringify((await extState(page)).bars.map(b => b.next + '=' + b.lock)));
    await clickFrame(page, '#addcomment');
    log('V1 lock after click in frame: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await page.click('.jmd-fab');
    await page.waitForSelector('.jmd-panel--open');
    log('V1 panel target: ' + await page.textContent('.jmd-panel [data-role="target"]'));
    await page.fill('#jmd-input', '# Ueberschrift\n\n**fett** und `code` und [Link](https://example.org)\n\n- a\n- b\n\n| k | v |\n|---|---|\n| 1 | 2 |');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForTimeout(1500);
    log('V1 toast=' + (await extState(page)).toast);
    log('V1 rte html: ' + JSON.stringify((await bodyHtml(page) || '').slice(0, 600)));
    await shot(page, '45-jira-rte-formatted');
    await page.click('.jmd-panel [data-action="close"]');
    // Was macht Jira daraus im Textmodus?
    await setMode(page, '#addcomment', 'source');
    log('V1 als wiki: ' + JSON.stringify(await page.inputValue('#comment')));
    await fresh(page);

    // V2 Code-Dialog und Panel-Vorlage im visuellen Modus
    await openComment(page, 'wysiwyg');
    await clickFrame(page, '#addcomment');
    await page.keyboard.type('Vor dem Code. ');
    await bar(page).getByText('Code', { exact: true }).click();
    await page.waitForSelector('.jmd-dialog--open');
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int x = 1;\nreturn x;');
    await page.click('[data-code-action="insert"]');
    await page.waitForTimeout(1200);
    log('V2 code toast=' + (await extState(page)).toast + ' html=' + JSON.stringify((await bodyHtml(page) || '').slice(0, 400)));
    await bar(page).getByText('Panel', { exact: true }).click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForTimeout(1200);
    log('V2 panel toast=' + (await extState(page)).toast + ' html=' + JSON.stringify((await bodyHtml(page) || '').slice(0, 700)));
    await shot(page, '46-jira-rte-code-panel');
    await setMode(page, '#addcomment', 'source');
    log('V2 als wiki: ' + JSON.stringify(await page.inputValue('#comment')));
    await fresh(page);

    // V3 Strg+V im visuellen Modus (Automatik)
    await openComment(page, 'wysiwyg');
    await clickFrame(page, '#addcomment');
    clip('# Titel\n\n- eins\n- zwei');
    await page.keyboard.press(MOD + '+V');
    await page.waitForTimeout(1500);
    log('V3 paste toast=' + (await extState(page)).toast + ' html=' + JSON.stringify((await bodyHtml(page) || '').slice(0, 300)));
    await setMode(page, '#addcomment', 'source');
    log('V3 als wiki: ' + JSON.stringify(await page.inputValue('#comment')));
    await fresh(page);

    // V4 Einstellung "Vorher auf Markup-Modus umschalten"
    log('V4 switchToMarkup=' + await setOption(h.context, 'switchToMarkup', true));
    await fresh(page);
    await openComment(page, 'wysiwyg');
    await clickFrame(page, '#addcomment');
    await page.click('.jmd-fab');
    await page.waitForSelector('.jmd-panel--open');
    await page.fill('#jmd-input', '# Umschalt-Test\n\n- a');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForTimeout(3000);
    log('V4 toast=' + (await extState(page)).toast + ' mode now=' + await mode(page, '#addcomment') + ' textarea=' + JSON.stringify(await page.inputValue('#comment').catch(() => null)) + ' html=' + JSON.stringify((await bodyHtml(page) || '').slice(0, 200)));
    await shot(page, '47-jira-switch-to-markup');
    await page.click('.jmd-panel [data-action="close"]');
    log('V4 switchToMarkup zurueck=' + await setOption(h.context, 'switchToMarkup', false));
    await fresh(page);

    // V5 Beschreibung visuell: Sperre direkt nach dem Oeffnen, Klick daneben
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(800);
    await setMode(page, '#descriptionmodule', 'wysiwyg');
    await fresh(page);
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(2000);
    log('V5 description mode=' + await mode(page, '#descriptionmodule') + ' lock right after open=' + JSON.stringify((await extState(page)).bars.map(b => b.lock)) + ' activeEl=' + await page.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id + '.' + String(document.activeElement.className).slice(0, 40)));
    await page.keyboard.type('Getippt direkt nach dem Oeffnen');
    await page.waitForTimeout(300);
    log('V5 typed into: ' + JSON.stringify(await page.evaluate(() => { const f = document.querySelector('#descriptionmodule iframe.tox-edit-area__iframe'); return f && f.contentDocument ? f.contentDocument.body.textContent.slice(0, 80) : null; })));
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    log('V5 after click outside: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')) + ' lock=' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await shot(page, '48-jira-description-visual-outside');
    if (await page.evaluate(() => document.getElementById('description-val').classList.contains('active'))) {
      await page.click('#description-val button.cancel', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    // Erneut: erst in den Rahmen klicken, dann daneben
    await fresh(page);
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(2000);
    await clickFrame(page, '#descriptionmodule');
    await page.keyboard.type('Nach Klick in den Rahmen');
    log('V6 lock after click in frame: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    log('V6 after click outside: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    if (await page.evaluate(() => document.getElementById('description-val').classList.contains('active'))) {
      await page.click('#description-val button.cancel', { timeout: 4000 }).then(() => log('V6 cancel ok')).catch(e => log('V6 cancel err ' + e.message.split('\n')[0]));
      await page.waitForTimeout(600);
      log('V6 after cancel: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    }
    // Ausgangslage: Visuell bleibt (war beim Start so)
    log('Z final comment mode check');
    await fresh(page);
    await page.click('#footer-comment-button');
    await page.waitForSelector('#addcomment .editor-toggle-tabs', { timeout: 8000 });
    await page.waitForTimeout(800);
    log('Z comment mode=' + await mode(page, '#addcomment'));
    await setMode(page, '#addcomment', 'wysiwyg');
    await page.click('#issue-comment-add-cancel').catch(() => {});
    log('Z dialogs: ' + JSON.stringify(h.logs.filter(l => l.startsWith('[dialog]')).map(l => l.slice(0, 40))));
    log('Z console errors: ' + JSON.stringify(h.logs.filter(l => /\[(error|pageerror)\]/.test(l)).slice(0, 5)));
  }).catch(e => log('Z ERROR ' + e.message));
})();
