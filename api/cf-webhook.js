// api/cf-webhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET;
  if (CF_WEBHOOK_SECRET) {
    const signature = req.headers['webhook-signature'];
    if (!signature) return res.status(401).json({ error: 'Signature manquante' });
    const expected = crypto.createHmac('sha256', CF_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (signature !== `sha256=${expected}`) return res.status(401).json({ error: 'Signature invalide' });
  }

  const event = req.body;
  if (event?.type !== 'stream.video.ready' && event?.status?.state !== 'ready') {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const uid = event?.uid;
  if (!uid) return res.status(400).json({ error: 'UID manquant' });

  const { error } = await supabase
    .from('profiles')
    .update({ video_status: 'ready' })
    .eq('video_uid', uid)
    .eq('video_status', 'pending');

  if (error) console.error('[cf-webhook] Erreur:', error.message);

  return res.status(200).json({ ok: true, uid });
}
