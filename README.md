# Kuchenliga 🍰

Die Klassen-Kuchenbewertung: neun Kuchen, zwölf persönliche Zugänge, 1–10 Punkte. Gebaut für GitHub Pages mit Supabase Auth und Postgres.

## Wer macht mit?

Kuchen: Nico, Livio, Kimo, Kyle, Noemi, Maria, Anina, Joel Häusler und Tim.
Nur abstimmen: Joel Stocker, Raphael und Berni (Lehrer).

| Datum | Kuchen von |
|---|---|
| 13.11.2026 | Nico |
| 20.11.2026 | Livio |
| 27.11.2026 | Kimo |
| 04.12.2026 | Kyle |
| 11.12.2026 | Noemi |
| 18.12.2026 | Maria |
| 08.01.2027 | Anina |
| 15.01.2027 | Joel Häusler |
| 22.01.2027 | Tim |

## Was die Datenbank garantiert

- Pro angemeldeter Person und Kuchen maximal eine Wertung (zusammengesetzter Primärschlüssel).
- Nur ganze Punkte von 1 bis 10 (Datenbank-Constraint).
- Keine Selbstbewertungen; reine Abstimmende dürfen alle neun Kuchen bewerten.
- Keine Bewertung vor dem Kuchen-Datum; die Datenbank prüft das Datum in `Europe/Zurich`. Das Verstellen der Geräteuhr hilft nicht.
- Kein Ändern oder Löschen durch Klassen-Zugänge, auch nicht über direkte API-Anfragen.
- Nur manuell zugewiesene Klassenkonten dürfen abstimmen. Ein selbst registriertes Auth-Konto erhält keine Mitgliedschaft.
- Einzelne Stimmen sind nur für die Person selbst lesbar. Die Rangliste liefert ausschliesslich aggregierte Punkte.
- Avatare und Farben werden im eigenen Profil gespeichert; fremde Profile und feste Identitäten sind nicht änderbar.

Eine Person wird durch ihren Zugang erkannt: Wer ein Passwort weitergibt, gibt damit seine Stimme weiter. Der Supabase-Projektbesitzer hat administrative Rechte und könnte Daten verändern. Gegen solche Handlungen ist eine vom Besitzer verwaltete App nicht manipulationssicher.

## Kostenloser Betrieb

GitHub Pages aus einem öffentlichen Repository und die kostenlose Supabase-Organisation. Es wurden keine kostenpflichtigen Erweiterungen oder Zahlungsdaten eingerichtet. Kontingente und gegebenenfalls Projektpausen im Free-Tarif beachten; bei erreichten Grenzen keinen kostenpflichtigen Tarif aktivieren. Keine eigene Domain notwendig.

## Anwendung starten und prüfen

Node.js 22+ (entwickelt/getestet mit Node 24).

```sh
npm ci
npm test
npm run dev
```

Öffne `http://localhost:4173`. Für die Browserprüfungen:

```sh
npx playwright install chromium
npm run test:ui
```

Die Datenbanktests verwenden einen echten lokalen Postgres-Kern (PGlite) mit Rollen und Row Level Security, keine nachgebildete Speichermappe.

## Neues Supabase-Projekt einrichten

1. Organisation im **Free-Tarif** und Projekt in Europa anlegen; keine Zahlungsdaten hinzufügen.
2. `supabase/schema.sql` im SQL Editor ausführen. Wiederholtes Ausführen erhält Stimmen und Konten. Es aktualisiert den Kuchenplan und die Zugriffsregeln.
3. Projekt-URL und **öffentlichen Publishable-Key** in `config.js` eintragen. Ein geheimer Schlüssel gehört niemals in diese Datei.
4. Optional öffentliche Registrierung unter Authentication deaktivieren. Unbekannte Konten erhalten auch bei offener Registrierung keinen Klassenzugang.
5. Zwölf Konten einmalig erstellen: `npm run setup:users`. Der geheime Projektschlüssel wird im Terminal unsichtbar abgefragt und nicht gespeichert. Alternativ `node scripts/setup-server.mjs` starten und den Schlüssel auf `http://127.0.0.1:4174/` eingeben.
6. Die Datei `private/kuchenliga-zugaenge.csv` privat behalten. Jede Person erhält nur ihre eigene Zeile. Die Zugangsliste, der Einrichtungsstand und sämtliche geheimen Schlüssel dürfen nie auf GitHub oder die Webseite.

Die Logins nutzen interne Adressen wie `tim@kuchenliga.invalid`. Das sind keine realen E-Mail-Postfächer und sie versenden keine Mails. Bei vergessenem Passwort muss der Projektbesitzer den Zugang administrativ zurücksetzen. Die Webseite selbst erlaubt keine Registrierung oder Passwortänderung.

Der lokale Einrichtungshelfer nutzt den vorhandenen Secret-Key nur im Arbeitsspeicher für Anfragen an das konfigurierte Supabase-Projekt. Er protokolliert den Key nicht. Der private Einrichtungsstand ermöglicht Wiederaufnahme nach Unterbrechung, ohne Passwörter neu zu setzen. Nach dem Einrichten Helfer beenden und Browser-Zwischenablage leeren.

## Veröffentlichung

```sh
npm run build
```

`dist/` enthält ausschliesslich `index.html`, `app.<Versionskennung>.js`, `styles.<Versionskennung>.css`, `config.js`, `favicon.svg` und `.nojekyll`. Die Versionskennungen verhindern, dass Browser alte Programmdateien zur neuen Oberfläche laden. Kein Admin-Helfer, keine Passwörter und keine Entwicklungsabhängigkeiten werden mitgebaut.

Für das vollständige Quellprojekt kann `.github/workflows/pages.yml` nach GitHub gepusht und in Settings → Pages als Quelle **GitHub Actions** gewählt werden.

Die erste Veröffentlichung über den Browser lädt den Inhalt von `dist/` direkt ins Repository und verwendet **Deploy from a branch → main → /(root)**. `kuchenliga-source.zip` enthält dazu das vollständige bearbeitbare Quellprojekt mit Tests und Einrichtungsskripten, ohne private Daten. Zum Bearbeiten das Archiv entpacken, Änderungen machen, Tests ausführen, bauen und `dist/` erneut veröffentlichen.

## Termine oder Namen ändern

`src/domain.js` enthält `MEMBERS` (alle Zugänge) und `SCHEDULE` (nur Kuchen). Termine zusätzlich in `supabase/schema.sql` ändern und das SQL anwenden; die Datenbank ist für die Freigabe verbindlich. Bei bereits bestehenden Konten Mitgliedschaften nicht unbedacht austauschen. Anschliessend neu bauen und veröffentlichen.

## Quellen

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API-Schlüssel](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Admin-Benutzeranlage](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
