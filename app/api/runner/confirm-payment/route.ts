// app/api/runner/confirm-payment/route.ts
//
// Runner confirms they've received the customer's bank transfer for
// a runner-funded order. Runner's bank alert is the source of truth —
// they only tap this after the money actually lands.
//
// Advances order from runner_funded_awaiting_payment → runner_funded_payment_confirmed
// then customer + runner see it flow through the normal delivery states.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: orderRaw } = await admin
    .from('orders')
    .select('id, order_ref, runner_id, customer_id, status, payment_model, restaurant:restaurants(name)')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.runner_id !== user.id) {
    return NextResponse.json({ error: 'Only the assigned runner can confirm payment' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ error: 'Order is not runner-funded' }, { status: 400 })
  }
  if (order.status !== 'runner_funded_awaiting_payment') {
    return NextResponse.json({
      error: order.status === 'runner_funded_payment_confirmed'
        ? 'Payment already confirmed'
        : `Can't confirm payment from ${order.status}`,
    }, { status: 409 })
  }

  // Advance the order — race-guard on the source state so a double-tap
  // doesn't double-fire the push notifications.
  const { data: updated } = await admin
    .from('orders')
    .update({
      status: 'runner_funded_payment_confirmed',
      runner_funded_payment_confirmed_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'runner_funded_awaiting_payment')
    .select('id')

  if (!updated?.length) {
    return NextResponse.json({ error: 'Order state changed — refresh' }, { status: 409 })
  }

  // Push customer — they now know the runner is en route to the restaurant.
  const restaurant = Array.isArray(order.restaurant) ? order.restaurant[0] : order.restaurant
  await sendPushToUser(order.customer_id, {
    title: '✅ Payment received',
    body: `Your runner is heading to ${restaurant?.name ?? 'the restaurant'} now.`,
    url: `/track/${order.id}`,
    tag: 'payment-received',
  })

  return NextResponse.json({ success: true })
}
