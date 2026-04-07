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

const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP":  "test",
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

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
    `${SB_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,images_remaining,videos_remaining,plan&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  return data?.[0] || null;
}

async function findUserById(userId, serviceKey) {
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=id,images_remaining,videos_remaining,plan&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  return data?.[0] || null;
}

// First activation only — sets full credits, does NOT accumulate
async function activateNewPlan(userId, plan, serviceKey) {
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

// Monthly renewal — resets to full plan credits (no accumulation)
// Credits reset each billing cycle, they don't roll over
async function renewPlanCredits(userId, plan, serviceKey) {
  const credits = PLAN_CREDITS[plan];
  console.log(`Renewing ${plan} credits for user ${userId}: ${credits.images} images, ${credits.videos} videos`);
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

  // ─── checkout.session.completed → FIRST activation only ───
  // Fires once when customer subscribes for the first time
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;

    let plan = VALID_PLANS.includes(session.client_reference_id)
      ? session.client_reference_id
      : null;

    if (!plan && session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items?.data?.[0]?.price?.id;
        plan = PRICE_TO_PLAN[priceId] || null;
      } catch (e) { console.error("Sub lookup failed:", e.message); }
    }

    if (!email || !plan) {
      console.error("Missing email or plan:", { email, plan });
      return res.status(200).json({ received: true });
    }

    try {
      const user = await findUserByEmail(email, SERVICE_KEY);
      if (user) {
        await activateNewPlan(user.id, plan, SERVICE_KEY);
        console.log(`✓ First activation: ${plan} for ${email}`);
      } else {
        console.error(`User not found for email: ${email}`);
      }
    } catch (err) {
      console.error("Activation error:", err.message);
    }
  }

  // ─── invoice.payment_succeeded → MONTHLY RENEWAL ───
  // This is the correct event for recurring billing — fires every month
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;

    // Only process subscription renewals, not the first payment (handled by checkout.session.completed)
    if (invoice.billing_reason === "subscription_cycle") {
      try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const email = customer.email;
        const priceId = invoice.lines?.data?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];

        if (email && plan) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user) {
            await renewPlanCredits(user.id, plan, SERVICE_KEY);
            console.log(`✓ Monthly renewal: ${plan} credits reset for ${email}`);
          }
        }
      } catch (e) { console.error("Renewal error:", e.message); }
    }
  }

  // ─── customer.subscription.updated → plan CHANGE only ───
  // Only fires when customer upgrades/downgrades plan, NOT on monthly renewal
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const prevPriceId = sub.items?.data?.[0]?.price?.id;
    const newPriceId  = sub.items?.data?.[0]?.price?.id;

    // Only process actual plan changes, not status updates
    if (sub.status === "active" && sub.cancel_at_period_end === false) {
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        const plan = PRICE_TO_PLAN[newPriceId];

        if (email && plan) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user && user.plan !== plan) {
            // Plan actually changed — reset credits to new plan
            await activateNewPlan(user.id, plan, SERVICE_KEY);
            console.log(`✓ Plan changed to ${plan} for ${email}`);
          }
        }
      } catch (e) { console.error("Plan change error:", e.message); }
    }
  }

  // ─── customer.subscription.deleted → deactivate ───
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer.email;
      if (email) {
        const user = await findUserByEmail(email, SERVICE_KEY);
        if (user) {
          await deactivatePlan(user.id, SERVICE_KEY);
          console.log(`✓ Deactivated plan for ${email}`);
        }
      }
    } catch (e) { console.error("Deactivation error:", e.message); }
  }

  // ─── invoice.payment_failed → mark user, block generation ───
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    try {
      const customer = await stripe.customers.retrieve(invoice.customer);
      const email = customer.email;
      if (email) {
        const user = await findUserByEmail(email, SERVICE_KEY);
        if (user) {
          await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
            method: "PATCH",
            headers: sbHeaders(SERVICE_KEY),
            body: JSON.stringify({ subscription_status: "payment_failed" }),
          });
          console.warn(`Payment failed — blocked generation for ${email}`);
        }
      }
    } catch (e) { console.error("payment_failed handler error:", e.message); }
  }

  res.status(200).json({ received: true });
}
