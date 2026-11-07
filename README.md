# Mein Reselling

Kleine App für Vinted-Reselling: Lager, Verkäufe, Gewinn und ein Preisrechner.

## Benutzen

`index.html` doppelt anklicken – die App öffnet sich im Browser. Es braucht kein Internet und keine Installation.

- **+ Artikel**: Teil ins Lager legen (Einkaufspreis, Kaufdatum, Marke, Größe, Notiz).
- **Verkauft**: Verkaufspreis eintragen – der Gewinn wird automatisch ausgerechnet.
- **Preis berechnen**: übernimmt den Einkaufspreis in den Preisrechner.
- **Preisrechner**: Wunschgewinn und Mindestgewinn eingeben → Preis zum Ansetzen und die Grenze für Preisvorschläge (auf volle Euro aufgerundet).
- Die Markierung „seit … Tagen“ wird ab 30 Tagen gelb und ab 60 Tagen rot.

## Daten

Alles wird im Browser auf diesem Gerät gespeichert (`localStorage`, Schlüssel `reselling-v1`). Wer die Browserdaten löscht, löscht auch die Artikel. Darum ab und zu **Daten sichern** – das lädt eine `.json`-Datei herunter, die man mit **Daten laden** wieder einspielen kann (auch auf einem anderen Gerät).

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
