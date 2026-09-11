// Testprotokoll gegen DBREFI-10549, Teil 1: Textmodus (aktuell im Profil
// gespeicherter Modus). Aendert den Vorgang: ein Kommentar, die Beschreibung.
'use strict';
const { withPage, shot, extState, logger } = require('./jira-lib');
const log = logger('jira-protocol-text.out');
const URL = 'http://jira.inxire.com/browse/DBREFI-10549';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
async function fresh(page) { await page.goto(URL, { waitUntil: 'load' }); await page.waitForSelector('.jmd-fab', { timeout: 10000 }); await page.waitForTimeout(1200); }
async function openComment(page) {
  await page.click('#footer-comment-button');
  await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 8000 });
  await page.waitForTimeout(800);
  const mode = await page.evaluate(() => (document.querySelector('#addcomment .editor-toggle-tabs li.aui-nav-selected') || {}).getAttribute('data-mode'));
  if (mode !== 'source') {
    await page.click('#addcomment .editor-toggle-tabs li[data-mode="source"] button');
    await page.waitForTimeout(1200);
  }
  await page.click('#comment');
  await page.waitForTimeout(300);
}
const bar = page => page.locator('#addcomment .jmd-fieldbar');
const value = page => page.inputValue('#comment');
async function setCaret(page, sel, pos) { await page.evaluate(([s, p]) => { const t = document.querySelector(s); t.focus(); t.setSelectionRange(p, p); }, [sel, pos]); }
async function cancelComment(page) {
  await page.click('#issue-comment-add-cancel', { timeout: 4000 }).catch(e => log('  cancel click err ' + e.message.split('\n')[0]));
  await page.waitForTimeout(1000);
  let n = await page.locator('#issue-comment-add').count();
  if (n) {
    log('  cancel: form noch da (lock=' + JSON.stringify((await extState(page)).bars.map(b => b.lock)) + ', dialogs=' + JSON.stringify(h.logs.filter(l => l.startsWith('[dialog]')).slice(-1)) + ') -> Schloss oeffnen, erneut');
    await page.click('#addcomment .jmd-fieldbar__btn--lock', { timeout: 3000 }).catch(() => {});
    await page.click('#issue-comment-add-cancel', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    n = await page.locator('#issue-comment-add').count();
    log('  cancel nach Schloss: form=' + n);
    if (n) { await fresh(page); }
  }
}
let h = null;
const { execSync } = require('child_process');
async function clip(page, text) { execSync('pbcopy', { input: text }); }

(async () => {
  await withPage(null, async (page, hh) => {
    h = hh;
    await fresh(page);

    // A1 Umwandeln
    await openComment(page);
    log('A1 lock after open: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await page.fill('#comment', '# Titel\n\n- a\n- b\n\n| k | v |\n|---|---|\n| 1 | 2 |');
    await bar(page).getByText('Umwandeln', { exact: true }).click();
    await page.waitForTimeout(500);
    log('A1 umwandeln: ' + JSON.stringify(await value(page)) + ' toast=' + (await extState(page)).toast);
    await cancelComment(page);

    // A2 Jira-Markup einfuegen (Automatik)
    await openComment(page);
    await clip(page, 'h2. Titel\n* punkt\n{code:java}\nint x = 1;\n{code}');
    await page.keyboard.press(MOD + '+V');
    await page.waitForTimeout(800);
    log('A2 jira-markup paste: ' + JSON.stringify(await value(page)) + ' toast=' + (await extState(page)).toast);
    await cancelComment(page);

    // A3 mitten in der Zeile
    await openComment(page);
    await page.fill('#comment', 'Satz eins. Satz zwei.');
    await setCaret(page, '#comment', 11);
    await clip(page, '## Neu\n\n- a\n- b');
    await bar(page).getByText('Einfuegen', { exact: true }).click();
    await page.waitForTimeout(800);
    log('A3 einfuegen mitten in zeile: ' + JSON.stringify(await value(page)));
    await cancelComment(page);

    // A4 Undo
    await openComment(page);
    await page.keyboard.type('Vorher ');
    await clip(page, '# Titel\n\n- a');
    await page.keyboard.press(MOD + '+V');
    await page.waitForTimeout(600);
    const afterPaste = await value(page);
    await page.keyboard.press(MOD + '+Z');
    await page.waitForTimeout(400);
    log('A4 paste=' + JSON.stringify(afterPaste) + ' undo=' + JSON.stringify(await value(page)));
    await cancelComment(page);

    // A5 Escape und Klick daneben, Vorschau-Reiter
    await openComment(page);
    await page.fill('#comment', 'bleibt');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    log('A5 after escape: form=' + await page.locator('#issue-comment-add').count() + ' value=' + JSON.stringify(await value(page).catch(() => null)));
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    log('A5 after click outside: form=' + await page.locator('#issue-comment-add').count());
    await page.click('#addcomment .wiki-preview, #addcomment button.wiki-preview', { timeout: 4000 }).then(() => log('A5 preview click ok')).catch(e => log('A5 preview click err ' + e.message.split('\n')[0]));
    await page.waitForTimeout(1500);
    log('A5 preview: ' + JSON.stringify(await page.evaluate(() => ({ previewVisible: !!Array.from(document.querySelectorAll('#addcomment .content-inner, #addcomment .wiki-preview-pane, #addcomment .previewArea')).find(e => e.offsetParent !== null), commentVisible: (document.getElementById('comment') || {}).offsetParent !== null }))));
    await shot(page, '40-jira-comment-preview');
    await cancelComment(page);
    if (await page.locator('#issue-comment-add').count()) { await fresh(page); }

    // A6 Kommentar mit Sonderzeichen wirklich absenden (Rendering-Nachweis)
    await fresh(page);
    await openComment(page);
    const probe = [
      'PowerEdit-Test E (Rendering): Dauer ~30 ms bis ~50 ms, x^2 und y^3, [INFO] gestartet, Kosten -oder- mehr, 5 * 3 * 2',
      '',
      '||Spalte A||Spalte B||',
      '|Backslash-Pipe: a\\|b|Zelle 2|',
      '|Entity-Pipe: a&#124;b|Zelle 2|',
      '|Monospace: {{\\{\\{key\\}\\}}}|Zelle 2|',
      '',
      'Maskiert: \\~30 ms\\~, x\\^2\\^, \\[INFO\\], \\-oder\\-',
      '',
      '{code:java}',
      'int x = 1;',
      '{code}'
    ].join('\n');
    await page.fill('#comment', probe);
    await page.click('#issue-comment-add-submit');
    await page.waitForTimeout(4000);
    log('A6 comment submitted: form=' + await page.locator('#issue-comment-add').count() + ' url=' + page.url() + ' dialogs=' + JSON.stringify(h.logs.filter(l => l.startsWith('[dialog]'))));
    log('A6 ext after submit: ' + JSON.stringify(await extState(page)));
    // Reagiert die Seite noch? (Issue 02)
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    log('A6 details toggled (aria-expanded): ' + await page.getAttribute('#details-module_heading button', 'aria-expanded'));
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await shot(page, '41-jira-after-comment-submit');

    // C Beschreibung inline (Textmodus)
    await fresh(page);
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(1200);
    const dmode = await page.evaluate(() => (document.querySelector('#descriptionmodule .editor-toggle-tabs li.aui-nav-selected') || {}).getAttribute('data-mode'));
    log('C1 description mode=' + dmode + ' lock=' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    if (dmode !== 'source') { await page.click('#descriptionmodule .editor-toggle-tabs li[data-mode="source"] button'); await page.waitForTimeout(1200); }
    await page.click('#descriptionmodule textarea#description');
    await page.waitForTimeout(300);
    log('C1 lock after click: ' + JSON.stringify((await extState(page)).bars.map(b => b.lock)));
    await page.fill('#descriptionmodule textarea#description', 'h2. Referenz\n* punkt\n{code:java}\nint x = 1;\n{code}\n\nPowerEdit-Test C: Beschreibung im Textmodus gespeichert.');
    await page.click('#summary-val', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    log('C2 after click on summary: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    log('C3 after escape: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    await page.click('#description-val button.submit', { timeout: 4000 }).catch(e => log('C4 save err ' + e.message.split('\n')[0]));
    await page.waitForTimeout(3000);
    log('C4 after save: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')) + ' text=' + JSON.stringify(await page.textContent('#description-val').then(t => t.trim().slice(0, 80))) + ' ext=' + JSON.stringify((await extState(page)).bars.length));
    await shot(page, '42-jira-description-saved');
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.click('#descriptionmodule textarea#description').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('#description-val button.cancel', { timeout: 4000 }).then(() => log('C5 cancel ok')).catch(e => log('C5 cancel err ' + e.message.split('\n')[0]));
    await page.waitForTimeout(800);
    log('C5 after cancel: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));
    // Schloss oeffnen, daneben klicken
    await page.click('#description-val');
    await page.waitForSelector('#descriptionmodule .jmd-fieldbar', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.click('#descriptionmodule textarea#description').catch(() => {});
    await page.click('#descriptionmodule .jmd-fieldbar__btn--lock');
    await page.waitForTimeout(200);
    await page.click('#details-module_heading', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(800);
    log('C6 unlocked + click outside: active=' + await page.evaluate(() => document.getElementById('description-val').classList.contains('active')));

    // D Bearbeiten-Dialog
    await fresh(page);
    await page.click('#edit-issue');
    await page.waitForSelector('#edit-issue-dialog', { timeout: 10000 });
    await page.waitForTimeout(3000);
    log('D1 bars: ' + JSON.stringify((await extState(page)).bars.map(b => b.next + '=' + b.lock)));
    await page.click('#edit-issue-dialog textarea#description');
    await page.waitForTimeout(300);
    await page.fill('#edit-issue-dialog textarea#description', 'h2. Referenz\n* punkt\n{code:java}\nint x = 1;\n{code}\n\nPowerEdit-Test D: aus dem Bearbeiten-Dialog.');
    await page.click('#edit-issue-dialog #summary', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(200);
    log('D2 summary focused: ' + await page.evaluate(() => document.activeElement.id));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    log('D3 after escape: dialog=' + await page.locator('#edit-issue-dialog').count());
    await page.click('#edit-issue-dialog button.cancel', { timeout: 4000 }).catch(e => log('D4 cancel err ' + e.message.split('\n')[0]));
    await page.waitForTimeout(800);
    log('D4 after cancel (frozen): dialog=' + await page.locator('#edit-issue-dialog').count());
    await page.click('#edit-issue-submit', { timeout: 4000 }).catch(e => log('D5 submit err ' + e.message.split('\n')[0]));
    await page.waitForTimeout(4000);
    log('D5 after update: dialog=' + await page.locator('#edit-issue-dialog').count() + ' url=' + page.url() + ' desc=' + JSON.stringify(await page.textContent('#description-val').then(t => t.trim().slice(0, 60)).catch(() => null)));
    await shot(page, '43-jira-after-dialog-update');
    log('Z dialogs: ' + JSON.stringify(h.logs.filter(l => l.startsWith('[dialog]'))));
    log('Z console errors: ' + JSON.stringify(h.logs.filter(l => /\[(error|pageerror)\]/.test(l)).slice(0, 5)));
  }).catch(e => log('Z ERROR ' + e.message));
})();
