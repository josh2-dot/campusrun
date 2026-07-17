// app/api/payments/transfer/runner.ts
// Runner-funded flow: queues a transfer instruction to the runner.
// Follows the same queue-based pattern as transferToRestaurant().
// Admin pays out from /admin/payments once reviewed.

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Insert a transfer instruction for the runner. The runner only sees
 * funds land once Lymora marks this queue row as 'sent' from
 * /admin/payments. Return value indicates whether the row was created
 * (skipped if the order isn't runner-funded, or the transfer already
 * exists — idempotent).
 */
export async function queueRunnerTransfer(orderId: string): Promise<
  | { ok: true; queueId: string; transferRef: string; amount: number }
  | { ok: false; reason: string }
> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_ref, payment_model, food_total, runner_earnings, runner_id, runner_funded_transfer_ref')
    .eq('id', orderId)
    .single()

  if (!order) return { ok: false, reason: 'Order not found' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  if (o.payment_model !== 'runner_funded') {
    return { ok: false, reason: 'Order is not runner-funded' }
  }
  if (!o.runner_id) return { ok: false, reason: 'Order has no runner assigned' }
  // Idempotent: existing transfer_ref means we already queued this
  // order. Protects against a double-tapped Accept firing two rows.
  if (o.runner_funded_transfer_ref) {
    return { ok: false, reason: 'Transfer already queued for this order' }
  }

  const amount = (o.food_total ?? 0) + (o.runner_earnings ?? 0)
  if (amount <= 0) return { ok: false, reason: 'Invalid transfer amount' }

  // Snapshot bank details at accept time so a mid-flight change
  // to the runner's profile doesn't derail the payout downstream.
  const { data: runnerProfile } = await supabase
    .from('runner_profiles')
    .select('bank_name, account_number')
    .eq('user_id', o.runner_id)
    .single()

  const { data: runnerUser } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', o.runner_id)
    .single()

  const { data: queueRow, error } = await supabase
    .from('runner_transfer_queue')
    .insert({
      order_id: o.id,
      runner_id: o.runner_id,
      order_ref: o.order_ref,
      amount,
      status: 'pending',
      bank_name: runnerProfile?.bank_name ?? null,
      account_number: runnerProfile?.account_number ?? null,
      account_name: (runnerUser as { full_name?: string } | null)?.full_name ?? null,
    })
    .select('id')
    .single()

  if (error || !queueRow) {
    return { ok: false, reason: error?.message ?? 'Failed to queue transfer' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = queueRow as any
  const transferRef = `RFT-${String(q.id).slice(0, 8).toUpperCase()}`
  await supabase
    .from('orders')
    .update({
      runner_funded_transfer_ref: transferRef,
      runner_funded_transfer_amount: amount,
    })
    .eq('id', o.id)

  return { ok: true, queueId: q.id, transferRef, amount }
}

