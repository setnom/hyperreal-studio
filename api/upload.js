export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const ALLOWED_MIME = ["image/jpeg","image/jpg","image/png","image/webp","image/gif","video/mp4","video/quicktime","video/webm","video/x-m4v"];
const MAX_B64_SIZE = 4 * 1024 * 1024; // 4MB base64 string max

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

  const { data_url, user_token } = req.body || {};
  const FAL_KEY = process.env.FAL_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!FAL_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!data_url) return res.status(400).json({ error: "data_url required" });

  // Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
  const userId = authUser.id;

  // Parse data URL
  const matches = data_url.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid data URL format" });

  const mimeType = matches[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mimeType))
    return res.status(400).json({ error: "File type not allowed" });

  const base64Data = matches[2];
  if (base64Data.length > MAX_B64_SIZE)
    return res.status(400).json({ error: "File too large for this upload path" });

  let buffer;
  try { buffer = Buffer.from(base64Data, "base64"); }
  catch { return res.status(400).json({ error: "Invalid base64 data" }); }

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("quicktime") ? "mov" : mimeType.includes("webm") ? "webm" : "jpg";
  const fileName = `${userId}/${Date.now()}.${ext}`;

  console.log(`Upload: mime=${mimeType} size=${Math.round(buffer.length/1024)}KB user=${userId}`);

  // Method 1: Supabase Storage (reliable, already working in the app)
  try {
    const sbRes = await fetch(`${SB_URL}/storage/v1/object/motion-refs/${fileName}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": mimeType, "x-upsert": "true" },
      body: buffer,
    });
    if (sbRes.ok) {
      // Generate a signed URL valid for 1 hour
      const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/motion-refs/${fileName}`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (signRes.ok) {
        const { signedURL } = await signRes.json();
        const url = `${SB_URL}/storage/v1${signedURL}`;
        console.log(`✓ Uploaded to Supabase Storage: ${fileName}`);
        return res.status(200).json({ success: true, url, path: fileName });
      }
    }
    console.warn("Supabase upload status:", sbRes.status, await sbRes.text());
  } catch (e) { console.error("Supabase upload failed:", e.message); }

  // Method 2: fal.ai storage
  try {
    const initRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: mimeType, file_name: `upload_${Date.now()}.${ext}` }),
    });
    if (initRes.ok) {
      const { upload_url, file_url } = await initRes.json();
      const putRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mimeType }, body: buffer });
      if (putRes.ok) {
        console.log(`✓ Uploaded to fal.ai storage`);
        return res.status(200).json({ success: true, url: file_url });
      }
    }
  } catch (e) { console.error("fal.ai upload failed:", e.message); }

  return res.status(500).json({ error: "Upload failed. Please try again." });
}
