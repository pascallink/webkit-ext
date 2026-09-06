# Vorlage: Ausfuehrungsplan aus einem Issue

Zum Kopieren in ein Issue, das ein Agent in mehrere Sitzungen zerlegen soll.
`<N>` durch die Issue-Nummer ersetzen, den Abschnitt "Fachliche Vorgaben"
selbst fuellen. Alles darueber bleibt, wie es dasteht - es beschreibt dieses
Repo, nicht das jeweilige Feature.

Ergebnis eines Laufs: ein Plandokument unter `<projekt>/docs/issue-<N>-ausfuehrungsplan.md`.

---

**Rolle & Kontext**

Du agierst als Senior Architect fuer Browser-Erweiterungen (Chrome/Edge, MV3).
Deine Aufgabe ist es, GitHub Issue #`<N>` in eine Reihe extrem fokussierter,
aufeinander aufbauender Sub-Tasks zu zerlegen. Diese werden anschliessend
sequenziell in separaten Chat-Sessions von einem Agenten im Rahmen einer
**Stacked-PRs-Architektur** umgesetzt.

**Ziel**

Erstelle einen detaillierten Ausfuehrungsplan fuer Issue #`<N>`. Jeder Sub-Task
entspricht genau einem Branch und einem Pull Request (PR 1 auf `main`, PR 2 auf
PR 1, PR 3 auf PR 2 usw.). Lege den Plan als Markdown unter
`<projekt>/docs/issue-<N>-ausfuehrungsplan.md` ab.

**Technischer Rahmen dieses Repos** (nicht verhandelbar, vor dem Planen pruefen)

* Lies zuerst `CLAUDE.md` im Root und im betroffenen Projektordner.
* Stack: **ES5**, `'use strict'`, nur `var`, **kein Bundler, keine
  Runtime-Dependencies**. Wiederverwendbare Module folgen dem UMD-Muster aus
  `src/settings.js` (`module.exports` **und** Global), sonst laden die
  Node-Tests sie nicht.
* Build gibt es nicht - der MV3-Quellcode geht unveraendert raus. "Kompiliert
  fehlerfrei" heisst hier: `npm run lint --prefix <projekt>` ohne Befund.
* Tests: Node-Runner in `<projekt>/test/*.test.js`, Oberflaeche und DOM ueber
  Playwright in `test/integration.test.js` gegen Fixtures in `test/fixtures/`.
* Befehle je Sub-Task, immer gefiltert, nie global:
  ```
  npm install --prefix <projekt>
  npm run lint --prefix <projekt>
  npm test  --prefix <projekt>
  ```
* Neue Content-Script-Datei muss an **zwei** Stellen eingetragen werden:
  `manifest.json` (`content_scripts[0].js`) und `src/background.js`
  (`var CONTENT_FILES = [...]`). `test/package.test.js` vergleicht beide mit
  `deepStrictEqual` - wer nur eine aendert, faellt durch.
* `innerHTML` nur mit einer festen Vorlagenkonstanten; Fremddaten immer per
  `textContent`. Auch das prueft `test/package.test.js`.
* Deutsch in Kommentaren und UI-Texten, **ohne Umlaute** (`ue`, `ae`, `oe`,
  `ss`). Kein `console.log` im Auslieferungscode.
* Commits: `<typ>(<scope>): <Betreff im Imperativ, ohne Punkt>`, ein Commit ein
  Scope, Scope aus der Projekttabelle der Root-`CLAUDE.md`.

**Regeln fuer die Erstellung der Sub-Tasks**

1. **Kontext-Fokus:** Jeder Sub-Task ist atomar und in einer einzigen Session
   ohne Kontextverlust abzuschliessen.
2. **Keine Breaking Changes:** Jeder Schritt ist eine lauffaehige Zwischenstufe -
   Lint und Tests sind nach jedem Sub-Task gruen.
3. **Klare Instruktion:** Deterministisch und eindeutig - welche Dateien, welche
   Selektoren, welche Testfaelle, welche Befehle. Keine Wahlmoeglichkeiten.
4. **Schnitt an Modulgrenzen:** Trenne nach Modulen, nicht nach fachlichen
   Teilschritten, die sich Infrastruktur teilen.
5. **Feature zuletzt sichtbar:** Verdrahtung in `src/content.js` und die
   Schalter in Popup/Optionsseite gehoeren in einen eigenen, spaeten Sub-Task.
6. **Doku und Version** bilden den letzten Sub-Task (README, CHANGELOG,
   `CLAUDE.md` des Projekts, `docs/store/`, Version in `package.json` **und**
   `manifest.json` synchron).
7. **Review-Prompt am Ende jeder Session:** Jeder Sub-Task endet nicht mit dem
   Push. Die umsetzende Session gibt einen gebrauchsfertigen Review-Prompt fuer
   ein staerkeres Modell aus - Auftrag woertlich: "Erstelle einen Review-Prompt
   fuer Opus, der die Code-Aenderungen, deine Designentscheidungen, potenzielle
   Edge Cases und 3-4 konkrete Pruefpunkte fuer diesen PR zusammenfasst."
   Der Plan enthaelt dafuer einen eigenen Abschnitt mit der Ausgabeform (siehe
   unten). Die Ausgabe dieses Prompts ist ein zwingendes Kriterium der
   Definition of Done - ohne ihn gilt der Sub-Task nicht als abgeschlossen,
   unabhaengig davon, ob Lint, Tests und Push bereits gruen sind. Jeder
   Sub-Task nimmt ihn entsprechend in seine Definition of Done auf.

**Struktur fuer jeden Sub-Task im Plan**

**Sub-Task [X]: [Kurzer, praegnanter Name]**
* **Git Branch:** `feature/issue-<N>-part-[X]` (Base Branch: `[vorheriger Branch oder main]`)
* **Scope / Ziel:** Kurze Beschreibung des Ziels.
* **Dateiebene:**
  * Zu erstellen: `[Pfade]`
  * Zu aendern: `[Pfade]`
* **Schritt-fuer-Schritt Anweisungen:** nummeriert, mit den konkreten
  Funktionssignaturen, Selektoren und Testfaellen.
* **Definition of Done:**
  * [ ] `npm run lint --prefix <projekt>` ohne Befund
  * [ ] `npm test --prefix <projekt>` gruen, neue Tests laufen mit
  * [ ] `manifest.json` und `CONTENT_FILES` identisch (falls beruehrt)
  * [ ] Keine Umlaute, kein `console.log`
  * [ ] Commit und Push auf den Branch
  * [ ] Review-Prompt fuer Opus ausgegeben (zwingend - ohne ihn ist der
    Sub-Task nicht abgeschlossen)
* **Agent-Start-Prompt:** gebrauchsfertiger Prompt fuer die Session - nennt
  Repo, Projekt, die zu lesenden `CLAUDE.md`, Base Branch, Dateiliste,
  Abgrenzung ("nichts darueber hinaus"), die Abschlussbefehle und zuletzt die
  Aufforderung, den Review-Prompt auszugeben.

**Pflichtabschnitt im Plan: "Abschluss jeder Session: Review-Prompt fuer Opus"**

Nimm diesen Abschnitt woertlich in den Plan auf, damit jede Session dieselbe
Form liefert:

```text
Review von PR "<Titel>" (Branch <Branch>, Base <Base>).
Projekt: <projekt>, MV3-Erweiterung, ES5 + UMD, keine Deps.

Aenderungen
- <Datei>: <was und warum, ein Satz>

Designentscheidungen
- <Entscheidung>: <verworfene Alternative und der Grund>

Edge Cases, die ich bedacht habe
- <Fall> -> <Verhalten>

Bitte pruefe gezielt
1. <konkreter Pruefpunkt mit Datei und Funktion>
2. <...>
3. <...>
(4. <...>)

Bekannte Luecken: <was bewusst offen blieb, oder "keine">
```

Regeln dafuer: selbsttragend (der Reviewer sieht den Chatverlauf nicht, jede
Behauptung nennt Datei und Funktion), Pruefpunkte sind Fragen an den Code und
keine Zusammenfassung, bekannte Luecken ehrlich benennen, kein Selbstlob,
hoechstens 40 Zeilen. Verpflichtend: der Prompt wird immer als ein einzelner
Codeblock exakt in obiger Vorlagenform ausgegeben, nie als Fliesstext oder auf
mehrere Codebloecke verteilt.

**Pflichtabschnitt im Plan: "Abschluss des Opus-Reviews: Korrektur-Prompts"**

Nimm diesen Abschnitt woertlich in den Plan auf, direkt im Anschluss an den
vorigen. Er gilt fuer die Opus-Session, die das Review durchfuehrt:

```text
Analysiere das Review-Ergebnis und gib am Ende deines Reviews genau EINE der
folgenden drei Varianten aus:

VARIANTE A: 0 Prompts (PR ist bereit zum Merge)
STATUS: APPROVED
Keine Korrekturen erforderlich. Der PR kann gemergt werden.

VARIANTE B: 1 Prompt (fuer Haiku ODER Sonnet)
Waehle Haiku bei reinen Linter/Typo/Format-Fixes. Waehle Sonnet bei
Logikfehlern oder wenn gemischte Fehler am effizientesten in einem Rutsch
behoben werden sollen.

STATUS: FIX REQUIRED
Empfohlenes Modell: [Haiku | Sonnet]

--- PROMPT START ---
[Gebrauchsfertiger Prompt mit genauer Anweisung, Dateien und Aufgaben]
--- PROMPT END ---

VARIANTE C: 2 Prompts (getrennte Uebergabe)
Waehle diese Variante, wenn eine klare Trennung zwischen vielen trivialen
Linter/Syntax-Fixes und komplexen Logik-Fixes sinnvoll ist, um Tokens zu
sparen.

STATUS: FIX REQUIRED (SPLIT)

--- PROMPT 1 FOR HAIKU START ---
[Gebrauchsfertiger Prompt fuer Linter, Typen, Umlaute, Formatierung]
--- PROMPT 1 END ---

--- PROMPT 2 FOR SONNET START ---
[Gebrauchsfertiger Prompt fuer Logik, Architektur, Testanpassungen]
--- PROMPT 2 END ---
```

Regeln dafuer: genau eine der drei Varianten, keine Mischform, kein Prompt
ohne konkrete Datei- und Aufgabenangabe, Ausgabe ebenfalls als ein einzelner
Codeblock in obiger Form.

**Abschluss des Plans**

Eine Tabelle mit Risiken und offenen Punkten - insbesondere alles, was von
Annahmen ueber ein Fremdsystem abhaengt und nur an einer echten Instanz
verifiziert werden kann.

---

### Issue #`<N>` Details & Fachliche Vorgaben

*(Hier das Problem, das Ziel, die Anforderungen, die Zielumgebung, den
gewuenschten Ablauf und die technischen Leitplanken beschreiben. Je genauer die
Selektoren, Feldnamen und Meldungstexte hier stehen, desto weniger raet der
Agent spaeter.)*
