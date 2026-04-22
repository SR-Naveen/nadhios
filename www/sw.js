const CACHE_NAME = 'nadhi-os-v1';

// App Install aagum pothu
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed Boss!');
  self.skipWaiting();
});

// App active aagum pothu
self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activated and Ready!');
  return self.clients.claim();
});

// Background network request handle panna
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => console.log('Offline mode')));
});