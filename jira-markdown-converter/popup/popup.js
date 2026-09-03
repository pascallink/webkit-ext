'use strict';

(function () {
  var Settings = window.JiraMdSettings;
  var Converter = window.JiraMarkdown;

  var input = document.getElementById('input');
  var output = document.getElementById('output');
  var status = document.getElementById('status');
  var settings = Settings.DEFAULTS;

  function say(message, isError) {
    status.textContent = message || '';
    status.classList.toggle('status--error', !!isError);
  }

  function refresh() {
    output.value = input.value ? Converter.convert(input.value, Settings.converterOptions(settings)) : '';
  }

  function withActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs.length) {
        say('Kein aktiver Tab.', true);
        return;
      }
      callback(tabs[0]);
    });
  }

  input.addEventListener('input', refresh);

  document.getElementById('clear').addEventListener('click', function () {
    input.value = '';
    refresh();
    input.focus();
    say('');
  });

  document.getElementById('from-clipboard').addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      say('Zwischenablage ist nicht lesbar.', true);
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      if (!text) {
        say('Zwischenablage ist leer.', true);
        return;
      }
      input.value = text;
      refresh();
      say('Aus der Zwischenablage uebernommen.');
    }, function () {
      say('Zwischenablage ist nicht lesbar.', true);
    });
  });

  document.getElementById('copy').addEventListener('click', function () {
    if (!output.value) {
      say('Es gibt noch nichts zu kopieren.', true);
      return;
    }
    navigator.clipboard.writeText(output.value).then(function () {
      say('Jira-Markup kopiert.');
    }, function () {
      say('Kopieren nicht moeglich.', true);
    });
  });

  document.getElementById('insert').addEventListener('click', function () {
    if (!output.value) {
      say('Es gibt noch nichts einzufuegen.', true);
      return;
    }
    withActiveTab(function (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'insert-text', text: output.value, mode: 'insert' }, function (response) {
        if (chrome.runtime.lastError) {
          say('Auf dieser Seite laeuft die Erweiterung nicht.', true);
          return;
        }
        if (response && response.ok) {
          say('In Jira eingefuegt.');
          window.close();
        } else {
          say('Kein Jira-Eingabefeld gefunden.', true);
        }
      });
    });
  });

  document.getElementById('options').addEventListener('click', function (event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  Settings.load().then(function (loaded) {
    settings = loaded;
    refresh();
    input.focus();
  });
})();
