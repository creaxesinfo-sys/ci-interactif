// api/groq-chat.js
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
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 400,
        messages: messages || [],
      }),
    });
    const data = await groqRes.json();
    console.log('Groq response:', JSON.stringify(data));
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(200).json({ reply: 'Désolé, je n\'ai pas pu répondre.' });
    }
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('groq-chat error:', err);
    return res.status(200).json({ reply: 'Erreur de connexion. Réessaie !' });
  }
}
