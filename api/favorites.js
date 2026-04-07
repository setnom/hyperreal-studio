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
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
