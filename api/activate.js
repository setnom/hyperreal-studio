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

async function writeProfileToSupabase(userId, userEmail, plan, serviceKey) {
  const credits = PLAN_CREDITS[plan];
  const data = {
    id: userId,
    email: userEmail,
    plan,
    images_remaining: credits.images,
    videos_remaining: credits.videos,
    subscription_status: "active",
    subscription_start: new Date().toISOString(),
  };

  // Try 1: PATCH existing row
  console.log("Trying PATCH...");
  const patchRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ plan, images_remaining: credits.images, videos_remaining: credits.videos, subscription_status: "active", subscription_start: data.subscription_start }),
  });
  const patchText = await patchRes.text();
  console.log(`PATCH status: ${patchRes.status}, body: ${patchText.slice(0,200)}`);

  // If PATCH updated something, done
  try {
    const patchData = JSON.parse(patchText);
    if (Array.isArray(patchData) && patchData.length > 0) {
      console.log("PATCH succeeded");
      return true;
    }
  } catch {}

  // Try 2: INSERT new row
  console.log("PATCH returned empty (row missing), trying INSERT...");
  const insertRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(data),
  });
  const insertText = await insertRes.text();
  console.log(`INSERT status: ${insertRes.status}, body: ${insertText.slice(0,200)}`);

  if (insertRes.ok) {
    console.log("INSERT succeeded");
    return true;
  }

  // Try 3: UPSERT with merge-duplicates
  console.log("INSERT failed, trying UPSERT...");
  const upsertRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(data),
  });
  const upsertText = await upsertRes.text();
  console.log(`UPSERT status: ${upsertRes.status}, body: ${upsertText.slice(0,200)}`);
  return upsertRes.ok;
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

  // 1. Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch (e) { return res.status(401).json({ error: "Invalid session: " + e.message }); }

  const userId = authUser.id;
  const userEmail = authUser.email;
  console.log(`Activate request: userId=${userId}, email=${userEmail}, requestedPlan=${requestedPlan}`);

  // 2. Confirm plan via Stripe
  let confirmedPlan = null;
  try {
    const stripe = new Stripe(STRIPE_SECRET);
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    console.log(`Stripe customers found: ${customers.data.length}`);

    for (const customer of customers.data) {
      // Check subscriptions
      const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
      for (const sub of subs.data) {
        const priceId = sub.items?.data?.[0]?.price?.id;
        console.log(`Sub ${sub.id}: status=${sub.status}, priceId=${priceId}`);
        if (["active","trialing","past_due","incomplete"].includes(sub.status) && PRICE_TO_PLAN[priceId]) {
          confirmedPlan = PRICE_TO_PLAN[priceId];
          break;
        }
      }
      if (confirmedPlan) break;

      // Check paid invoices
      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 10 });
      for (const inv of invoices.data) {
        const priceId = inv.lines?.data?.[0]?.price?.id;
        if (PRICE_TO_PLAN[priceId]) { confirmedPlan = PRICE_TO_PLAN[priceId]; break; }
      }
      if (confirmedPlan) break;
    }

    // If customer exists but no plan yet — trust requestedPlan
    if (!confirmedPlan && requestedPlan && PLAN_CREDITS[requestedPlan] && customers.data.length > 0) {
      console.warn(`Trusting requestedPlan: ${requestedPlan}`);
      confirmedPlan = requestedPlan;
    }
  } catch (stripeErr) {
    console.error("Stripe error:", stripeErr.message);
    if (requestedPlan && PLAN_CREDITS[requestedPlan]) {
      console.warn("Stripe failed, falling back to requestedPlan");
      confirmedPlan = requestedPlan;
    }
  }

  if (!confirmedPlan) {
    return res.status(402).json({ error: `No subscription found for ${userEmail}. Make sure you used the same email for signup and payment.` });
  }

  // 3. Write to Supabase with 3 fallback methods
  const written = await writeProfileToSupabase(userId, userEmail, confirmedPlan, SERVICE_KEY);

  // 4. Verify
  const verifyRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const verifyData = await verifyRes.json();
  console.log("Final verify:", JSON.stringify(verifyData));

  const profile = verifyData?.[0];
  if (!profile || profile.plan !== confirmedPlan) {
    return res.status(500).json({
      error: `Failed to write to database. Got: ${JSON.stringify(profile)}. Written: ${written}`,
    });
  }

  console.log(`✓ SUCCESS: ${confirmedPlan} activated for ${userEmail}`);
  return res.status(200).json({ ok: true, plan: confirmedPlan, credits: PLAN_CREDITS[confirmedPlan] });
}
