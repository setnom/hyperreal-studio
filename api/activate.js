// Emergency activation endpoint — called by frontend after Stripe redirect
// Verifies payment with Stripe directly and activates plan if confirmed
import Stripe from 'stripe';

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP":  "test",
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` },
  });
  const user = await res.json();
  if (!user?.id) throw new Error("Invalid session");
  return user;
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_token, plan } = req.body || {};
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!plan || !PLAN_CREDITS[plan]) return res.status(400).json({ error: "Invalid plan" });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  // Verify user token
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;
  const userEmail = authUser.email;

  try {
    const stripe = new Stripe(STRIPE_SECRET);

    // Verify that this user actually has a recent successful payment in Stripe
    // Look for customer by email and check their subscriptions
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    const customer = customers.data?.[0];

    if (!customer) {
      return res.status(402).json({ error: "No Stripe customer found for this email" });
    }

    // Check active subscriptions
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 5 });
    let confirmedPlan = null;

    for (const sub of subs.data) {
      const priceId = sub.items?.data?.[0]?.price?.id;
      const subPlan = PRICE_TO_PLAN[priceId];
      if (subPlan) { confirmedPlan = subPlan; break; }
    }

    // Also check recent paid invoices if no active sub found yet
    if (!confirmedPlan) {
      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 3 });
      for (const inv of invoices.data) {
        const priceId = inv.lines?.data?.[0]?.price?.id;
        const invPlan = PRICE_TO_PLAN[priceId];
        if (invPlan) { confirmedPlan = invPlan; break; }
      }
    }

    if (!confirmedPlan) {
      return res.status(402).json({ error: "No active subscription found in Stripe" });
    }

    // Activate the confirmed plan
    const credits = PLAN_CREDITS[confirmedPlan];
    const patchRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: sbHeaders(SERVICE_KEY),
      body: JSON.stringify({
        plan: confirmedPlan,
        images_remaining: credits.images,
        videos_remaining: credits.videos,
        subscription_status: "active",
        subscription_start: new Date().toISOString(),
      }),
    });

    if (!patchRes.ok) throw new Error("Failed to update profile");
    console.log(`✓ Activated ${confirmedPlan} for ${userEmail} via /api/activate`);

    return res.status(200).json({ ok: true, plan: confirmedPlan, credits });

  } catch (err) {
    console.error("Activate error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
