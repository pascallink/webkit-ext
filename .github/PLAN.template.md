**Rolle & Kontext**
Du agierst als Senior Lead Architect. Deine Aufgabe ist es, das nachfolgende GitHub Issue #[ISSUE_NUMBER] in eine Reihe von extrem fokussierten, aufeinander aufbauenden Sub-Tasks zu zerlegen. Diese Sub-Tasks werden anschließend sequenziell in separaten Chat-Sessions von einem AI-Agenten (Claude Sonnet) im Rahmen einer **Stacked PRs Architecture** umgesetzt.

**Ziel**
Erstelle einen detaillierten Ausführungsplan für Issue #[ISSUE_NUMBER]. Jeder Sub-Task entspricht genau einem Branch und einem Pull Request (PR 1 basiert auf `main`, PR 2 auf PR 1, PR 3 auf PR 2 usw.).

**Regeln für die Erstellung der Sub-Tasks**
1. **Kontext-Fokus:** Jeder Sub-Task muss atomar sein und in einer einzigen Sonnet-Session ohne Kontextverlust abgeschlossen werden können.
2. **Keine Breaking Changes:** Jeder Schritt muss eine voll funktionsfähige, kompilierbare und testbare Zwischenstufe des Projekts darstellen.
3. **Klare Instruktion:** Die Anweisungen für den Agenten müssen deterministisch und eindeutig sein (welche Dateien, welche Formate, welche Test-Befehle).

**Struktur für jeden Sub-Task im Plan**

**Sub-Task [X]: [Kurzer, prägnanter Name]**
* **Git Branch:** `feature/issue-[ISSUE_NUMBER]-part-[X]` (Base Branch: `[Name des vorherigen Branches oder main]`)
* **Scope / Ziel:** Kurze Beschreibung des Ziels.
* **Dateiebene:**
  * Zu erstellen: `[Pfade/Dateinamen]`
  * Zu ändern: `[Pfade/Dateinamen]`
* **Schritt-für-Schritt Anweisungen für Claude Sonnet:**
  1. Erstelle/Passe die Logik in `[Datei]` an.
  2. Schreibe/Erweitere Unit-Tests in `[Test-Datei]`.
  3. Führe den Test-Befehl aus: `[Build/Test-Befehl, z. B. npm test oder xcodebuild]`.
* **Definition of Done (Acceptance Criteria):**
  * [ ] Code ist syntaxfrei und entspricht den Projekt-Standards.
  * [ ] Neue und bestehende Tests laufen grün durch.
  * [ ] Git Commit & Push auf den Branch ausgeführt.
* **Agent-Start-Prompt:** *(Gebrauchsfertiger Prompt zum Starten der Chat-Session - reiner Text in einem eigenen Codeblock, drei Backticks, ohne Sprache.)*

**Format des PR-Review-Ergebnisses (Opus)**

Das Review am Sessionende wird als kurzer Markdown-Fliesstext ausgegeben, nicht
als JSON-Bericht:

1. Ueberschrift mit PR-Nummer und Status: `APPROVED` oder `CHANGES_REQUESTED`.
2. Zwei bis drei Absaetze: was bricht, warum, und die empfohlene Richtung.
   Datei- und Zeilenangaben inline (`datei.yml:18`), keine Tabelle, keine
   Aufzaehlung aller Befunde als Liste.
3. Danach 0, 1 oder 2 Korrektur-Prompts, je Prompt genau eine Zieldatei, jeder
   als reiner Text in einem eigenen Codeblock (drei Backticks, ohne Sprache),
   die Modellwahl als Ueberschrift davor. Ausserhalb der Codebloecke steht
   nichts, was zum Prompt gehoert.

Routing wie in [`.github/PROMPTS.md`](PROMPTS.md): nur `STYLE`/`MINOR` geht an
Haiku, alles andere an Sonnet. Die inhaltlichen Felder eines Korrektur-Prompts
(Zieldatei, Befunde, Constraints, Ausgabeformat) folgen der Stufe-2-Vorlage
dort - als Klartext, nicht als JSON-Objekt.

---

### Issue #[ISSUE_NUMBER] Details & Technische Vorgaben

#### Beschreibung
[Hier die Problembeschreibung aus dem GitHub Issue einfügen]

#### Anforderungen & User Story
[Hier funktionale und nicht-funktionale Anforderungen einfügen]

#### Technische Umsetzungshinweise
* **Ziel-Umgebung:** [z. B. iOS / WebExtension / Jira Server 9.12 LTS / etc.]
* **Architektur / Module:** [Relevante Pfade, z. B. src/settings.js, Shared/Services/, etc.]

#### Zu erarbeitende Sub-Tasks:
- [Sub-Task 1 Stichpunkt]
- [Sub-Task 2 Stichpunkt]

**Technische Leitplanken für die Umsetzung:**
* [Leitplanke 1, z. B. Asynchronität/Wait-Handling, Race Conditions]
* [Leitplanke 2, z. B. Error-Handling, Fallbacks, Edge-Cases]

---

Analysiere das oben beschriebene Issue #[ISSUE_NUMBER] und erstelle jetzt den vollständigen Ausführungsplan gemäß den definierten Vorgaben. Erzeuge alle Sub-Tasks nacheinander inklusive aller Details, Checklisten und der einsatzbereiten Agent-Start-Prompts für die einzelnen Chat-Sessions.
