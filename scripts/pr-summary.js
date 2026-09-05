#!/usr/bin/env node
/**
 * Erzeugt aus dem PR-Diff eine kompakte Beschreibung (Anthropic Messages API)
 * und schreibt sie in den PR-Body. Laeuft ohne Dependencies auf Node >= 18 (global fetch).
 */
'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-3-5-haiku-latest';

// Token-Bremsen: kleiner Diff rein, kurze Antwort raus.
const MAX_DIFF_CHARS = 40000;
const MAX_TOKENS = 400;

const MARKER_START = '<!-- haiku-summary:start -->';
const MARKER_END = '<!-- haiku-summary:end -->';

// Rauschen, das nichts erklaert, aber Tokens frisst.
const EXCLUDES = [
  ':(exclude)**/package-lock.json',
  ':(exclude)**/yarn.lock',
  ':(exclude)**/pnpm-lock.yaml',
  ':(exclude)**/*.min.js',
  ':(exclude)**/*.map',
  ':(exclude)**/*.svg',
  ':(exclude)**/*.png',
  ':(exclude)**/*.jpg',
  ':(exclude)**/*.zip',
  ':(exclude)**/dist/**',
];

const SYSTEM_PROMPT = [
  'Du schreibst PR-Beschreibungen aus einem Git-Diff.',
  'Antworte nur mit Markdown, kein Vorwort, keine Anrede, keine Codebloecke.',
  'Format: 1-2 Saetze Zusammenfassung, danach "### Änderungen" mit max. 5 Bulletpoints.',
  'Nur was der Diff belegt. Keine Vermutungen, kein Lob, keine Review-Hinweise.',
  'Harte Grenze: 150 Wörter gesamt.',
].join(' ');

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function collectDiff(baseSha, headSha) {
  const range = `${baseSha}...${headSha}`;
  const stat = git(['diff', '--stat', range, '--', '.', ...EXCLUDES]).trim();
  let diff = git(['diff', '--unified=1', '--no-color', range, '--', '.', ...EXCLUDES]);

  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }
  return { stat, diff, truncated };
}

async function generateSummary({ title, stat, diff, truncated }) {
  const userContent = [
    `PR-Titel: ${title}`,
    '',
    'Diffstat:',
    stat || '(leer)',
    '',
    truncated ? 'Diff (gekuerzt):' : 'Diff:',
    diff || '(leer)',
  ].join('\n');

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env('ANTHROPIC_API_KEY'),
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const text = (data.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      if (!text) throw new Error('Anthropic API lieferte keinen Text zurueck');
      return text;
    }

    const detail = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 2) {
      throw new Error(`Anthropic API ${res.status}: ${detail}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

function mergeIntoBody(existingBody, summary) {
  const block = `${MARKER_START}\n## Zusammenfassung (automatisch generiert)\n\n${summary}\n${MARKER_END}`;
  const current = existingBody || '';

  if (current.includes(MARKER_START) && current.includes(MARKER_END)) {
    const start = current.indexOf(MARKER_START);
    const end = current.indexOf(MARKER_END) + MARKER_END.length;
    return current.slice(0, start) + block + current.slice(end);
  }
  return current.trim() ? `${current.trim()}\n\n${block}` : block;
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} bei ${path}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const repo = env('GITHUB_REPOSITORY');
  const prNumber = env('PR_NUMBER');
  const title = process.env.PR_TITLE || '';

  const { stat, diff, truncated } = collectDiff(env('BASE_SHA'), env('HEAD_SHA'));
  if (!diff.trim()) {
    console.log('Kein relevanter Diff - uebersprungen.');
    return;
  }

  const summary = await generateSummary({ title, stat, diff, truncated });

  const pr = await github(`/repos/${repo}/pulls/${prNumber}`);
  const nextBody = mergeIntoBody(pr.body, summary);
  if (nextBody === (pr.body || '')) {
    console.log('PR-Body unveraendert.');
    return;
  }

  await github(`/repos/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: nextBody }),
  });
  console.log(`PR #${prNumber} aktualisiert.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
