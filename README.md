# StudyHub 0.1

Persönliches Uni-Dashboard mit deutscher Oberfläche, lokalem SQLite-Speicher und ohne Zugangsdaten. Enthält Dashboard, Wochenübersicht, Modulverwaltung, manuelle Veranstaltungen, ICS-Import, Aufgaben, Klausuren und lokale Vorwarnungen. Lernmaterialien sind bewusst leer.

## Start unter Windows / PowerShell

Voraussetzung: Node.js 24 LTS (mindestens 24.11), npm und beim erstmaligen Installieren Internet. Für lokale Funktionen ist kein Netzwerk nötig; Kalenderabonnements benötigen beim manuellen Abruf Internet. Im Projektverzeichnis:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run db:seed
npm.cmd run dev
```

Dann http://127.0.0.1:3000 öffnen. `db:seed` ist optional; alle Beispieldaten sind als Demo gekennzeichnet, frei erfunden und keine offiziellen Termine. Wiederholtes Seeden überschreibt bestehende Demo-Einträge nicht. In anderen Shells genügt `npm` statt `npm.cmd`; unter PowerShell vermeidet `.cmd` Probleme mit gesperrten `.ps1`-Skripten.

`setup` legt `.env` nur an, wenn sie fehlt, erzeugt den Prisma-Client und wendet die versionierte Migration an. Standarddatenbank: `prisma/studyhub.db`. Eine leere SQLite-Datei wird vorab angelegt, um einen Schema-Engine-Fehler beim erstmaligen Anlegen unter Windows zu vermeiden. Bei angepasster `DATABASE_URL` bezieht sich ein relativer Pfad auf `prisma/`; Zielverzeichnisse vorher erstellen.

Produktionsmodus lokal: `npm.cmd run build`, danach `npm.cmd start`. Beide Startbefehle binden ausschließlich an `127.0.0.1`. Kein Deployment erforderlich.

## Kalender ausprobieren

1. „Kalender importieren“ öffnen und `examples/demo.ics` auswählen.
2. Quellenkennung beispielsweise `mein-stundenplan` vergeben. Zeitraum 01.01.2026 bis 01.01.2027 wählen; Enddatum ist exklusiv.
3. Optional ein Modul zuordnen und importieren. Die Beispieldatei enthält eine Wochenserie, einen Ausfall und einen verschobenen Termin über die Zeitumstellung hinweg.
4. Dieselbe Datei mit derselben Quellenkennung erneut importieren: Es entstehen keine zusätzlichen Termine. Geänderte Dateien ersetzen den gesamten bisherigen Bestand dieser Quelle atomar. Andere Quellen und manuelle Daten bleiben erhalten.

Eine Quelle entspricht **einem vollständigen Kalender**, nicht einer Einzeldatei als Teilbestand. Bei eingeschränktem Zeitraum werden frühere Vorkommen außerhalb dieses Zeitraums ebenfalls entfernt. Original-ICS wird lokal an der Quelle gespeichert. Die Quellenkennung muss bei Folgeimporten gleich bleiben; eine andere Kennung legt bewusst eine unabhängige Quelle an.

Serien werden ausschließlich für den gewählten Zeitraum aufgelöst (maximal zwei Jahre, 10.000 Vorkommen, 100.000 Iterationen, 2 MB pro Datei). RRULE, RDATE, EXDATE und RECURRENCE-ID werden verarbeitet. UTC, Europe/Berlin, floating Zeiten (als Berlin) und mitgelieferte VTIMEZONE-Definitionen werden unterstützt. Unbekannte TZIDs ohne Definition werden abgewiesen. Ganztägige Enddaten sind exklusiv. `RANGE=THISANDFUTURE` wird ausdrücklich abgewiesen. Ein neuer Import ist nötig, um weitere Jahre sichtbar zu machen.

## Kalender per Link abonnieren

Die vorhandene Dateifunktion bleibt unverändert erhalten. Für die Erweiterung einmal `npm.cmd run setup` ausführen und den Entwicklungsserver neu starten. Falls Windows eine gesperrte Prisma-DLL meldet, zuerst den laufenden StudyHub-Server mit Strg+C beenden. Die additive Migration löscht keine Daten.

1. In der Navigation **Kalender abonnieren** auswählen oder zum Abschnitt **Kalender per Link abonnieren** direkt unter dem Dateiimport scrollen.
2. Den persönlichen cmlife-iCal-Link in **Persönlicher iCal-Link** einfügen. Das Feld zeigt den Link absichtlich verdeckt an. Ein `webcal://`-Link muss als entsprechender `https://`-Link vorliegen; HTTP und andere Protokolle sind gesperrt.
3. Importzeitraum wählen (Enddatum exklusiv, maximal zwei Jahre) und **Abonnieren und synchronisieren** klicken.
4. Unter dem Formular erscheint das Abonnement mit letztem Erfolgszeitpunkt und **Jetzt synchronisieren**. Es wird ausschließlich durch Klick abgerufen, niemals automatisch beim Laden des Dashboards.

Die neue Quelle verwendet denselben ICS-Parser wie der Dateiimport. Eindeutigkeit beruht auf Quelle, UID und ursprünglichem Wiederholungsdatum; Einzeltermine bleiben auch bei geänderter Uhrzeit über die UID identifizierbar. Abonnement-Ereigniskennungen werden daraus per HMAC abgeleitet. Derselbe Link erzeugt bei erneutem Abonnieren kein zweites Abo; dabei kann auch der Zeitraum angepasst werden. Verschiedene Quellen bleiben bewusst unabhängig (derselbe Kalender zusätzlich als Datei kann deshalb parallel erscheinen).

**Datenerhalt:** Beim URL-Abonnement wird nichts automatisch gelöscht. Geänderte Vorkommen werden aktualisiert; fehlende, ausgefallene oder abgesagte Vorkommen bleiben sichtbar und werden **Nicht im letzten Abruf – prüfen** markiert. Ein eingeschränktes oder leeres Feed löscht keine Termine. Historische Daten außerhalb des gewählten Fensters bleiben unberührt. Dateiimporte behalten ihre bisherige, in der Oberfläche erklärte Ersetzungslogik für ihre eigene Quelle. Manuelle Termine und andere Quellen werden von der Abosynchronisierung nicht verändert. Bei Abruf-, Parser- oder Datenbankfehlern bleibt der vorherige Stand erhalten.

### Hostfreigabe und SSRF-Schutz

Standardmäßig ist **nur** `my.uni-bayreuth.de` auf HTTPS-Port 443 zugelassen. Falls dein persönlicher Link einen anderen tatsächlichen Kalenderhost verwendet, trage dessen exakten Hostnamen lokal in `.env` ein und starte den Server neu:

```dotenv
CALENDAR_ALLOWED_HOSTS="my.uni-bayreuth.de"
```

Mehrere ausdrücklich vertrauenswürdige Hosts können durch Kommas getrennt werden; keine Wildcards, URLs oder Tokens eintragen. Die Freigabe ist ausschließlich serverseitig konfigurierbar. Nicht die gesamte Uni-Domain pauschal erlauben.

Der native Node-HTTPS-Abruf prüft alle DNS-Antworten auf öffentliche IPv4-/IPv6-Adressen und bindet den Socket an genau eine geprüfte IP (kein zweites DNS-Lookup). TLS-Zertifikat und SNI bleiben auf den ursprünglichen Host bezogen. IP-Literale, Zugangsdaten in URLs und private/reservierte Adressen werden abgewiesen. **Keinerlei Redirects** werden verfolgt, auch nicht zum selben Host. Ein Feed muss direkt mit Status 200 antworten; Login-/HTML-Seiten sind kein Kalender. Gesamtzeitlimit inklusive DNS, TLS und Download: 10 Sekunden; Headerlimit 16 KiB; gestreamtes Größenlimit 2 MB. Komprimierte Antworten werden abgelehnt und `Accept-Encoding: identity` angefordert. Es werden keine Cookies oder Login-Daten mitgesendet und keine Proxy-Umgebungsvariablen genutzt. Schutzkonzept: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), Transport: [Node.js HTTPS](https://nodejs.org/api/https.html).

### Schutz des persönlichen Links

`setup` erzeugt einmalig `CALENDAR_URL_KEY` (32 zufällige Bytes) in der ignorierten lokalen `.env`. Der Kalenderlink wird mit **AES-256-GCM** verschlüsselt in SQLite gespeichert; ein HMAC dient zur Wiedererkennung. Keine Klartext-URL und kein Original-ICS werden für Abonnements gespeichert. Dashboard-Abfragen laden nur freigegebene Quellenmetadaten; weder URL noch Ciphertext oder Schlüssel werden an Client-Komponenten übergeben. Abonnementfehler werden ohne URL, Feedinhalt oder ursprünglichen Fehler ausgegeben und nicht protokolliert. Der Link wird per Formular-POST übertragen, nicht als Browser-URL.

Die `.env` und Datenbank bleiben in `.gitignore`. Beide für eine Wiederherstellung sichern und den Schlüssel möglichst getrennt von der Datenbank aufbewahren. Den bestehenden Schlüssel nicht löschen oder neu erzeugen: ohne ihn können gespeicherte Abos nicht mehr entschlüsselt werden. Die restlichen Studieninformationen in SQLite sind weiterhin unverschlüsselt. Lokale Benutzer mit Zugriff auf Datenbank **und** `.env` können den Link entschlüsseln. Persönliche Links niemals in Tickets, Screenshots, Befehlszeilen, Tests oder Git einfügen; die Tests verwenden ausschließlich erfundene Tokens. Anwendungslogs sind bereinigt, absichtliches HTTP-/TLS-Debuglogging außerhalb der Anwendung sollte für persönliche Feeds ausgeschaltet bleiben.

## Daten und Sicherheit

- `Course`, `CalendarEvent`, `Task`, `Exam`, `LearningMaterial`, `Notification` und `SyncSource` sind im Prisma-Schema definiert. Importdaten haben Quellenreferenz und eindeutige Quellen-/Ereigniskennung.
- Module lassen sich bearbeiten und löschen. Löschen entfernt die Modulzuordnung, erhält aber Termine, Aufgaben und Klausuren.
- Aufgaben und Klausuren sind bearbeitbar und löschbar; Aufgaben lassen sich erledigen und wieder öffnen. Manuelle Termine sind anlegbar und löschbar.
- Vorwarnungen erscheinen beim Laden des Dashboards. Kein Hintergrundprozess, keine E-Mail-, Push- oder Betriebssystembenachrichtigungen. Das Notification-Modell ist für spätere persistierte Mitteilungen vorbereitet.
- Keine Anmeldung, keine Verschlüsselung der lokalen Datenbank, kein Mehrbenutzerbetrieb. Nur lokal betreiben. Sicherung bei gestopptem Server: SQLite-Datei kopieren; importierte ICS kann private Informationen enthalten.
- `.env`, SQLite-Dateien, Abhängigkeiten und Buildartefakte werden durch `.gitignore` ausgeschlossen. Keine Uni-Anmeldedaten oder API-Schlüssel erforderlich; der Abolink selbst ist wie ein Geheimnis zu behandeln.
- Externe Lernplattform- und Mailprovider bleiben lokal. Die einzige neue Netzwerkfunktion ist der ausdrücklich ausgelöste HTTPS-Kalenderabruf. Die bisherige Variable `EXTERNAL_CONNECTIONS_ENABLED` aktiviert keine zusätzlichen Integrationen und steuert die manuell autorisierten Kalenderabonnements nicht.
- Webmail öffnet nur auf Klick die offizielle Adresse https://mail.myubt.de. Keine Postfachabfrage. Optional über `UNI_WEBMAIL_URL=https://…` in `.env` änderbar. Quelle: [ITS Universität Bayreuth](https://www.its.uni-bayreuth.de/en/email).

## Entwicklung und Prüfungen

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

34 Tests verwenden eine eigene temporäre SQLite-Datenbank und berühren keine persönlichen Daten. Geprüft werden Serien, Zeitumstellung, Ausfälle, Verschiebungen, RDATE, ganztägige und UTC-Termine, floating Zeiten, Eingabevalidierung, CRUD, Fälligkeitssortierung, Modul-Löschen, Reimport, Transaktions-Rollback, Datei-/Abo-Isolation, sichere Fehlerbehandlung, Verschlüsselung und die SSRF-Schutzmaßnahmen. Der echte persönliche Feed wird in Tests nicht abgerufen. Bei laufendem Server prüft `node scripts/smoke-subscription.mjs` außerdem beide Formularansichten und einen echten Formular-POST mit einem erfundenen, gesperrten Link.

Architektur: [ARCHITECTURE.md](ARCHITECTURE.md), Arbeitsschritte: [PLAN.md](PLAN.md), bekannte Grenzen und Prüfergebnisse: [STATUS.md](STATUS.md).

Kalenderverarbeitung basiert auf [ical.js](https://github.com/kewisch/ical.js) und dessen [Event-/Ausnahmen-API](https://kewisch.github.io/ical.js/api/ICAL.Event.html). Prisma 6 ist für den kleinen lokalen SQLite-Aufbau gewählt; ein späteres Major-Upgrade mit Treiberadapter wird separat geplant.
