// api/upload-video.js — Cloudflare Stream Direct Creator Upload
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '718abc417236918feea54c109e09edbb';
  const CF_TOKEN   = process.env.CF_STREAM_TOKEN || process.env.CLOUDFLARE_STREAM_TOKEN;

  if (!CF_TOKEN) return res.status(500).json({ error: 'Token Cloudflare manquant' });

  try {
    // Utiliser direct_upload — génère une URL pré-signée pour upload navigateur direct
    const body = JSON.stringify({ maxDurationSeconds: 3600, requireSignedURLs: false });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cloudflare.com',
        path:     `/client/v4/accounts/${CF_ACCOUNT}/stream/direct_upload`,
        method:   'POST',
        headers: {
          'Authorization': `Bearer ${CF_TOKEN}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        }
      };

      const r = https.request(options, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    const json = JSON.parse(result.body);

    if (!json.success || !json.result) {
      return res.status(500).json({ error: `Cloudflare: ${result.body}` });
    }

    return res.status(200).json({
      uploadURL: json.result.uploadURL,
      uid:       json.result.uid
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
