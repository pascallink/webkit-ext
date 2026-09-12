/**
 * Fundament der Testebene ext: startet die echte, aus dem Manifest gebaute
 * Erweiterung in einem echten Chromium/Edge statt sie wie test/lib/browser.js
 * per addScriptTag in die Hauptwelt einer Seite zu injizieren. Nach dem
 * Muster von docs/mockup/edge-harness.js und docs/mockup/cdp.js, aber ohne
 * festen Port/Profilpfad und mit Aufraeumen im after() der jeweiligen Datei.
 *
 * Kein Playwright, kein Service-Worker binnen SERVICE_WORKER_TIMEOUT oder
 * kein Display -> canRunExtension() liefert { ok: false, reason } statt
 * einen roten Lauf zu riskieren. Jede aufrufende Testdatei raeumt ueber das
 * zurueckgegebene teardown() im eigenen after() ab.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var ROOT = path.join(__dirname, '..', '..');
var SERVICE_WORKER_TIMEOUT = 15000;

var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function hasPlaywright() {
  try {
    require.resolve('playwright');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * http.createServer ueber test/fixtures/, Port 0 - der tatsaechliche Port
 * steht erst nach listen() fest und muss vor dem Manifest-Patch bekannt
 * sein (extensionCopy() traegt ihn in host_permissions/matches ein).
 */
function serveFixtures() {
  var fixturesDir = path.join(ROOT, 'test', 'fixtures');
  var server = http.createServer(function (req, res) {
    var reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    var filePath = path.join(fixturesDir, reqPath);
    if (path.relative(fixturesDir, filePath).indexOf('..') === 0) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, function (error, data) {
      if (error) {
        res.writeHead(404);
        res.end();
        return;
      }
      var contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port;
      resolve({
        port: port,
        close: function () {
          return new Promise(function (resolveClose) {
            server.close(function () { resolveClose(); });
          });
        }
      });
    });
  });
}

function copyRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * Kopiert manifest.json, src/, popup/, options/, icons/ in einen frischen
 * Temp-Ordner und ergaenzt dort content_scripts[0].matches sowie
 * host_permissions um den 127.0.0.1-Host der Fixture-Server-Instanz. Die
 * Kopie wird nie eingecheckt - manifest.json im Repo bleibt unveraendert.
 */
function extensionCopy(port) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmd-ext-'));

  fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(dir, 'manifest.json'));
  ['src', 'popup', 'options', 'icons'].forEach(function (name) {
    copyRecursive(path.join(ROOT, name), path.join(dir, name));
  });

  var manifestPath = path.join(dir, 'manifest.json');
  var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  var host = 'http://127.0.0.1:' + port + '/*';
  if (manifest.host_permissions.indexOf(host) === -1) manifest.host_permissions.push(host);
  if (manifest.content_scripts[0].matches.indexOf(host) === -1) manifest.content_scripts[0].matches.push(host);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    dir: dir,
    cleanup: function () {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/**
 * Startet die Erweiterungskopie in einem frischen, temporaeren Profil.
 * CHROMIUM_PATH (siehe test/lib/browser.js) geht vor - lokal zeigt es auf
 * das installierte Edge. Sonst channel: PW_CHANNEL oder 'chromium'.
 * Playwright erlaubt channel und executablePath nicht gleichzeitig.
 */
function launchExtension(extDir) {
  var chromium = require('playwright').chromium;
  var profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmd-profile-'));
  var options = {
    args: ['--load-extension=' + extDir, '--disable-extensions-except=' + extDir],
    ignoreDefaultArgs: ['--disable-extensions']
  };
  if (process.env.CHROMIUM_PATH) {
    options.executablePath = process.env.CHROMIUM_PATH;
  } else {
    options.channel = process.env.PW_CHANNEL || 'chromium';
  }

  function cleanupProfile() {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  return chromium.launchPersistentContext(profileDir, options).then(function (context) {
    var worker = context.serviceWorkers()[0];
    var workerReady = worker ? Promise.resolve(worker) :
      context.waitForEvent('serviceworker', { timeout: SERVICE_WORKER_TIMEOUT });

    return workerReady.then(function (readyWorker) {
      var extensionId = readyWorker.url().split('/')[2];
      return {
        context: context,
        extensionId: extensionId,
        close: function () {
          return context.close().catch(function () {}).then(cleanupProfile);
        }
      };
    }, function (error) {
      return context.close().catch(function () {}).then(function () {
        cleanupProfile();
        throw error;
      });
    });
  }, function (error) {
    cleanupProfile();
    throw error;
  });
}

/**
 * Skip-Guard analog hasPlaywright() in test/lib/browser.js, nur dass hier
 * ein echter Start noetig ist, um "kein Service-Worker binnen 15 s" oder
 * "kein Display" ueberhaupt feststellen zu koennen. Baut bei Erfolg Server,
 * Erweiterungskopie und Kontext einmal auf und reicht sie mitsamt einem
 * gebuendelten teardown() an den Aufrufer durch, statt ein zweites Mal zu
 * starten - jede Testdatei ruft das aus ihrem eigenen after() auf.
 */
function canRunExtension() {
  if (!hasPlaywright()) {
    return Promise.resolve({
      ok: false,
      reason: 'Playwright nicht installiert - Testebene ext wird uebersprungen.'
    });
  }

  var server = null;
  var extCopy = null;

  function cleanupPartial() {
    var jobs = [];
    if (extCopy) extCopy.cleanup();
    if (server) jobs.push(server.close());
    return Promise.all(jobs).catch(function () {});
  }

  return serveFixtures().then(function (startedServer) {
    server = startedServer;
    extCopy = extensionCopy(server.port);
    return launchExtension(extCopy.dir);
  }).then(function (launched) {
    return {
      ok: true,
      port: server.port,
      context: launched.context,
      extensionId: launched.extensionId,
      teardown: function () {
        return launched.close().then(function () {
          extCopy.cleanup();
          return server.close();
        });
      }
    };
  }).catch(function (error) {
    return cleanupPartial().then(function () {
      return {
        ok: false,
        reason: 'Erweiterung liess sich nicht starten (kein Display oder kein ' +
          'Service-Worker binnen ' + SERVICE_WORKER_TIMEOUT + ' ms): ' + error.message
      };
    });
  });
}

module.exports = {
  hasPlaywright: hasPlaywright,
  serveFixtures: serveFixtures,
  extensionCopy: extensionCopy,
  launchExtension: launchExtension,
  canRunExtension: canRunExtension
};
