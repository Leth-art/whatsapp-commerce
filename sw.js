/**
 * sw.js — Service Worker WaziBot Dashboard PWA
 * Cache statique + stratégie network-first pour l'API
 */

const CACHE_NAME = 'wazibot-v1';
const STATIC_ASSETS = [
  '/merchant',
  '/merchant.html',
  '/favicon.svg',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap',
];

// ─── INSTALL — mise en cache des assets statiques ─────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing WaziBot PWA...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { mode: 'no-cors' });
      })).catch(() => {
        // Ignore individual failures
      });
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE — nettoyage des anciens caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating WaziBot PWA...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH — stratégie de cache ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls — toujours network first, jamais de cache
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/analytics/') ||
      url.pathname.startsWith('/boutique/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Pas de connexion. Vérifiez votre réseau.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Fonts Google — cache first
  if (url.origin === 'https://fonts.googleapis.com' || 
      url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Dashboard marchand — network first, fallback cache
  if (url.pathname === '/merchant' || url.pathname === '/merchant.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/merchant') || caches.match('/merchant.html'))
    );
    return;
  }

  // Default — network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'WaziBot', body: 'Nouvelle activité sur votre boutique', icon: '/icons/icon-192.png' };
  
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch(e) {}

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'wazibot-notif',
    renotify: true,
    data: { url: data.url || '/merchant' },
    actions: [
      { action: 'open', title: 'Voir', icon: '/icons/icon-96.png' },
      { action: 'close', title: 'Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/merchant';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si l'app est déjà ouverte, la mettre au premier plan
      for (const client of windowClients) {
        if (client.url.includes('/merchant') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir un nouvel onglet
      return clients.openWindow(url);
    })
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // Sync des commandes en attente si connexion perdue puis rétablie
  console.log('[SW] Background sync: orders');
}