// api/list-videos.js
// Retourne toutes les vidéos Cloudflare Stream du compte
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let allVideos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream?per_page=50&page=${page}&status=ready`,
        { headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` } }
      );
      const data = await cfRes.json();
      if (!data.success) throw new Error(data.errors?.[0]?.message || 'Cloudflare error');

      const videos = data.result || [];
      allVideos = allVideos.concat(videos.map(v => ({
        uid:       v.uid,
        name:      v.meta?.name || v.uid,
        duration:  Math.round(v.duration || 0),
        size:      v.size || 0,
        state:     v.status?.state,
        thumbnail: v.thumbnail,
        hls:       `https://customer-911pgg1vlhryqb16.cloudflarestream.com/${v.uid}/manifest/video.m3u8`,
        created:   v.created,
      })));

      hasMore = videos.length === 50;
      page++;
      if (page > 10) break; // sécurité max 500 vidéos
    }

    return res.status(200).json({ ok: true, videos: allVideos, total: allVideos.length });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
