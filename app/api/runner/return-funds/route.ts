// app/api/runner/return-funds/route.ts
//
// Runner-initiated cancel when they can't complete the order after
// receiving payment. In the direct-pay model, they send the money
// back to the customer from their own bank app, then tap "I've sent
// the refund" to close the order. Platform debt is zeroed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

const RETURN_REASONS = [
  'restaurant_closed',
  'item_unavailable',
  'restaurant_refused',
  'other',
] as const

type ReturnReason = typeof RETURN_REASONS[number]

export async function POST(request: NextRequest) {
  const { orderId, reason } = await request.json().catch(() => ({})) as {
    orderId?: string; reason?: ReturnReason
  }

  if (!orderId) return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 })
  if (!reason || !RETURN_REASONS.includes(reason)) {
    return NextResponse.json({ success: false, error: 'Invalid reason' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: orderRaw, error: orderErr } = await admin
    .from('orders')
    .select('id, order_ref, runner_id, customer_id, payment_model, status')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) {
    return NextResponse.json({ success: false, error: `Order lookup failed: ${orderErr.message}` }, { status: 500 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (!order) return NextResponse.json({ success: false, error: `No order with id ${orderId}` }, { status: 404 })
  if (order.runner_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Only the assigned runner can refund' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ success: false, error: 'This is not a runner-funded order' }, { status: 400 })
  }
  if (order.status !== 'runner_funded_payment_confirmed') {
    return NextResponse.json({
      success: false,
      error: order.status === 'runner_funded_awaiting_payment'
        ? 'No payment received yet — cancel the order instead'
        : `Can't refund from status "${order.status}"`,
    }, { status: 409 })
  }

  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_by: 'runner',
      cancel_reason: `runner_funded_return:${reason}`,
      cancelled_at: new Date().toISOString(),
      runner_funded_return_reason: reason,
      platform_owed_amount: 0,
    })
    .eq('id', order.id)

  if (updateErr) {
    return NextResponse.json({ success: false, error: `Update failed: ${updateErr.message}` }, { status: 500 })
  }

  await sendPushToUser(order.customer_id, {
    title: '\u21A9\uFE0F Order cancelled — refund on the way',
    body: `Your runner couldn't complete ${order.order_ref}. They'll send your money back.`,
    url: '/orders',
    tag: 'order-refunded',
  })

  if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
    const msg = `\u21A9\uFE0F Runner-funded cancelled\nOrder: ${order.order_ref}\nReason: ${reason}\nRunner is refunding customer directly.`
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

  return NextResponse.json({ success: true })
}
