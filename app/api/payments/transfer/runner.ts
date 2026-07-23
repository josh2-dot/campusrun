// app/api/payments/transfer/runner.ts
//
// Runner-funded flow: fires a real Paystack transfer to the runner's
// bank account. Replaces the earlier queue-only placeholder.
//
// Flow:
//   1. Load the order, verify it's runner-funded and eligible
//   2. Get or create a Paystack transfer recipient for the runner
//   3. Fire the transfer via Paystack API
//   4. Insert an audit row in runner_transfer_queue
//   5. Stamp the order with the transfer ref + amount
//
// State returned to the caller (accept route):
//   status='success'  — Paystack completed synchronously (test mode
//                       or fast live transfer). Order can advance
//                       directly to runner_funded_awaiting_pickup.
//   status='pending'  — Paystack accepted, awaiting webhook. Order
//                       stays in runner_funded_pending_transfer;
//                       webhook advances it later.
//   status='otp'      — Configuration error: OTP is enabled on the
//                       Paystack account. Bail with a clear message.

import { createAdminClient } from '@/lib/supabase/server'
import {
  getOrCreateRecipient,
  initiateTransfer,
  type TransferInitialStatus,
} from '@/lib/paystack/transfers'

export async function queueRunnerTransfer(orderId: string): Promise<
  | { ok: true; transferRef: string; amount: number; initialStatus: TransferInitialStatus }
  | { ok: false; reason: string; code?: string }
> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, order_ref, payment_model, food_total, runner_earnings, ' +
      'runner_id, runner_funded_transfer_ref'
    )
    .eq('id', orderId)
    .single()

  if (!order) return { ok: false, reason: 'Order not found' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  if (o.payment_model !== 'runner_funded') {
    return { ok: false, reason: 'Order is not runner-funded' }
  }
  if (!o.runner_id) return { ok: false, reason: 'Order has no runner assigned' }

  // Idempotent guard — existing transfer_ref means we've already fired.
  // Protects against a double-tapped Accept sending money twice.
  if (o.runner_funded_transfer_ref) {
    return { ok: false, reason: 'Transfer already fired for this order' }
  }

  const amount = (o.food_total ?? 0) + (o.runner_earnings ?? 0)
  if (amount <= 0) return { ok: false, reason: 'Invalid transfer amount' }

  // ── 1. Get or create the Paystack recipient ─────────────────────
  const recipientResult = await getOrCreateRecipient(o.runner_id)
  if (!recipientResult.ok) {
    return { ok: false, reason: recipientResult.reason }
  }

  // ── 2. Fire the transfer ────────────────────────────────────────
  // Our reference uses the order id so the webhook can match it back.
  // Prefix RFT- so we can distinguish it from customer-payment refs
  // (which are CR_...) and from return-flow refs (which are RETURN-...).
  const reference = `RFT-${o.id}`

  const transferResult = await initiateTransfer({
    recipientCode: recipientResult.recipientCode,
    amountNaira: amount,
    reference,
    reason: `CampusRun order ${o.order_ref}`,
  })

  if (!transferResult.ok) {
    return { ok: false, reason: transferResult.reason, code: transferResult.code }
  }

  if (transferResult.initialStatus === 'otp') {
    // OTP required — someone at Paystack has to authorize each transfer.
    // Not workable for an automated pilot. Surface a specific error the
    // admin can act on.
    return {
      ok: false,
      reason:
        'Paystack OTP is enabled — transfer requires manual approval. ' +
        'Disable "Confirm transfers before sending" in Paystack Dashboard → ' +
        'Settings → Preferences.',
      code: 'OTP_REQUIRED',
    }
  }

  // ── 3. Insert queue audit row ───────────────────────────────────
  // Fetch bank details for the audit snapshot. Not required for the
  // transfer itself (Paystack already has them via the recipient),
  // but useful for admin views + reconciliation.
  const { data: runnerProfileRaw } = await supabase
    .from('runner_profiles')
    .select('bank_name, account_number')
    .eq('user_id', o.runner_id)
    .single()
  const { data: runnerUserRaw } = await supabase
    .from('users').select('full_name').eq('id', o.runner_id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runnerProfile = runnerProfileRaw as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runnerUser = runnerUserRaw as any

  const queueStatus: 'sent' | 'success' =
    transferResult.initialStatus === 'success' ? 'success' : 'sent'

  await supabase.from('runner_transfer_queue').insert({
    order_id: o.id,
    runner_id: o.runner_id,
    order_ref: o.order_ref,
    amount,
    status: queueStatus,
    bank_name: runnerProfile?.bank_name ?? null,
    account_number: runnerProfile?.account_number ?? null,
    account_name: runnerUser?.full_name ?? null,
    paystack_ref: reference,
    paystack_transfer_code: transferResult.transferCode,
    paid_at: transferResult.initialStatus === 'success' ? new Date().toISOString() : null,
  })

  // ── 4. Stamp the order ─────────────────────────────────────────
  const updates: Record<string, unknown> = {
    runner_funded_transfer_ref: reference,
    runner_funded_transfer_amount: amount,
    runner_funded_paystack_transfer_code: transferResult.transferCode,
  }
  if (transferResult.initialStatus === 'success') {
    updates.runner_funded_transferred_at = new Date().toISOString()
  }

  await supabase.from('orders').update(updates).eq('id', o.id)

  return {
    ok: true,
    transferRef: reference,
    amount,
    initialStatus: transferResult.initialStatus,
  }
}
