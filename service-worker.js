const CACHE_NAME = 'agenda-shell-v3.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=3.2.0',
  './manifest.json',
  './js/app.js?v=3.2.0',
  './js/store.js?v=3.2.0',
  './assets/brand/logo-horizontal.svg',
  './assets/brand/logo-symbol.svg',
  './assets/brand/logo-symbol-light.svg',
  './assets/icons/agenda_app_icon_192x192.png',
  './assets/icons/agenda_app_icon_512x512.png'
];
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        // Le SDK est mis en cache lorsqu’il est joignable, sans bloquer l’installation.
        try { await cache.add(new Request(SUPABASE_SDK, { mode: 'cors' })); } catch { /* reprise réseau au prochain lancement */ }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Les appels Supabase contiennent des données privées : jamais de cache.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Le fichier de configuration est généré à chaque déploiement.
  // Réseau en priorité afin qu’une nouvelle URL/clé Supabase remplace immédiatement l’ancienne.
  if (url.origin === self.location.origin && url.pathname.endsWith('/js/config.js')) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
        .then((response) => {
          if (response?.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // SDK Supabase : cache-first pour permettre le redémarrage hors ligne.
  if (url.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response?.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
