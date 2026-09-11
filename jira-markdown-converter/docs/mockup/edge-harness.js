// Startet das installierte Edge mit der Erweiterung (Kopie in ./ext) in einem
// frischen Profil und haelt es offen. Andere Skripte verbinden sich per CDP
// (Port 9333). Das Profil liegt im Scratchpad, nicht im Nutzerprofil.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Volumes/sources/tools/webkit-ext/jira-markdown-converter/node_modules/playwright');
const S = __dirname;

function patchManifest() {
  const p = path.join(S, 'ext', 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  const extra = ['http://jira.inxire.com/*', 'http://localhost:8765/*', 'http://127.0.0.1:8765/*'];
  extra.forEach(function (h) {
    if (m.host_permissions.indexOf(h) === -1) m.host_permissions.push(h);
    if (m.content_scripts[0].matches.indexOf(h) === -1) m.content_scripts[0].matches.push(h);
  });
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
  console.log('manifest matches:', m.content_scripts[0].matches.join(', '));
}

(async () => {
  patchManifest();
  const ext = path.join(S, 'ext');
  const ctx = await chromium.launchPersistentContext(path.join(S, 'profile'), {
    channel: 'msedge',
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [
      '--load-extension=' + ext,
      '--disable-extensions-except=' + ext,
      '--remote-debugging-port=9333',
      '--no-first-run'
    ],
    ignoreDefaultArgs: ['--disable-extensions']
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  const id = sw ? sw.url().split('/')[2] : 'unbekannt';
  fs.writeFileSync(path.join(S, 'ext-id.txt'), id);
  console.log('extension id:', id);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('http://localhost:8765/mock-jira-server.html');
  console.log('READY');
  await new Promise(() => {});
})().catch(e => { console.error(e); process.exit(1); });
