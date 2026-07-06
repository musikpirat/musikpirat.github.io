/**
 * Service Worker — dual-cache strategy for ccMixter2go.
 *
 * Caches:
 *   - ccmixter2go: MP3 files (cache-first)
 *   - ccmixter2goWebData: app shell assets (network-first, 5s timeout fallback)
 *
 * API requests (/api/query) always go to network, never cached.
 */

const MP3_CACHE = 'ccmixter2go';
const APP_CACHE = 'ccmixter2goWebData';
const VALID_CACHES = new Set([MP3_CACHE, APP_CACHE]);

const APP_SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './api.js',
  './db.js',
  './player.js',
  './ui.js',
  './swipe.js',
  './shuffle.js',
  './song-parser.js',
  './title-scroller.js',
  './manifest.json',
];

const NETWORK_TIMEOUT = 5000;

// --- Install ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// --- Activate ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => !VALID_CACHES.has(n)).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests — always network, never cached
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cross-origin requests — let the browser handle them directly
  if (url.origin !== self.location.origin) {
    return;
  }

  // MP3 files — cache-first
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(MP3_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            // Notify all clients that caching is complete
            self.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({ msg: 'progress', percent: 100 });
              });
            });
            return response;
          });
        })
      )
    );
    return;
  }

  // Everything else — network-first with 5s timeout, fallback to app cache
  event.respondWith(
    networkFirstWithTimeout(event.request)
  );
});

/**
 * Try network first with a timeout, falling back to the app cache.
 */
async function networkFirstWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    // Update cache with fresh response
    const cache = await caches.open(APP_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    clearTimeout(timeoutId);
    const cached = await caches.match(request);
    if (cached) return cached;
    // If nothing in cache either, return a basic offline response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
