/**
 * Einziger Einstiegspunkt fuer die Testsuite. Baut fuer die gewaehlten
 * Module eine explizite Dateiliste (kein Verzeichnis - die Datei-Erkennung
 * von `node --test` variiert zwischen den Node-Majors und wuerde test/lib/*.js
 * als Testdateien einsammeln) und uebergibt sie an `node --test`.
 *
 * Aufruf:
 *   node test/run.js                     alles (Node + Browser)
 *   node test/run.js settings            ein Modul, beide Arten
 *   node test/run.js settings editors    mehrere Module
 *   node test/run.js --node              nur Node-Tests, kein Chromium
 *   node test/run.js --browser           nur Playwright-Tests
 *   node test/run.js dialogs --name x    -> --test-name-pattern
 *   node test/run.js --list              Module und Testzahlen auflisten
 */
'use strict';

var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var TEST_DIR = __dirname;
var MODULES_DIR = path.join(TEST_DIR, 'modules');

function listModules() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR).filter(function (name) {
    return fs.statSync(path.join(MODULES_DIR, name)).isDirectory();
  }).sort();
}

function testFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (name) {
    return /\.test\.js$/.test(name) && fs.statSync(path.join(dir, name)).isFile();
  }).sort();
}

/** { node: [...absolute Pfade], browser: [...absolute Pfade] } fuer ein Modul. */
function filesForModule(moduleName) {
  var moduleDir = path.join(MODULES_DIR, moduleName);
  var node = testFilesIn(moduleDir).map(function (name) {
    return path.join(moduleDir, name);
  });
  var browserDir = path.join(moduleDir, 'browser');
  var browser = testFilesIn(browserDir).map(function (name) {
    return path.join(browserDir, name);
  });
  return { node: node, browser: browser };
}

/** Grobe, statische Zaehlung der test()/asyncTest()-Aufrufe fuer --list. */
function countTests(file) {
  var source = fs.readFileSync(file, 'utf8');
  var direct = source.match(/(^|[^.\w$])test\s*\(\s*['"]/g) || [];
  var async = source.match(/asyncTest\s*\(\s*['"]/g) || [];
  return direct.length + async.length;
}

function parseArgs(argv) {
  var modules = [];
  var onlyNode = false;
  var onlyBrowser = false;
  var namePattern = null;
  var list = false;

  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg === '--node') {
      onlyNode = true;
    } else if (arg === '--browser') {
      onlyBrowser = true;
    } else if (arg === '--list') {
      list = true;
    } else if (arg === '--name') {
      i++;
      if (i >= argv.length || argv[i].indexOf('--') === 0) {
        throw new Error('--name braucht ein Muster');
      }
      namePattern = argv[i];
    } else if (arg.indexOf('--') === 0) {
      throw new Error('Unbekannte Option: ' + arg);
    } else {
      modules.push(arg);
    }
  }

  return { modules: modules, onlyNode: onlyNode, onlyBrowser: onlyBrowser, namePattern: namePattern, list: list };
}

function printList() {
  var modules = listModules();
  modules.forEach(function (name) {
    var files = filesForModule(name);
    var nodeCount = files.node.reduce(function (sum, file) { return sum + countTests(file); }, 0);
    var browserCount = files.browser.reduce(function (sum, file) { return sum + countTests(file); }, 0);
    console.log(name + ': ' + nodeCount + ' Node, ' + browserCount + ' Browser');
  });
}

function collectFiles(options) {
  var known = listModules();
  var node = [];
  var browser = [];

  if (options.modules.length === 0) {
    known.forEach(function (name) {
      var files = filesForModule(name);
      node = node.concat(files.node);
      browser = browser.concat(files.browser);
    });
  } else {
    options.modules.forEach(function (name) {
      if (known.indexOf(name) === -1) {
        throw new Error('Unbekanntes Modul: ' + name + '\nBekannte Module: ' + known.join(', '));
      }
      var files = filesForModule(name);
      node = node.concat(files.node);
      browser = browser.concat(files.browser);
    });
  }

  if (options.onlyNode) browser = [];
  if (options.onlyBrowser) node = [];

  return { node: node, browser: browser };
}

function hasPlaywright() {
  try {
    require.resolve('playwright');
    return true;
  } catch (error) {
    return false;
  }
}

function runNodeTest(files, options, concurrency) {
  var args = ['--test'];
  if (concurrency) args.push('--test-concurrency=' + concurrency);
  if (options.namePattern) args.push('--test-name-pattern=' + options.namePattern);
  args = args.concat(files);
  var result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  return result.status === null ? 1 : result.status;
}

function main() {
  var options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
    return;
  }

  if (options.list) {
    printList();
    process.exit(0);
    return;
  }

  var files;
  try {
    files = collectFiles(options);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
    return;
  }

  var exitCode = 0;
  var node = files.node;
  var browser = files.browser;

  if (browser.length > 0 && !hasPlaywright()) {
    console.log('\nPlaywright nicht gefunden - Browser-Tests werden uebersprungen.\n');
    browser = [];
  }

  if (node.length > 0) {
    var nodeExit = runNodeTest(node, options, null);
    if (nodeExit !== 0) exitCode = nodeExit;
  }

  if (browser.length > 0) {
    var browserExit = runNodeTest(browser, options, 1);
    if (browserExit !== 0) exitCode = browserExit;
  }

  process.exit(exitCode);
}

main();
