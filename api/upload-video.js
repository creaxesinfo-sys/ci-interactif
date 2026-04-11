// api/upload-video.js — Cloudflare Stream TUS upload
// Retourne une URL TUS pour upload direct navigateur → Cloudflare
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Tus-Resumable, Upload-Length, Upload-Metadata');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Supporte tous les noms de variables possibles
  const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_TOKEN   = process.env.CF_STREAM_TOKEN || process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CF_API_TOKEN;

  if (!CF_ACCOUNT || !CF_TOKEN) {
    return res.status(500).json({ error: 'Variables CF_ACCOUNT_ID et CF_STREAM_TOKEN manquantes dans Vercel' });
  }

  try {
    const uploadLength   = req.headers['upload-length'] || '0';
    const uploadMetadata = req.headers['upload-metadata'] || '';

    // Utiliser https natif Node.js — pas besoin de fetch
    const https = require('https');
    const url   = require('url');

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream`;
    const parsed   = url.parse(endpoint);

    const cfRes = await new Promise((resolve, reject) => {
      const options = {
        hostname: parsed.hostname,
        path:     parsed.path,
        method:   'POST',
        headers: {
          'Authorization':   `Bearer ${CF_TOKEN}`,
          'Tus-Resumable':   '1.0.0',
          'Upload-Length':   uploadLength,
          'Upload-Metadata': uploadMetadata || `name ${Buffer.from('video').toString('base64')}`,
          'Content-Length':  '0',
        }
      };

      const req2 = https.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
      });
      req2.on('error', reject);
      req2.end();
    });

    if (cfRes.status < 200 || cfRes.status >= 300) {
      return res.status(500).json({
        error: `Cloudflare a refusé la requête (${cfRes.status}) : ${cfRes.body}`
      });
    }

    const tusUrl = cfRes.headers['location'];
    const uid    = cfRes.headers['stream-media-id'];

    if (!tusUrl || !uid) {
      return res.status(500).json({
        error: `Cloudflare n'a pas retourné d'URL TUS. Headers reçus : ${JSON.stringify(cfRes.headers)}`
      });
    }

    return res.status(200).json({ tusUrl, uid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
