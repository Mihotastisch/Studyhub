# Kalenderabonnements – Erweiterungsplan

- [x] Bestehenden Dateiimport, ICS-Adapter und Quellenmodell prüfen.
- [x] SyncSource additiv um verschlüsselte URL, HMAC-Kennung und Importfenster erweitern; keine bestehenden Datensätze verändern.
- [x] Serverseitigen HTTPS-Abruf mit exakter Host-Allowlist, Prüfung aller DNS-Antworten, IP-Pinning, TLS-Hostprüfung, Redirect-Verbot, Gesamtzeit- und Größenlimit ergänzen.
- [x] Bestehenden ICS-Parser verwenden; Abonnements anhand Quelle/UID/Wiederholungszeit upserten. Fehlende Vorkommen aus Sicherheitsgründen behalten. Keine Quelle anderer Importwege verändern.
- [x] Separates Abonnementformular und manuelle Synchronisierung integrieren. Keine URL an den Browser zurückgeben, loggen oder in Git speichern.
- [x] Datei- und URL-Import sowie SSRF, Verschlüsselung, Fehlerfälle und Datenbestandserhalt testen. Migration, Lint, TypeScript und Build prüfen.
