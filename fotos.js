// Foto-Studio – macht Handyfotos für Vinted einheitlich: gleiches Format, gleich hell, gleiche Farben.
// Alles passiert im Browser. Kein Foto wird irgendwo hochgeladen.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const VORSCHAU = 480;        // Breite der Vorschau in Pixeln
const AUSGABE = 1600;        // längste Seite der gespeicherten Fotos
const MAX_QUELLE = 2400;     // größere Fotos werden beim Laden verkleinert (spart Speicher)
const ZIEL_HELLIGKEIT = 150; // mittlere Helligkeit (0–255), auf die „Automatisch aufhellen“ hinarbeitet

// Jedes Foto: { id, quelle (Canvas mit dem Original), auto (Werte fürs automatische Aufhellen), px, py (Ausschnitt 0–1), leinwand (Vorschau) }
let fotos = [];
let format = 0.8; // Breite geteilt durch Höhe – 4:5, so zeigt Vinted die Fotos an
// Die feste „Vinted-Einstellung“: aufgehellt, etwas mehr Kontrast und Farbe, minimal wärmer.
// Damit wirkt Kleidung frisch, ohne unnatürlich auszusehen. Hier ändern, wenn sie dir nicht gefällt.
const VINTED = { hell: 0, kontrast: 8, farbe: 6, waerme: 3 };
const einstellung = { ...VINTED, auto: true };
let zeigeOriginal = false;

const begrenzen = (x, min, max) => Math.min(max, Math.max(min, x));
const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

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

// ---------- Fotos laden ----------
async function ladeDateien(dateien) {
  const bilder = [...dateien].filter((d) => d.type.startsWith("image/"));
  const neue = []; // erst am Ende zu „fotos“ hinzufügen, damit nichts Halbfertiges gezeichnet wird
  for (const datei of bilder) {
    try {
      const bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
      const faktor = Math.min(1, MAX_QUELLE / Math.max(bild.width, bild.height));
      const quelle = document.createElement("canvas");
      quelle.width = Math.round(bild.width * faktor);
      quelle.height = Math.round(bild.height * faktor);
      quelle.getContext("2d").drawImage(bild, 0, 0, quelle.width, quelle.height);
      bild.close?.();
      neue.push({ id: neueId(), quelle, auto: autoWerte(quelle), px: 0.5, py: 0.5 });
    } catch {
      meldung("Ein Foto konnte nicht gelesen werden");
    }
  }
  fotos.push(...neue);
  aufbauen();
  if (bilder.length) meldung(bilder.length === 1 ? "1 Foto geladen" : `${bilder.length} Fotos geladen`);
}

// „Automatisch aufhellen“ in zwei Schritten, wie in Foto-Apps:
// 1. Tonwerte strecken: das hellste Stück des Fotos wird Weiß, das dunkelste Schwarz.
// 2. Aufhellen, bis das Foto im Schnitt ZIEL_HELLIGKEIT erreicht (durch probeweises Rechnen, Intervallhalbierung).
function autoWerte(quelle) {
  const klein = document.createElement("canvas");
  klein.width = klein.height = 64;
  const ctx = klein.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(quelle, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const werte = [];
  for (let i = 0; i < d.length; i += 4) werte.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const sortiert = [...werte].sort((a, b) => a - b);
  // die hellsten und dunkelsten 0,5 % zählen nicht mit (einzelne Lichtpunkte, Schatten)
  const schwarz = Math.min(sortiert[Math.floor(sortiert.length * 0.005)], 40);
  const weiss = Math.max(sortiert[Math.floor(sortiert.length * 0.995)], 140);
  const gestreckt = werte.map((v) => begrenzen((v - schwarz) / (weiss - schwarz), 0, 1));
  const mittelBei = (faktor) => gestreckt.reduce((s, v) => s + 255 * Math.pow(v, 1 / faktor), 0) / gestreckt.length;
  let unten = 0.7, oben = 2.0; // stärker aufhellen macht sehr dunkle Fotos nur noch körnig
  for (let schritt = 0; schritt < 18; schritt++) {
    const mitte = (unten + oben) / 2;
    if (mittelBei(mitte) < ZIEL_HELLIGKEIT) unten = mitte; else oben = mitte;
  }
  return { schwarz, weiss, faktor: (unten + oben) / 2 };
}
const OHNE_AUTO = { schwarz: 0, weiss: 255, faktor: 1 };

// ---------- Zuschneiden und Bearbeiten ----------
function ausschnitt(foto) {
  const { width: w, height: h } = foto.quelle;
  let aw, ah;
  if (w / h > format) { ah = h; aw = h * format; } else { aw = w; ah = w / format; }
  return { x: (w - aw) * foto.px, y: (h - ah) * foto.py, w: aw, h: ah, freiX: w - aw, freiY: h - ah };
}

function zeichneFoto(foto, ziel, breite, original = zeigeOriginal) {
  const hoehe = Math.round(breite / format);
  ziel.width = breite;
  ziel.height = hoehe;
  const ctx = ziel.getContext("2d", { willReadFrequently: true });
  const a = ausschnitt(foto);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto.quelle, a.x, a.y, a.w, a.h, 0, 0, breite, hoehe);
  if (!original) bearbeiten(ctx, breite, hoehe, foto);
}

function bearbeiten(ctx, w, h, foto) {
  const bild = ctx.getImageData(0, 0, w, h);
  const d = bild.data;
  const auto = einstellung.auto ? foto.auto : OHNE_AUTO;
  // Aufhellen per Gamma: dunkle Bereiche werden heller, Weiß bleibt Weiß
  const hell = auto.faktor * (1 + einstellung.hell / 100);
  const kontrast = 1 + einstellung.kontrast / 100;
  // stark aufgehellte Fotos wirken sonst zu bunt – deshalb die Farbe automatisch etwas zurücknehmen
  const farbe = (1 + einstellung.farbe / 100) / (1 + 0.4 * Math.max(0, auto.faktor - 1));
  const waerme = einstellung.waerme * 0.8;
  // Tabelle für Tonwerte, Helligkeit und Kontrast – schneller, als für jedes Pixel neu zu rechnen
  const tabelle = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const gestreckt = begrenzen((v - auto.schwarz) / (auto.weiss - auto.schwarz), 0, 1);
    tabelle[v] = (255 * Math.pow(gestreckt, 1 / hell) - 128) * kontrast + 128;
  }
  for (let i = 0; i < d.length; i += 4) {
    // Nur die Helligkeit eines Pixels ändern und die Farbe im gleichen Verhältnis mitnehmen –
    // so werden Farben beim Aufhellen nicht unnatürlich kräftig
    const hellwert = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const k = Math.max(tabelle[Math.round(hellwert)], 0) / Math.max(hellwert, 1);
    const r = d[i] * k + waerme;
    const g = d[i + 1] * k;
    const b = d[i + 2] * k - waerme;
    const grau = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i] = grau + (r - grau) * farbe;     // Uint8ClampedArray begrenzt automatisch auf 0–255
    d[i + 1] = grau + (g - grau) * farbe;
    d[i + 2] = grau + (b - grau) * farbe;
  }
  ctx.putImageData(bild, 0, 0);
}

// ---------- Anzeige ----------
function aufbauen() {
  const leer = fotos.length === 0;
  $("#ablage").hidden = !leer;
  $("#werkbank").hidden = leer;
  $("#bilder").replaceChildren(...fotos.map((foto, i) => {
    foto.leinwand = el("canvas", { "aria-label": `Foto ${i + 1}, ziehen zum Verschieben des Ausschnitts`, role: "img" });
    verschiebbar(foto);
    return el("li", { class: "bild" },
      foto.leinwand,
      el("div", { class: "bild-knoepfe" },
        el("button", { class: "knopf knopf-klein", type: "button", text: "Speichern", onclick: () => einzelnSpeichern(foto, i) }),
        el("button", { class: "knopf knopf-klein knopf-rot", type: "button", text: "×", "aria-label": `Foto ${i + 1} entfernen`, onclick: () => entfernen(foto) }),
      ),
    );
  }));
  alleZeichnen();
}

let geplant = false;
function alleZeichnen() {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => {
    geplant = false;
    fotos.forEach((foto) => { if (foto.leinwand) zeichneFoto(foto, foto.leinwand, VORSCHAU); });
  });
}

// Ausschnitt mit Finger oder Maus verschieben
function verschiebbar(foto) {
  const c = foto.leinwand;
  let start = null;
  c.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, px: foto.px, py: foto.py };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", (e) => {
    if (!start) return;
    const a = ausschnitt(foto);
    const massstab = a.w / c.clientWidth; // Bildschirm-Pixel -> Foto-Pixel
    if (a.freiX > 0) foto.px = begrenzen(start.px - ((e.clientX - start.x) * massstab) / a.freiX, 0, 1);
    if (a.freiY > 0) foto.py = begrenzen(start.py - ((e.clientY - start.y) * massstab) / a.freiY, 0, 1);
    zeichneFoto(foto, c, VORSCHAU);
  });
  const ende = () => { start = null; };
  c.addEventListener("pointerup", ende);
  c.addEventListener("pointercancel", ende);
}

function entfernen(foto) {
  fotos = fotos.filter((f) => f !== foto);
  aufbauen();
}

// ---------- Speichern ----------
function alsBlob(foto) {
  const c = document.createElement("canvas");
  zeichneFoto(foto, c, format >= 1 ? AUSGABE : Math.round(AUSGABE * format), false);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
}
const dateiname = (i) => `vinted-foto-${i + 1}.jpg`;

function herunterladen(blob, name) {
  const adresse = URL.createObjectURL(blob);
  const link = el("a", { href: adresse, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 4000);
}

async function einzelnSpeichern(foto, i) {
  herunterladen(await alsBlob(foto), dateiname(i));
  meldung("Foto gespeichert");
}

$("#alle-speichern").addEventListener("click", async () => {
  for (const [i, foto] of fotos.entries()) {
    herunterladen(await alsBlob(foto), dateiname(i));
    await new Promise((r) => setTimeout(r, 350)); // kurze Pause, sonst blockiert der Browser mehrere Downloads
  }
  meldung(fotos.length === 1 ? "Foto gespeichert" : `${fotos.length} Fotos gespeichert`);
});

// Am Handy: über „Teilen“ in die Galerie oder direkt in eine App (z. B. Vinted)
const kannTeilen = (() => {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File([""], "t.jpg", { type: "image/jpeg" })] }); }
  catch { return false; }
})();
$("#teilen").hidden = !kannTeilen;
$("#teilen").addEventListener("click", async () => {
  try {
    const dateien = await Promise.all(fotos.map(async (foto, i) => new File([await alsBlob(foto)], dateiname(i), { type: "image/jpeg" })));
    await navigator.share({ files: dateien });
  } catch (e) {
    if (e?.name !== "AbortError") meldung("Teilen hat nicht geklappt – nimm „Alle speichern“");
  }
});

$("#alle-weg").addEventListener("click", () => {
  if (!confirm("Alle Fotos aus dem Foto-Studio entfernen?")) return;
  fotos = [];
  aufbauen();
});

// ---------- Regler und Format ----------
const regler = { hell: "#r-hell", kontrast: "#r-kontrast", farbe: "#r-farbe", waerme: "#r-waerme" };
const anzeige = { hell: "#o-hell", kontrast: "#o-kontrast", farbe: "#o-farbe", waerme: "#o-waerme" };
for (const [name, sel] of Object.entries(regler)) {
  $(sel).addEventListener("input", (e) => {
    einstellung[name] = Number(e.target.value);
    $(anzeige[name]).textContent = (einstellung[name] > 0 ? "+" : "") + einstellung[name];
    alleZeichnen();
  });
}
$("#auto").addEventListener("change", (e) => { einstellung.auto = e.target.checked; alleZeichnen(); });

// Regler und Schalter auf die Vinted-Einstellung stellen (beim Start und mit dem Knopf)
function vintedEinstellung() {
  for (const [name, sel] of Object.entries(regler)) {
    einstellung[name] = VINTED[name];
    $(sel).value = VINTED[name];
    $(anzeige[name]).textContent = (VINTED[name] > 0 ? "+" : "") + VINTED[name];
  }
  einstellung.auto = true;
  $("#auto").checked = true;
}
$("#zuruecksetzen").addEventListener("click", () => {
  vintedEinstellung();
  setzeFormat(formatKnoepfe[0]);
  alleZeichnen();
});
$("#vorher").addEventListener("click", (e) => {
  zeigeOriginal = !zeigeOriginal;
  e.currentTarget.setAttribute("aria-pressed", String(zeigeOriginal));
  e.currentTarget.textContent = zeigeOriginal ? "Bearbeitet zeigen" : "Original zeigen";
  alleZeichnen();
});

const formatKnoepfe = $$("[data-format]");
function setzeFormat(knopf) {
  format = Number(knopf.dataset.format);
  formatKnoepfe.forEach((k) => {
    k.setAttribute("aria-checked", String(k === knopf));
    k.tabIndex = k === knopf ? 0 : -1;
  });
  alleZeichnen();
}
formatKnoepfe.forEach((k, i) => {
  k.addEventListener("click", () => setzeFormat(k));
  k.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const neu = formatKnoepfe[(i + (e.key === "ArrowRight" ? 1 : formatKnoepfe.length - 1)) % formatKnoepfe.length];
    setzeFormat(neu);
    neu.focus();
  });
});

// ---------- Fotos hinzufügen: Auswahl und Hineinziehen ----------
$("#fotos-datei").addEventListener("change", (e) => {
  ladeDateien(e.target.files);
  e.target.value = "";
});
["dragenter", "dragover"].forEach((art) => document.addEventListener(art, (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  $("#ablage").classList.add("ueber");
}));
["dragleave", "drop"].forEach((art) => document.addEventListener(art, () => $("#ablage").classList.remove("ueber")));
document.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  ladeDateien(e.dataTransfer.files);
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

vintedEinstellung();
setzeFormat(formatKnoepfe[0]); // der erste Knopf ist „Vinted 4:5“
aufbauen();
