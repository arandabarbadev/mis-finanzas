// Service worker: precache del shell + CDN para que la app abra offline
const CACHE = 'misfinanzas-v2';
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
  ));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // cache-first para lo estático; el resto pasa directo a la red
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
