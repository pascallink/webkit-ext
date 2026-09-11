// Nachbau v2 gegen die Erweiterung: dieselben Faelle wie in der Instanz, um
// zu sehen, ob der Nachbau die echten Befunde reproduziert.
'use strict';
const { withPage, shot, extState, logger } = require('./jira-lib');
const log = logger('scenario-mock2.out');
const URL = 'http://localhost:8765/mock-jira-912-issue-view.html';
const mockLog = page => page.evaluate(() => window.__mock.log.slice());
const last = async (page, n) => (await mockLog(page)).slice(-(n || 2));
async function fresh(page, q) { await page.goto(URL + (q || ''), { waitUntil: 'load' }); await page.waitForSelector('.jmd-fab', { timeout: 8000 }); await page.waitForTimeout(600); }
const mode = (page, scope) => page.evaluate(s => (document.querySelector(s + ' .editor-toggle-tabs li.aui-nav-selected') || {}).getAttribute('data-mode'), scope);
async function setMode(page, scope, m) { if ((await mode(page, scope)) === m) return; await page.click(scope + ' .editor-toggle-tabs li[data-mode="' + m + '"] button'); await page.waitForTimeout(600); }
async function clickFrame(page, scope) { const box = await page.evaluate(s => { const f = document.querySelector(s + ' iframe.tox-edit-area__iframe'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 25 }; }, scope); if (box) await page.mouse.click(box.x, box.y); await page.waitForTimeout(300); return !!box; }
const bodyHtml = (page, scope) => page.evaluate(s => { const f = document.querySelector(s + ' iframe.tox-edit-area__iframe'); return f && f.contentDocument ? f.contentDocument.body.innerHTML : null; }, scope);

(async () => {
  await withPage(null, async (page, h) => {
    await page.evaluate(() => { try { localStorage.setItem('jira.editor.mode', 'wysiwyg'); } catch (e) {} }).catch(() => {});
    // 1 Kommentar visuell: Leiste, Sperre, Link-Navigation
    await fresh(page, '?state=comment');
    await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 5000 });
    await page.waitForTimeout(500);
    log('M1 comment mode=' + await mode(page, '#addcomment') + ' bars=' + JSON.stringify((await extState(page)).bars.map(b => b.parent + ' -> ' + b.next + ' = ' + b.lock)));
    await clickFrame(page, '#addcomment');
    log('M1 lock after frame click: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await page.click('#assign-issue', { timeout: 3000 }).catch(e => log('M1 assign click err'));
    await page.waitForTimeout(1200);
    log('M1 after assign click: url=' + page.url().replace(/^.*\?/, '?') + ' banner=' + await page.evaluate(() => document.getElementById('mock-navigated').hidden ? 'nein' : document.getElementById('mock-navigated').textContent.slice(0, 60)));
    // 2 Kommentar Abbrechen waehrend eingefroren (save-options in field-group -> muss gehen)
    await fresh(page, '?state=comment');
    await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 5000 });
    await clickFrame(page, '#addcomment');
    await page.click('#issue-comment-add-cancel');
    await page.waitForTimeout(300);
    log('M2 cancel while frozen: ' + JSON.stringify(await last(page)) + ' form=' + await page.locator('#issue-comment-add').count());
    // 3 Formatiertes Einfuegen, Code, Panel im RTE -> als Wiki
    await fresh(page, '?state=comment');
    await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 5000 });
    await clickFrame(page, '#addcomment');
    await page.click('.jmd-fab');
    await page.waitForSelector('.jmd-panel--open');
    await page.fill('#jmd-input', '# Ueberschrift\n\n**fett** und `code`\n\n- a\n- b\n\n| k | v |\n|---|---|\n| 1 | 2 |');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForTimeout(400);
    await page.click('.jmd-panel [data-action="close"]');
    await page.locator('#addcomment .jmd-fieldbar').getByText('Code', { exact: true }).click();
    await page.waitForSelector('.jmd-dialog--open');
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int x = 1;');
    await page.click('[data-code-action="insert"]');
    await page.waitForTimeout(400);
    await page.locator('#addcomment .jmd-fieldbar').getByText('Panel', { exact: true }).click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForTimeout(400);
    log('M3 rte html: ' + JSON.stringify((await bodyHtml(page, '#addcomment') || '').slice(0, 500)));
    await setMode(page, '#addcomment', 'source');
    log('M3 als wiki: ' + JSON.stringify(await page.inputValue('#comment')));
    await shot(page, '60-mock2-rte');
    // 4 Beschreibung visuell: Sperre nach dem Oeffnen, Klick daneben speichert
    await page.evaluate(() => localStorage.setItem('jira.editor.mode', 'wysiwyg'));
    await fresh(page);
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 5000 });
    await page.waitForTimeout(800);
    log('M4 lock right after open: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)) + ' active=' + await page.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id));
    await page.keyboard.type('Getippt');
    await page.click('#details-module_heading');
    await page.waitForTimeout(300);
    log('M4 click outside: ' + JSON.stringify(await last(page, 2)) + ' active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    // 5 Edit-Dialog: Escape + Cancel waehrend eingefroren
    await fresh(page, '?state=edit');
    await page.waitForTimeout(800);
    log('M5 dialog bars: ' + JSON.stringify((await extState(page)).bars.map(b => b.next + ' = ' + b.lock)));
    await setMode(page, '#edit-issue-dialog .field-group:nth-of-type(3)', 'source').catch(() => {});
    await page.click('#edit-issue-dialog textarea#description', { timeout: 3000 }).catch(async () => { await clickFrame(page, '#edit-issue-dialog'); });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log('M5 escape: dialog open=' + await page.evaluate(() => document.getElementById('edit-issue-dialog').getAttribute('aria-hidden') === 'false') + ' log=' + JSON.stringify(await last(page, 1)));
    await page.click('#edit-issue-dialog button.cancel', { timeout: 3000, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(300);
    log('M5 cancel: dialog open=' + await page.evaluate(() => document.getElementById('edit-issue-dialog').getAttribute('aria-hidden') === 'false') + ' log=' + JSON.stringify(await last(page, 1)));
    // 6 Shifter + Labels + Link
    await fresh(page);
    await page.keyboard.press('.');
    await page.keyboard.type('Kunden');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    log('M6 shifter: ' + JSON.stringify(await last(page, 2)) + ' modal=' + await page.locator('#modal-field-view.jira-dialog-open').count());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('#summary-val', { timeout: 2000 }).catch(() => {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('l');
    await page.waitForTimeout(300);
    log('M6 labels: ' + await page.locator('#edit-labels-dialog.jira-dialog-open').count() + ' focus=' + await page.evaluate(() => document.activeElement.id));
    await fresh(page);
    await page.click('#opsbar-operations_more');
    await page.click('#link-issue');
    await page.click('#add-web-link-link');
    await page.waitForTimeout(400);
    log('M6 weblink: ' + await page.locator('#web-link-url').count() + ' bars=' + await page.locator('#link-issue-dialog .jmd-fieldbar').count());
    await shot(page, '61-mock2-weblink');
    log('Z console errors: ' + JSON.stringify(h.logs.filter(l => /\[(error|pageerror)\]/.test(l)).slice(0, 5)));
  }).catch(e => log('Z ERROR ' + e.message));
})();
