'use strict';

(function () {
  var Settings = window.JiraMdSettings;
  var Converter = window.JiraMarkdown;

  var input = document.getElementById('input');
  var output = document.getElementById('output');
  var status = document.getElementById('status');
  var toggle = document.getElementById('convertOnPaste');
  var toggleCard = document.getElementById('toggleCard');
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

  /* ---------------------------------------------------------------- *
   * Schalter fuer die Einfuege-Automatik
   * ---------------------------------------------------------------- */

  function showToggle() {
    var state = Settings.toggleState(settings);
    toggle.checked = !!settings.convertOnPaste;
    document.getElementById('toggleLabel').textContent = state.label;
    document.getElementById('toggleHint').textContent = state.hint;
    toggleCard.style.setProperty('--switch-color', state.color);
  }

  toggle.addEventListener('change', function () {
    settings.convertOnPaste = toggle.checked;
    showToggle();
    Settings.save(settings).then(function () {
      say(Settings.toggleState(settings).label + '.');
    }, function () {
      say('Einstellung konnte nicht gespeichert werden.', true);
    });
  });

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

  /* ---------------------------------------------------------------- *
   * Freigabe der aktuellen Seite (Jira Server / Data Center)
   * ---------------------------------------------------------------- */

  var pendingHost = '';

  /** Laeuft das Content-Script auf dem aktuellen Tab schon? */
  function checkCurrentTab() {
    withActiveTab(function (tab) {
      if (!tab.url || !/^https?:/i.test(tab.url)) return;
      var host = Settings.normalizeHost(tab.url);
      if (!host) return;

      chrome.tabs.sendMessage(tab.id, { type: 'ping' }, function () {
        if (!chrome.runtime.lastError) return;   // laeuft bereits
        pendingHost = host;
        document.getElementById('grantHost').textContent = host;
        document.getElementById('grantNotice').hidden = false;
      });
    });
  }

  document.getElementById('grant').addEventListener('click', function () {
    if (!pendingHost) return;
    var pattern = Settings.hostPattern(pendingHost);
    chrome.permissions.request({ origins: [pattern] }, function (granted) {
      if (chrome.runtime.lastError || !granted) {
        say('Freigabe wurde nicht erteilt.', true);
        return;
      }
      // Host merken, damit das Content-Script dauerhaft registriert wird.
      Settings.load().then(function (stored) {
        var hosts = (stored.extraHosts || []).slice();
        if (hosts.indexOf(pendingHost) === -1) hosts.push(pendingHost);
        stored.extraHosts = hosts;
        return Settings.save(stored);
      }).then(function () {
        document.getElementById('grantNotice').hidden = true;
        say('Freigegeben. Bitte die Jira-Seite neu laden.');
        withActiveTab(function (tab) {
          chrome.tabs.reload(tab.id);
        });
      });
    });
  });

  Settings.load().then(function (loaded) {
    settings = loaded;
    showToggle();
    refresh();
    input.focus();
    checkCurrentTab();
  });

  // Wurde anderswo umgeschaltet (Kontextmenue, Panel, Optionsseite), zieht
  // der Schalter nach.
  Settings.onChange(function (next) {
    settings = next;
    showToggle();
    refresh();
  });
})();
