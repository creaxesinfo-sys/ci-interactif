// api/upload-video.js — Cloudflare Stream TUS upload (fichiers jusqu'à 30GB)
// Retourne une URL TUS pour upload direct navigateur → Cloudflare (sans passer par Vercel)

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Tus-Resumable, Upload-Length, Upload-Metadata');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
  const CF_TOKEN   = process.env.CF_STREAM_TOKEN;

  if (!CF_ACCOUNT || !CF_TOKEN) {
    return res.status(500).json({ error: 'Variables CF_ACCOUNT_ID ou CF_STREAM_TOKEN manquantes' });
  }

  try {
    // Lire le Content-Length de la vidéo envoyé par le client
    const uploadLength = req.headers['upload-length'] || req.headers['content-length'] || '0';
    const uploadMetadata = req.headers['upload-metadata'] || '';

    // Créer une session TUS sur Cloudflare Stream
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_TOKEN}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': uploadLength,
          'Upload-Metadata': uploadMetadata || `name ${Buffer.from('video').toString('base64')}`,
        }
      }
    );

    if (!cfRes.ok) {
      const errText = await cfRes.text();
      return res.status(500).json({ error: 'Cloudflare error: ' + errText });
    }

    // Cloudflare retourne l'URL TUS dans le header Location et l'UID dans stream-media-id
    const tusUrl = cfRes.headers.get('location');
    const uid    = cfRes.headers.get('stream-media-id');

    if (!tusUrl || !uid) {
      return res.status(500).json({ error: 'Cloudflare n\'a pas retourné d\'URL TUS' });
    }

    return res.status(200).json({ tusUrl, uid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
