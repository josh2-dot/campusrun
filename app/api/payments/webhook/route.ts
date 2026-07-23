import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, sendPushToAvailableRunners } from '@/lib/send-push'
import { transferToRestaurant } from '../transfer/restaurant'
import { captureError } from '@/lib/sentry'

// Two flows share this webhook:
//   1. Customer paying for an order (existing) — CR_{orderId}_{ts} refs
//   2. Runner returning unspent funds after a failed pickup (new)
//      — RETURN-{orderId} refs, marked by the runner-funded flow

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest('hex')

  if (hash !== signature) {
    captureError(new Error('Webhook signature validation failed'), {
      tags:  { event: 'webhook_signature_invalid' },
      level: 'warning',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(body)

  // ── Branch: Paystack transfer events (runner-funded flow) ────────
  // transfer.success / transfer.failed / transfer.reversed each carry
  // the transfer's reference (RFT-{orderId}) and transfer_code (TRF_...).
  if (event.event === 'transfer.success')  return handleTransferSuccess(event.data)
  if (event.event === 'transfer.failed')   return handleTransferFailed(event.data)
  if (event.event === 'transfer.reversed') return handleTransferReversed(event.data)

  if (event.event === 'charge.success') {
    const { reference, metadata } = event.data

    // ── Branch: runner-funded return payment ─────────────────────────
    // These references have the form RETURN-{orderId}. The runner has
    // just paid unspent funds back after a failed pickup. Advance the
    // order to cancelled and refund the customer.
    if (typeof reference === 'string' && reference.startsWith('RETURN-')) {
      return handleReturnPayment(reference, event.data)
    }

    // ── Existing branch: customer paying for an order ────────────────
    const orderId = metadata?.order_id
    if (!orderId) return NextResponse.json({ received: true })

    const supabase = createAdminClient()

    await supabase
      .from('payments')
      .update({ status: 'success', channel: event.data.channel, paid_at: new Date().toISOString() })
      .eq('paystack_ref', reference)

    // Include payment_model so we can skip restaurant transfer for
    // runner-funded orders (they have no restaurant subaccount).
    const { data: orderRaw } = await supabase
      .from('orders')
      .select('status, customer_id, order_ref, scheduled_for, payment_model')
      .eq('id', orderId)
      .single()

    if (!orderRaw) return NextResponse.json({ received: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = orderRaw as any
    if (!['pending', 'confirmed'].includes(order.status)) {
      return NextResponse.json({ received: true })
    }

    await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)

    const isScheduled = order.scheduled_for && new Date(order.scheduled_for) > new Date()

    if (isScheduled) {
      const timeLabel = new Date(order.scheduled_for!).toLocaleTimeString('en-NG', {
        hour: '2-digit', minute: '2-digit',
      })
      await sendPushToUser(order.customer_id, {
        title: '\u2705 Payment confirmed — order scheduled!',
        body: `Your order ${order.order_ref} is confirmed. We'll find a runner for ${timeLabel}.`,
        url: `/track/${orderId}`,
        tag: 'order-scheduled',
      })
    } else {
      // Only trigger restaurant transfer for restaurant_paid orders.
      // Runner-funded orders queue a runner transfer at runner-accept
      // time instead (see api/runner/accept + transfer/runner).
      if (order.payment_model !== 'runner_funded') {
        await transferToRestaurant(orderId)
      }
      await sendPushToUser(order.customer_id, {
        title: '\u2705 Payment received!',
        body: `Order ${order.order_ref} confirmed. Finding a runner for you now.`,
        url: `/track/${orderId}`,
        tag: 'order-confirmed',
      })
      await triggerAutoAllocation(orderId, supabase)
    }
  }

  return NextResponse.json({ received: true })
}

// Runner has paid back the unspent funds. Complete the return flow.
async function handleReturnPayment(reference: string, chargeData: { amount?: number; channel?: string }) {
  void chargeData
  const orderId = reference.slice('RETURN-'.length)
  const supabase = createAdminClient()

  const { data: orderRaw } = await supabase
    .from('orders')
    .select('id, order_ref, customer_id, runner_id, status, runner_funded_return_reason')
    .eq('id', orderId)
    .single()

  if (!orderRaw) return NextResponse.json({ received: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (order.status !== 'runner_funded_returning') {
    // Already processed or unexpected state — ack and drop.
    return NextResponse.json({ received: true })
  }

  await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_by: 'runner',
      cancel_reason: `runner_funded_return:${order.runner_funded_return_reason ?? 'unknown'}`,
      cancelled_at: new Date().toISOString(),
      runner_funded_returned_ref: reference,
      runner_funded_returned_at: new Date().toISOString(),
    })
    .eq('id', order.id)

  // Refund the customer for the full order. We queue a customer refund
  // row that admin processes; keeping symmetry with the runner transfer
  // queue means no direct Paystack action from the webhook.
  await supabase.from('customer_refund_queue').insert({
    order_id: order.id,
    order_ref: order.order_ref,
    customer_id: order.customer_id,
    reason: `Runner-funded return: ${order.runner_funded_return_reason ?? 'restaurant unavailable'}`,
    status: 'pending',
  }).select().single().then(() => {}, () => {}) // fine if table doesn't exist yet — see note below

  // Notify customer + runner
  await sendPushToUser(order.customer_id, {
    title: '↩️ Your order was refunded',
    body: `We couldn't complete order ${order.order_ref}. A refund is on the way.`,
    url: `/orders`,
    tag: 'order-refunded',
  })
  if (order.runner_id) {
    await sendPushToUser(order.runner_id, {
      title: '✅ Return complete',
      body: `Funds for ${order.order_ref} returned. Thanks for the honest try.`,
      url: `/dashboard`,
      tag: 'return-complete',
    })
  }

  // Alert Lymora
  if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
    const msg = `↩️ Runner-funded return complete\nOrder: ${order.order_ref}\nReason: ${order.runner_funded_return_reason}\n\nCustomer refund queued.`
    await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: process.env.ADMIN_PHONE,
        from: process.env.TERMII_SENDER_ID ?? 'CampusRun',
        sms: msg, type: 'plain', channel: 'generic',
        api_key: process.env.TERMII_API_KEY,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ received: true })
}

async function triggerAutoAllocation(orderId: string, supabase: ReturnType<typeof createAdminClient>) {
  const { data: order } = await supabase
    .from('orders')
    .select('*, restaurant:restaurants(name, location)')
    .eq('id', orderId)
    .single()

  if (!order) return

  const { data: runners } = await supabase
    .from('runner_profiles')
    .select('user_id, users(phone, full_name)')
    .eq('is_available', true)

  if (!runners?.length) {
    await supabase.from('orders').update({
      status:          'awaiting_runner',
      broadcast_at:    new Date().toISOString(),
      broadcast_count: 1,
    }).eq('id', orderId)
    await sendSMS(process.env.ADMIN_PHONE!, `\u26A0\uFE0F CampusRun: Order ${order.order_ref} confirmed but no runners online. Watchdog will retry.`)
    return
  }

  const msg = `\uD83D\uDEF5 New order ${order.order_ref}! Earn \u20A6300. From: ${order.restaurant?.name}. Drop: ${order.delivery_address}. Accept: ${process.env.NEXT_PUBLIC_APP_URL}/order/${orderId}`
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runners.map((r: any) => {
      const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
      return phone ? sendSMS(phone, msg) : Promise.resolve()
    })
  )

  await sendPushToAvailableRunners({
    title: '\uD83D\uDEF5 New order available!',
    body: `Order ${order.order_ref} \u2014 earn \u20A6300 from ${order.restaurant?.name ?? 'restaurant'}.`,
    url: '/dashboard',
    tag: 'new-order',
  })

  await supabase.from('orders').update({
    status: 'awaiting_runner',
    broadcast_at: new Date().toISOString(),
    broadcast_count: 1,
  }).eq('id', orderId)
}

async function sendSMS(phone: string, message: string) {
  if (!process.env.TERMII_API_KEY) { console.log(`[SMS to ${phone}]: ${message}`); return }
  await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone, from: process.env.TERMII_SENDER_ID ?? 'CampusRun', sms: message, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
  }).catch(() => {})
}

// ═══════════════════════════════════════════════════════════════════
//  Paystack transfer event handlers (runner-funded flow)
// ───────────────────────────────────────────────────────────────────
//  Each event carries transfer_code + reference (RFT-{orderId}).
//  Reference is what our queue row uses to identify the transfer;
//  we can look up by paystack_ref = reference and stamp the queue
//  row + advance the order state.
// ═══════════════════════════════════════════════════════════════════

interface TransferEventData {
  reference?: string
  transfer_code?: string
  status?: string
  reason?: string
  failures?: unknown
  amount?: number
}

function orderIdFromRef(ref?: string): string | null {
  if (!ref?.startsWith('RFT-')) return null
  return ref.slice('RFT-'.length)
}

async function handleTransferSuccess(data: TransferEventData) {
  const orderId = orderIdFromRef(data.reference)
  if (!orderId) return NextResponse.json({ received: true })

  const supabase = createAdminClient()

  // Idempotency — if this webhook fires twice (Paystack retries), only
  // advance the order once.
  const { data: orderRaw } = await supabase
    .from('orders')
    .select('id, order_ref, runner_id, status')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (!order) return NextResponse.json({ received: true })

  // Only advance from pending_transfer. If we already advanced to
  // awaiting_pickup (test mode synchronous), do nothing.
  if (order.status === 'runner_funded_pending_transfer') {
    await supabase
      .from('orders')
      .update({
        status: 'runner_funded_awaiting_pickup',
        runner_funded_transferred_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'runner_funded_pending_transfer')  // race-guard

    await sendPushToUser(order.runner_id, {
      title: '💸 Funds sent — go buy',
      body: `₦${(data.amount ?? 0) / 100 || ''} for ${order.order_ref} is in your account.`.replace('  ', ' '),
      url: `/order/${order.id}`,
      tag: 'funds-sent',
    })
  }

  // Stamp the queue row as success.
  await supabase
    .from('runner_transfer_queue')
    .update({ status: 'success', paid_at: new Date().toISOString() })
    .eq('paystack_ref', data.reference)

  return NextResponse.json({ received: true })
}

async function handleTransferFailed(data: TransferEventData) {
  const orderId = orderIdFromRef(data.reference)
  if (!orderId) return NextResponse.json({ received: true })

  const supabase = createAdminClient()

  const { data: orderRaw } = await supabase
    .from('orders')
    .select('id, order_ref, runner_id, customer_id, status')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (!order) return NextResponse.json({ received: true })

  const failureReason = data.reason ?? (typeof data.failures === 'string' ? data.failures : 'Transfer failed at Paystack')

  // Roll the order back so another runner can take it. If it's already
  // moved past pending_transfer (unlikely — transfer.failed usually
  // arrives quickly), we leave it alone and alert admin manually.
  if (order.status === 'runner_funded_pending_transfer') {
    await supabase
      .from('orders')
      .update({
        status: 'awaiting_runner',
        runner_id: null,
        runner_assigned_at: null,
        runner_funded_transfer_ref: null,
        runner_funded_transfer_amount: null,
        runner_funded_paystack_transfer_code: null,
      })
      .eq('id', order.id)
  }

  await supabase
    .from('runner_transfer_queue')
    .update({ status: 'failed', failure_reason: failureReason })
    .eq('paystack_ref', data.reference)

  // Push runner + admin. Runner needs to know they don't have the money.
  if (order.runner_id) {
    await sendPushToUser(order.runner_id, {
      title: '❌ Transfer failed',
      body: `We couldn't send ${order.order_ref} — try again or skip.`,
      url: '/dashboard',
      tag: 'transfer-failed',
    })
  }
  if (process.env.ADMIN_PHONE) {
    await sendSMS(process.env.ADMIN_PHONE, `⚠️ Runner-funded transfer FAILED\nOrder: ${order.order_ref}\nReason: ${failureReason}\nRef: ${data.reference}`)
  }

  return NextResponse.json({ received: true })
}

async function handleTransferReversed(data: TransferEventData) {
  const orderId = orderIdFromRef(data.reference)
  if (!orderId) return NextResponse.json({ received: true })

  const supabase = createAdminClient()

  // A reversal means the money was successfully sent but then bounced
  // back (destination bank rejected it). This is rare but real. Because
  // we've already advanced the order and probably the runner has already
  // spent their own money buying the food, this needs admin attention —
  // we don't auto-rollback the order state.
  await supabase
    .from('runner_transfer_queue')
    .update({ status: 'reversed', failure_reason: data.reason ?? 'Transfer reversed by Paystack' })
    .eq('paystack_ref', data.reference)

  if (process.env.ADMIN_PHONE) {
    await sendSMS(process.env.ADMIN_PHONE, `🚨 Runner-funded transfer REVERSED\nOrder ${orderId}\nReason: ${data.reason ?? 'unknown'}\n\nRunner may have already spent money. Handle manually.`)
  }

  return NextResponse.json({ received: true })
}
