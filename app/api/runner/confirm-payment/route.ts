// app/api/runner/confirm-payment/route.ts
//
// Runner taps "I received the payment" after their bank alerts them.
// Advances order from runner_funded_awaiting_payment → runner_funded_payment_confirmed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId } = await request.json().catch(() => ({}))
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: orderRaw, error: orderErr } = await admin
    .from('orders')
    .select('id, order_ref, runner_id, customer_id, restaurant_id, status, payment_model')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) {
    return NextResponse.json({ success: false, error: `Order lookup failed: ${orderErr.message}` }, { status: 500 })
  }
  if (!orderRaw) {
    return NextResponse.json({ success: false, error: `No order with id ${orderId}` }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any

  if (order.runner_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Only the assigned runner can confirm payment' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ success: false, error: 'This is not a runner-funded order' }, { status: 400 })
  }
  if (order.status !== 'runner_funded_awaiting_payment') {
    return NextResponse.json({
      success: false,
      error: order.status === 'runner_funded_payment_confirmed'
        ? 'Payment already confirmed'
        : `Can't confirm from status "${order.status}"`,
    }, { status: 409 })
  }

  const { data: updated, error: updateErr } = await admin
    .from('orders')
    .update({
      status: 'runner_funded_payment_confirmed',
      runner_funded_payment_confirmed_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'runner_funded_awaiting_payment')
    .select('id')

  if (updateErr) {
    return NextResponse.json({
      success: false,
      error: `Update failed: ${updateErr.message}`,
      hint: updateErr.hint,
    }, { status: 500 })
  }
  if (!updated?.length) {
    return NextResponse.json({ success: false, error: 'Order state changed — refresh' }, { status: 409 })
  }

  // Explicit restaurant lookup for the push message
  const { data: restRaw } = await admin
    .from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantName = (restRaw as any)?.name ?? 'the restaurant'

  await sendPushToUser(order.customer_id, {
    title: '\u2705 Payment received',
    body: `Your runner is heading to ${restaurantName} now.`,
    url: `/track/${order.id}`,
    tag: 'payment-received',
  })

  return NextResponse.json({ success: true })
}
