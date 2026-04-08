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
  console.log("Auth user:", data?.id, data?.email);
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

  // 2. Find plan — from Stripe or trust requestedPlan if customer exists
  let confirmedPlan = null;
  const stripe = new Stripe(STRIPE_SECRET);

  try {
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    console.log(`Stripe customers for ${userEmail}:`, customers.data.length);

    for (const customer of customers.data) {
      // Check active/trialing/past_due subscriptions
      const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
      console.log(`Subs for customer ${customer.id}:`, subs.data.map(s => `${s.status}:${s.items?.data?.[0]?.price?.id}`));

      for (const sub of subs.data) {
        if (["active", "trialing", "past_due", "incomplete"].includes(sub.status)) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          if (PRICE_TO_PLAN[priceId]) { confirmedPlan = PRICE_TO_PLAN[priceId]; break; }
        }
      }
      if (confirmedPlan) break;

      // Check ALL paid invoices (no time limit)
      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 10 });
      console.log(`Invoices for ${customer.id}:`, invoices.data.map(i => `${i.lines?.data?.[0]?.price?.id}:${i.created}`));
      for (const inv of invoices.data) {
        const priceId = inv.lines?.data?.[0]?.price?.id;
        if (PRICE_TO_PLAN[priceId]) { confirmedPlan = PRICE_TO_PLAN[priceId]; break; }
      }
      if (confirmedPlan) break;
    }

    // If customer exists but plan not found yet (Stripe propagation delay) — trust requestedPlan
    if (!confirmedPlan && requestedPlan && PLAN_CREDITS[requestedPlan]) {
      if (customers.data.length > 0) {
        console.warn(`Plan not confirmed yet, trusting requestedPlan: ${requestedPlan}`);
        confirmedPlan = requestedPlan;
      } else {
        console.error(`No Stripe customer found for ${userEmail}`);
        return res.status(402).json({ error: `No Stripe customer found for ${userEmail}. Did you use the same email for Stripe and app signup?` });
      }
    }
  } catch (stripeErr) {
    console.error("Stripe error:", stripeErr.message);
    // If Stripe fails but we have a requestedPlan, still try to activate
    if (requestedPlan && PLAN_CREDITS[requestedPlan]) {
      console.warn("Stripe error — falling back to requestedPlan:", requestedPlan);
      confirmedPlan = requestedPlan;
    } else {
      return res.status(500).json({ error: "Stripe error: " + stripeErr.message });
    }
  }

  if (!confirmedPlan) {
    return res.status(402).json({ error: "Could not confirm subscription. Contact support." });
  }

  // 3. Write plan to Supabase — UPSERT so it creates the row if missing
  const credits = PLAN_CREDITS[confirmedPlan];
  const updateData = {
    id: userId,
    email: userEmail,
    plan: confirmedPlan,
    images_remaining: credits.images,
    videos_remaining: credits.videos,
    subscription_status: "active",
    subscription_start: new Date().toISOString(),
  };

  console.log(`Upserting profile ${userId} with plan ${confirmedPlan}`);

  const patchRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(updateData),
  });

  const patchBody = await patchRes.text();
  console.log(`Supabase upsert status: ${patchRes.status}, body: ${patchBody.slice(0, 300)}`);

  if (!patchRes.ok && patchRes.status !== 409) {
    return res.status(500).json({ error: `Supabase upsert failed: ${patchRes.status} ${patchBody}` });
  }

  // 4. Verify it actually wrote correctly
  const verifyRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const verifyData = await verifyRes.json();
  console.log("Verify after update:", verifyData);

  const updatedProfile = verifyData?.[0];
  if (!updatedProfile || updatedProfile.plan !== confirmedPlan) {
    return res.status(500).json({ error: `Profile not updated correctly. Got: ${JSON.stringify(updatedProfile)}` });
  }

  console.log(`✓ SUCCESS: Activated ${confirmedPlan} for ${userEmail} (${userId})`);
  return res.status(200).json({ ok: true, plan: confirmedPlan, credits });
}
