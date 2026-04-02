// api/groq-chat.js
// Endpoint pour l'assistant CI — utilise Groq (gratuit)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { messages } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(200).json({ reply: 'Clé API manquante.' });
    }

    const systemPrompt = 'Tu es l\'assistant officiel de CI — Cinéma Interactif, une plateforme SaaS de création de films interactifs. ' +
      'Tu connais parfaitement la plateforme :\n' +
      '- Storyboard : outil visuel pour créer des arbres de scènes interactives\n' +
      '- Scènes : gestion des vidéos HLS via Cloudflare Stream\n' +
      '- Hotspots : zones cliquables sur la vidéo pour créer les choix\n' +
      '- Plans : Gratuit (1 film, 2Go), Pro (5 films, 20Go, 15$/mois), Studio (illimité, 100Go, 49$/mois)\n' +
      '- Upload vidéo : via Cloudflare Stream, format HLS\n' +
      '- Messagerie : chat en temps réel entre membres\n' +
      '- Publication : génère un lien direct pour partager le film\n' +
      'Réponds en français, de façon concise et amicale. Tu peux utiliser des emojis.';

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...(messages || [])
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 400,
        messages: groqMessages,
      }),
    });

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Désolé, je n\'ai pas pu répondre.';
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('groq-chat error:', err);
    return res.status(200).json({ reply: 'Erreur de connexion. Réessaie !' });
  }
}
