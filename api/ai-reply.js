// api/ai-reply.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    const msg = payload.record || payload;

    if (!msg?.receiver_id || !msg?.sender_id || !msg?.content) {
      return res.status(200).json({ skipped: 'missing fields' });
    }

    if (msg.content.startsWith('🤖')) {
      return res.status(200).json({ skipped: 'AI message' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
      return res.status(200).json({ skipped: 'missing env vars' });
    }

    // 1. Charger le profil du destinataire
    const receiverRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${msg.receiver_id}&select=*`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const receiver = (await receiverRes.json())?.[0];

    if (!receiver?.ai_configured || !receiver?.ai_profile) {
      return res.status(200).json({ skipped: 'AI not configured' });
    }

    // 2. Charger le profil de l'expéditeur
    const senderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${msg.sender_id}&select=nom,email`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const sender = (await senderRes.json())?.[0];
    const senderName = sender?.nom || sender?.email || 'quelqu\'un';

    // 3. Construire le prompt
    const aiData = receiver.ai_profile;
    const questionsText = Object.entries(aiData.questions || {})
      .map(([k, v]) => `${k}: ${v}`).join('\n');

    const prompt =
      `Tu es l'AI personnel de ${receiver.nom || 'cet utilisateur'} sur CI — Cinéma Interactif.\n\n` +
      `Voici ce que tu sais sur cet utilisateur :\n${questionsText}\n\n` +
      `Style : ${JSON.stringify(aiData.style || {})}\n\n` +
      `${senderName} vient de lui envoyer :\n"${msg.content}"\n\n` +
      `Réponds exactement comme ${receiver.nom || 'cet utilisateur'} le ferait, dans son style et sa langue. ` +
      `Réponse courte et naturelle (1-3 phrases max). Ne mentionne jamais que tu es une AI.`;

    // 4. Appel Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const anthropicData = await anthropicRes.json();
    const aiReply = anthropicData.content?.[0]?.text;

    if (!aiReply) {
      return res.status(200).json({ skipped: 'no reply generated' });
    }

    // 5. Insérer la réponse dans Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        sender_id: msg.receiver_id,
        receiver_id: msg.sender_id,
        content: '🤖 ' + aiReply,
        read: false,
      }),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('ai-reply error:', err);
    return res.status(200).json({ error: err.message });
  }
}
