-- ═══════════════════════════════════════════════════════════════════
--  Runner-Funded — Migration 003: Direct-to-Runner Payment Flow
-- ───────────────────────────────────────────────────────────────────
--  Replaces the runner-funded Paystack-transfer model with a peer-to-
--  peer flow: customer sends money directly to the runner's bank
--  account (bypassing Paystack for these orders), runner confirms
--  receipt via their bank alert, order proceeds normally. Runner
--  accumulates a debt to CampusRun (delivery + plate fees minus
--  runner earnings) and settles up periodically via bank transfer to
--  the admin.
--
--  Migration 002 (Paystack transfer columns) is kept but its columns
--  are now dormant — the accept path never fires a Paystack transfer.
--  Leaving them lets us switch back easily if the model changes.
--
--  Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. New order-status values for the direct-pay flow ─────────────
--   runner_funded_awaiting_payment   — runner has accepted; showing
--                                       their bank details to the
--                                       customer; waiting for payment
--                                       to land (or the 20-min timeout)
--   runner_funded_payment_confirmed  — runner tapped "received" on
--                                       their bank alert; order can
--                                       proceed to the restaurant
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_awaiting_payment';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'runner_funded_payment_confirmed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Payment-tracking columns on orders ──────────────────────────
--  Snapshot the runner's bank details at accept time onto the order.
--  The customer views these; the runner's profile bank details are
--  the source of truth, but stamping them lets us handle the case
--  where a runner edits their bank mid-order without breaking a
--  transfer already in progress.
--
--  payment_expected_amount  — what the customer should send
--  payment_confirmed_at     — runner tapped "received"
--  platform_owed_amount     — what the runner owes CampusRun for
--                              this order (delivery_fee + plate_fee
--                              - runner_earnings). Set when payment
--                              is confirmed; cleared to 0 on settlement.
--  platform_settled_at      — when the runner settled up on this order
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS runner_funded_payment_expected_amount INT,
  ADD COLUMN IF NOT EXISTS runner_funded_payment_confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_funded_payment_deadline        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_owed_amount                  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_settled_at                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_settlement_id                UUID;

CREATE INDEX IF NOT EXISTS idx_orders_platform_owed
  ON orders(runner_id)
  WHERE platform_owed_amount > 0 AND platform_settled_at IS NULL;

-- ── 3. Settlement log ──────────────────────────────────────────────
--  When a runner sends their accumulated platform debt to the admin's
--  bank account, admin marks it settled here. Each row groups the
--  orders being paid off in one bank transfer, matching the bank ref
--  the runner used.
CREATE TABLE IF NOT EXISTS platform_settlements (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  runner_id             UUID NOT NULL REFERENCES users(id),
  amount                INT NOT NULL,
  order_count           INT NOT NULL,
  bank_reference        TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by           UUID REFERENCES users(id),
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_settlements_runner
  ON platform_settlements(runner_id, received_at DESC);

COMMENT ON TABLE platform_settlements IS
  'Records when a runner has sent CampusRun their accumulated debt from '
  'runner-funded orders. Each row = one bank transfer from the runner '
  'covering some or all of their outstanding orders.';
