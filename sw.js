/**
 * iDragon Adventures — Service Worker
 * Cache-first strategy for offline play
 */

const CACHE_NAME = 'idragon-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './bg.png',
  './dino.png',
  './dragon.png',
  './music.mp3',
  './gameover.mp3',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;900&family=Rajdhani:wght@400;600;700&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
