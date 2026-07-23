-- ═══════════════════════════════════════════════════════════════════
--  Runner-Funded Direct-Pay — Consolidated Migration
-- ───────────────────────────────────────────────────────────────────
--  Idempotent. Safe to run multiple times. Additive only.
--  Combines migrations 001 + 003 into one clean pass.
--
--  What this creates or ensures exists:
--    · payment_model column on orders
--    · runner_funded_* payment-tracking columns on orders
--    · platform_owed/settled columns on orders
--    · runner_funded_allowlist table
--    · platform_settlements table
--    · Direct-pay order_status enum values
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Restaurant flag ─────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS requires_runner_funded BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Payment model enum + column on orders ───────────────────────
DO $$ BEGIN
  CREATE TYPE payment_model AS ENUM ('restaurant_paid', 'runner_funded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_model payment_model NOT NULL DEFAULT 'restaurant_paid',
  ADD COLUMN IF NOT EXISTS runner_funded_payment_expected_amount INT,
  ADD COLUMN IF NOT EXISTS runner_funded_payment_confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_funded_payment_deadline        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_funded_return_reason           TEXT,
  ADD COLUMN IF NOT EXISTS platform_owed_amount                  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_settled_at                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_settlement_id                UUID;

-- ── 3. Order status enum values ────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_awaiting_payment';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_payment_confirmed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Allowlist ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runner_funded_allowlist (
  runner_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by    UUID REFERENCES users(id),
  note        TEXT
);

-- ── 5. Settlements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settlements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runner_id       UUID NOT NULL REFERENCES users(id),
  amount          INT NOT NULL,
  order_count     INT NOT NULL,
  bank_reference  TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by     UUID REFERENCES users(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_settlements_runner
  ON platform_settlements(runner_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_platform_owed
  ON orders(runner_id)
  WHERE platform_owed_amount > 0 AND platform_settled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_model
  ON orders(payment_model)
  WHERE payment_model = 'runner_funded';

-- ── 6. Force PostgREST schema reload ───────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 7. Verification block ──────────────────────────────────────────
-- Run this in the SQL editor after the migration to confirm everything
-- landed. All should return non-empty results.
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name IN (
--   'payment_model',
--   'runner_funded_payment_expected_amount',
--   'runner_funded_payment_deadline',
--   'runner_funded_payment_confirmed_at',
--   'runner_funded_return_reason',
--   'platform_owed_amount',
--   'platform_settled_at'
-- );
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('runner_funded_allowlist', 'platform_settlements');
--
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = 'order_status'::regtype
--   AND enumlabel IN ('runner_funded_awaiting_payment', 'runner_funded_payment_confirmed');
