// api/check-video-status.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, userId } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'UID manquant' });

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream/${uid}`,
      { headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` } }
    );
    const cfData = await cfRes.json();

    if (!cfData.success) {
      return res.status(500).json({ error: 'Cloudflare error', details: cfData.errors });
    }

    const state   = cfData.result?.status?.state;
    const pctDone = cfData.result?.status?.pctComplete || 0;

    if (state === 'ready' && userId) {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ video_status: 'ready' })
        }
      );
    }

    return res.status(200).json({
      uid,
      state,
      pctComplete: pctDone,
      ready: state === 'ready',
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};

// api/cf-webhook.js
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secret = process.env.CF_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['webhook-signature'];
      if (!sig) return res.status(401).json({ error: 'Signature manquante' });
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
      if (sig !== expected) return res.status(401).json({ error: 'Signature invalide' });
    }

    const event = req.body;
    if (event?.type !== 'stream.video.ready' && event?.status?.state !== 'ready') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const uid = event?.uid;
    if (!uid) return res.status(400).json({ error: 'UID manquant' });

    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/profiles?video_uid=eq.${uid}&video_status=eq.pending`,
      {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ video_status: 'ready' })
      }
    );

    return res.status(200).json({ ok: true, uid });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
