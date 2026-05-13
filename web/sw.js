const CACHE = 'hangman-pwa-v11';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'assets/words.json',
  'assets/arnamu.ttf',
  'assets/arrow.png',
  'assets/arrow_disabled.png',
  'assets/texture-tile.png',
  'assets/happymarduk.png',
  'assets/sm_0.png',
  'assets/sm_1.png',
  'assets/sm_2.png',
  'assets/sm_3.png',
  'assets/sm_4.png',
  'assets/sm_5.png',
  'assets/sm_6.png',
  'assets/sm_7.png',
  'assets/sm_8.png',
  'assets/sm_9.png',
  'assets/sm_10.png',
  'assets/sm_11.png',
  'assets/sm_12.png',
  'assets/sm_13.png',
  'assets/sm_14.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
