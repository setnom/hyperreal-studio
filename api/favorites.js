const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY not configured");
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` },
  });
  const user = await res.json();
  if (!user?.id) throw new Error("Invalid session");
  return user.id;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { user_token } = req.method === "GET"
    ? req.query
    : req.body || {};

  if (!user_token) return res.status(401).json({ error: "Authentication required" });

  let userId;
  try { userId = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  // GET — load favorites
  if (req.method === "GET") {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=favorites`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const data = await r.json();
      return res.status(200).json({ favorites: data?.[0]?.favorites || {} });
    } catch {
      return res.status(500).json({ error: "Failed to load favorites" });
    }
  }

  // DELETE generation permanently (kept in this file to stay within Vercel's 12-function limit)
  // Body: { user_token, action: "delete_generation", gen_id }
  if (req.method === "DELETE" || (req.method === "POST" && req.body?.action === "delete_generation")) {
    const genId = req.body?.gen_id;
    if (!genId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(genId))) return res.status(400).json({ error: "Invalid gen_id" });
    const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
    try {
      const look = await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}&user_id=eq.${userId}&select=id,status,result_url&limit=1`, { headers: H });
      const row = (await look.json())?.[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.status === "processing") return res.status(409).json({ error: "Still generating — wait until it finishes." });

      // Delete our own stored copy if the result lives in Supabase Storage (fal/wavespeed CDN files expire on their side)
      const m = typeof row.result_url === "string" && row.result_url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
      if (m) {
        await fetch(`${SB_URL}/storage/v1/object/${m[1]}/${m[2]}`, { method: "DELETE", headers: H }).catch(() => {});
      }

      const del = await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}&user_id=eq.${userId}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      if (!del.ok) return res.status(500).json({ error: `Delete failed (${del.status})` });

      // Drop it from favorites too
      try {
        const fr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=favorites`, { headers: H });
        const fav = (await fr.json())?.[0]?.favorites || {};
        if (fav[genId]) {
          delete fav[genId];
          await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ favorites: fav }) });
        }
      } catch {}
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — save favorites
  if (req.method === "POST") {
    const { favorites } = req.body || {};
    if (typeof favorites !== "object" || favorites === null)
      return res.status(400).json({ error: "Invalid favorites" });

    // Limit: max 500 favorite IDs
    const keys = Object.keys(favorites).slice(0, 500);
    const safe = {};
    keys.forEach(k => { if (favorites[k]) safe[k] = true; });

    try {
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({ favorites: safe }),
      });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to save favorites" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
