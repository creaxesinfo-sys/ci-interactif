// ===== CI — SERVICE WORKER avec auto-update =====
var CACHE_NAME = 'ci-cache-' + Date.now().toString(36);

var PRECACHE = ['/', '/app.html', '/manifest.json'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.allSettled(PRECACHE.map(function(url){
        return cache.add(new Request(url, { cache: 'reload' }));
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){
        return n.startsWith('ci-cache-') && n !== CACHE_NAME;
      }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
    .then(function(){ return self.clients.matchAll({ type:'window' }); })
    .then(function(clients){
      clients.forEach(function(c){
        c.postMessage({ type: 'CI_UPDATE_READY' });
      });
    })
  );
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  if(url.includes('cloudflarestream.com') || url.includes('videodelivery.net') ||
     url.includes('.m3u8') || url.includes('.ts') || url.includes('supabase.co') ||
     url.includes('googleapis.com') || url.includes('jsdelivr.net')){
    return;
  }
  e.respondWith(
    fetch(e.request.clone()).then(function(res){
      if(res && res.status === 200){
        caches.open(CACHE_NAME).then(function(c){ c.put(e.request, res.clone()); });
      }
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(c){ return c || caches.match('/app.html'); });
    })
  );
});

self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
