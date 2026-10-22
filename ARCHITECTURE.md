# StudyHub 0.1

Lokale Einzelbenutzer-Anwendung: Next.js App Router, TypeScript, Tailwind, Prisma und SQLite. Kein Login, keine geschützten Uni-Verbindungen, kein Deployment. Nur an localhost betreiben.

## Struktur
- `src/app`: deutsche Oberfläche, Server Actions und serverseitige Abfragen.
- `src/lib`: Validierung, Berliner Datumslogik, Datenoperationen und Prisma-Singleton.
- `src/providers`: CalendarProvider, LearningPlatformProvider und MailProvider; lokale Implementierungen und ICS-Adapter.
- `prisma`: Datenmodell, Migration und ausdrücklich gekennzeichnete Demo-Daten.
- `tests`: Kalenderfälle und echte SQLite-Datenoperationen.

## Entscheidungen
Server Actions halten Datenbank und Dateiverarbeitung aus dem Browser. SQLite genügt für einen lokalen Benutzer. Alle importierten Datensätze referenzieren SyncSource; eindeutige Schlüssel aus Quelle, UID und ursprünglicher Wiederholungszeit verhindern Duplikate. Imports werden atomar ersetzt, sodass gelöschte oder abgesagte Vorkommen verschwinden. Original-ICS bleibt zur späteren Neuauflösung gespeichert. ICS wird mit ical.js verarbeitet; VTIMEZONE und Europe/Berlin werden berücksichtigt. Wiederholungen werden innerhalb eines expliziten Importzeitraums materialisiert, mit Größen- und Iterationsgrenzen. UTC wird gespeichert, Europe/Berlin angezeigt; ganztägige Daten behalten ihre Semantik.

Lernplattform- und Mailadapter haben keine Netzwerkimplementierung. Benachrichtigungen werden lokal beim Öffnen berechnet, ohne Hintergrunddienst oder Push. Modul-Löschen entfernt Zuordnungen, erhält aber Termine und Aufgaben.

## Erweiterung: manuelle URL-Abonnements

`src/providers/calendar-url.ts` ergänzt ausschließlich den sicheren HTTPS-Transport: exakte Host-Allowlist, Prüfung aller DNS-Adressen, IP-Pinning, TLS-Hostprüfung, keine Redirects, Zeit- und Größenlimits. `src/lib/calendar-secrets.ts` kapselt AES-GCM-Verschlüsselung und HMAC-Kennungen; `src/lib/subscriptions.ts` orchestriert Download, bestehenden ICS-Parser und transaktionale Upserts. Die Quellenart `ICS_URL` ist vom unveränderten Dateiimport `ICS` und manuellen Quellen getrennt. Die additive Migration erweitert SyncSource um Ciphertext, HMAC und Importfenster; CalendarEvent erhält eine Prüfmarkierung für fehlende Feedtermine.

Abosynchronisierung löscht keine Ereignisse. Sie markiert vorhandene Vorkommen innerhalb des Fensters zunächst als fehlend und aktualisiert gelieferte Vorkommen anhand ihrer UID/Wiederholungskennung. Fehlende Vorkommen bleiben zur Prüfung sichtbar. Nicht wiederkehrende Ereignisse verwenden eine UID-basierte Identität ohne DTSTART, damit Verschiebungen keine Duplikate erzeugen. Abonnementkennungen werden zusätzlich gehasht. Keine globale Zusammenführung verschiedener Quellen, kein automatischer Abruf und keine Änderung manueller Termine. Fehler führen zum Transaktions-Rollback. Der ursprüngliche Feed wird für URL-Abos nicht gespeichert. Quellenmetadaten werden für die Oberfläche explizit ausgewählt; geheime Felder verbleiben serverseitig.
