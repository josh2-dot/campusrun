// app/api/runner/return-funds/route.ts
//
// Runner-initiated cancel when they can't complete the order after
// receiving payment (restaurant closed, item unavailable, etc.).
//
// In the direct-pay model, the money is in the runner's own account,
// not Paystack. So "return funds" means: runner sends the customer's
// money back to them from their own bank app, then confirms here.
// The order goes to cancelled; the runner no longer owes the platform
// (platform_owed_amount is zeroed since no service was delivered).

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
  const { orderId, reason } = await request.json() as { orderId: string; reason: ReturnReason }

  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  if (!RETURN_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: orderRaw } = await admin
    .from('orders')
    .select('id, order_ref, runner_id, payment_model, status, customer_id')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.runner_id !== user.id) {
    return NextResponse.json({ error: 'Only the assigned runner can return funds' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ error: 'This order is not runner-funded' }, { status: 400 })
  }
  // Return-funds is valid only after the runner has confirmed receiving
  // payment. Before that there's nothing to return.
  if (order.status !== 'runner_funded_payment_confirmed') {
    return NextResponse.json({
      error: order.status === 'runner_funded_awaiting_payment'
        ? "You haven't confirmed receiving payment yet — just cancel the order instead."
        : `Can't return funds from ${order.status}. Contact CampusRun if you need help.`,
    }, { status: 409 })
  }

  await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_by: 'runner',
      cancel_reason: `runner_funded_return:${reason}`,
      cancelled_at: new Date().toISOString(),
      runner_funded_return_reason: reason,
      // Runner didn't earn on this order and doesn't owe CampusRun
      // anything for it — service wasn't delivered.
      platform_owed_amount: 0,
    })
    .eq('id', order.id)

  await sendPushToUser(order.customer_id, {
    title: '↩️ Order cancelled — refund on the way',
    body: `Your runner couldn't complete ${order.order_ref}. They'll send your money back to your account.`,
    url: `/orders`,
    tag: 'order-refunded',
  })

  if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
    const msg = `↩️ Runner-funded cancelled\nOrder: ${order.order_ref}\nReason: ${reason}\nRunner will refund customer directly.`
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
