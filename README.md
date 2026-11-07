# Mein Reselling

Kleine App für Vinted-Reselling: Lager, Verkäufe, Gewinn und ein Preisrechner.

## Benutzen

`index.html` doppelt anklicken – die App öffnet sich im Browser. Es braucht kein Internet und keine Installation.

- **+ Artikel**: Teil ins Lager legen (bis zu 8 Fotos – das erste ist das Titelbild in der Liste, Antippen eines anderen Fotos macht es zum Titelbild –, Einkaufspreis, Marke, Größe, Notiz). Ein Datum muss man nicht eintragen: Kauf- und Verkaufstag merkt sich die App automatisch (für „seit … Tagen“ und „Gewinn diesen Monat“).
- **Verkauft**: Verkaufspreis eintragen – der Gewinn wird automatisch ausgerechnet.
- **Preis berechnen**: übernimmt den Einkaufspreis in den Preisrechner.
- **Preisrechner**: Wunschgewinn und Mindestgewinn eingeben → Preis zum Ansetzen und die Grenze für Preisvorschläge (auf volle Euro aufgerundet).
- Die Markierung „seit … Tagen“ wird ab 30 Tagen gelb und ab 60 Tagen rot.

## Daten

Alles wird im Browser auf diesem Gerät gespeichert: die Artikel im `localStorage` (Schlüssel `reselling-v1`), die Fotos in der Browser-Datenbank IndexedDB (`reselling-fotos`, gespeichert unter der ID des Artikels). Fotos werden beim Hinzufügen auf höchstens 640 px verkleinert. Wer die Browserdaten löscht, löscht auch Artikel und Fotos. Darum ab und zu **Daten sichern** – das lädt eine `.json`-Datei mit allen Artikeln und Fotos herunter, die man mit **Daten laden** wieder einspielen kann (auch auf einem anderen Gerät).

## Aufbau

- `index.html` – Seite und Fenster
- `style.css` – Aussehen (Handy und PC)
- `app.js` – Logik; Geldbeträge werden in Cent gespeichert, damit keine Rundungsfehler entstehen

Ein Artikel sieht gespeichert so aus:

```json
{ "id": "…", "status": "lager", "name": "Nike Hoodie", "marke": "Nike", "groesse": "M",
  "einkauf": 800, "kosten": 0, "kaufdatum": "2026-11-07", "notiz": "" }
```

Nach dem Verkauf kommen `verkauf`, `versand` (beides in Cent) und `verkaufsdatum` dazu, und `status` wird `"verkauft"`.
