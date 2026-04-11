// ============================================================
// CI — api/video-cache.js
// Vercel Serverless Function : Proxy Manifest HLS
//
// Rôle :
//   1. Récupère les manifests .m3u8 depuis Cloudflare Stream
//   2. Réécrit toutes les URLs internes pour passer par CE proxy
//   3. Ajoute des headers de cache agressifs pour l'Edge Vercel
//   4. Les segments (.ts / .m4s) passent directement via les
//      rewrites de vercel.json — sans passer par cette fonction
//
// URL d'appel : /api/video-cache?url=https://customer-xxx.../manifest.m3u8
// ============================================================

module.exports = async function handler(req, res) {
  // CORS pour HLS.js
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Accept');

  if(req.method === 'OPTIONS'){
    res.status(200).end();
    return;
  }

  var targetUrl = req.query.url;

  // ── Validation ──────────────────────────────────────────────
  if(!targetUrl){
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  var ALLOWED_DOMAINS = [
    'cloudflarestream.com',
    'videodelivery.net',
    'customer-911pgg1vlhryqb16.cloudflarestream.com'
  ];

  var isAllowed = ALLOWED_DOMAINS.some(function(d){
    return targetUrl.indexOf(d) !== -1;
  });

  if(!isAllowed){
    res.status(403).json({ error: 'Domain not allowed' });
    return;
  }

  // ── Fetch depuis Cloudflare ──────────────────────────────────
  var upstreamRes;
  try {
    upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'CI-VideoProxy/3.0',
        'Accept': '*/*'
      }
    });
  } catch(e) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: e.message });
    return;
  }

  if(!upstreamRes.ok){
    res.status(upstreamRes.status).end();
    return;
  }

  var contentType = upstreamRes.headers.get('content-type') || '';
  var isM3U8 = targetUrl.indexOf('.m3u8') !== -1 ||
               contentType.indexOf('mpegurl') !== -1 ||
               contentType.indexOf('m3u8') !== -1;

  // ── Traitement manifest M3U8 ─────────────────────────────────
  if(isM3U8){
    var body = await upstreamRes.text();

    // Reconstruire l'URL de base pour les chemins relatifs
    var baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    // Réécrire toutes les URLs dans le manifest
    body = rewriteManifest(body, baseUrl);

    // Cache court pour les manifests (ils peuvent changer selon la qualité)
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-CI-Proxy', 'manifest');
    res.status(200).end(body);
    return;
  }

  // ── Autres contenus (ne devrait pas arriver — segments via rewrite) ──
  var buffer = await upstreamRes.arrayBuffer();
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-CI-Proxy', 'segment');
  res.status(200).end(Buffer.from(buffer));
};

// ── Réécriture des URLs dans un manifest M3U8 ──────────────────

function rewriteManifest(body, baseUrl){
  var lines = body.split('\n');

  lines = lines.map(function(line){
    var trimmed = line.trim();

    // Ignorer les commentaires (lignes #EXT...)
    if(trimmed.startsWith('#')){
      // Mais réécrire les URI dans les attributs (#EXT-X-MAP:URI="...")
      line = line.replace(/URI="([^"]+)"/g, function(match, uri){
        return 'URI="' + proxyUrl(resolveUrl(uri, baseUrl)) + '"';
      });
      return line;
    }

    // Ligne vide
    if(!trimmed) return line;

    // URL absolue ou relative → proxifier
    var absoluteUrl = resolveUrl(trimmed, baseUrl);
    if(isVideoUrl(absoluteUrl)){
      return proxyUrl(absoluteUrl);
    }

    return line;
  });

  return lines.join('\n');
}

function resolveUrl(url, base){
  if(url.startsWith('http://') || url.startsWith('https://')) return url;
  if(url.startsWith('//')) return 'https:' + url;
  if(url.startsWith('/')) {
    var origin = base.match(/^(https?:\/\/[^/]+)/);
    return origin ? origin[1] + url : base + url;
  }
  return base + url;
}

function isVideoUrl(url){
  return url.indexOf('cloudflarestream.com') !== -1 ||
         url.indexOf('videodelivery.net') !== -1;
}

function proxyUrl(url){
  // Les segments (.ts, .m4s) passent directement via Vercel rewrite (plus rapide)
  if(/\.(ts|m4s|fmp4)(\?|$)/.test(url) || /\/(seg|chunk)-/.test(url)){
    // Convertir l'URL Cloudflare en chemin relatif proxy
    return url.replace(
      /https?:\/\/customer-[^/]+\.cloudflarestream\.com\//,
      '/cdn/cf/'
    ).replace(
      /https?:\/\/videodelivery\.net\//,
      '/cdn/vd/'
    );
  }
  // Manifests passent par notre fonction
  return '/api/video-cache?url=' + encodeURIComponent(url);
}
