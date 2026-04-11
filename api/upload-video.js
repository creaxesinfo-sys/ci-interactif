// api/upload-video.js — Cloudflare Stream TUS upload
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Tus-Resumable, Upload-Length, Upload-Metadata, X-CF-Account, X-CF-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CF_ACCOUNT = req.headers['x-cf-account']
    || process.env.CF_ACCOUNT_ID
    || process.env.CLOUDFLARE_ACCOUNT_ID
    || '718abc417236918feea54c109e09edbb';

  const CF_TOKEN = req.headers['x-cf-token']
    || process.env.CF_STREAM_TOKEN
    || process.env.CLOUDFLARE_STREAM_TOKEN
    || 'cfut_NWJPQUaQie4GJhSr1W0w0qNQ7iqCEC8AhDEJJb6O840d254c';

  const uploadLength   = req.headers['upload-length'] || '0';
  const uploadMetadata = req.headers['upload-metadata'] || '';

  try {
    const https = require('https');

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${CF_ACCOUNT}/stream`,
        method: 'POST',
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

    if (result.status < 200 || result.status >= 300) {
      return res.status(500).json({ error: `Cloudflare erreur ${result.status}: ${result.body}` });
    }

    const tusUrl = result.headers['location'];
    const uid    = result.headers['stream-media-id'];

    if (!tusUrl || !uid) {
      return res.status(500).json({ error: 'Pas d\'URL TUS retournée', headers: result.headers });
    }

    return res.status(200).json({ tusUrl, uid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
