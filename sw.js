// Service worker: la red manda (los cambios de Pages llegan al instante)
// y la caché queda solo como respaldo para abrir offline.
const CACHE = 'misfinanzas-v4';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './firebase.js',
  './db.js',
  './app.js',
  './manifest.webmanifest',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(claves =>
    Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const mismoOrigen = new URL(e.request.url).origin === location.origin;

  if (!mismoOrigen){
    // CDN con versión en la URL (inmutables): caché primero
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // Archivos propios: RED primero y caché de respaldo (así los updates llegan ya)
  e.respondWith(
    fetch(e.request).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
