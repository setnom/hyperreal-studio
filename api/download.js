const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

const ALLOWED_HOSTS = [
  "fal.run", "cdn.fal.run", "storage.googleapis.com",
  "fal-cdn.batata.so", "v2.fal.media", "v3b.fal.media", "fal.media",
  "pygcsyqahhdtmwmqklnl.supabase.co",  // Supabase Storage
  "api.wavespeed.ai",                   // Wavespeed API
  "cdn.wavespeed.ai",                   // Wavespeed output CDN
  "storage.wavespeed.ai",               // Wavespeed storage
];

function isSafeUrl(url) {
  try {
    const p = new URL(url);
    return p.protocol === "https:" &&
      ALLOWED_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("." + h));
  } catch { return false; }
}

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, filename, user_token } = req.body || {};

  if (!user_token) return res.status(401).json({ error: "Authentication required" });
  if (!url || !isSafeUrl(url)) return res.status(400).json({ error: "Invalid URL" });

  try {
    await verifyToken(user_token);
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) return res.status(502).json({ error: "Failed to fetch file" });

    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    const buffer = await fileRes.arrayBuffer();
    if (buffer.byteLength > 50 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large to proxy (max 50MB)" });
    }
    const safeFilename = (filename || "nanobanano-file").replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", buffer.byteLength);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    console.error("Download proxy error:", err.message);
    return res.status(500).json({ error: "Download failed" });
  }
}
