// Service Worker para CSIA Campo
// Sub-fase 2C: push notifications reales

const CACHE_VERSION = 'csia-campo-v2';
// Rutas relativas: el navegador las resuelve respecto al scope del SW
const CACHE_FILES = [
  './',
  './app.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// === INSTALACIÓN ===
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versión', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.allSettled(
        CACHE_FILES.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] No se pudo cachear', url, err);
        }))
      );
    })
  );
  self.skipWaiting();
});

// === ACTIVACIÓN ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando versión', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        );
      }),
      self.clients.claim(),
    ])
  );
});

// === FETCH: network-first con fallback a cache ===
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./app.html');
          }
          return new Response('Offline y sin cache', { status: 503 });
        });
      })
  );
});

// === PUSH NOTIFICATIONS ===
// El servidor (Edge Function) envía un push con este formato:
// {
//   "title": "Nueva tarea asignada",
//   "body": "ACARRILEO en JCS1 · 3 ha",
//   "url": "./app.html",
//   "tag": "notif-123",
//   "data": { "prog_id": 42 }
// }

self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido');
  
  let payload = {
    title: 'CSIA Campo',
    body: 'Tenés una nueva notificación',
    url: './app.html',
    tag: 'csia-default'
  };
  
  // Parsear el contenido del push (JSON)
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      console.warn('[SW] Push sin JSON, usando defaults', e);
      payload.body = event.data.text() || payload.body;
    }
  }
  
  const options = {
    body: payload.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: payload.tag,                    // agrupa notifs con mismo tag
    renotify: true,                      // suena aunque haya otras con el mismo tag
    requireInteraction: false,           // se cierra sola
    vibrate: [200, 100, 200],            // patrón de vibración Android
    data: {
      url: payload.url || './app.html',
      ...payload.data
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Cerrar' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// === CLICK EN NOTIFICACIÓN ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Si tocaron "Cerrar", no abrir nada
  if (event.action === 'dismiss') return;
  
  const targetUrl = event.notification.data?.url || './app.html';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la app ya está abierta en alguna pestaña, enfocarla
      for (const client of clientList) {
        if (client.url.includes('/CSIA_CAMPO/') && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // Si no está abierta, abrir nueva pestaña
      return self.clients.openWindow(targetUrl);
    })
  );
});
