const CACHE = 'golf-pwa-v65';
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');
const ASSETS = [
  BASE + '/index.html',
  BASE + '/games.html',
  BASE + '/edit-round.html',
  BASE + '/f1.html',
  BASE + '/banker.html',
  BASE + '/practice.html',
  BASE + '/history.html',
  BASE + '/wolf.html',
  BASE + '/scramble.html',
  BASE + '/foursomes.html',
  BASE + '/vegas.html',
  BASE + '/season.html',
  BASE + '/season.js',
  BASE + '/matchplay.html',
  BASE + '/courses.json',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('Failed to cache:', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always fetch HTML fresh from network; fall back to cache if offline
  if(e.request.destination === 'document'){
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
