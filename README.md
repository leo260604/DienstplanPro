# DienstPlan Pro – Shift Planning

Web-App zur Dienst- und Bereitschaftsplanung (Dienstplan, Bereitschaft, Diensttausch, Abwesenheiten, Arbeitsort, Teams & Abteilungen, Berichte/Export, Audit Log). Läuft im Browser. Daten werden in **Supabase** gespeichert, sobald URL und Anon-Key in `DienstPlanPro/supabase.js` eingetragen sind – sonst wie bisher nur im `localStorage` des Browsers.

## Starten
- `DienstPlanPro/index.html` im Browser öffnen, **oder**
- `DienstPlanPro-Einzeldatei.html` öffnen (alles in einer Datei).

## Inhalt
| Pfad | Beschreibung |
|---|---|
| `DienstPlanPro/` | Quellcode: `index.html`, `app.js`, `i18n.js` (Deutsch/Englisch), `styles.css`, `supabase.js` (Datenbank-Anbindung), `assets/` |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln für Supabase |
| `tools/build_einzeldatei.py` | Baut `DienstPlanPro-Einzeldatei.html` aus den Quelldateien |
| `DienstPlanPro-Einzeldatei.html` | Gesamte App in einer HTML-Datei |
| `LIES_MICH.md` | Ausführliche Beschreibung aller Funktionen und Änderungen |
| `Mockups/`, `Screenshots_*` | Entwürfe und Screenshots |

## Supabase einrichten
1. Im Supabase-Dashboard: **SQL Editor → New query**, Inhalt von `supabase/schema.sql` einfügen, **Run**.
2. Unter **Project Settings → API** die *Project URL* und den *anon public* Key kopieren.
3. In `DienstPlanPro/supabase.js` oben `DP_SUPABASE_URL` und `DP_SUPABASE_ANON_KEY` eintragen.
4. Einzeldatei neu bauen: `python3 tools/build_einzeldatei.py`.

Beim ersten Start mit leerer Datenbank werden die vorhandenen Browserdaten einmalig hochgeladen. Danach lädt jedes Gerät beim Start aus Supabase; Änderungen werden automatisch übertragen (nur geänderte Zeilen). Ist die Datenbank nicht erreichbar, arbeitet die App mit dem Stand im Browser weiter und überträgt später.

Gespeichert in Supabase: Mitarbeitende, Teams, Abteilungen, alle Einträge (Dienste, Bereitschaften, Abwesenheiten, Arbeitsorte), Dienstzeiten, Bereitschaftszeiten, Diensttausch, Audit Log, Export Audit, Benachrichtigungen, Rollen & Berechtigungen, Links/Favoriten/Dashboard-Layouts. Nur auf dem Gerät bleiben: Darstellung (Hell/Dunkel, Farbe, Schrift), Sprache, Kalender-Standardansicht und die Anmeldung.

> **Achtung – vorläufig ohne Anmeldung:** Die Zugriffsregeln in `schema.sql` erlauben jeder Person mit dem Link, alle Daten zu lesen und zu ändern. Vor dem echten Einsatz eine Anmeldung (Supabase Auth) einbauen und die Regeln einschränken.

## Einzeldatei bauen
Nach jeder Änderung an den Quelldateien: `python3 tools/build_einzeldatei.py` – nicht von Hand zusammenkopieren (`app.js` wird dabei so eingebettet, dass zuerst die Daten aus Supabase geladen werden).
