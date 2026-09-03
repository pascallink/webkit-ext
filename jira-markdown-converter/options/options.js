'use strict';

(function () {
  var Settings = window.JiraMdSettings;
  var Converter = window.JiraMarkdown;

  var CHECKBOXES = [
    'convertOnPaste',
    'showFloatingButton',
    'showToast',
    'keepCodeLanguage',
    'convertAlerts',
    'convertHtml',
    'escapeBraces'
  ];

  var SAMPLE = [
    '# Login schlaegt fehl',
    '',
    'Beim Login mit **SSO** erscheint ein Fehler, siehe [Work Item 1234](https://dev.azure.com/).',
    '',
    '## Schritte',
    '',
    '1. Seite `/login` oeffnen',
    '2. SSO waehlen',
    '   - Microsoft-Konto nutzen',
    '',
    '```json',
    '{ "error": "invalid_grant" }',
    '```',
    '',
    '| Feld | Wert |',
    '| --- | --- |',
    '| Browser | Edge 120 |',
    '',
    '> [!IMPORTANT]',
    '> Betrifft alle Mandanten.',
    '',
    '- [x] reproduziert',
    '- [ ] behoben'
  ].join('\n');

  var settings = Settings.DEFAULTS;
  var status = document.getElementById('status');
  var hostStatus = document.getElementById('hostStatus');
  var hostsField = document.getElementById('extraHosts');
  var tryInput = document.getElementById('tryInput');
  var tryOutput = document.getElementById('tryOutput');
  var saveTimer = null;

  function say(message, isError) {
    status.textContent = message || '';
    status.classList.toggle('status--error', !!isError);
    if (message) {
      setTimeout(function () {
        if (status.textContent === message) status.textContent = '';
      }, 2500);
    }
  }

  function readForm() {
    var next = {};
    CHECKBOXES.forEach(function (key) {
      next[key] = document.getElementById(key).checked;
    });
    var format = document.querySelector('input[name="richEditorFormat"]:checked');
    next.richEditorFormat = format ? format.value : 'jira';
    next.extraHosts = parseHosts(hostsField.value);
    return Settings.withDefaults(next);
  }

  function parseHosts(value) {
    return String(value || '')
      .split(/[\s,;]+/)
      .map(Settings.normalizeHost)
      .filter(function (host, index, all) {
        return host && all.indexOf(host) === index;
      });
  }

  function writeForm() {
    CHECKBOXES.forEach(function (key) {
      document.getElementById(key).checked = !!settings[key];
    });
    var radio = document.querySelector('input[name="richEditorFormat"][value="' + settings.richEditorFormat + '"]');
    if (radio) radio.checked = true;
    hostsField.value = (settings.extraHosts || []).join('\n');
    refreshPreview();
    refreshHostStatus();
  }

  function save() {
    settings = readForm();
    Settings.save(settings).then(function () {
      say('Gespeichert.');
      refreshPreview();
      refreshHostStatus();
    }, function (error) {
      say('Speichern fehlgeschlagen: ' + error.message, true);
    });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function refreshPreview() {
    tryOutput.value = tryInput.value
      ? Converter.convert(tryInput.value, Settings.converterOptions(readForm()))
      : '';
  }

  function hostPatterns() {
    return parseHosts(hostsField.value).map(Settings.hostPattern);
  }

  function refreshHostStatus() {
    var patterns = hostPatterns();
    if (!patterns.length) {
      hostStatus.textContent = '';
      return;
    }
    chrome.permissions.contains({ origins: patterns }, function (granted) {
      hostStatus.textContent = granted
        ? 'Zugriff erteilt.'
        : 'Zugriff fehlt noch - bitte auf "Zugriff erlauben" klicken.';
    });
  }

  document.getElementById('grant').addEventListener('click', function () {
    var patterns = hostPatterns();
    if (!patterns.length) {
      say('Bitte zuerst eine Adresse eintragen.', true);
      return;
    }
    chrome.permissions.request({ origins: patterns }, function (granted) {
      if (chrome.runtime.lastError) {
        say('Freigabe fehlgeschlagen: ' + chrome.runtime.lastError.message, true);
        return;
      }
      say(granted ? 'Zugriff erteilt.' : 'Zugriff wurde abgelehnt.', !granted);
      refreshHostStatus();
    });
  });

  CHECKBOXES.forEach(function (key) {
    document.getElementById(key).addEventListener('change', save);
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="richEditorFormat"]'), function (radio) {
    radio.addEventListener('change', save);
  });

  hostsField.addEventListener('input', scheduleSave);
  tryInput.addEventListener('input', refreshPreview);

  Settings.load().then(function (loaded) {
    settings = loaded;
    tryInput.value = SAMPLE;
    writeForm();
  });
})();
