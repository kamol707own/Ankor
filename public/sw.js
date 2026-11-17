const CACHE = 'ankor-v8';
// Only immutable, hashed-free static files are precached. The HTML shell is
// deliberately NOT cached: a cached shell points at old asset hashes after a
// deploy, which yields a completely unstyled page.
const ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/favicon.ico',
  '/favicon-48x48.png',
  '/favicon-32x32.png',
  '/favicon.svg',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Let API calls (Supabase, AI providers, fonts) go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Always fetch the HTML shell from the network so it references the assets
  // that actually exist in the current deployment.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request));
    return;
  }

  // Hashed static assets are immutable → cache first.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      });
    }),
  );
});
