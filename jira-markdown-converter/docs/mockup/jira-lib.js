// Helfer fuer Laeufe gegen die echte Instanz: DOM-Geruest (ohne Inhalte),
// Zustand der Erweiterung, Protokoll.
'use strict';
const fs = require('fs');
const path = require('path');
const { withPage, shot } = require('./cdp');
const S = __dirname;
const DOM_DIR = path.join(S, 'dom');
fs.mkdirSync(DOM_DIR, { recursive: true });

const SKELETON_FN = `(function (selector, limit) {
  var KEEP = ['name', 'type', 'role', 'placeholder', 'title', 'for', 'rows', 'accesskey', 'value', 'hidden', 'style'];
  var SKIP = { SCRIPT: 1, STYLE: 1, SVG: 1, PATH: 1, NOSCRIPT: 1, LINK: 1, META: 1 };
  var MAX = 80, out = [];
  function head(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var cls = (typeof el.className === 'string' ? el.className : '').trim();
    if (cls) s += '.' + cls.split(/\\s+/).join('.');
    return s;
  }
  function attrs(el) {
    var list = el.attributes || [], keep = [], i, a, n, v;
    for (i = 0; i < list.length; i++) {
      a = list[i]; n = a.name;
      if (!(KEEP.indexOf(n) !== -1 || n.indexOf('data-') === 0 || n.indexOf('aria-') === 0 || n === 'href')) continue;
      if (/token|nonce|secret|mail/i.test(n)) continue;
      v = String(a.value || '');
      if (n === 'href' && v.charAt(0) !== '#') v = v.replace(/[?].*$/, '?...');
      if (n === 'value' && el.tagName !== 'INPUT') continue;
      if (n === 'value' && el.type === 'hidden') v = '...';
      if (v.length > MAX) v = v.slice(0, MAX) + '...';
      keep.push(n + '="' + v + '"');
    }
    var vis = el.offsetParent === null && el.tagName !== 'BODY' ? ' {unsichtbar}' : '';
    return (keep.length ? ' [' + keep.join(' ') + ']' : '') + vis;
  }
  function walk(el, depth) {
    if (SKIP[el.tagName] || out.length >= limit) return;
    out.push(new Array(depth + 1).join('  ') + head(el) + attrs(el));
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    if (el.tagName === 'IFRAME') {
      try {
        var b = el.contentDocument && el.contentDocument.body;
        if (b) { out.push(new Array(depth + 2).join('  ') + '#document'); walk(b, depth + 2); }
      } catch (e) { out.push(new Array(depth + 2).join('  ') + '#document (fremde Herkunft)'); }
    }
  }
  var roots = document.querySelectorAll(selector);
  if (!roots.length) return 'nichts gefunden fuer: ' + selector;
  for (var r = 0; r < roots.length; r++) { walk(roots[r], 0); out.push(''); }
  return out.join('\\n');
})`;

async function skeleton(page, selector, name, limit) {
  const text = await page.evaluate('(' + SKELETON_FN + ')(' + JSON.stringify(selector) + ',' + (limit || 3000) + ')');
  fs.writeFileSync(path.join(DOM_DIR, name + '.txt'), '# ' + selector + '\n' + text);
  return text;
}

async function extState(page) {
  return page.evaluate(() => ({
    fab: document.querySelectorAll('.jmd-fab').length,
    bars: Array.from(document.querySelectorAll('.jmd-fieldbar')).map(b => ({
      visible: b.offsetParent !== null,
      next: b.nextElementSibling ? (b.nextElementSibling.tagName.toLowerCase() + (b.nextElementSibling.id ? '#' + b.nextElementSibling.id : '') + '.' + String(b.nextElementSibling.className || '').split(' ').slice(0, 3).join('.')) : null,
      parent: b.parentElement ? (b.parentElement.tagName.toLowerCase() + (b.parentElement.id ? '#' + b.parentElement.id : '') + '.' + String(b.parentElement.className || '').split(' ').slice(0, 3).join('.')) : null,
      lock: (b.querySelector('.jmd-fieldbar__btn--lock') || {}).textContent || null,
      buttons: Array.from(b.querySelectorAll('button')).map(x => (x.textContent || '').trim() + (x.disabled ? '(disabled)' : ''))
    })),
    toast: (document.querySelector('.jmd-toast') || {}).textContent || null,
    panelOpen: !!document.querySelector('.jmd-panel--open')
  }));
}

function logger(file) {
  const out = [];
  const log = (s) => { out.push(s); console.log(s); fs.writeFileSync(path.join(S, file), out.join('\n')); };
  return log;
}

module.exports = { withPage, shot, skeleton, extState, logger, DOM_DIR };
