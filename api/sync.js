// Cron endpoint — called by Vercel Cron 1-2x per day
// Verifies all active subscriptions with Stripe and updates status + renewal date
import Stripe from 'stripe';

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const CRON_SECRET = process.env.CRON_SECRET; // set this in Vercel env vars

const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP": "test",
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.authorization || "";
  const secret = CRON_SECRET || "";
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  const stripe = new Stripe(STRIPE_SECRET);
  console.log("Sync cron started");

  // Get all active subscribers from Supabase
  const profilesRes = await fetch(
    `${SB_URL}/rest/v1/profiles?plan=neq.none&plan=not.is.null&select=id,email,plan,subscription_status,images_remaining,videos_remaining,subscription_start`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profiles = await profilesRes.json();
  console.log(`Checking ${profiles.length} active subscribers`);

  let renewed = 0, frozen = 0, cancelled = 0, errors = 0;

  for (const profile of profiles) {
    try {
      const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (!customers.data.length) {
        console.warn(`No Stripe customer for ${profile.email}`);
        continue;
      }

      const customer = customers.data[0];
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 });
      const activeSub = subs.data.find(s => ["active", "trialing"].includes(s.status));

      if (activeSub) {
        const priceId = activeSub.items?.data?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];
        const periodEnd = new Date(activeSub.current_period_end * 1000).toISOString();
        const periodStart = new Date(activeSub.current_period_start * 1000).toISOString();

        // Check if this is a new billing cycle (renewal happened)
        const subStart = profile.subscription_start ? new Date(profile.subscription_start) : null;
        const cycleStart = new Date(activeSub.current_period_start * 1000);
        const isNewCycle = subStart && cycleStart > subStart;

        const updateData = {
          subscription_status: "active",
          subscription_end: periodEnd,
        };

        if (isNewCycle && plan && PLAN_CREDITS[plan]) {
          // New billing cycle — reset credits
          updateData.images_remaining = PLAN_CREDITS[plan].images;
          updateData.videos_remaining = PLAN_CREDITS[plan].videos;
          updateData.subscription_start = periodStart;
          updateData.plan = plan;
          console.log(`✓ Renewed: ${plan} for ${profile.email} — cycle started ${periodStart}`);
          renewed++;
        } else {
          // Same cycle — just update end date and unfreeze if needed
          if (profile.subscription_status === "payment_failed") {
            console.log(`✓ Unfreezing ${profile.email} — sub is active`);
          }
          if (plan && plan !== profile.plan) {
            updateData.plan = plan;
          }
        }

        await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          headers: sbHeaders(SERVICE_KEY),
          body: JSON.stringify(updateData),
        });

      } else {
        // No active sub — check if past_due or cancelled
        const pastDueSub = subs.data.find(s => s.status === "past_due");
        const cancelledSub = subs.data.find(s => ["canceled", "unpaid"].includes(s.status));

        if (pastDueSub) {
          await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
            method: "PATCH",
            headers: sbHeaders(SERVICE_KEY),
            body: JSON.stringify({ subscription_status: "payment_failed" }),
          });
          console.warn(`Frozen (past_due): ${profile.email}`);
          frozen++;
        } else if (cancelledSub && profile.plan !== "none") {
          await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
            method: "PATCH",
            headers: sbHeaders(SERVICE_KEY),
            body: JSON.stringify({ plan: "none", subscription_status: "cancelled" }),
          });
          console.warn(`Cancelled: ${profile.email}`);
          cancelled++;
        }
      }
    } catch (e) {
      console.error(`Error syncing ${profile.email}:`, e.message);
      errors++;
    }
  }

  console.log(`Sync done: ${renewed} renewed, ${frozen} frozen, ${cancelled} cancelled, ${errors} errors`);
  return res.status(200).json({ ok: true, renewed, frozen, cancelled, errors, total: profiles.length });
}
