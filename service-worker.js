const CACHE_NAME = 'agenda-shell-v3.7.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=3.7.0',
  './manifest.json',
  './js/app.js?v=3.7.0',
  './js/store.js?v=3.7.0',
  './js/push-config.js?v=3.7.0',
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


// Notifications Web Push AGENDA v3.5
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || 'Nouveau rappel familial.' }; }

  const title = payload.title || 'AGENDA';
  const options = {
    body: payload.body || 'Un rappel familial vous attend.',
    icon: './assets/icons/agenda_app_icon_192x192.png',
    badge: './assets/icons/agenda_app_icon_96x96.png',
    tag: payload.tag || `agenda-${Date.now()}`,
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || './', ...payload.data },
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let relativeTarget = data.url || './';

  if (event.action === 'snooze' && data.entityType && data.entityId) {
    const params = new URLSearchParams({
      notificationAction: 'snooze',
      entityType: String(data.entityType),
      entityId: String(data.entityId),
      minutes: String(data.snoozeMinutes || 30)
    });
    relativeTarget = `./?${params.toString()}`;
  } else if (event.action === 'complete-task' && data.entityId) {
    const params = new URLSearchParams({
      notificationAction: 'completeTask',
      entityType: 'task',
      entityId: String(data.entityId)
    });
    relativeTarget = `./?${params.toString()}`;
  }

  const target = new URL(relativeTarget, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== target) {
            try { await client.navigate(target); } catch { /* navigation optionnelle */ }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
