// ============================================================
// CI — SERVICE WORKER v3.0
// Cache à 3 niveaux : App Shell / Manifests HLS / Segments HLS
// ============================================================

var APP_CACHE     = 'ci-app-v3';
var VIDEO_CACHE   = 'ci-video-v3';
var MANIFEST_CACHE = 'ci-manifest-v3';

// Domaines vidéo autorisés à être cachés
var VIDEO_DOMAINS = [
  'cloudflarestream.com',
  'videodelivery.net',
  'customer-911pgg1vlhryqb16.cloudflarestream.com'
];

// Fichiers de l'app shell à pré-cacher
var APP_SHELL = [
  '/',
  '/manifest.json'
];

// ─── Helpers ────────────────────────────────────────────────

function isVideoDomain(url) {
  return VIDEO_DOMAINS.some(function(d){ return url.indexOf(d) !== -1; });
}

function isSegment(url) {
  // Segments HLS : .ts, .m4s, .fmp4, seg-, chunk-
  return /\.(ts|m4s|fmp4)(\?|$)/.test(url) ||
         /\/(seg|chunk|fragment)-/.test(url);
}

function isManifest(url) {
  return url.indexOf('.m3u8') !== -1;
}

function isProxyManifest(url) {
  return url.indexOf('/api/video-cache') !== -1;
}

// ─── Install ────────────────────────────────────────────────

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(APP_CACHE).then(function(cache) {
      return cache.addAll(APP_SHELL).catch(function(){});
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

// ─── Activate ───────────────────────────────────────────────

self.addEventListener('activate', function(event) {
  var validCaches = [APP_CACHE, VIDEO_CACHE, MANIFEST_CACHE];
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return validCaches.indexOf(k) === -1; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){
      // Informer les clients qu'une mise à jour est prête
      return self.clients.matchAll({ includeUncontrolled: true });
    }).then(function(clients){
      clients.forEach(function(client){
        client.postMessage({ type: 'CI_UPDATE_READY' });
      });
      return self.clients.claim();
    })
  );
});

// ─── Fetch ──────────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var method = event.request.method;

  // Ignorer les requêtes non-GET
  if(method !== 'GET') return;

  // 1. SEGMENTS VIDÉO — Cache First, immutable
  //    Une fois téléchargé, un segment ne change jamais
  if(isVideoDomain(url) && isSegment(url)){
    event.respondWith(cacheFirstSegment(event.request));
    return;
  }

  // 2. MANIFESTS HLS — Network First, TTL 30s
  //    Les manifests peuvent changer (qualités disponibles)
  if((isVideoDomain(url) && isManifest(url)) || isProxyManifest(url)){
    event.respondWith(networkFirstManifest(event.request));
    return;
  }

  // 3. APP SHELL — Cache First, puis réseau si absent
  if(!url.includes('supabase') &&
     !url.includes('/api/') &&
     !url.includes('googleapis') &&
     !url.includes('jsdelivr') &&
     !isVideoDomain(url)){
    event.respondWith(cacheFirstApp(event.request));
    return;
  }
});

// ─── Stratégies de cache ─────────────────────────────────────

// Segments : Cache First — si pas en cache, fetch + stocker
function cacheFirstSegment(request) {
  return caches.open(VIDEO_CACHE).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if(cached){
        // Notifier la progression au client
        notifyStats('segment-hit', request.url);
        return cached;
      }
      return fetch(request).then(function(response) {
        if(response && response.ok && response.status === 200){
          // Cloner avant de stocker (stream ne peut être lu qu'une fois)
          cache.put(request, response.clone());
          notifyStats('segment-miss', request.url);
          // Vérifier la taille du cache et purger si nécessaire
          manageCacheSize(cache, 800); // max 800 entrées
        }
        return response;
      }).catch(function(){
        return cached || new Response('', { status: 503 });
      });
    });
  });
}

// Manifests : Network First avec fallback cache 30s
function networkFirstManifest(request) {
  return fetch(request).then(function(response) {
    if(response && response.ok){
      caches.open(MANIFEST_CACHE).then(function(cache){
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function(){
    return caches.open(MANIFEST_CACHE).then(function(cache){
      return cache.match(request).then(function(cached){
        return cached || new Response('', { status: 503 });
      });
    });
  });
}

// App Shell : Cache First
function cacheFirstApp(request) {
  return caches.open(APP_CACHE).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if(cached) return cached;
      return fetch(request).then(function(response) {
        if(response && response.ok && response.status === 200){
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function(){
        return cached || new Response('', { status: 503 });
      });
    });
  });
}

// ─── Gestion de la taille du cache ──────────────────────────

function manageCacheSize(cache, maxEntries) {
  cache.keys().then(function(keys) {
    if(keys.length > maxEntries){
      // Supprimer les entrées les plus anciennes (FIFO)
      var toDelete = keys.slice(0, keys.length - maxEntries);
      toDelete.forEach(function(key){ cache.delete(key); });
    }
  });
}

// ─── Communication avec le client ───────────────────────────

function notifyStats(type, url) {
  self.clients.matchAll().then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({
        type: 'CI_CACHE_' + type.toUpperCase().replace('-', '_'),
        url: url
      });
    });
  });
}

// ─── Messages depuis le client ───────────────────────────────

self.addEventListener('message', function(event) {
  if(!event.data) return;

  // Mise à jour forcée
  if(event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }

  // Rapport de cache à la demande
  if(event.data.type === 'CI_CACHE_STATS'){
    Promise.all([
      caches.open(VIDEO_CACHE).then(function(c){ return c.keys(); }),
      caches.open(MANIFEST_CACHE).then(function(c){ return c.keys(); }),
      caches.open(APP_CACHE).then(function(c){ return c.keys(); })
    ]).then(function(results){
      event.source.postMessage({
        type: 'CI_CACHE_STATS_RESULT',
        segments:  results[0].length,
        manifests: results[1].length,
        appShell:  results[2].length
      });
    });
  }

  // Purge manuelle du cache vidéo
  if(event.data.type === 'CI_CACHE_CLEAR_VIDEO'){
    caches.delete(VIDEO_CACHE).then(function(){
      caches.delete(MANIFEST_CACHE);
    }).then(function(){
      event.source.postMessage({ type: 'CI_CACHE_CLEARED' });
    });
  }

  // Préchauffer le cache pour une URL spécifique
  if(event.data.type === 'CI_CACHE_PREFETCH' && event.data.url){
    fetch(event.data.url).then(function(response){
      if(response && response.ok){
        caches.open(VIDEO_CACHE).then(function(cache){
          cache.put(event.data.url, response);
        });
      }
    }).catch(function(){});
  }
});
