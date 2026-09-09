/**
 * Tests fuer den OTRS-Verweis-Parser: Markdown-Link, HTML-Anker und Rohtext
 * werden in Ticketnummer, Titel und URL zerlegt.
 * Aufruf: npm run test:otrs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var OtrsLink = require(path.join(__dirname, '..', '..', '..', 'src', 'otrslink.js'));

var TITLE = 'Ticket#2026070710000078 - REFI PU 47.2 - Probleme mit ...';
var URL = 'https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=15285;ArticleID=102557';

describe('JiraOtrsLink.parse - Erkennung', function () {
  test('Markdown-Link aus dem Issue-Beispiel', function () {
    var result = OtrsLink.parse('[' + TITLE + '](' + URL + ')');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ticketNumber, '2026070710000078');
    assert.strictEqual(result.title, TITLE);
    assert.strictEqual(result.url, URL);
    assert.strictEqual(result.label, '2026070710000078');
    assert.strictEqual(result.reference, TITLE);
    assert.strictEqual(result.linkText, TITLE);
  });

  test('HTML-Anker mit target="_blank" und Entities im Titel', function () {
    var input = '<a href="' + URL + '" target="_blank">Ticket#2026070710000078 &amp; Team &lt;Support&gt;</a>';
    var result = OtrsLink.parse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ticketNumber, '2026070710000078');
    assert.strictEqual(result.title, 'Ticket#2026070710000078 & Team <Support>');
    assert.strictEqual(result.url, URL);
  });

  test('Rohtext mit eingebetteter URL', function () {
    var result = OtrsLink.parse('Ticket#2026070710000078 siehe ' + URL);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ticketNumber, '2026070710000078');
    assert.strictEqual(result.title, 'Ticket#2026070710000078 siehe');
    assert.strictEqual(result.url, URL);
  });

  test('URL mit Semikolon-Parametern bleibt unveraendert', function () {
    var result = OtrsLink.parse('Ticket#2026070710000078 ' + URL);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.url, URL);
    assert.ok(result.url.indexOf(';TicketID=15285;ArticleID=102557') !== -1);
  });

  test('mehrzeilige Eingabe mit fuehrenden Leerzeichen', function () {
    var input = '   Ticket#2026070710000078\n   siehe ' + URL + '\n';
    var result = OtrsLink.parse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ticketNumber, '2026070710000078');
    assert.strictEqual(result.title, 'Ticket#2026070710000078 siehe');
    assert.strictEqual(result.url, URL);
  });

  test('Titel ohne Ticket#, aber mit 16-stelliger Nummer wird erkannt', function () {
    var input = 'REFI PU 47.2 - Vorgang 2026070710000078 - siehe ' + URL;
    var result = OtrsLink.parse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ticketNumber, '2026070710000078');
  });
});

describe('JiraOtrsLink.parse - Fehlschlaege', function () {
  test('leere Eingabe', function () {
    assert.strictEqual(OtrsLink.parse('').ok, false);
    assert.strictEqual(OtrsLink.parse('   ').ok, false);
    assert.strictEqual(OtrsLink.parse(null).ok, false);
    assert.strictEqual(OtrsLink.parse(undefined).ok, false);
  });

  test('Eingabe ohne URL', function () {
    var result = OtrsLink.parse('Ticket#2026070710000078 aber kein Link');
    assert.strictEqual(result.ok, false);
    assert.ok(/^[\x00-\x7F]*$/.test(result.error), 'error ohne Umlaute: ' + result.error);
  });

  test('javascript-Verweis wird abgelehnt', function () {
    var result = OtrsLink.parse('javascript:alert(1)');
    assert.strictEqual(result.ok, false);
  });

  test('gueltige URL ohne erkennbare Ticketnummer', function () {
    var result = OtrsLink.parse('siehe https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'Keine Ticketnummer gefunden.');
  });

  test('parse() wirft nie, auch bei kaputter Eingabe', function () {
    assert.doesNotThrow(function () {
      OtrsLink.parse({});
    });
    assert.doesNotThrow(function () {
      OtrsLink.parse(12345);
    });
  });
});

describe('JiraOtrsLink.parse - Titelnormalisierung', function () {
  test('lange Titel werden auf 255 Zeichen gekappt', function () {
    var langerTitel = 'Ticket#2026070710000078 - ' + new Array(400).join('x');
    var result = OtrsLink.parse('[' + langerTitel + '](' + URL + ')');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.title.length, 255);
  });
});
