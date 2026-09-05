/**
 * Erzwingt die Commit-Konvention aus CLAUDE.md:
 *   <typ>(<scope>): <Betreff im Imperativ, klein, ohne Punkt>
 *
 * Die erlaubten Scopes werden zur Laufzeit aus dem Repo gelesen - jeder
 * Top-Level-Ordner mit manifest.json ist ein Projekt und damit ein Scope.
 * Eine neue Erweiterung braucht hier keine Aenderung.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FIXED_SCOPES = ['ci', 'repo'];

// Kurzform statt Ordnername - nur eintragen, wo der Ordner unhandlich lang ist.
const ALIASES = { 'jira-markdown-converter': 'jira' };

function extensionScopes() {
  return fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter(function (entry) {
      return (
        entry.isDirectory() &&
        entry.name.charAt(0) !== '.' &&
        entry.name !== 'node_modules' &&
        fs.existsSync(path.join(__dirname, entry.name, 'manifest.json'))
      );
    })
    .map(function (entry) {
      return ALIASES[entry.name] || entry.name;
    });
}

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'build', 'ci']
    ],
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', FIXED_SCOPES.concat(extensionScopes())],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [1, 'always', 100]
  }
};
