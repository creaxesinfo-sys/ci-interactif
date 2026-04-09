// api/check-video-status.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, userId } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID manquant' });

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/718abc417236918feea54c109e09edbb/stream/${uid}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const cfData = await cfRes.json();
  if (!cfData.success) {
    return res.status(500).json({ error: 'Cloudflare API error', details: cfData.errors });
  }

  const video   = cfData.result;
  const state   = video?.status?.state;
  const pctDone = video?.status?.pctComplete;

  if (state === 'ready' && userId) {
    await supabase
      .from('profiles')
      .update({ video_status: 'ready' })
      .eq('video_uid', uid)
      .eq('id', userId);
  }

  return res.status(200).json({
    uid,
    state,
    pctComplete: pctDone || 0,
    ready: state === 'ready',
    duration: video?.duration || null,
  });
}
