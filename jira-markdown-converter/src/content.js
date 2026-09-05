/**
 * Content-Script: baut die Bedienelemente in Jira ein und uebernimmt das
 * Konvertieren und Einfuegen.
 */
(function () {
  'use strict';

  if (window.__jiraMarkdownConverterLoaded) return;
  window.__jiraMarkdownConverterLoaded = true;

  var Converter = window.JiraMarkdown;
  var Editors = window.JiraEditors;
  var Settings = window.JiraMdSettings;
  var CodeDialog = window.JiraCodeDialog;
  var EditLock = window.JiraEditLock;

  var settings = Settings.DEFAULTS;
  var panel = null;
  var fab = null;
  var target = null;         // gemerktes Zielfeld
  var pickingTarget = false;
  var toastTimer = null;
  var templateMenu = null;   // offenes Menue mit den Panel-Vorlagen

  /* ------------------------------------------------------------------ *
   * Konvertierung
   * ------------------------------------------------------------------ */

  function convert(markdown) {
    return Converter.convert(markdown, Settings.converterOptions(settings));
  }

  /**
   * Ist dieses Feld gerade ein reines Textfeld? Nur dann ist Jira-Markup
   * ohne Umwege richtig.
   */
  function isPlainField(element) {
    return Editors.isTextarea(element) && !Editors.isRichTextActive(element);
  }

  /** Was fuer die Vorschau angezeigt wird: immer das Jira-Markup. */
  function outputFor(element, markdown) {
    if (isPlainField(element)) return convert(markdown);
    if (settings.richEditorFormat === 'markdown') return markdown;
    return convert(markdown);
  }

  /**
   * Schreibt Markdown in ein Feld - je nach Feldtyp und Einstellung als
   * Jira-Markup, als formatiertes HTML oder unveraendert.
   *
   * Reihenfolge bei aktivem Rich-Text-Editor (Jira Server, jira.rte.enabled):
   *   1. Wenn gewuenscht: auf den Markup-Modus umschalten, dann Markup einfuegen.
   *   2. Sonst je nach Einstellung formatiert (HTML), als Markup oder als
   *      Markdown einfuegen.
   */
  function deliver(field, markdown, mode) {
    if (!field) return Promise.resolve('');

    if (isPlainField(field)) {
      return Promise.resolve(Editors.insert(field, convert(markdown), mode) ? 'markup' : '');
    }

    var switching = settings.switchToMarkup && Editors.isRichTextActive(field)
      ? Editors.switchToMarkup(field)
      : Promise.resolve(false);

    return switching.then(function (switched) {
      if (switched) {
        return Editors.insert(field, convert(markdown), mode) ? 'switched' : '';
      }
      if (settings.richEditorFormat === 'markdown') {
        return Editors.insert(field, markdown, mode) ? 'markdown' : '';
      }
      if (settings.richEditorFormat === 'jira') {
        return Editors.insert(field, convert(markdown), mode) ? 'markup' : '';
      }
      // Standard: formatiert einfuegen, damit der Editor kein Markup anzeigt.
      var both = Converter.convertBoth(markdown, Settings.converterOptions(settings));
      return Editors.insertFormatted(field, both.jira, both.html, mode) ? 'formatted' : '';
    });
  }

  /** Rueckmeldung passend zu dem Weg, den deliver() genommen hat. */
  function insertMessage(how) {
    switch (how) {
      case 'formatted': return 'Formatiert eingefuegt.';
      case 'switched': return 'Auf Markup-Modus umgeschaltet und eingefuegt.';
      case 'markdown': return 'Markdown eingefuegt.';
      case 'markup': return 'In Jira-Markup umgewandelt.';
      default: return '';
    }
  }

  function currentTarget() {
    if (target && Editors.isUsable(target)) return target;
    target = Editors.findTarget();
    return target;
  }

  /** Wandelt Auswahl bzw. gesamten Inhalt des aktiven Feldes an Ort und Stelle um. */
  function convertInPlace(element) {
    var field = element || Editors.activeEditor() || currentTarget();
    if (!field) {
      toast('Kein Jira-Eingabefeld gefunden.', true);
      return false;
    }

    var selected = Editors.getSelectedText(field);
    var source = selected || Editors.getText(field);
    if (!source.trim()) {
      toast('Das Feld ist leer.', true);
      return false;
    }

    if (isPlainField(field)) {
      var output = convert(source);
      if (output === source) {
        toast('Nichts zu konvertieren.', true);
        return false;
      }
      if (selected) {
        // Der Konverter schneidet Rand-Leerzeichen ab. Bei einer Auswahl mitten
        // im Text muessen sie erhalten bleiben, sonst kleben Zeilen zusammen.
        output = /^\s*/.exec(source)[0] + output + /\s*$/.exec(source)[0];
      }
      var done = Editors.insert(field, output, selected ? 'insert' : 'replace');
      toast(done ? 'In Jira-Markup umgewandelt.' : 'Einfuegen nicht moeglich.', !done);
      return done;
    }

    deliver(field, source, selected ? 'insert' : 'replace').then(function (how) {
      toast(how ? insertMessage(how) : 'Einfuegen nicht moeglich.', !how);
    });
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Einfuegen abfangen (Strg+V)
   * ------------------------------------------------------------------ */

  function onPaste(event) {
    if (!settings.convertOnPaste) return;
    if (Editors.isSynthetic(event)) return;

    var field = Editors.editableFrom(event.target) || Editors.activeEditor();
    if (!field) return;

    var clipboard = event.clipboardData;
    if (!clipboard) return;
    var text = clipboard.getData('text/plain');
    if (!text || !Converter.looksLikeMarkdown(text)) return;

    // Markdown durchreichen heisst: nichts tun, der Editor macht den Rest.
    if (!isPlainField(field) && settings.richEditorFormat === 'markdown' &&
        !settings.switchToMarkup) {
      return;
    }
    if (isPlainField(field) && convert(text) === text) return;

    event.preventDefault();
    event.stopPropagation();
    target = field;
    // Die Position steht noch - der Nutzer hat gerade in das Feld getippt.
    Editors.rememberCaret(field);
    deliver(field, text, 'insert').then(function (how) {
      if (how) toast(insertMessage(how));
    });
  }

  /* ------------------------------------------------------------------ *
   * Oberflaeche: schwebender Button
   * ------------------------------------------------------------------ */

  function createFab() {
    if (fab || !settings.showFloatingButton) return;
    // In iframes (Jira Server bettet Editoren ein) wuerde sonst pro Rahmen
    // ein weiterer Button erscheinen.
    if (!isTopFrame()) return;
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'jmd-fab';
    fab.dataset.jmdUi = 'fab';
    fab.setAttribute('aria-label', 'Markdown nach Jira umwandeln');

    var caption = document.createElement('span');
    caption.textContent = 'MD';
    fab.appendChild(caption);

    // Kleiner Punkt zeigt, ob die Einfuege-Automatik laeuft.
    var dot = document.createElement('span');
    dot.className = 'jmd-fab__dot';
    fab.appendChild(dot);

    fab.addEventListener('click', function () {
      togglePanel();
    });
    document.body.appendChild(fab);
    updateFab();
  }

  /** Faerbt den Zustandspunkt am schwebenden Button. */
  function updateFab() {
    if (!fab) return;
    var state = Settings.toggleState(settings);
    var dot = fab.querySelector('.jmd-fab__dot');
    if (dot) dot.style.background = state.color;
    fab.title = 'Markdown nach Jira - ' + state.label;
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch (error) {
      return false;
    }
  }

  function removeFab() {
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
    fab = null;
  }

  /* ------------------------------------------------------------------ *
   * Schalter fuer die Einfuege-Automatik an der Buttonleiste
   *
   * Denselben Zustand zeigen Popup, Optionsseite, Panel, das Badge am
   * Symbol und der Punkt am schwebenden Button. Farbe, Beschriftung und
   * Beschreibung kommen darum aus Settings.TOGGLE - hier steht nichts
   * davon noch einmal.
   * ------------------------------------------------------------------ */

  /**
   * Kompakter Schalter in der Optik der uebrigen Leisten-Buttons: ein Punkt
   * traegt die Farbe, die Beschriftung sagt den Zustand im Klartext - an der
   * Farbe allein soll er nicht haengen.
   */
  function createAutoToggle() {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'jmd-fieldbar__btn jmd-fieldbar__btn--auto';

    var dot = document.createElement('span');
    dot.className = 'jmd-fieldbar__dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);

    var caption = document.createElement('span');
    caption.className = 'jmd-fieldbar__caption';
    button.appendChild(caption);

    button.addEventListener('click', function (event) {
      event.preventDefault();
      setConvertOnPaste(!settings.convertOnPaste);
    });

    showAutoToggle(button);
    return button;
  }

  function showAutoToggle(button) {
    var on = !!settings.convertOnPaste;
    var state = Settings.toggleState(settings);
    var dot = button.querySelector('.jmd-fieldbar__dot');
    var caption = button.querySelector('.jmd-fieldbar__caption');
    if (dot) dot.style.background = state.color;
    if (caption) caption.textContent = state.label;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.title = state.hint + ' Klicken schaltet die Automatik '
      + (on ? 'aus' : 'ein') + '.';
  }

  /**
   * Zieht alle Leisten nach. Auf einem Vorgang haengt je eine an Beschreibung
   * und Kommentar - wird woanders umgeschaltet, muessen beide es zeigen.
   */
  function updateFieldbarToggles() {
    var buttons = document.querySelectorAll('.jmd-fieldbar__btn--auto');
    for (var i = 0; i < buttons.length; i++) {
      showAutoToggle(buttons[i]);
    }
  }

  /** Schreibt die Einstellung und zieht alle Oberflaechen nach. */
  function setConvertOnPaste(next) {
    settings = Settings.withDefaults(Object.assign({}, settings, { convertOnPaste: next }));
    Settings.save(settings);
    syncPanelState();
    updateFab();
    updateFieldbarToggles();
    refreshPreview();
    toast(Settings.toggleState(settings).label + '.');
  }

  /* ------------------------------------------------------------------ *
   * Oberflaeche: Panel
   * ------------------------------------------------------------------ */

  var PANEL_HTML = [
    '<div class="jmd-panel__head">',
    '  <span class="jmd-panel__title">Markdown nach Jira</span>',
    '  <button type="button" class="jmd-icon-btn" data-action="close" title="Schliessen" aria-label="Schliessen">x</button>',
    '</div>',
    '<div class="jmd-panel__body">',
    '  <div class="jmd-toggle-card" data-role="toggle-card">',
    '    <label class="jmd-switch">',
    '      <input type="checkbox" data-option="convertOnPaste">',
    '      <span class="jmd-switch__track"><span class="jmd-switch__knob"></span></span>',
    '      <span class="jmd-switch__text">',
    '        <b data-role="toggle-label">Automatik ist an</b>',
    '        <small data-role="toggle-hint">Eingefuegtes Markdown wird umgewandelt.</small>',
    '      </span>',
    '    </label>',
    '  </div>',
    '  <label class="jmd-label" for="jmd-input">Markdown aus Azure DevOps</label>',
    '  <textarea id="jmd-input" class="jmd-textarea" rows="7" spellcheck="false"',
    '            placeholder="Markdown hier einfuegen (Strg+V) ..."></textarea>',
    '  <div class="jmd-row">',
    '    <button type="button" class="jmd-btn" data-action="from-clipboard">Aus Zwischenablage</button>',
    '    <button type="button" class="jmd-btn" data-action="from-field">Aus Zielfeld</button>',
    '    <button type="button" class="jmd-btn" data-action="clear">Leeren</button>',
    '  </div>',
    '  <label class="jmd-label" for="jmd-output">Jira-Markup</label>',
    '  <textarea id="jmd-output" class="jmd-textarea jmd-textarea--output" rows="7" spellcheck="false" readonly></textarea>',
    '  <div class="jmd-target">',
    '    <span class="jmd-target__text">Ziel: <b data-role="target">-</b></span>',
    '    <button type="button" class="jmd-link-btn" data-action="pick">Feld waehlen</button>',
    '  </div>',
    '  <div class="jmd-row jmd-row--main">',
    '    <button type="button" class="jmd-btn jmd-btn--primary" data-action="insert">Ins Ticket einfuegen</button>',
    '    <button type="button" class="jmd-btn" data-action="replace">Feld ersetzen</button>',
    '    <button type="button" class="jmd-btn" data-action="copy">Markup kopieren</button>',
    '  </div>',
    '  <div class="jmd-row">',
    '    <button type="button" class="jmd-btn" data-action="copy-html"',
    '            title="Als formatierten Text in die Zwischenablage legen">Formatiert kopieren</button>',
    '    <button type="button" class="jmd-btn" data-action="code">Code einfuegen</button>',
    '    <button type="button" class="jmd-btn" data-action="panel-template"',
    '            aria-haspopup="true" aria-expanded="false">Panel aus Vorlage</button>',
    '  </div>',
    '  <div class="jmd-options">',
    '    <label class="jmd-check"><input type="checkbox" data-option="switchToMarkup"> Rich-Text vorher auf Markup-Modus umschalten</label>',
    '    <label class="jmd-check jmd-check--wide">Im Rich-Text-Editor:',
    '      <select class="jmd-select" data-option="richEditorFormat">',
    '        <option value="html">formatiert einfuegen</option>',
    '        <option value="jira">Jira-Markup einfuegen</option>',
    '        <option value="markdown">Markdown durchreichen</option>',
    '      </select>',
    '    </label>',
    '  </div>',
    '</div>'
  ].join('\n');

  function createPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'jmd-panel';
    panel.dataset.jmdUi = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Markdown nach Jira');
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);

    var input = panel.querySelector('#jmd-input');
    var output = panel.querySelector('#jmd-output');

    input.addEventListener('input', refreshPreview);
    input.addEventListener('paste', function (event) {
      // Im eigenen Panel nie die globale Auto-Konvertierung anwenden.
      event.stopPropagation();
    }, true);

    panel.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]');
      if (!button) return;
      handleAction(button.getAttribute('data-action'), input, output, button);
    });

    panel.addEventListener('change', function (event) {
      var option = event.target.getAttribute && event.target.getAttribute('data-option');
      if (!option) return;
      var update = {};
      update[option] = event.target.tagName === 'SELECT' ? event.target.value : event.target.checked;
      settings = Settings.withDefaults(Object.assign({}, settings, update));
      Settings.save(settings);
      syncPanelState();
      updateFab();
      updateFieldbarToggles();
      refreshPreview();
      if (option === 'convertOnPaste') {
        toast(Settings.toggleState(settings).label + '.');
      }
    });

    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closePanel();
      }
    });

    syncPanelState();
    return panel;
  }

  function handleAction(action, input, output, button) {
    switch (action) {
      case 'close':
        closePanel();
        break;
      case 'clear':
        input.value = '';
        refreshPreview();
        input.focus();
        break;
      case 'from-clipboard':
        readClipboard().then(function (text) {
          if (!text) {
            toast('Zwischenablage ist leer oder nicht lesbar.', true);
            return;
          }
          input.value = text;
          refreshPreview();
        });
        break;
      case 'from-field':
        var field = currentTarget();
        if (!field) {
          toast('Kein Jira-Eingabefeld gefunden.', true);
          return;
        }
        input.value = Editors.getSelectedText(field) || Editors.getText(field);
        refreshPreview();
        break;
      case 'pick':
        startPicking();
        break;
      case 'panel-template':
        toggleTemplateMenu(button, currentTarget());
        break;
      case 'copy':
        copyText(output.value);
        break;
      case 'copy-html':
        copyFormatted(input.value);
        break;
      case 'insert':
        insertFromPanel(input.value, 'insert');
        break;
      case 'replace':
        insertFromPanel(input.value, 'replace');
        break;
      case 'code':
        openCodeDialog(null);
        break;
      default:
        break;
    }
  }

  function insertFromPanel(markdown, mode) {
    if (!markdown) {
      toast('Es gibt noch nichts einzufuegen.', true);
      return;
    }
    var field = currentTarget();
    if (!field) {
      toast('Kein Jira-Eingabefeld gefunden. Bitte Feld waehlen.', true);
      return;
    }
    deliver(field, markdown, mode).then(function (how) {
      if (how) {
        toast(mode === 'replace' ? 'Feldinhalt ersetzt.' : insertMessage(how));
      } else {
        toast('Einfuegen nicht moeglich - bitte Text kopieren.', true);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Code einfuegen
   * ------------------------------------------------------------------ */

  /**
   * Oeffnet den Code-Dialog fuer ein Feld. Der Dialog baut den Codeblock,
   * eingefuegt wird hier - an der gemerkten Cursorposition.
   */
  function openCodeDialog(field) {
    var into = field || currentTarget();
    if (!into) {
      toast('Kein Jira-Eingabefeld gefunden.', true);
      return;
    }
    target = into;
    CodeDialog.open({
      target: Editors.describe(into),
      onEmpty: function () {
        toast('Bitte zuerst Code eingeben.', true);
      },
      onCopy: copyCode,
      onInsert: function (result) {
        return insertCode(into, result);
      }
    });
  }

  /**
   * Reines Textfeld bekommt {code:sprache}, der Rich-Text-Editor das fertige
   * <pre><code>. Die Einstellungen fuer den Rich-Text-Editor gelten wie beim
   * uebrigen Einfuegen: erst umschalten, sonst Markup oder formatiert.
   */
  function insertCode(field, result) {
    var switching = settings.switchToMarkup && Editors.isRichTextActive(field)
      ? Editors.switchToMarkup(field)
      : Promise.resolve(false);

    return switching.then(function (switched) {
      var markupOnly = switched || isPlainField(field) || settings.richEditorFormat === 'jira';
      // 'block': {code} muss am Zeilenanfang stehen, sonst zeigt Jira es
      // woertlich an.
      var ok = markupOnly
        ? Editors.insert(field, result.jira, 'block')
        : Editors.insertFormatted(field, result.jira, result.html, 'block');
      toast(ok ? 'Codeblock eingefuegt.' : 'Einfuegen nicht moeglich - bitte Text kopieren.', !ok);
      return ok;
    });
  }

  /**
   * Das Markdown des Panels als formatiertes HTML kopieren - dasselbe, was
   * beim formatierten Einfuegen im Rich-Text-Editor ankaeme.
   */
  function copyFormatted(markdown) {
    if (!markdown) {
      toast('Es gibt noch nichts zu kopieren.', true);
      return;
    }
    var both = Converter.convertBoth(markdown, Settings.converterOptions(settings));
    copyRich(both.html, both.jira);
  }

  /**
   * Ergebnis des Dialogs in die Zwischenablage - zum Einfuegen von Hand,
   * wenn ein Feld sich nicht beschreiben laesst.
   */
  function copyCode(result, kind) {
    if (kind === 'html') {
      copyRich(result.html, result.jira);
      return;
    }
    copyText(result.jira);
  }

  /**
   * Formatiert kopieren heisst: als text/html, damit ein Rich-Text-Editor
   * beim Einfuegen von Hand einen echten Codeblock bekommt. Daneben liegt
   * das Jira-Markup als Rueckfalltext, genau wie beim Einfuegen.
   */
  function copyRich(html, text) {
    var write = null;
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      try {
        write = navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]);
      } catch (error) {
        write = null;
      }
    }
    if (!write) {
      copyText(html, 'HTML als Text kopiert.');
      return;
    }
    write.then(function () {
      toast('Formatiert kopiert.');
    }, function () {
      copyText(html, 'HTML als Text kopiert.');
    });
  }

  function refreshPreview() {
    if (!panel) return;
    var input = panel.querySelector('#jmd-input');
    var output = panel.querySelector('#jmd-output');
    var field = currentTarget();
    output.value = input.value ? outputFor(field, input.value) : '';
    updateTargetLabel();
  }

  function updateTargetLabel() {
    if (!panel) return;
    var label = panel.querySelector('[data-role="target"]');
    var field = currentTarget();
    label.textContent = Editors.describe(field);
  }

  function syncPanelState() {
    if (!panel) return;
    var paste = panel.querySelector('[data-option="convertOnPaste"]');
    var markup = panel.querySelector('[data-option="switchToMarkup"]');
    var rich = panel.querySelector('[data-option="richEditorFormat"]');
    if (paste) paste.checked = !!settings.convertOnPaste;
    if (markup) markup.checked = !!settings.switchToMarkup;
    if (rich) rich.value = settings.richEditorFormat;

    var state = Settings.toggleState(settings);
    var card = panel.querySelector('[data-role="toggle-card"]');
    var label = panel.querySelector('[data-role="toggle-label"]');
    var hint = panel.querySelector('[data-role="toggle-hint"]');
    if (card) card.style.setProperty('--jmd-switch-color', state.color);
    if (label) label.textContent = state.label;
    if (hint) hint.textContent = state.hint;

    updateTargetLabel();
  }

  function openPanel(prefill) {
    createPanel();
    panel.classList.add('jmd-panel--open');
    syncPanelState();
    var input = panel.querySelector('#jmd-input');
    if (prefill) {
      input.value = prefill;
    }
    refreshPreview();
    input.focus();
  }

  function closePanel() {
    stopPicking();
    closeTemplateMenu();
    if (panel) panel.classList.remove('jmd-panel--open');
  }

  function togglePanel() {
    if (panel && panel.classList.contains('jmd-panel--open')) {
      closePanel();
      return;
    }
    // Beim Oeffnen das aktuell fokussierte Feld als Ziel merken.
    var active = Editors.activeEditor();
    if (active) target = active;
    openPanel();
  }

  /* ------------------------------------------------------------------ *
   * Panel aus einer Vorlage einfuegen
   *
   * Die Vorlagen (Titel, Platzhalter, Farben) stehen in
   * Settings.PANEL_TEMPLATES, die Ausgabe erzeugt der Konverter:
   * Wiki-Markup fuer reine Textfelder, gleichwertiges HTML fuer den
   * Rich-Text-Editor.
   * ------------------------------------------------------------------ */

  /** Oeffnet das Menue unter dem Button; ein zweiter Klick schliesst es. */
  function toggleTemplateMenu(anchorButton, field) {
    if (templateMenu && templateMenu.__jmdAnchor === anchorButton) {
      closeTemplateMenu();
      return;
    }
    openTemplateMenu(anchorButton, field);
  }

  function openTemplateMenu(anchorButton, field) {
    closeTemplateMenu();

    var menu = document.createElement('div');
    menu.className = 'jmd-panelmenu';
    menu.dataset.jmdUi = 'panelmenu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Panel-Vorlagen');
    menu.__jmdAnchor = anchorButton;

    Settings.PANEL_TEMPLATES.forEach(function (template) {
      menu.appendChild(templateMenuItem(template, field));
    });

    document.body.appendChild(menu);
    templateMenu = menu;
    anchorButton.setAttribute('aria-expanded', 'true');
    placeTemplateMenu(menu, anchorButton);

    document.addEventListener('mousedown', onTemplateMenuOutside, true);
    document.addEventListener('keydown', onTemplateMenuKey, true);
    // Das Menue haengt an der Position des Buttons - beim Scrollen oder
    // Groessenaendern muss es mitwandern.
    window.addEventListener('scroll', followTemplateAnchor, true);
    window.addEventListener('resize', followTemplateAnchor, true);

    var first = menu.querySelector('.jmd-panelmenu__item');
    // Ohne preventScroll wuerde der Fokus die Seite verschieben - und damit
    // das eben erst gesetzte Menue.
    if (first) first.focus({ preventScroll: true });
  }

  function templateMenuItem(template, field) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'jmd-panelmenu__item';
    item.setAttribute('role', 'menuitem');
    item.dataset.template = template.id;
    item.title = template.hint;
    // Die Farbe der Vorlage traegt der Farbtupfer, nicht nur die Beschriftung.
    item.style.setProperty('--jmd-panel-border', template.borderColor);
    item.style.setProperty('--jmd-panel-bg', template.bgColor);

    var swatch = document.createElement('span');
    swatch.className = 'jmd-panelmenu__swatch';
    swatch.setAttribute('aria-hidden', 'true');
    item.appendChild(swatch);

    var caption = document.createElement('span');
    caption.textContent = template.label;
    item.appendChild(caption);

    item.addEventListener('click', function (event) {
      event.preventDefault();
      closeTemplateMenu();
      insertTemplate(field, template);
    });
    return item;
  }

  /** Unter den Button, notfalls darueber - das Menue bleibt im Sichtbereich. */
  function placeTemplateMenu(menu, anchorButton) {
    var rect = anchorButton.getBoundingClientRect();
    menu.style.left = Math.round(rect.left) + 'px';
    menu.style.top = Math.round(rect.bottom + 4) + 'px';

    var box = menu.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) {
      menu.style.left = Math.round(Math.max(8, window.innerWidth - box.width - 8)) + 'px';
    }
    if (box.bottom > window.innerHeight - 8) {
      menu.style.top = Math.round(Math.max(8, rect.top - box.height - 4)) + 'px';
    }
  }

  function closeTemplateMenu() {
    if (!templateMenu) return;
    var anchorButton = templateMenu.__jmdAnchor;
    if (anchorButton) anchorButton.setAttribute('aria-expanded', 'false');
    if (templateMenu.parentNode) templateMenu.parentNode.removeChild(templateMenu);
    templateMenu = null;
    document.removeEventListener('mousedown', onTemplateMenuOutside, true);
    document.removeEventListener('keydown', onTemplateMenuKey, true);
    window.removeEventListener('scroll', followTemplateAnchor, true);
    window.removeEventListener('resize', followTemplateAnchor, true);
  }

  /** Menue dem Button nachfuehren; ist er weggescrollt, wird geschlossen. */
  function followTemplateAnchor() {
    if (!templateMenu) return;
    var anchorButton = templateMenu.__jmdAnchor;
    if (!anchorButton || !anchorButton.isConnected) {
      closeTemplateMenu();
      return;
    }
    var rect = anchorButton.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      closeTemplateMenu();
      return;
    }
    placeTemplateMenu(templateMenu, anchorButton);
  }

  function onTemplateMenuOutside(event) {
    if (!templateMenu) return;
    if (templateMenu.contains(event.target)) return;
    var anchorButton = templateMenu.__jmdAnchor;
    if (anchorButton && (anchorButton === event.target || anchorButton.contains(event.target))) return;
    closeTemplateMenu();
  }

  function onTemplateMenuKey(event) {
    if (event.key === 'Escape') closeTemplateMenu();
  }

  /**
   * Fuegt das Panel an der gemerkten Cursorposition ein.
   *
   * Reines Textfeld  -> {panel:title=...|borderColor=...|bgColor=...}
   * Rich-Text-Editor -> gleichwertiges HTML mit denselben Farben
   *
   * Ist eingestellt, dass vorher auf den Markup-Modus umgeschaltet wird, wird
   * aus dem Rich-Text-Editor ein Textfeld - dann gilt der Markup-Zweig.
   */
  function insertTemplate(field, template) {
    if (!field) {
      toast('Kein Jira-Eingabefeld gefunden.', true);
      return;
    }
    target = field;

    var switching = !isPlainField(field) && settings.switchToMarkup &&
      Editors.isRichTextActive(field)
      ? Editors.switchToMarkup(field)
      : Promise.resolve(false);

    switching.then(function () {
      var markup = Converter.panelMarkup(template);
      var html = isPlainField(field) ? null : Converter.panelHtml(template);
      // 'block': auch {panel} deutet Jira nur am Zeilenanfang.
      if (!Editors.insertFormatted(field, markup, html, 'block')) {
        toast('Einfuegen nicht moeglich.', true);
        return;
      }
      focusPanelBody(field, template.body);
      toast('Panel "' + template.label + '" eingefuegt.');
    });
  }

  /**
   * Danach soll der Cursor im Textbereich des Panels stehen: der Platzhalter
   * wird markiert, sodass Tippen ihn ersetzt.
   */
  function focusPanelBody(field, placeholder) {
    if (selectPlaceholder(field, placeholder)) return;
    // Rich-Text-Editoren bauen eingefuegte Inhalte teils verzoegert ein.
    setTimeout(function () {
      selectPlaceholder(field, placeholder);
    }, 60);
  }

  function selectPlaceholder(field, placeholder) {
    if (!field || !placeholder) return false;
    var surface = Editors.editingSurface(field);
    if (!surface) return false;

    if (Editors.isTextarea(surface)) {
      var value = String(surface.value || '');
      // Der Cursor steht nach dem Einfuegen am Ende des Panels - von dort
      // aus rueckwaerts suchen, damit fruehere Panels unberuehrt bleiben.
      var from = typeof surface.selectionStart === 'number' ? surface.selectionStart : value.length;
      var start = value.lastIndexOf(placeholder, from);
      if (start === -1) return false;
      surface.focus();
      surface.setSelectionRange(start, start + placeholder.length);
      return true;
    }

    if (!surface.isContentEditable) return false;
    return selectInEditable(surface, placeholder);
  }

  function selectInEditable(surface, placeholder) {
    var doc = surface.ownerDocument;
    var view = doc.defaultView;
    try {
      // NodeFilter aus dem Dokument der Flaeche - im Editor-Rahmen ist das
      // ein anderes Fenster als das der Seite.
      var walker = doc.createTreeWalker(surface, view.NodeFilter.SHOW_TEXT, null);
      var node = null;
      var found = null;
      var offset = -1;
      while ((node = walker.nextNode())) {
        var at = String(node.nodeValue || '').indexOf(placeholder);
        // Das letzte Vorkommen ist das gerade eingefuegte.
        if (at !== -1) {
          found = node;
          offset = at;
        }
      }
      if (!found) return false;
      var selection = view && view.getSelection();
      if (!selection) return false;
      var range = doc.createRange();
      range.setStart(found, offset);
      range.setEnd(found, offset + placeholder.length);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (error) {
      return false;   // Editor hat den Inhalt umgebaut - dann eben nicht
    }
  }

  /* ------------------------------------------------------------------ *
   * Zielfeld per Klick waehlen
   * ------------------------------------------------------------------ */

  function startPicking() {
    if (pickingTarget) return;
    pickingTarget = true;
    document.body.classList.add('jmd-picking');
    Editors.findAllTargets().forEach(function (element) {
      element.classList.add('jmd-pick-candidate');
    });
    document.addEventListener('mousedown', onPickClick, true);
    toast('Bitte das gewuenschte Jira-Feld anklicken.');
  }

  function stopPicking() {
    if (!pickingTarget) return;
    pickingTarget = false;
    document.body.classList.remove('jmd-picking');
    var marked = document.querySelectorAll('.jmd-pick-candidate');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove('jmd-pick-candidate');
    }
    document.removeEventListener('mousedown', onPickClick, true);
  }

  function onPickClick(event) {
    if (panel && panel.contains(event.target)) return;
    var field = Editors.editableFrom(event.target);
    event.preventDefault();
    event.stopPropagation();
    stopPicking();
    if (field) {
      target = field;
      updateTargetLabel();
      toast('Zielfeld: ' + Editors.describe(field));
    } else {
      toast('Das ist kein Eingabefeld.', true);
    }
  }

  /* ------------------------------------------------------------------ *
   * Button direkt am Editor
   * ------------------------------------------------------------------ */

  var BUTTON_FLAG = 'jmdButtonAttached';

  function attachFieldButtons() {
    removeOrphanBars();
    var fields = Editors.findAllTargets();
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.dataset[BUTTON_FLAG]) continue;
      var box = Editors.isRichTextActive(field) ? Editors.richTextFrame(field) : field;
      var rect = box.getBoundingClientRect();
      // Nur an echte Eingabebereiche, nicht an winzige Einzeiler.
      if (rect.height < 48) continue;
      field.dataset[BUTTON_FLAG] = '1';
      addButtonBar(field);
    }
  }

  /**
   * Jira Server baut beim Inline-Bearbeiten ganze Feldbloecke neu auf. Leisten,
   * deren Feld verschwunden ist, muessen mit weg.
   */
  function removeOrphanBars() {
    var bars = document.querySelectorAll('.jmd-fieldbar');
    for (var i = 0; i < bars.length; i++) {
      var field = bars[i].__jmdField;
      if (!field || !field.isConnected) {
        if (bars[i].parentNode) bars[i].parentNode.removeChild(bars[i]);
      }
    }
  }

  function addButtonBar(field) {
    // Bei aktivem Rich-Text-Editor ist die Textarea versteckt - die Leiste
    // gehoert dann ueber den sichtbaren Editor.
    var host = field.closest('.ak-editor-content-area');
    if (!host && Editors.isRichTextActive(field)) {
      var frame = Editors.richTextFrame(field);
      host = frame && frame.closest('.mce-tinymce, .tox-tinymce, .jira-wikifield') || frame;
    }
    if (!host) host = field;
    var parent = host.parentNode;
    if (!parent) return;

    var bar = document.createElement('div');
    bar.className = 'jmd-fieldbar';
    bar.dataset.jmdUi = 'fieldbar';
    bar.__jmdField = field;

    // Schalter fuer die Einfuege-Automatik - dort, wo man ohnehin hinschaut,
    // wenn beim Einfuegen etwas falsch umgewandelt wurde.
    var autoButton = createAutoToggle();

    var convertButton = document.createElement('button');
    convertButton.type = 'button';
    convertButton.className = 'jmd-fieldbar__btn';
    convertButton.textContent = 'Umwandeln';
    convertButton.title = 'Markdown in diesem Feld - oder die Auswahl darin - in Jira-Markup umwandeln';
    convertButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      convertInPlace(field);
    });

    var pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'jmd-fieldbar__btn';
    pasteButton.textContent = 'Einfuegen';
    pasteButton.title = 'Markdown aus der Zwischenablage umgewandelt an der Cursorposition einfuegen';
    pasteButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      readClipboard().then(function (text) {
        if (!text) {
          toast('Zwischenablage ist leer oder nicht lesbar.', true);
          return;
        }
        return deliver(field, text, 'insert').then(function (how) {
          toast(how ? 'Aus der Zwischenablage eingefuegt.' : 'Einfuegen nicht moeglich.', !how);
        });
      });
    });

    var codeButton = document.createElement('button');
    codeButton.type = 'button';
    codeButton.className = 'jmd-fieldbar__btn';
    codeButton.textContent = 'Code';
    codeButton.title = 'Codeblock mit Sprachauswahl an der Cursorposition einfuegen';
    codeButton.addEventListener('click', function (event) {
      event.preventDefault();
      openCodeDialog(field);
    });

    var templateButton = document.createElement('button');
    templateButton.type = 'button';
    templateButton.className = 'jmd-fieldbar__btn';
    templateButton.textContent = 'Panel';
    templateButton.title = 'Farbiges Panel aus einer Vorlage an der Cursorposition einfuegen';
    templateButton.setAttribute('aria-haspopup', 'true');
    templateButton.setAttribute('aria-expanded', 'false');
    templateButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      toggleTemplateMenu(templateButton, field);
    });

    var panelButton = document.createElement('button');
    panelButton.type = 'button';
    panelButton.className = 'jmd-fieldbar__btn jmd-fieldbar__btn--ghost';
    panelButton.textContent = 'Editor';
    panelButton.title = 'Editor mit Vorschau oeffnen: Markdown eingeben und das Jira-Markup sehen';
    panelButton.addEventListener('click', function (event) {
      event.preventDefault();
      target = field;
      openPanel();
    });

    // Schloss: haelt das Feld offen, wenn Jira es sonst beim Klick daneben
    // schliessen wuerde.
    var lockButton = EditLock.createButton(field);

    bar.appendChild(autoButton);
    bar.appendChild(convertButton);
    bar.appendChild(pasteButton);
    bar.appendChild(codeButton);
    bar.appendChild(templateButton);
    bar.appendChild(panelButton);
    bar.appendChild(lockButton);
    parent.insertBefore(bar, host);
  }

  /* ------------------------------------------------------------------ *
   * Hilfen
   * ------------------------------------------------------------------ */

  function readClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      return Promise.resolve('');
    }
    return navigator.clipboard.readText().catch(function () {
      return '';
    });
  }

  function copyText(text, message) {
    if (!text) {
      toast('Es gibt noch nichts zu kopieren.', true);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(message || 'Jira-Markup kopiert.');
      }, function () {
        toast('Kopieren nicht moeglich.', true);
      });
      return;
    }
    toast('Kopieren nicht moeglich.', true);
  }

  function toast(message, isError) {
    if (!settings.showToast && !isError) return;
    var node = document.querySelector('.jmd-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'jmd-toast';
      node.dataset.jmdUi = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.toggle('jmd-toast--error', !!isError);
    node.classList.add('jmd-toast--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('jmd-toast--visible');
    }, 2600);
  }

  /* ------------------------------------------------------------------ *
   * Nachrichten aus Hintergrund-Skript / Popup
   * ------------------------------------------------------------------ */

  function onMessage(message, sender, sendResponse) {
    if (!message || !message.type) return;
    switch (message.type) {
      case 'convert-selection':
        sendResponse({ ok: convertInPlace(null) });
        break;
      case 'open-panel':
        openPanel(message.text);
        sendResponse({ ok: true });
        break;
      case 'insert-text':
        var field = currentTarget();
        if (!field) {
          sendResponse({ ok: false, reason: 'no-target' });
          return;
        }
        sendResponse({ ok: Editors.insert(field, message.text, message.mode || 'insert') });
        break;
      case 'convert-context-selection':
        handleContextSelection(message.text);
        sendResponse({ ok: true });
        break;
      case 'ping':
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  }

  function handleContextSelection(text) {
    var field = Editors.activeEditor();
    if (field) {
      convertInPlace(field);
      return;
    }
    openPanel(text || '');
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  /** Merkt sich die Auswahl des gerade bearbeiteten Jira-Feldes. */
  function trackCaret() {
    var field = Editors.activeEditor();
    if (!field) return;
    target = field;
    Editors.rememberCaret(field);
  }

  /**
   * Der Rich-Text-Editor lebt in einem eigenen Rahmen mit eigenem Dokument -
   * dort muss die Cursorposition getrennt mitgeschrieben werden.
   */
  function watchRichTextFrames() {
    var fields = Editors.findAllTargets();
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var frame = Editors.richTextFrame(field);
      if (!frame || frame.dataset.jmdWatched) continue;
      var body = Editors.richTextBody(field);
      if (!body) continue;
      frame.dataset.jmdWatched = '1';
      wireRichTextFrame(frame, field, body);
    }
  }

  function wireRichTextFrame(frame, field, body) {
    var doc = body.ownerDocument;
    var remember = function () {
      target = field;
      Editors.rememberCaret(field);
    };
    doc.addEventListener('selectionchange', remember, true);
    doc.addEventListener('mouseup', remember, true);
    doc.addEventListener('keyup', remember, true);
    doc.addEventListener('paste', onPaste, true);
    // Im Rich-Text-Modus arbeitet der Nutzer im Rahmen, nicht in der
    // Textarea: das Feld friert darum von hier aus ein.
    doc.addEventListener('focusin', function () {
      target = field;
      EditLock.lock(field);
    }, true);
    doc.addEventListener('mousedown', function () {
      target = field;
      EditLock.lock(field);
    }, true);
  }

  var scanTimer = null;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      try {
        attachFieldButtons();
        watchRichTextFrames();
        EditLock.cleanup();
        if (panel && panel.classList.contains('jmd-panel--open')) {
          updateTargetLabel();
        }
      } catch (error) {
        /* Jira baut viel um - Fehler hier nie hochblubbern lassen */
      }
    }, 400);
  }

  function start() {
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('focusin', function (event) {
      var field = Editors.editableFrom(event.target);
      if (!field) return;
      target = field;
      // Sobald im Feld gearbeitet wird, friert der Bearbeitungsmodus ein.
      EditLock.lock(field);
    }, true);

    // Solange ein Feld eingefroren ist, kommen die gestoppten Ereignisse
    // nicht mehr bis zu unseren eigenen Wachposten am Dokument. Sie bekommen
    // sie deshalb von der Sperre gereicht - sonst bliebe das Vorlagenmenue
    // offen und die Feldauswahl taub.
    EditLock.watch(function (event) {
      if (event.type !== 'mousedown') return;
      onTemplateMenuOutside(event);
      if (pickingTarget) onPickClick(event);
    });

    // Cursorposition festhalten, solange das Feld sie noch kennt. Sobald der
    // Nutzer ins Panel klickt, ist sie sonst verloren.
    document.addEventListener('selectionchange', trackCaret, true);
    document.addEventListener('mouseup', trackCaret, true);
    document.addEventListener('keyup', trackCaret, true);
    document.addEventListener('focusout', function (event) {
      var field = Editors.editableFrom(event.target);
      if (field) Editors.rememberCaret(field);
    }, true);

    createFab();
    attachFieldButtons();
    watchRichTextFrames();

    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(onMessage);
    }

    Settings.onChange(function (next) {
      settings = next;
      EditLock.configure({ enabled: settings.freezeEditMode });
      if (settings.showFloatingButton) {
        createFab();
      } else {
        removeFab();
      }
      syncPanelState();
      updateFab();
      updateFieldbarToggles();
      refreshPreview();
    });
  }

  Settings.load().then(function (loaded) {
    settings = loaded;
    EditLock.configure({ enabled: settings.freezeEditMode });
    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  });
})();
