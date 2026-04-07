// CI — Service Worker minimal (requis pour l'installation PWA)
var CACHE = 'ci-v1';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  self.clients.claim();
});

// Réseau d'abord, cache en fallback
self.addEventListener('fetch', function(e){
  e.respondWith(
    fetch(e.request).catch(function(){
      return caches.match(e.request);
    })
  );
});
