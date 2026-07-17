-- ═══════════════════════════════════════════════════════════════════
--  Runner-Funded Payment Flow — Migration 001
-- ───────────────────────────────────────────────────────────────────
--  Adds infrastructure for off-campus orders where the runner receives
--  the food-purchase float in their own bank account and walks in as a
--  paying customer at unregistered restaurants.
--
--  Mirrors the existing restaurant_transfer_queue pattern
--  (app/api/payments/transfer/restaurant.ts): rather than firing a
--  live Paystack API transfer on runner accept, we queue an instruction
--  that Lymora manually pays out from /admin/payments. Correct for the
--  pilot scale — every runner-facing transfer gets eyeballed before
--  sending.
--
--  Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Restaurant flag: requires runner-funded ─────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS requires_runner_funded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN restaurants.requires_runner_funded IS
  'Set true for unregistered off-campus restaurants without payment '
  'integration. Orders route through the runner-funded flow instead '
  'of the restaurant-paid one.';

-- ── 2. Order-level payment model + runner-transfer tracking ────────
DO $$ BEGIN
  CREATE TYPE payment_model AS ENUM ('restaurant_paid', 'runner_funded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_model payment_model NOT NULL DEFAULT 'restaurant_paid',
  ADD COLUMN IF NOT EXISTS runner_funded_transfer_ref     TEXT,
  ADD COLUMN IF NOT EXISTS runner_funded_transfer_amount  INT,
  ADD COLUMN IF NOT EXISTS runner_funded_transferred_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_funded_returned_ref     TEXT,
  ADD COLUMN IF NOT EXISTS runner_funded_returned_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_funded_return_reason    TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_payment_model
  ON orders(payment_model) WHERE payment_model = 'runner_funded';

-- ── 3. Runner-funded allowlist ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS runner_funded_allowlist (
  runner_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by    UUID REFERENCES users(id),
  note        TEXT
);

COMMENT ON TABLE runner_funded_allowlist IS
  'Hand-maintained list of runners eligible for runner-funded orders. '
  'Not tier-driven. Pilot scale: 3-5 personally-vouched-for runners.';

-- ── 4. Runner transfer queue ───────────────────────────────────────
--  Mirrors restaurant_transfer_queue. When a runner accepts a runner-
--  funded order, we insert a row here. Lymora reviews and marks as
--  sent from /admin/payments. On success, order state advances from
--  runner_funded_pending_transfer → runner_funded_awaiting_pickup.
CREATE TABLE IF NOT EXISTS runner_transfer_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  runner_id       UUID NOT NULL REFERENCES users(id),
  order_ref       TEXT NOT NULL,
  amount          INT NOT NULL,  -- food_total + runner_earnings in naira
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  -- Snapshot of the runner's payout details at accept time — safer than
  -- pulling from runner_profiles at pay-out time (bank details might
  -- change between accept and payout).
  bank_name       TEXT,
  account_number  TEXT,
  account_name    TEXT,
  paid_at         TIMESTAMPTZ,
  paid_by         UUID REFERENCES users(id),
  paystack_ref    TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runner_transfer_queue_status
  ON runner_transfer_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_runner_transfer_queue_order
  ON runner_transfer_queue(order_id);
CREATE INDEX IF NOT EXISTS idx_runner_transfer_queue_runner
  ON runner_transfer_queue(runner_id);

-- ── 5. Extend order_status enum ────────────────────────────────────
--    runner_funded_pending_transfer  — accepted, funds not yet released by admin
--    runner_funded_awaiting_pickup   — funds sent, runner en route to restaurant
--    runner_funded_returning         — restaurant closed/failed, awaiting reverse payment
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_pending_transfer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_awaiting_pickup';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_returning';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN orders.payment_model IS
  'restaurant_paid = existing flow, transfer to restaurant subaccount. '
  'runner_funded   = pilot flow, transfer to runner personal bank, runner buys the food.';
