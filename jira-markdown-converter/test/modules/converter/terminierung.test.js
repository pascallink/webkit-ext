/**
 * Tests gegen Endlosschleifen im Konverter: nackte Listenmarker (Issue #88)
 * sowie ein Property-Test mit deterministischem PRNG, der zufaellige
 * Zeilenkombinationen gegen ein Zeitbudget prueft.
 * Aufruf: npm run test:converter --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var jira = require(path.join(__dirname, '..', '..', '..', 'src', 'converter.js'));

function eq(markdown, expected, message) {
  var actual = jira.convert(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

// Kleiner LCG (Numerical Recipes-Konstanten) statt Math.random, damit ein
// Fehlschlag mit derselben Saat reproduzierbar bleibt.
function makeLcg(seed) {
  var state = seed >>> 0;
  return function next() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

describe('Terminierung', function () {
  test('Marker ohne Text wird leerer Eintrag', function () {
    eq('-', '*');
    eq('*', '*');
    eq('+', '*');
    eq('1.', '#');
  });

  test('Zufallstexte terminieren', function () {
    var rng = makeLcg(88);
    var tokens = ['-', '*', '+', '1.', '- ', '2)', '', 'Text',
      '  -', '> -', '# Titel', '| a | b |', '```', '  1.'];
    var budgetMs = 50;

    for (var caseIndex = 0; caseIndex < 200; caseIndex++) {
      var lineCount = 1 + Math.floor(rng() * 8);
      var lines = [];
      for (var l = 0; l < lineCount; l++) {
        lines.push(pick(rng, tokens));
      }
      var input = lines.join('\n');

      var start = process.hrtime.bigint();
      var threw = null;
      try {
        jira.convert(input);
      } catch (err) {
        threw = err;
      }
      var elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

      assert.strictEqual(threw, null,
        'Fall ' + caseIndex + ' wirft: ' + (threw && threw.message) +
        '\n  Eingabe: ' + JSON.stringify(input));
      assert.ok(elapsedMs < budgetMs,
        'Fall ' + caseIndex + ' braucht ' + elapsedMs + ' ms (Budget ' + budgetMs + ' ms)' +
        '\n  Eingabe: ' + JSON.stringify(input));
    }
  });
});
