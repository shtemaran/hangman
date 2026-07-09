const CACHE = 'hangman-pwa-v27';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'picker.js',
  'character.js',
  'manifest.webmanifest',
  'assets/words.json',
  'assets/arnamu.ttf',
  'assets/texture-tile.png',
  'assets/happymarduk.png',
  'assets/sm_0.png',
  // Animation rig (in-game figure): replaces the sm_1..sm_14 stage PNGs.
  'assets/marduk_semantic.svg',
  'rig/rig.js',
  'rig/cage.js',
  'rig/character.js',
  'rig/face_targets.json',
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
