// Offline-Speicher: legt die App-Dateien im Handy ab, damit „Mein Reselling“ auch ohne Internet startet.
// Bei jeder neuen Version die Nummer erhöhen, dann holt sich das Handy die neuen Dateien.
const VERSION = "reselling-2";
const DATEIEN = ["./", "index.html", "style.css", "app.js", "fotos.html", "fotos.css", "fotos.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Erst das Internet fragen (damit Änderungen sofort ankommen), ohne Internet den Speicher nehmen
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(VERSION).then((c) => c.put(e.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(e.request).then((t) => t || caches.match("index.html"))),
  );
});
