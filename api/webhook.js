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
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PLAN_CREDITS = {
  test: { images: 20, videos: 2 },
  basic: { images: 40, videos: 8 },
  pro: { images: 90, videos: 18 },
  creator: { images: 200, videos: 30 },
};

// Map Stripe price IDs to plan names
const PRICE_TO_PLAN = {
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET || !WEBHOOK_SECRET) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  const stripe = new Stripe(STRIPE_SECRET);
  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_email || session.customer_details?.email;
    const priceId = session.line_items?.data?.[0]?.price?.id
      || session.metadata?.price_id
      || null;

    // Try to get plan from client_reference_id or price
    let plan = session.client_reference_id;
    if (!plan || !PLAN_CREDITS[plan]) {
      // Try to match from subscription
      if (session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const subPriceId = sub.items?.data?.[0]?.price?.id;
          plan = PRICE_TO_PLAN[subPriceId] || null;
        } catch {}
      }
    }

    if (customerEmail && plan && PLAN_CREDITS[plan]) {
      // Update user profile in Supabase using service key
      const credits = PLAN_CREDITS[plan];
      try {
        // Find user by email
        const searchRes = await fetch(
          `${SB_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}&select=id`,
          {
            headers: {
              apikey: SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
            },
          }
        );
        const users = await searchRes.json();
        if (users?.[0]?.id) {
          await fetch(
            `${SB_URL}/rest/v1/profiles?id=eq.${users[0].id}`,
            {
              method: "PATCH",
              headers: {
                apikey: SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                plan,
                images_remaining: credits.images,
                videos_remaining: credits.videos,
              }),
            }
          );
          console.log(`Activated ${plan} for ${customerEmail}`);
        }
      } catch (err) {
        console.error("Error activating plan:", err);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customerEmail = sub.customer_email;
    if (customerEmail) {
      try {
        const searchRes = await fetch(
          `${SB_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}&select=id`,
          {
            headers: {
              apikey: SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
            },
          }
        );
        const users = await searchRes.json();
        if (users?.[0]?.id) {
          await fetch(
            `${SB_URL}/rest/v1/profiles?id=eq.${users[0].id}`,
            {
              method: "PATCH",
              headers: {
                apikey: SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SB_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                plan: "none",
                images_remaining: 0,
                videos_remaining: 0,
              }),
            }
          );
          console.log(`Deactivated plan for ${customerEmail}`);
        }
      } catch {}
    }
  }

  res.status(200).json({ received: true });
}
