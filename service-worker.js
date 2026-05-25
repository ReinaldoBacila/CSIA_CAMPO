// Service Worker para CSIA Campo
// Versión inicial - Solo cache offline. Push se agrega en Sub-fase 2C.
// IMPORTANTE: este SW vive en /CSIA_CAMPO/service-worker.js
// y solo controla esa subcarpeta, no la raíz del dominio reinaldobacila.github.io

const CACHE_VERSION = 'csia-campo-v1';
// Rutas relativas: el navegador las resuelve respecto al scope del SW
const CACHE_FILES = [
  './',
  './app.html',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// === INSTALACIÓN ===
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versión', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Cachear archivos clave, ignorando errores individuales (algunos pueden no existir)
      return Promise.allSettled(
        CACHE_FILES.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] No se pudo cachear', url, err);
        }))
      );
    })
  );
  // Activar este SW inmediatamente, sin esperar a que se cierren las pestañas viejas
  self.skipWaiting();
});

// === ACTIVACIÓN ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando versión', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // Borrar caches viejos
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => {
              console.log('[SW] Borrando cache viejo:', key);
              return caches.delete(key);
            })
        );
      }),
      // Tomar control de las pestañas abiertas inmediatamente
      self.clients.claim(),
    ])
  );
});

// === FETCH: estrategia network-first con fallback a cache ===
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Solo manejar GET de mismo origen (HTML, JS, CSS)
  // Las requests a Supabase (cross-origin) pasan directo a la red
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  
  // No cachear el archivo app.html dinámico — siempre intentar red primero
  // para que los cambios lleguen rápido
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, actualizar el cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si no hay red, servir del cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Si tampoco está en cache y es una navegación, devolver app.html como fallback
          if (event.request.mode === 'navigate') {
            return caches.match('./app.html');
          }
          // Sino, fallar limpio
          return new Response('Offline y sin cache', { status: 503 });
        });
      })
  );
});

// === PUSH NOTIFICATIONS (vendrá en Sub-fase 2C) ===
// Placeholder por ahora. En 2C esto recibirá push del servidor y mostrará la notificación nativa.
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido (no implementado todavía)', event);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // En 2C: abrir CSIA Campo en la URL relevante
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('./app.html');
    })
  );
});
