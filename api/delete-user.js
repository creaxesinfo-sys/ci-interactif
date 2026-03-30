export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const response = await fetch(
    `https://zrkikyubfqlerehsovii.supabase.co/auth/v1/admin/users/${userId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_KEY
      }
    }
  );

  if (response.ok) return res.status(200).json({ success: true });
  return res.status(500).json({ error: 'Failed to delete user' });
}
