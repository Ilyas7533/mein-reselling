// Mein Reselling – läuft komplett im Browser, gespeichert wird im localStorage des Geräts.
// Alle Geldbeträge werden in Cent gespeichert, damit beim Rechnen keine Rundungsfehler entstehen.

const SPEICHER = "reselling-v1";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let artikel = laden();
let verkaufId = null;   // welcher Artikel gerade im Fenster „Verkauft“ ist
let bearbeitenId = null; // welcher Artikel gerade bearbeitet wird (null = neuer Artikel)

// ---------- Speichern und Laden ----------
function laden() {
  try {
    const daten = JSON.parse(localStorage.getItem(SPEICHER));
    return Array.isArray(daten) ? daten : [];
  } catch {
    return [];
  }
}
function speichern() {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(artikel));
  } catch {
    meldung("Speichern hat nicht geklappt");
  }
}

// ---------- Fotos ----------
// Fotos sind zu groß für den localStorage. Sie liegen deshalb in der Browser-Datenbank
// (IndexedDB), gespeichert unter der ID des Artikels.
let dbVersprechen;
function datenbank() {
  dbVersprechen ??= new Promise((ok, nein) => {
    const anfrage = indexedDB.open("reselling-fotos", 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore("fotos");
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => nein(anfrage.error);
  });
  return dbVersprechen;
}
async function fotoAktion(modus, aktion) {
  const db = await datenbank();
  return new Promise((ok, nein) => {
    const tx = db.transaction("fotos", modus);
    const anfrage = aktion(tx.objectStore("fotos"));
    tx.oncomplete = () => ok(anfrage?.result);
    tx.onerror = () => nein(tx.error);
  });
}
const fotoSpeichern = (id, blob) => fotoAktion("readwrite", (s) => s.put(blob, id));
const fotoLaden = (id) => fotoAktion("readonly", (s) => s.get(id));
const fotoLoeschen = (id) => fotoAktion("readwrite", (s) => s.delete(id));
const alleFotosLoeschen = () => fotoAktion("readwrite", (s) => s.clear());

// Bereits geladene Fotos merken, damit die Liste nicht bei jedem Zeichnen neu lädt
const fotoAdressen = new Map();
async function fotoAdresse(id) {
  if (!fotoAdressen.has(id)) {
    const blob = await fotoLaden(id).catch(() => null);
    fotoAdressen.set(id, blob ? URL.createObjectURL(blob) : null);
  }
  return fotoAdressen.get(id);
}
function fotoVergessen(id) {
  const adresse = fotoAdressen.get(id);
  if (adresse) URL.revokeObjectURL(adresse);
  fotoAdressen.delete(id);
}

// Verkleinert ein Foto auf höchstens 640 px und speichert es als JPEG (ca. 40–80 KB)
async function verkleinern(datei, max = 640) {
  const bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
  const faktor = Math.min(1, max / Math.max(bild.width, bild.height));
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.round(bild.width * faktor);
  leinwand.height = Math.round(bild.height * faktor);
  leinwand.getContext("2d").drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  bild.close?.();
  return new Promise((ok) => leinwand.toBlob(ok, "image/jpeg", 0.82));
}

// Kleines Foto links in der Liste; ohne Foto der erste Buchstabe des Namens
function fotoKachel(a) {
  const kachel = el("div", { class: "foto" }, el("span", { text: (a.name || "?").trim().charAt(0).toUpperCase() }));
  if (a.foto) {
    fotoAdresse(a.id).then((adresse) => {
      if (adresse) kachel.replaceChildren(el("img", { src: adresse, alt: "" }));
    });
  }
  return kachel;
}

// ---------- Hilfen für Geld und Datum ----------
const geldFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euro = (cent) => geldFormat.format((cent || 0) / 100);

// Wandelt „12,50“, „12.5“ oder „1.234,50 €“ in Cent um. Leer = null, ungültig = NaN.
function zuCent(text) {
  let t = String(text ?? "").replace(/[\s€]/g, "");
  if (t === "") return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}
// Betrag für ein Eingabefeld, z. B. 1250 -> „12,50“
const zuText = (cent) => (cent == null ? "" : (cent / 100).toFixed(2).replace(".", ","));

function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function tageSeit(datum) {
  if (!datum) return 0;
  const [j, m, t] = datum.split("-").map(Number);
  const start = new Date(j, m - 1, t);
  const jetzt = new Date();
  jetzt.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((jetzt - start) / 86400000));
}
const monatVon = (datum) => (datum || "").slice(0, 7);
const monatName = (ym) => {
  const [j, m] = ym.split("-").map(Number);
  return new Date(j, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
};
const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const kostenVon = (a) => a.einkauf + (a.kosten || 0);
const gewinnVon = (a) => a.verkauf - a.einkauf - (a.kosten || 0) - (a.versand || 0);

// Kleines Werkzeug zum Bauen von Elementen (Text immer über textContent, nie als HTML)
function el(tag, eigenschaften = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschaften)) {
    if (k === "text") e.textContent = v;
    else if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kind of kinder) if (kind) e.append(kind);
  return e;
}

// ---------- Anzeige ----------
function zeichnen() {
  zeichneZahlen();
  zeichneLager();
  zeichneVerkauft();
}

function zeichneZahlen() {
  const lager = artikel.filter((a) => a.status === "lager");
  const verkauft = artikel.filter((a) => a.status === "verkauft");
  const diesMonat = monatVon(heute());
  const gewinnMonat = verkauft.filter((a) => monatVon(a.verkaufsdatum) === diesMonat).reduce((s, a) => s + gewinnVon(a), 0);
  const gewinnGesamt = verkauft.reduce((s, a) => s + gewinnVon(a), 0);

  $("#z-monat").textContent = euro(gewinnMonat);
  $("#z-gesamt").textContent = euro(gewinnGesamt);
  $("#z-lager").textContent = lager.length;
  $("#z-lagerwert").textContent = `für ${euro(lager.reduce((s, a) => s + kostenVon(a), 0))} eingekauft`;
  $("#z-verkauft").textContent = verkauft.length;
  $("#z-umsatz").textContent = `${euro(verkauft.reduce((s, a) => s + a.verkauf, 0))} Umsatz`;
}

function passtZurSuche(a, suche) {
  if (!suche) return true;
  return [a.name, a.marke, a.groesse, a.notiz].join(" ").toLowerCase().includes(suche.toLowerCase());
}

function zeichneLager() {
  const suche = $("#suche-lager").value.trim();
  const sortierung = $("#sort-lager").value;
  const liste = artikel.filter((a) => a.status === "lager" && passtZurSuche(a, suche));
  liste.sort((x, y) => {
    if (sortierung === "name") return x.name.localeCompare(y.name, "de");
    if (sortierung === "neu") return (y.kaufdatum || "").localeCompare(x.kaufdatum || "");
    return (x.kaufdatum || "").localeCompare(y.kaufdatum || "");
  });

  const ul = $("#liste-lager");
  ul.replaceChildren(...liste.map((a) => {
    const tage = tageSeit(a.kaufdatum);
    const stufe = tage >= 60 ? " etikett-sehr-alt" : tage >= 30 ? " etikett-alt" : "";
    const details = [a.marke, a.groesse && `Größe ${a.groesse}`].filter(Boolean).join(" · ");
    return el("li", { class: "eintrag" },
      fotoKachel(a),
      el("div", { class: "text" },
        el("h3", { text: a.name }),
        el("div", { class: "info" },
          details ? el("span", { text: details }) : null,
          el("span", { class: `etikett${stufe}`, text: tage === 0 ? "seit heute" : tage === 1 ? "seit 1 Tag" : `seit ${tage} Tagen` }),
        ),
      ),
      el("div", { class: "preis" }, euro(kostenVon(a)), el("small", { text: "Einkauf" })),
      el("div", { class: "aktionen" },
        el("button", { class: "knopf knopf-hell knopf-klein", type: "button", text: "Verkauft", onclick: () => oeffneVerkauf(a.id) }),
        el("button", { class: "knopf knopf-klein", type: "button", text: "Preis berechnen", onclick: () => preisFuer(a) }),
        el("button", { class: "knopf knopf-klein", type: "button", text: "Bearbeiten", onclick: () => oeffneArtikel(a.id) }),
      ),
    );
  }));
  const leer = $("#leer-lager");
  leer.hidden = liste.length > 0;
  if (suche) leer.textContent = "Nichts gefunden.";
  else leer.replaceChildren("Noch nichts im Lager. Tippe oben auf ", el("b", { text: "+ Artikel" }), ".");
}

function zeichneMonate() {
  const auswahl = $("#monat-verkauft");
  const vorher = auswahl.value;
  const monate = [...new Set(artikel.filter((a) => a.status === "verkauft").map((a) => monatVon(a.verkaufsdatum)).filter(Boolean))].sort().reverse();
  auswahl.replaceChildren(el("option", { value: "alle", text: "Alle Monate" }), ...monate.map((m) => el("option", { value: m, text: monatName(m) })));
  auswahl.value = monate.includes(vorher) ? vorher : "alle";
}

function zeichneVerkauft() {
  zeichneMonate();
  const suche = $("#suche-verkauft").value.trim();
  const monat = $("#monat-verkauft").value;
  const liste = artikel
    .filter((a) => a.status === "verkauft" && passtZurSuche(a, suche) && (monat === "alle" || monatVon(a.verkaufsdatum) === monat))
    .sort((x, y) => (y.verkaufsdatum || "").localeCompare(x.verkaufsdatum || ""));

  const gewinn = liste.reduce((s, a) => s + gewinnVon(a), 0);
  const umsatz = liste.reduce((s, a) => s + a.verkauf, 0);
  const summe = $("#summe-verkauft");
  summe.replaceChildren();
  if (liste.length) {
    summe.append(`${liste.length} ${liste.length === 1 ? "Verkauf" : "Verkäufe"} · Umsatz `, el("b", { text: euro(umsatz) }), " · Gewinn ", el("b", { class: gewinn < 0 ? "minus" : "plus", text: euro(gewinn) }));
  }

  $("#liste-verkauft").replaceChildren(...liste.map((a) => {
    const g = gewinnVon(a);
    return el("li", { class: "eintrag" },
      fotoKachel(a),
      el("div", { class: "text" },
        el("h3", { text: a.name }),
        el("div", { class: "info", text: `gekauft für ${euro(kostenVon(a))}${a.versand ? ` · Versand ${euro(a.versand)}` : ""}` }),
      ),
      el("div", { class: "preis" }, euro(a.verkauf), el("small", { class: g < 0 ? "minus" : "plus", text: `${g >= 0 ? "+" : ""}${euro(g)} Gewinn` })),
      el("div", { class: "aktionen" },
        el("button", { class: "knopf knopf-klein", type: "button", text: "Bearbeiten", onclick: () => oeffneVerkauf(a.id) }),
      ),
    );
  }));
  $("#leer-verkauft").hidden = liste.length > 0;
}

// ---------- Fenster: Artikel ----------
const fArtikel = $("#f-artikel");
const formArtikel = $("#form-artikel");
let neuesFoto; // undefined = unverändert, null = entfernt, Blob = neues Foto
let vorschauAdresse = null;

function zeigeFotoVorschau(adresse) {
  if (vorschauAdresse && vorschauAdresse !== adresse && !fotoAdressenWerte().includes(vorschauAdresse)) URL.revokeObjectURL(vorschauAdresse);
  vorschauAdresse = adresse;
  $("#foto-vorschau").replaceChildren(adresse ? el("img", { src: adresse, alt: "" }) : el("span", { text: "Kein Foto" }));
  $("#foto-entfernen").hidden = !adresse;
  $("#foto-waehlen").textContent = adresse ? "Foto ändern" : "Foto hinzufügen";
}
const fotoAdressenWerte = () => [...fotoAdressen.values()];

$("#foto-datei").addEventListener("change", async (e) => {
  const datei = e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  try {
    neuesFoto = await verkleinern(datei);
    zeigeFotoVorschau(URL.createObjectURL(neuesFoto));
  } catch {
    meldung("Dieses Foto kann nicht gelesen werden");
  }
});
$("#foto-entfernen").addEventListener("click", () => {
  neuesFoto = null;
  zeigeFotoVorschau(null);
});

async function oeffneArtikel(id = null) {
  bearbeitenId = id;
  neuesFoto = undefined;
  formArtikel.reset();
  $("#fehler-artikel").hidden = true;
  const a = artikel.find((x) => x.id === id);
  zeigeFotoVorschau(a?.foto ? await fotoAdresse(a.id) : null);
  $("#f-artikel-titel").textContent = a ? "Artikel bearbeiten" : "Neuer Artikel";
  $("#loeschen").hidden = !a;
  const f = formArtikel.elements;
  f.name.value = a?.name ?? "";
  f.marke.value = a?.marke ?? "";
  f.groesse.value = a?.groesse ?? "";
  f.einkauf.value = a ? zuText(a.einkauf) : "";
  f.kosten.value = a?.kosten ? zuText(a.kosten) : "";
  f.notiz.value = a?.notiz ?? "";
  fArtikel.showModal();
  f.name.focus();
}

formArtikel.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formArtikel.elements;
  const einkauf = zuCent(f.einkauf.value);
  const kosten = zuCent(f.kosten.value);
  const fehler = !f.name.value.trim() ? "Bitte gib an, was es ist."
    : einkauf == null ? "Bitte gib den Einkaufspreis an (0 geht auch)."
    : Number.isNaN(einkauf) || Number.isNaN(kosten) ? "Bitte Beträge so eingeben: 12,50"
    : "";
  if (fehler) {
    $("#fehler-artikel").textContent = fehler;
    $("#fehler-artikel").hidden = false;
    return;
  }
  const werte = {
    name: f.name.value.trim(),
    marke: f.marke.value.trim(),
    groesse: f.groesse.value.trim(),
    einkauf,
    kosten: kosten || 0,
    notiz: f.notiz.value.trim(),
  };
  let ziel = artikel.find((x) => x.id === bearbeitenId);
  const warDa = Boolean(ziel);
  if (ziel) Object.assign(ziel, werte);
  // Das Datum wird nicht angezeigt, aber gemerkt (für „seit … Tagen“ und die Sortierung)
  else artikel.push(ziel = { id: neueId(), status: "lager", kaufdatum: heute(), ...werte });

  // Foto speichern oder entfernen
  try {
    if (neuesFoto) {
      await fotoSpeichern(ziel.id, neuesFoto);
      fotoVergessen(ziel.id);
      ziel.foto = true;
    } else if (neuesFoto === null) {
      await fotoLoeschen(ziel.id);
      fotoVergessen(ziel.id);
      delete ziel.foto;
    }
  } catch {
    meldung("Das Foto konnte nicht gespeichert werden");
  }
  speichern();
  fArtikel.close();
  zeichnen();
  meldung(warDa ? "Gespeichert" : "Ins Lager gelegt");
});

$("#loeschen").addEventListener("click", async () => {
  const a = artikel.find((x) => x.id === bearbeitenId);
  if (!a || !confirm(`„${a.name}“ wirklich löschen?`)) return;
  artikel = artikel.filter((x) => x.id !== bearbeitenId);
  if (a.foto) {
    await fotoLoeschen(a.id).catch(() => {});
    fotoVergessen(a.id);
  }
  speichern();
  fArtikel.close();
  zeichnen();
  meldung("Gelöscht");
});

// ---------- Fenster: Verkauft ----------
const fVerkauf = $("#f-verkauf");
const formVerkauf = $("#form-verkauf");

function oeffneVerkauf(id) {
  const a = artikel.find((x) => x.id === id);
  if (!a) return;
  verkaufId = id;
  formVerkauf.reset();
  $("#fehler-verkauf").hidden = true;
  const f = formVerkauf.elements;
  $("#f-verkauf-titel").textContent = a.status === "verkauft" ? "Verkauf bearbeiten" : "Verkauft";
  $("#verkauf-name").textContent = `${a.name} · gekauft für ${euro(kostenVon(a))}`;
  f.verkauf.value = a.status === "verkauft" ? zuText(a.verkauf) : "";
  f.versand.value = a.versand ? zuText(a.versand) : "";
  $("#zurueck-lager").hidden = a.status !== "verkauft";
  zeigeGewinnVorschau();
  fVerkauf.showModal();
  f.verkauf.focus();
}

function zeigeGewinnVorschau() {
  const a = artikel.find((x) => x.id === verkaufId);
  const f = formVerkauf.elements;
  const verkauf = zuCent(f.verkauf.value);
  const versand = zuCent(f.versand.value) || 0;
  const ziel = $("#verkauf-gewinn");
  if (!a || verkauf == null || Number.isNaN(verkauf) || Number.isNaN(versand)) { ziel.textContent = ""; return; }
  const g = verkauf - kostenVon(a) - versand;
  ziel.textContent = `Dein Gewinn: ${g >= 0 ? "+" : ""}${euro(g)}`;
  ziel.className = `vorschau ${g < 0 ? "minus" : "plus"}`;
}
formVerkauf.addEventListener("input", zeigeGewinnVorschau);

formVerkauf.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = formVerkauf.elements;
  const verkauf = zuCent(f.verkauf.value);
  const versand = zuCent(f.versand.value);
  const fehler = verkauf == null ? "Bitte gib den Verkaufspreis an."
    : Number.isNaN(verkauf) || Number.isNaN(versand) ? "Bitte Beträge so eingeben: 12,50"
    : "";
  if (fehler) {
    $("#fehler-verkauf").textContent = fehler;
    $("#fehler-verkauf").hidden = false;
    return;
  }
  const a = artikel.find((x) => x.id === verkaufId);
  // Verkaufsdatum wird automatisch gemerkt (für „Gewinn diesen Monat“); beim Bearbeiten bleibt das alte
  Object.assign(a, { status: "verkauft", verkauf, versand: versand || 0, verkaufsdatum: a.verkaufsdatum ?? heute() });
  speichern();
  fVerkauf.close();
  zeichnen();
  meldung(`Verkauft – Gewinn ${euro(gewinnVon(a))}`);
});

$("#zurueck-lager").addEventListener("click", () => {
  const a = artikel.find((x) => x.id === verkaufId);
  if (!a) return;
  a.status = "lager";
  delete a.verkauf;
  delete a.versand;
  delete a.verkaufsdatum;
  speichern();
  fVerkauf.close();
  zeichnen();
  meldung("Zurück im Lager");
});

$$("[data-schliessen]").forEach((k) => k.addEventListener("click", () => k.closest("dialog").close()));
$("[data-neu]").addEventListener("click", () => oeffneArtikel());

// ---------- Reiter ----------
const reiter = $$('[role="tab"]');
function zeigeReiter(knopf) {
  reiter.forEach((r) => {
    const an = r === knopf;
    r.setAttribute("aria-selected", String(an));
    r.tabIndex = an ? 0 : -1;
    document.getElementById(r.getAttribute("aria-controls")).hidden = !an;
  });
}
reiter.forEach((r, i) => {
  r.addEventListener("click", () => zeigeReiter(r));
  r.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const neu = reiter[(i + (e.key === "ArrowRight" ? 1 : reiter.length - 1)) % reiter.length];
    zeigeReiter(neu);
    neu.focus();
  });
});

// ---------- Preisrechner ----------
function rechnen() {
  const einkauf = zuCent($("#p-einkauf").value);
  const kosten = zuCent($("#p-kosten").value) || 0;
  const wunsch = zuCent($("#p-wunsch").value) ?? 1000;
  const mindest = zuCent($("#p-mindest").value) ?? 500;
  const hinweis = $("#p-hinweis");
  if (einkauf == null || [einkauf, kosten, wunsch, mindest].some(Number.isNaN)) {
    $("#p-ansetzen").textContent = "–";
    $("#p-unter").textContent = "–";
    hinweis.textContent = einkauf == null ? "Gib oben deinen Einkaufspreis ein." : "Bitte Beträge so eingeben: 12,50";
    return;
  }
  const basis = einkauf + kosten;
  // auf volle Euro aufrunden, das sieht in der Anzeige besser aus
  const ansetzen = Math.ceil((basis + wunsch) / 100) * 100;
  const unter = Math.ceil((basis + mindest) / 100) * 100;
  $("#p-ansetzen").textContent = euro(ansetzen);
  $("#p-unter").textContent = euro(Math.min(unter, ansetzen));
  hinweis.textContent = mindest > wunsch
    ? "Dein Mindestgewinn ist höher als dein Wunschgewinn – dann gibt es keinen Spielraum für Preisvorschläge."
    : `So bleiben dir zwischen ${euro(Math.min(unter, ansetzen) - basis)} und ${euro(ansetzen - basis)} Gewinn. Versand und Käuferschutz zahlt auf Vinted der Käufer.`;
}
$("#rechner").addEventListener("input", rechnen);
$("#rechner").addEventListener("submit", (e) => e.preventDefault());

function preisFuer(a) {
  $("#p-einkauf").value = zuText(a.einkauf);
  $("#p-kosten").value = a.kosten ? zuText(a.kosten) : "";
  zeigeReiter($("#r-rechner"));
  rechnen();
  $("#p-wunsch").focus();
}

// ---------- Sichern und Laden ----------
const alsText = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

$("#sichern").addEventListener("click", async () => {
  // Fotos kommen als Text (data:image/jpeg;base64,…) mit in die Sicherung
  const mitFotos = await Promise.all(artikel.map(async (a) => {
    if (!a.foto) return a;
    const blob = await fotoLaden(a.id).catch(() => null);
    return blob ? { ...a, fotoDaten: await alsText(blob) } : a;
  }));
  const daten = JSON.stringify({ app: "mein-reselling", version: 2, gesichert: new Date().toISOString(), artikel: mitFotos }, null, 2);
  const link = el("a", { href: URL.createObjectURL(new Blob([daten], { type: "application/json" })), download: `reselling-sicherung-${heute()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  meldung("Sicherung heruntergeladen");
});

$("#laden").addEventListener("change", async (e) => {
  const datei = e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  try {
    const daten = JSON.parse(await datei.text());
    const liste = Array.isArray(daten) ? daten : daten.artikel;
    const gueltig = Array.isArray(liste) && liste.every((a) => a && typeof a.name === "string" && Number.isInteger(a.einkauf) && (a.status === "lager" || a.status === "verkauft"));
    if (!gueltig) throw new Error("ungültig");
    if (!confirm(`${liste.length} Artikel laden? Deine aktuellen Daten werden dabei ersetzt.`)) return;
    await alleFotosLoeschen().catch(() => {});
    fotoAdressen.forEach((adresse) => adresse && URL.revokeObjectURL(adresse));
    fotoAdressen.clear();
    for (const a of liste) {
      if (typeof a.fotoDaten === "string" && a.fotoDaten.startsWith("data:image/")) {
        await fotoSpeichern(a.id, await (await fetch(a.fotoDaten)).blob());
        a.foto = true;
      } else {
        delete a.foto;
      }
      delete a.fotoDaten;
    }
    artikel = liste;
    speichern();
    zeichnen();
    meldung("Daten geladen");
  } catch {
    meldung("Diese Datei ist keine gültige Sicherung");
  }
});

// ---------- Meldung unten ----------
let meldungZeit;
function meldung(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("zeigen");
  clearTimeout(meldungZeit);
  meldungZeit = setTimeout(() => t.classList.remove("zeigen"), 2400);
}

// ---------- Start ----------
["#suche-lager", "#sort-lager"].forEach((s) => $(s).addEventListener("input", zeichneLager));
["#suche-verkauft", "#monat-verkauft"].forEach((s) => $(s).addEventListener("input", zeichneVerkauft));
zeigeReiter($("#r-lager"));
zeichnen();
rechnen();
