import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

// 🔴 FIX: Added "test" plan price ID
const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP":  "test",
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

// Also check client_reference_id — Stripe Payment Links pass plan name here
const VALID_PLANS = ["test", "basic", "pro", "creator"];

function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function findUserByEmail(email, serviceKey) {
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  return data?.[0]?.id || null;
}

async function activatePlan(userId, plan, serviceKey) {
  const credits = PLAN_CREDITS[plan];
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(serviceKey),
    body: JSON.stringify({
      plan,
      images_remaining: credits.images,
      videos_remaining: credits.videos,
      subscription_status: "active",
      subscription_start: new Date().toISOString(),
    }),
  });
}

async function deactivatePlan(userId, serviceKey) {
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(serviceKey),
    body: JSON.stringify({
      plan: "none",
      subscription_status: "cancelled",
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET || !WEBHOOK_SECRET || !SERVICE_KEY) {
    console.error("Missing env vars");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const stripe = new Stripe(STRIPE_SECRET);
  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  console.log("Stripe event:", event.type);

  // ─── checkout.session.completed → activate plan ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;

    // Determine plan: try client_reference_id first (most reliable with Payment Links)
    let plan = VALID_PLANS.includes(session.client_reference_id)
      ? session.client_reference_id
      : null;

    // Fallback: look up by subscription price ID
    if (!plan && session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items?.data?.[0]?.price?.id;
        plan = PRICE_TO_PLAN[priceId] || null;
      } catch (e) { console.error("Sub lookup failed:", e.message); }
    }

    if (!email || !plan) {
      console.error("Missing email or plan:", { email, plan, ref: session.client_reference_id });
      return res.status(200).json({ received: true });
    }

    try {
      const userId = await findUserByEmail(email, SERVICE_KEY);
      if (userId) {
        await activatePlan(userId, plan, SERVICE_KEY);
        console.log(`✓ Activated ${plan} for ${email}`);
      } else {
        console.error(`User not found for email: ${email}`);
      }
    } catch (err) {
      console.error("Activation error:", err.message);
    }
  }

  // ─── customer.subscription.updated → handle plan changes ───
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    // Only process if subscription is now active
    if (sub.status === "active") {
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];
        if (email && plan) {
          const userId = await findUserByEmail(email, SERVICE_KEY);
          if (userId) {
            await activatePlan(userId, plan, SERVICE_KEY);
            console.log(`✓ Updated plan to ${plan} for ${email}`);
          }
        }
      } catch (e) { console.error("Update error:", e.message); }
    }
  }

  // ─── customer.subscription.deleted → deactivate plan ───
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer.email;
      if (email) {
        const userId = await findUserByEmail(email, SERVICE_KEY);
        if (userId) {
          await deactivatePlan(userId, SERVICE_KEY);
          console.log(`✓ Deactivated plan for ${email}`);
        }
      }
    } catch (e) { console.error("Deactivation error:", e.message); }
  }

  // ─── invoice.payment_failed → notify but keep plan active until Stripe retries ───
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    console.warn(`Payment failed for customer: ${invoice.customer_email || invoice.customer}`);
    // Stripe handles retries automatically — don't deactivate yet
  }

  res.status(200).json({ received: true });
}
