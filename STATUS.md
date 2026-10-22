# Stand und offene Punkte

Version 0.1 einschließlich manueller HTTPS-Kalenderabonnements ist lokal implementiert. Keine Konten angelegt, kein Deployment, keine Login-Automatisierung. Der persönliche iCal-Link wird ausschließlich auf Benutzeraktion serverseitig abgerufen.

## Verifikation

- 34 Vitest-Tests erfolgreich: ICS-Verarbeitung, Datei- und URL-Import mit echten isolierten SQLite-Datenoperationen, Datenerhalt, Verschlüsselung, SSRF, DNS-Pinning, Redirects, Größenlimits und Timeouts.
- TypeScript erfolgreich.
- ESLint ohne Fehler oder Warnungen.
- Next.js-Produktionsbuild erfolgreich.
- Bestehende Initialmigration und additive Abonnementmigration erfolgreich angewendet. Kein Datenbank-Reset.
- HTTP-Prüfung: Dashboard und folgende Kalenderwoche jeweils Status 200; Dateiimport und verdecktes Abonnementformular vorhanden. Echter Formular-POST mit absichtlich gesperrtem synthetischen Link liefert eine bereinigte Fehlermeldung ohne Token in Antwort oder Redirect-URL. Wiederholbar mit `node scripts/smoke-subscription.mjs` bei laufendem Server.
- Visuelle Browserprüfung: in dieser Umgebung mangels Browsersteuerung nicht durchgeführt.

## Bekannte Grenzen

- Kalenderauflösung ist auf den gewählten Zeitraum begrenzt; kein automatisches Nachladen. Datei-Reimport ersetzt weiterhin den Bestand seiner eigenen Quelle. URL-Abos erhalten alle Termine und markieren fehlende Vorkommen zur Prüfung. Verschiedene Quellen werden nicht global zusammengeführt.
- `RANGE=THISANDFUTURE`, Serienausnahmen ohne Haupttermin, doppelte Haupt-UIDs und unbekannte Zeitzonen ohne VTIMEZONE werden abgewiesen. Nur vollständige Kalenderexporte importieren. Keine Outlook-spezifische Zeitzonenübersetzung.
- Manuelle Berliner Uhrzeiten in der fehlenden oder doppelt vorkommenden Stunde einer Zeitumstellung werden abgewiesen. Bei der doppelten Stunde UTC-ICS verwenden.
- Kein Mehrbenutzerbetrieb, Login, Push, Hintergrund-Sync, E-Mail-Abruf oder KI-Dienst. Erinnerungen werden beim Öffnen der Seite berechnet; Notification ist als Datenmodell vorbereitet.
- Wochenansicht zeigt Termine je Tag mit Beginn/Ende; keine Drag-and-drop-Bearbeitung und keine Kollisionsspalten. Termine können gelöscht und neu angelegt werden; Module, Aufgaben und Klausuren sind direkt bearbeitbar.
- Keine automatischen Backups. SQLite-Datei bei gestopptem Server sichern.
- Erstes `prisma migrate dev` meldete beim Anlegen einer noch fehlenden SQLite-Datei einen generischen Schema-Engine-Fehler. Setup legt die Datei daher vorher nicht destruktiv an; `migrate deploy` mit versionierter Migration funktioniert.

## Abhängigkeiten

`npm audit` meldet nach Aktualisierung von Vitest **8 hohe, 0 kritische** Funde: Prisma-Konfiguration/deepmerge-ts und Next-ESLint/fast-glob/micromatch/braces. Der Audit ohne Entwicklungsabhängigkeiten meldet noch 3 hohe Prisma-Konfigurationsfunde, da Prisma auch über die Client-Peerabhängigkeit aufgelöst wird. Die Funde dürfen daher nicht als vollständig beseitigt gelten. Kein `audit fix --force` angewendet: der vorgeschlagene Next-ESLint-Downgrade und ein Prisma-Majorwechsel sind keine geeigneten automatischen Reparaturen. Vor späterer Veröffentlichung oder Mehrbenutzerbetrieb separat aktualisieren und erneut prüfen. Audit-Ergebnisse sind zeitabhängig (Prüfung: 22.10.2026).

## Nächste mögliche Schritte außerhalb von 0.1

Prisma-Majorupgrade mit SQLite-Treiberadapter, barrierefreie Browserprüfung, automatisches Erweitern der Serienfenster und persistierte Benachrichtigungen. Weitere externe Uni-Adapter erst nach gesonderter Abstimmung und Prüfung offiziell unterstützter Schnittstellen.

## Kalenderabonnements

- Der persönliche reale cmlife-Link wurde nicht angefordert, nicht in Tests verwendet und noch nicht live abgerufen. Transportschutz und Import werden mit synthetischen Antworten geprüft.
- Redirects und komprimierte Antworten werden absichtlich abgewiesen; nur direkt antwortende HTTPS-Feeds auf freigegebenen Hosts funktionieren.
- Verschlüsselung schützt den Link in der Datenbank; `.env` mit dem Schlüssel muss lokal geschützt bleiben. Schlüsselrotation und automatische Bereinigung fehlender Termine gehören nicht zu dieser Erweiterung.
