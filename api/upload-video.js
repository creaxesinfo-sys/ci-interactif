export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxDurationSeconds: 60,
          requireSignedURLs: false,
          allowedOrigins: ['ci-interactif.vercel.app']
        })
      }
    );

    const data = await response.json();
    res.status(200).json({
      uploadURL: data.result.uploadURL,
      uid: data.result.uid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
