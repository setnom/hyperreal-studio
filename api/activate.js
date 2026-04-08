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
  "price_1TJYG2EkbBokZiaivYSd44qP": "test",
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
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_token, plan: requestedPlan } = req.body || {};
  if (!user_token) return res.status(401).json({ error: "Auth required" });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;
  const userEmail = authUser.email;

  try {
    const stripe = new Stripe(STRIPE_SECRET);

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: userEmail, limit: 3 });
    
    let confirmedPlan = null;

    for (const customer of customers.data) {
      if (confirmedPlan) break;

      // Check all subscriptions (active, trialing, past_due)
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 5,
      });

      for (const sub of subs.data) {
        if (["active", "trialing", "past_due"].includes(sub.status)) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          if (PRICE_TO_PLAN[priceId]) {
            confirmedPlan = PRICE_TO_PLAN[priceId];
            break;
          }
        }
      }

      // Also check recent paid invoices (catches cases where sub not yet active)
      if (!confirmedPlan) {
        const invoices = await stripe.invoices.list({
          customer: customer.id,
          status: "paid",
          limit: 5,
        });
        for (const inv of invoices.data) {
          // Only invoices from last 10 minutes
          if (Date.now() / 1000 - inv.created > 600) continue;
          const priceId = inv.lines?.data?.[0]?.price?.id;
          if (PRICE_TO_PLAN[priceId]) {
            confirmedPlan = PRICE_TO_PLAN[priceId];
            break;
          }
        }
      }
    }

    // If still not found but requestedPlan is valid and we have a customer, trust it
    // (Stripe may take a few seconds to propagate the subscription)
    if (!confirmedPlan && requestedPlan && PLAN_CREDITS[requestedPlan] && customers.data.length > 0) {
      console.warn(`Subscription not found yet for ${userEmail}, using requested plan: ${requestedPlan}`);
      confirmedPlan = requestedPlan;
    }

    if (!confirmedPlan) {
      console.error(`No subscription found for ${userEmail}`);
      return res.status(402).json({ error: "No active subscription found" });
    }

    // Activate plan in Supabase
    const credits = PLAN_CREDITS[confirmedPlan];
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
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

    console.log(`✓ Activated ${confirmedPlan} for ${userEmail} (${userId})`);
    return res.status(200).json({ ok: true, plan: confirmedPlan, credits });

  } catch (err) {
    console.error("Activate error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
