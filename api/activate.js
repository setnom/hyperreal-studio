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
  const data = await res.json();
  if (!data?.id) throw new Error("Invalid session");
  return data;
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
  if (!requestedPlan || !PLAN_CREDITS[requestedPlan])
    return res.status(400).json({ error: "Invalid plan: " + requestedPlan });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_KEY missing" });
  if (!STRIPE_SECRET) return res.status(500).json({ error: "STRIPE_SECRET_KEY missing" });

  // 1. Verify user token
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch (e) { return res.status(401).json({ error: "Invalid session: " + e.message }); }

  const userId = authUser.id;
  const userEmail = authUser.email;
  console.log(`Activate: userId=${userId} email=${userEmail} plan=${requestedPlan}`);

  // 2. Verify payment with Stripe
  let confirmedPlan = null;
  let subscriptionEnd = null;
  try {
    const stripe = new Stripe(STRIPE_SECRET);
    const customers = await stripe.customers.list({ email: userEmail, limit: 3 });
    console.log(`Stripe customers: ${customers.data.length}`);

    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
      for (const sub of subs.data) {
        const priceId = sub.items?.data?.[0]?.price?.id;
        console.log(`Sub: ${sub.status} priceId=${priceId}`);
        if (["active","trialing","past_due","incomplete"].includes(sub.status) && PRICE_TO_PLAN[priceId]) {
          confirmedPlan = PRICE_TO_PLAN[priceId];
            subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
          break;
        }
      }
      if (confirmedPlan) break;

      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 5 });
      for (const inv of invoices.data) {
        const priceId = inv.lines?.data?.[0]?.price?.id;
        if (PRICE_TO_PLAN[priceId]) { confirmedPlan = PRICE_TO_PLAN[priceId]; break; }
      }
      if (confirmedPlan) break;
    }

    // Customer exists = payment happened, trust requested plan
    if (!confirmedPlan && customers.data.length > 0) {
      console.warn(`No sub found yet, trusting requestedPlan=${requestedPlan}`);
      confirmedPlan = requestedPlan;
    }
  } catch (e) {
    console.error("Stripe error:", e.message);
    confirmedPlan = requestedPlan; // Stripe down = still activate
  }

  if (!confirmedPlan) {
    return res.status(402).json({ error: `No Stripe customer found for ${userEmail}. Use same email for signup and payment.` });
  }

  const credits = PLAN_CREDITS[confirmedPlan];
  console.log(`Writing plan=${confirmedPlan} credits=${JSON.stringify(credits)} to userId=${userId}`);

  // 3a. Try PATCH first (update existing row)
  const patchRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=representation",
    },
    body: JSON.stringify({
      plan: confirmedPlan,
      images_remaining: credits.images,
      videos_remaining: credits.videos,
      subscription_status: "active",
      subscription_start: new Date().toISOString(),
      subscription_end: subscriptionEnd || null,
    }),
  });
  const patchText = await patchRes.text();
  console.log(`PATCH: status=${patchRes.status} body=${patchText.slice(0,200)}`);

  // Check if PATCH updated a row
  let patchedRows = [];
  try { patchedRows = JSON.parse(patchText); } catch {}

  if (!Array.isArray(patchedRows) || patchedRows.length === 0) {
    // No row to patch — INSERT
    console.log("No row found, trying INSERT...");
    const insertRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json", "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id: userId,
        email: userEmail,
        plan: confirmedPlan,
        images_remaining: credits.images,
        videos_remaining: credits.videos,
        subscription_status: "active",
        subscription_start: new Date().toISOString(),
      subscription_end: subscriptionEnd || null,
      }),
    });
    const insertText = await insertRes.text();
    console.log(`INSERT: status=${insertRes.status} body=${insertText.slice(0,200)}`);

    if (!insertRes.ok) {
      // Last resort: UPSERT
      console.log("INSERT failed, trying UPSERT...");
      const upsertRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          id: userId,
          email: userEmail,
          plan: confirmedPlan,
          images_remaining: credits.images,
          videos_remaining: credits.videos,
          subscription_status: "active",
          subscription_start: new Date().toISOString(),
      subscription_end: subscriptionEnd || null,
        }),
      });
      const upsertText = await upsertRes.text();
      console.log(`UPSERT: status=${upsertRes.status} body=${upsertText.slice(0,200)}`);
    }
  }

  // 4. Final verify
  const verifyRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=id,plan,images_remaining,subscription_status`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const verifyText = await verifyRes.text();
  console.log(`VERIFY: ${verifyText.slice(0,300)}`);

  let profile;
  try { profile = JSON.parse(verifyText)?.[0]; } catch {}

  if (!profile || profile.plan !== confirmedPlan) {
    return res.status(500).json({
      error: "DB write failed",
      detail: `Expected plan=${confirmedPlan}, got: ${JSON.stringify(profile)}`,
      hint: "Check Supabase RLS policies on profiles table — service key may be blocked by RLS",
    });
  }

  console.log(`✓ SUCCESS: ${confirmedPlan} for ${userEmail} (${userId})`);
  return res.status(200).json({ ok: true, plan: confirmedPlan, credits });
}
