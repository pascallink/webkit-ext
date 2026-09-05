#!/usr/bin/env node
/**
 * Baut die Bild-Artefakte fuer die Store-Listung aus Quellen, die im
 * Repository liegen: das Logo aus `assets/logo.svg`, die Screenshots aus
 * `docs/images/`. Damit ist jedes eingereichte Bild reproduzierbar - kein
 * Bildbearbeitungsprogramm, keine Handarbeit.
 *
 * Aufruf: npm run store:assets --prefix jira-markdown-converter
 * Braucht Playwright (devDependency); fehlt es, bricht das Skript mit einem
 * Hinweis ab, statt halbfertige Dateien zu hinterlassen.
 *
 * Vorgaben des Microsoft Edge Add-ons Store:
 *   Logo        300 x 300  PNG
 *   Screenshots 1280 x 800 PNG (1-10 Stueck)
 *   Promo-Tile  1400 x 560 PNG (optional)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const storeDir = __dirname;
const projectDir = path.join(storeDir, '..', '..');
const assetsDir = path.join(storeDir, 'assets');
const shotsDir = path.join(assetsDir, 'screenshots');

const BLUE = '#0052CC';
const INK = '#172B4D';
const MUTED = '#5E6C84';
const PAPER = '#F4F5F7';

/** Screenshot-Motive: Quellbild aus docs/images, Titel und Bildunterschrift. */
const SHOTS = [
  {
    file: '01-popup.png',
    source: 'popup.png',
    title: 'Konverter in der Symbolleiste',
    caption: 'Markdown einfuegen, Jira-Markup herausholen - ganz ohne Jira-Seite.'
  },
  {
    file: '02-panel.png',
    source: 'panel.png',
    title: 'Panel direkt im Ticket',
    caption: 'Links Markdown, rechts das fertige Jira-Markup, dann ins Feld einsetzen.'
  },
  {
    file: '03-code-dialog.png',
    source: 'code-dialog.png',
    title: 'Codebloecke ohne Umwege',
    caption: 'Sprache waehlen, Code eintippen - als {code}-Block an der Cursorposition.'
  },
  {
    file: '04-editlock.png',
    source: 'schloss-zu.png',
    title: 'Bearbeitung einfrieren',
    caption: 'Das Schloss haelt das Feld offen; ein Klick daneben verwirft nichts mehr.'
  },
  {
    file: '05-einstellungen.png',
    source: 'einstellungen.png',
    title: 'Alles einstellbar',
    caption: 'Automatik, Rich-Text-Verhalten und eigene Jira-Adressen an einer Stelle.'
  }
];

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    console.error('Playwright fehlt. Erst installieren:');
    console.error('  npm install --prefix jira-markdown-converter');
    console.error('  npx --prefix jira-markdown-converter playwright install chromium');
    process.exit(1);
  }
}

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.svg' ? 'image/svg+xml' : 'image/png';
  return 'data:' + type + ';base64,' + fs.readFileSync(file).toString('base64');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';

function logoPage() {
  return `<style>
    html,body{margin:0;padding:0}
    body{width:300px;height:300px}
    img{display:block;width:300px;height:300px}
  </style>
  <img src="${dataUri(path.join(assetsDir, 'logo.svg'))}" alt="">`;
}

function promoPage() {
  return `<style>
    html,body{margin:0;padding:0}
    body{width:1400px;height:560px;display:flex;align-items:center;gap:64px;
      padding:0 96px;box-sizing:border-box;background:${PAPER};font-family:${FONT};color:${INK}}
    img{width:220px;height:220px;flex:none}
    h1{margin:0 0 18px;font-size:64px;line-height:1.1;letter-spacing:-1px}
    p{margin:0;font-size:30px;line-height:1.45;color:${MUTED};max-width:760px}
    strong{color:${BLUE}}
  </style>
  <img src="${dataUri(path.join(assetsDir, 'logo.svg'))}" alt="">
  <div>
    <h1>PowerEdit for Jira</h1>
    <p>Markdown wird beim Einfuegen zu <strong>Jira-Markup</strong>.
       Dazu Codebloecke, Panel-Vorlagen und ein Feld, das beim Bearbeiten offen bleibt.</p>
  </div>`;
}

function shotPage(shot) {
  const source = path.join(projectDir, 'docs', 'images', shot.source);
  return `<style>
    html,body{margin:0;padding:0}
    body{width:1280px;height:800px;box-sizing:border-box;padding:56px 72px 48px;
      background:${PAPER};font-family:${FONT};color:${INK};
      display:flex;flex-direction:column;align-items:center}
    h1{margin:0;font-size:40px;line-height:1.2;letter-spacing:-0.5px;text-align:center}
    p{margin:14px 0 0;font-size:22px;line-height:1.4;color:${MUTED};text-align:center}
    .frame{margin-top:36px;flex:1;min-height:0;max-width:100%;display:flex;
      align-items:center;justify-content:center;background:#FFFFFF;
      border:1px solid #DFE1E6;border-radius:12px;
      box-shadow:0 8px 24px rgba(9,30,66,.12);overflow:hidden;padding:20px;box-sizing:border-box}
    img{max-width:100%;max-height:100%;object-fit:contain;display:block}
  </style>
  <h1>${escapeHtml(shot.title)}</h1>
  <p>${escapeHtml(shot.caption)}</p>
  <div class="frame"><img src="${dataUri(source)}" alt=""></div>`;
}

async function render(browser, html, width, height, target) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: target, type: 'png' });
  await page.close();
  console.log('  ' + path.relative(projectDir, target) + '  ' + width + 'x' + height);
}

async function main() {
  const missing = SHOTS
    .map((shot) => path.join(projectDir, 'docs', 'images', shot.source))
    .filter((file) => !fs.existsSync(file));
  if (missing.length) {
    console.error('Quellbilder fehlen:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(shotsDir, { recursive: true });

  const { chromium } = loadPlaywright();
  // CHROMIUM_PATH hilft dort, wo ein Chromium schon liegt und Playwright
  // seinen eigenen Download nicht ziehen soll (CI-Images, Container).
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  try {
    console.log('\nStore-Artefakte');
    await render(browser, logoPage(), 300, 300, path.join(assetsDir, 'logo-300.png'));
    await render(browser, promoPage(), 1400, 560, path.join(assetsDir, 'promo-tile-1400x560.png'));
    for (const shot of SHOTS) {
      await render(browser, shotPage(shot), 1280, 800, path.join(shotsDir, shot.file));
    }
    console.log('');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
