// ERSA Takip — basit kabuk önbelleği. Veri (Apps Script) her zaman canlı çekilir.
const CACHE = "ersa-takip-v1";
const SHELL = [
  "./", "./index.html", "./app.js", "./config.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Apps Script / API çağrıları: her zaman ağdan (önbelleğe alma)
  if (url.hostname.includes("script.google.com") || e.request.method !== "GET") return;
  // Kabuk dosyaları: önce önbellek, yoksa ağ
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
