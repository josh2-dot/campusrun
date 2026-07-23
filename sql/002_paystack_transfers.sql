-- ═══════════════════════════════════════════════════════════════════
--  Runner-Funded — Migration 002: Real Paystack Transfers
-- ───────────────────────────────────────────────────────────────────
--  Replaces the manual "float queue" model with real Paystack transfer
--  API calls fired on runner accept. Adds columns to cache the Paystack
--  recipient code on runner_profiles (created once per runner, reused
--  for every transfer) and to track the transfer's Paystack-side state
--  on the queue row and order.
--
--  Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Cache Paystack recipient on runner_profiles ─────────────────
--  Recipient creation is a Paystack API call that returns RCP_...
--  We cache it here so we only call the recipient endpoint once per
--  runner. If the runner changes bank details, the cached code is
--  invalidated on save (bank-details save endpoint clears it).
ALTER TABLE runner_profiles
  ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;

COMMENT ON COLUMN runner_profiles.paystack_recipient_code IS
  'Cached Paystack recipient code (RCP_...) created from bank details. '
  'Cleared when the runner updates their bank so a new recipient gets '
  'created on next transfer.';

-- ── 2. Track transfer state on the queue ───────────────────────────
ALTER TABLE runner_transfer_queue
  ADD COLUMN IF NOT EXISTS paystack_transfer_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

--  Extend the status CHECK to include 'reversed' (Paystack can reverse
--  a successful transfer if the destination bank rejects it later).
--  Postgres doesn't have ALTER CHECK, so drop + re-add.
ALTER TABLE runner_transfer_queue DROP CONSTRAINT IF EXISTS runner_transfer_queue_status_check;
ALTER TABLE runner_transfer_queue
  ADD CONSTRAINT runner_transfer_queue_status_check
  CHECK (status IN ('pending', 'sent', 'success', 'failed', 'reversed', 'cancelled'));

COMMENT ON COLUMN runner_transfer_queue.status IS
  'pending: created but not yet sent to Paystack (rare — usually skipped). '
  'sent: initiated at Paystack, awaiting webhook confirmation. '
  'success: transfer.success webhook received. '
  'failed: transfer.failed webhook or initial API rejection. '
  'reversed: transfer.reversed webhook — money returned to Paystack balance. '
  'cancelled: manually cancelled by admin.';

-- ── 3. Track Paystack transfer code on the order ───────────────────
--  Useful for direct queries and admin views without joining through
--  the queue. The transfer_code (TRF_...) is what Paystack uses to
--  identify the transfer in its webhooks.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS runner_funded_paystack_transfer_code TEXT;
