// Uploads motion reference files to Supabase Storage (private bucket)
// Files are deleted by motion.js after generation completes
export const config = { api: { bodyParser: { sizeLimit: '200mb' } } };

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const BUCKET = "motion-refs";

const ALLOWED_MIME = [
  "image/jpeg","image/jpg","image/png","image/webp",
  "video/mp4","video/quicktime","video/webm","video/x-m4v",
];

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` },
  });
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

  const { user_token, file_name, mime_type, file_data } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!ALLOWED_MIME.includes(mime_type)) return res.status(400).json({ error: "File type not allowed" });
  if (!file_data) return res.status(400).json({ error: "No file data" });

  // Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;

  // Decode base64
  let buffer;
  try {
    buffer = Buffer.from(file_data, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid file data" });
  }

  // Size limit: 200MB
  if (buffer.length > 200 * 1024 * 1024) {
    return res.status(413).json({ error: "File too large (max 200MB)" });
  }

  // Build path: userId/timestamp_filename
  const safeName = (file_name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const ext = mime_type.includes("mp4") ? "mp4" : mime_type.includes("quicktime") ? "mov" : mime_type.includes("webm") ? "webm" : mime_type.includes("png") ? "png" : mime_type.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}_${safeName.replace(/\.[^.]+$/, "")}.${ext}`;

  // Upload to Supabase Storage using service key
  const uploadRes = await fetch(
    `${SB_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": mime_type,
        "x-upsert": "false",
      },
      body: buffer,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("Supabase upload error:", err);
    return res.status(500).json({ error: "Upload failed. Try again." });
  }

  console.log(`✓ Motion ref uploaded: ${path} (${Math.round(buffer.length/1024)}KB)`);
  return res.status(200).json({ ok: true, path });
}
