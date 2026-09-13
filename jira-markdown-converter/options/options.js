'use strict';

(function () {
  var Settings = window.JiraMdSettings;
  var Converter = window.JiraMarkdown;
  var Mapping = window.JiraMapping;

  var CHECKBOXES = [
    'convertOnPaste',
    'switchToMarkup',
    'showFloatingButton',
    'showToast',
    'freezeEditMode',
    'otrsHelper',
    'keepCodeLanguage',
    'convertAlerts',
    'convertHtml',
    'escapeBraces',
    'customerKeyHighlight'
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
  var otrsFieldNameField = document.getElementById('otrsFieldName');
  var tryInput = document.getElementById('tryInput');
  var tryOutput = document.getElementById('tryOutput');
  var saveTimer = null;

  var customerKeyPatternField = document.getElementById('customerKeyPattern');
  var customerKeyFieldNameField = document.getElementById('customerKeyFieldName');
  var ckPatternError = document.getElementById('ckPatternError');
  var ckCount = document.getElementById('ckCount');
  var ckJson = document.getElementById('ckJson');
  var ckReset = document.getElementById('ckReset');
  var ckFile = document.getElementById('ckFile');
  var ckStatus = document.getElementById('ckStatus');
  // Arbeitskopie der Zuordnungstabelle, wie templates es fuer Vorlagen macht -
  // es gibt kein einzelnes Formularfeld, aus dem readForm() sie lesen koennte.
  var customerKeyMap = {};
  var resetTimer = null;

  var templateList = document.getElementById('templateList');
  var tplTitle = document.getElementById('tplTitle');
  var tplMarkup = document.getElementById('tplMarkup');
  var tplPlaceholders = document.getElementById('tplPlaceholders');
  var tplError = document.getElementById('tplError');
  var editingId = null;
  var templates = [];

  function say(message, isError) {
    status.textContent = message || '';
    status.classList.toggle('status--error', !!isError);
    if (message) {
      setTimeout(function () {
        if (status.textContent === message) status.textContent = '';
      }, 2500);
    }
  }

  /** Wie say(), aber fuer die Rueckmeldungen der Kunden-Schluessel-Sektion. */
  function sayCk(message, isError) {
    ckStatus.textContent = message || '';
    ckStatus.classList.toggle('status--error', !!isError);
    if (message) {
      setTimeout(function () {
        if (ckStatus.textContent === message) ckStatus.textContent = '';
      }, 2500);
    }
  }

  function setPatternError(message, isError) {
    ckPatternError.textContent = message || '';
    customerKeyPatternField.classList.toggle('area--error', !!isError);
  }

  /**
   * Liefert den zu speichernden Musterwert. Leeres Feld -> Standardmuster aus
   * Settings.DEFAULTS. Ungueltiges (oder zu aufwendiges) Muster -> der zuletzt
   * gueltige, bereits gespeicherte Stand bleibt erhalten, das Feld bekommt
   * eine Fehlermeldung und die Klasse area--error.
   */
  function validateCustomerKeyPattern(value) {
    var trimmed = String(value || '').trim();
    if (!trimmed) {
      setPatternError('', false);
      return Settings.DEFAULTS.customerKeyPattern;
    }
    var normalized = Mapping.normalizePattern(trimmed);
    if (!normalized) {
      setPatternError('Muster ist ungueltig oder zu aufwendig - gespeichert wurde der letzte gueltige Stand.', true);
      return settings.customerKeyPattern;
    }
    setPatternError('', false);
    return normalized;
  }

  /** verb faellt auf 'gespeichert' zurueck (Zaehlung in #ckCount), sonst z. B. 'exportiert'. */
  function ckCountLabel(count, verb) {
    verb = verb || 'gespeichert';
    if (count === 0) return '0 Zuordnungen ' + verb + '.';
    if (count === 1) return '1 Zuordnung ' + verb + '.';
    return count + ' Zuordnungen ' + verb + '.';
  }

  function updateCkCount() {
    ckCount.textContent = ckCountLabel(Object.keys(customerKeyMap).length);
  }

  /**
   * Setzt den Loeschen-Knopf der Kunden-Schluessel-Sektion in den
   * Ausgangszustand zurueck - nach Ablauf der Frist oder sobald eine andere
   * Aktion in der Sektion ausgeloest wird.
   */
  function disarmReset() {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
    ckReset.textContent = 'Tabelle zuruecksetzen';
    delete ckReset.dataset.armed;
  }

  function readForm() {
    var next = {};
    CHECKBOXES.forEach(function (key) {
      next[key] = document.getElementById(key).checked;
    });
    var format = document.querySelector('input[name="richEditorFormat"]:checked');
    next.richEditorFormat = format ? format.value : 'html';
    next.extraHosts = parseHosts(hostsField.value);
    next.otrsFieldName = otrsFieldNameField.value.trim();
    next.customTemplates = templates;
    next.customerKeyPattern = validateCustomerKeyPattern(customerKeyPatternField.value);
    next.customerKeyFieldName = customerKeyFieldNameField.value.trim();
    next.customerKeyMap = customerKeyMap;
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

  function parsePlaceholders(value) {
    return String(value || '')
      .split(',')
      .map(function (name) {
        return name.trim();
      })
      .filter(function (name) {
        return name;
      });
  }

  /** Fehlermeldung (blockierend) oder leerer String, wenn die Eingabe passt. */
  function validateTemplate(entry) {
    if (!entry.title) return 'Bitte einen Titel eintragen.';
    if (entry.title.length > Settings.MAX_TITLE_LENGTH) {
      return 'Titel ist zu lang (hoechstens ' + Settings.MAX_TITLE_LENGTH + ' Zeichen).';
    }
    if (!entry.templateMarkup) return 'Bitte ein Markup eintragen.';
    if (entry.templateMarkup.length > Settings.MAX_TEMPLATE_LENGTH) {
      return 'Markup ist zu lang (hoechstens ' + Settings.MAX_TEMPLATE_LENGTH + ' Zeichen).';
    }
    var markupNames = Settings.placeholdersInMarkup(entry.templateMarkup);
    if (markupNames.length > Settings.MAX_PLACEHOLDERS) {
      return 'Hoechstens ' + Settings.MAX_PLACEHOLDERS + ' Platzhalter je Vorlage erlaubt (' +
        markupNames.length + ' im Markup gefunden).';
    }
    var seen = Object.create(null);
    for (var i = 0; i < entry.placeholders.length; i++) {
      if (seen[entry.placeholders[i]]) return 'Platzhalter "' + entry.placeholders[i] + '" ist doppelt.';
      seen[entry.placeholders[i]] = true;
    }
    if (!editingId && templates.length >= Settings.MAX_TEMPLATES) {
      return 'Hoechstens ' + Settings.MAX_TEMPLATES + ' Vorlagen moeglich.';
    }
    return '';
  }

  /**
   * Hinweis (nicht blockierend), wenn Markup und Platzhalterliste
   * auseinanderlaufen. Die Liste ist nur ein Reihenfolge-Hinweis fuer den
   * Dialog (normalizePlaceholders() in src/settings.js leitet die Namen
   * ohnehin aus dem Markup ab) - eine leer gelassene Liste heisst "keine
   * Reihenfolge vorgegeben", nicht "unvollstaendig", und bekommt darum
   * keinen Hinweis auf fehlende Namen.
   */
  function placeholderWarning(entry) {
    var markupNames = Settings.placeholdersInMarkup(entry.templateMarkup);
    var hintSet = Object.create(null);
    entry.placeholders.forEach(function (name) {
      hintSet[name] = true;
    });
    if (entry.placeholders.length) {
      var missing = markupNames.filter(function (name) {
        return !hintSet[name];
      });
      if (missing.length) {
        return 'Im Markup steht ${' + missing[0] + '}, das nicht in der Platzhalterliste steht.';
      }
    }
    var markupSet = Object.create(null);
    markupNames.forEach(function (name) {
      markupSet[name] = true;
    });
    var extra = entry.placeholders.filter(function (name) {
      return !markupSet[name];
    });
    if (extra.length) {
      return 'Der Platzhalter "' + extra[0] + '" kommt im Markup nicht vor.';
    }
    return '';
  }

  function setTplMessage(message, isError) {
    tplError.textContent = message || '';
    tplError.classList.toggle('status--error', !!isError);
  }

  function resetTemplateForm() {
    editingId = null;
    tplTitle.value = '';
    tplMarkup.value = '';
    tplPlaceholders.value = '';
    setTplMessage('', false);
  }

  function renderTemplates() {
    templateList.textContent = '';
    if (!templates.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Noch keine Vorlage angelegt.';
      templateList.appendChild(empty);
      return;
    }
    templates.forEach(function (tpl) {
      var item = document.createElement('div');
      item.className = 'tpl-item';

      var title = document.createElement('div');
      title.className = 'tpl-item__title';
      title.textContent = tpl.title;
      item.appendChild(title);

      if (tpl.placeholders.length) {
        var tags = document.createElement('div');
        tags.className = 'tpl-item__tags';
        tpl.placeholders.forEach(function (name) {
          var code = document.createElement('code');
          code.textContent = name;
          tags.appendChild(code);
        });
        item.appendChild(tags);
      }

      var actions = document.createElement('div');
      actions.className = 'tpl-item__actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn';
      editBtn.textContent = 'Bearbeiten';
      editBtn.dataset.tplAction = 'edit';
      editBtn.dataset.tplId = tpl.id;
      actions.appendChild(editBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn';
      deleteBtn.textContent = 'Loeschen';
      deleteBtn.dataset.tplAction = 'delete';
      deleteBtn.dataset.tplId = tpl.id;
      actions.appendChild(deleteBtn);

      item.appendChild(actions);
      templateList.appendChild(item);
    });
  }

  /** Beschriftung und Farbe des Schalters zum Zustand passend setzen. */
  function showToggle() {
    var state = Settings.toggleState(settings);
    document.getElementById('toggleLabel').textContent = state.label;
    document.getElementById('toggleHint').textContent = state.hint;
    document.getElementById('toggleCard').style.setProperty('--switch-color', state.color);
  }

  function writeForm() {
    CHECKBOXES.forEach(function (key) {
      document.getElementById(key).checked = !!settings[key];
    });
    showToggle();
    var radio = document.querySelector('input[name="richEditorFormat"][value="' + settings.richEditorFormat + '"]');
    if (radio) radio.checked = true;
    hostsField.value = (settings.extraHosts || []).join('\n');
    otrsFieldNameField.value = settings.otrsFieldName;
    templates = settings.customTemplates.slice();
    renderTemplates();
    customerKeyPatternField.value = settings.customerKeyPattern;
    customerKeyFieldNameField.value = settings.customerKeyFieldName;
    setPatternError('', false);
    customerKeyMap = settings.customerKeyMap || {};
    updateCkCount();
    refreshPreview();
    refreshHostStatus();
  }

  function save() {
    settings = readForm();
    showToggle();
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
  otrsFieldNameField.addEventListener('input', scheduleSave);
  customerKeyPatternField.addEventListener('input', scheduleSave);
  customerKeyFieldNameField.addEventListener('input', scheduleSave);
  tryInput.addEventListener('input', refreshPreview);

  document.getElementById('tplSave').addEventListener('click', function () {
    var entry = {
      id: editingId,
      title: tplTitle.value.trim(),
      templateMarkup: tplMarkup.value,
      placeholders: parsePlaceholders(tplPlaceholders.value)
    };
    var error = validateTemplate(entry);
    if (error) {
      setTplMessage(error, true);
      return;
    }
    var normalized = Settings.normalizeTemplate(entry);
    if (editingId) {
      templates = templates.map(function (tpl) {
        return tpl.id === editingId ? normalized : tpl;
      });
    } else {
      templates.push(normalized);
    }
    save();
    renderTemplates();
    resetTemplateForm();
    setTplMessage(placeholderWarning(entry), false);
  });

  document.getElementById('tplCancel').addEventListener('click', resetTemplateForm);

  templateList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-tpl-action]');
    if (!button) return;
    var tpl = Settings.templateById(templates, button.dataset.tplId);
    if (!tpl) return;
    if (button.dataset.tplAction === 'edit') {
      editingId = tpl.id;
      tplTitle.value = tpl.title;
      tplMarkup.value = tpl.templateMarkup;
      tplPlaceholders.value = tpl.placeholders.join(', ');
      setTplMessage('', false);
    } else if (button.dataset.tplAction === 'delete') {
      if (!window.confirm('Vorlage "' + tpl.title + '" loeschen?')) return;
      templates = templates.filter(function (item) {
        return item.id !== tpl.id;
      });
      if (editingId === tpl.id) resetTemplateForm();
      save();
      renderTemplates();
    }
  });

  document.getElementById('ckExport').addEventListener('click', function () {
    disarmReset();
    ckJson.value = Mapping.toExportText(customerKeyMap);
    var count = Object.keys(Mapping.normalizeMap(customerKeyMap)).length;
    sayCk(ckCountLabel(count, 'exportiert'), false);
  });

  document.getElementById('ckImport').addEventListener('click', function () {
    disarmReset();
    var result = Mapping.parseImport(ckJson.value);
    if (result.error) {
      sayCk(result.error, true);
      return;
    }
    // Import ersetzt die Tabelle vollstaendig statt sie mit dem bisherigen
    // Stand zusammenzufuehren - bewusste Entscheidung, siehe Einleitungstext
    // der Sektion "Kunden-Schluessel" in options.html.
    customerKeyMap = result.map;
    save();
    updateCkCount();
    sayCk(ckCountLabel(Object.keys(customerKeyMap).length, 'importiert'), false);
  });

  document.getElementById('ckDownload').addEventListener('click', function () {
    disarmReset();
    var blob = new Blob([Mapping.toExportText(customerKeyMap)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'customer-keys.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  ckFile.addEventListener('change', function (event) {
    disarmReset();
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      ckJson.value = String(reader.result || '');
      sayCk('Datei geladen - mit "Import aus dem Feld" uebernehmen.', false);
    };
    reader.onerror = function () {
      sayCk('Datei konnte nicht gelesen werden.', true);
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  ckReset.addEventListener('click', function () {
    if (ckReset.dataset.armed === '1') {
      disarmReset();
      customerKeyMap = {};
      save();
      updateCkCount();
      sayCk('Tabelle geloescht.', false);
      return;
    }
    if (resetTimer) clearTimeout(resetTimer);
    ckReset.dataset.armed = '1';
    ckReset.textContent = 'Wirklich loeschen?';
    resetTimer = setTimeout(disarmReset, 5000);
  });

  Settings.load().then(function (loaded) {
    settings = loaded;
    tryInput.value = SAMPLE;
    writeForm();
  });
})();
