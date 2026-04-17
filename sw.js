/* =============================================
   LA HORNADA — Service Worker
   ============================================= */

const CACHE_NAME = 'lahornada-admin-v2';
const ASSETS = [
  '/admin.html',
  '/admin.css',
  '/admin.js',
  '/firebase.js',
  '/products.js',
  '/manifest.json'
];

/* ── Instalar: cachear assets ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* ── Activar: limpiar caches viejos ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: servir desde cache si está disponible ── */
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

/* ── Push: mostrar notificación ── */
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title   = data.title   || '🍞 La Hornada';
  const options = {
    body:    data.body    || 'Nuevo pedido recibido',
    icon:    data.icon    || '/img/icon-192.png',
    badge:   '/img/icon-192.png',
    tag:     data.tag     || 'pedido',
    data:    data.data    || {},
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* ── Click en notificación ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.action;
  const orderId = e.notification.data?.orderId;

  if (action === 'aprobar' && orderId) {
    // Enviar mensaje a la página para aprobar el pago
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'APROBAR_YAPE', orderId });
          clients[0].focus();
        } else {
          self.clients.openWindow(`/admin.html?aprobar=${orderId}`);
        }
      })
    );
  } else {
    // Abrir admin
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) clients[0].focus();
        else self.clients.openWindow('/admin.html');
      })
    );
  }
});
