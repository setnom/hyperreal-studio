-- Run this in Supabase SQL Editor
-- Creates the credit_transactions table for full audit history

CREATE TABLE IF NOT EXISTS credit_transactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  type        text NOT NULL, -- 'plan_activation' | 'plan_upgrade' | 'plan_renewal' | 'pack_purchase' | 'generation' | 'refund' | 'admin'
  description text,          -- human-readable description
  plan        text,          -- plan name if relevant
  images_delta  integer DEFAULT 0,  -- + = added, - = used/deducted
  videos_delta  integer DEFAULT 0,
  images_after  integer,     -- balance after this transaction
  videos_after  integer,
  stripe_ref  text,          -- stripe session_id or invoice_id for traceability
  meta        jsonb          -- extra context (style, duration, endpoint, etc.)
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON credit_transactions(user_id, created_at DESC);

-- RLS: users can only read their own transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (backend only)
CREATE POLICY "Service role insert"
  ON credit_transactions FOR INSERT
  WITH CHECK (true);

GRANT SELECT ON credit_transactions TO authenticated;
GRANT INSERT ON credit_transactions TO service_role;
