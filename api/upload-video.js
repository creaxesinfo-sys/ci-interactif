// api/upload-video.js — Cloudflare Stream TUS upload
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '718abc417236918feea54c109e09edbb';
  const CF_TOKEN   = process.env.CF_STREAM_TOKEN || process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CF_API_TOKEN;

  if (!CF_TOKEN) {
    return res.status(500).json({ error: 'Aucun token Cloudflare trouvé dans les variables Vercel' });
  }

  const uploadLength   = req.headers['upload-length'] || '0';
  const uploadMetadata = req.headers['upload-metadata'] || `name ${Buffer.from('video').toString('base64')}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cloudflare.com',
        path:     `/client/v4/accounts/${CF_ACCOUNT}/stream`,
        method:   'POST',
        headers: {
          'Authorization':   `Bearer ${CF_TOKEN}`,
          'Tus-Resumable':   '1.0.0',
          'Upload-Length':   uploadLength,
          'Upload-Metadata': uploadMetadata,
          'Content-Length':  '0',
        }
      };

      const r = https.request(options, (resp) => {
        let body = '';
        resp.on('data', c => body += c);
        resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body }));
      });
      r.on('error', reject);
      r.end();
    });

    if (result.status < 200 || result.status >= 300) {
      return res.status(500).json({ error: `CF ${result.status}: ${result.body}` });
    }

    const tusUrl = result.headers['location'];
    const uid    = result.headers['stream-media-id'];

    if (!tusUrl || !uid) {
      return res.status(500).json({ error: 'Pas de TUS URL', body: result.body });
    }

    return res.status(200).json({ tusUrl, uid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
