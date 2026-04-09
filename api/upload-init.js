// Returns a presigned upload URL from fal.ai storage
// Frontend uploads directly — bypasses Vercel body size limits
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const ALLOWED_MIME = [
  "image/jpeg","image/jpg","image/png","image/webp","image/gif",
  "video/mp4","video/quicktime","video/webm","video/x-m4v",
];

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` } });
  const data = await res.json();
  if (!data?.id) throw new Error("Invalid session");
  return data;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || (origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio"));
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { mime_type, file_name, user_token } = req.body || {};
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!ALLOWED_MIME.includes(mime_type)) return res.status(400).json({ error: "File type not allowed" });

  try { await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  const safeName = (file_name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const ext = mime_type.includes("mp4") ? "mp4" : mime_type.includes("quicktime") ? "mov" : mime_type.includes("webm") ? "webm" : mime_type.includes("png") ? "png" : mime_type.includes("webp") ? "webp" : "jpg";

  try {
    const initRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: mime_type, file_name: `motion_${Date.now()}.${ext}` }),
    });
    if (!initRes.ok) throw new Error("fal.ai initiate failed");
    const { upload_url, file_url } = await initRes.json();
    return res.status(200).json({ upload_url, file_url });
  } catch (e) {
    console.error("Upload init error:", e.message);
    return res.status(500).json({ error: "Could not initiate upload. Try again." });
  }
}
