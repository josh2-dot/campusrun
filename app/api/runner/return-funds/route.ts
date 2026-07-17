// app/api/runner/return-funds/route.ts
//
// Runner-initiated return flow. Runs when the runner can't complete
// the food purchase (restaurant closed, item unavailable, etc). Paystack
// does not support automatic clawback of an outbound transfer, so the
// runner must actively pay back the funds themselves via a payment
// request link. This endpoint creates the payment request and returns
// the link — the frontend hands it off to the runner to complete.
//
// State transitions:
//   runner_funded_awaiting_pickup → runner_funded_returning
//   webhook on the RETURN-{orderId} ref → cancelled (+ customer refund)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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
    .select(
      'id, order_ref, runner_id, payment_model, status, ' +
      'runner_funded_transfer_amount, customer_id'
    )
    .eq('id', orderId)
    .single()

  if (!orderRaw) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (order.runner_id !== user.id) {
    return NextResponse.json({ error: 'Only the assigned runner can return funds' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ error: 'This order is not runner-funded' }, { status: 400 })
  }
  // Return is only valid before pickup. Once pickup is marked, the
  // food is presumed bought and the money has left the runner's hands.
  if (order.status !== 'runner_funded_awaiting_pickup') {
    return NextResponse.json({
      error: order.status === 'runner_funded_pending_transfer'
        ? "Funds haven't been sent to you yet — nothing to return."
        : "Can't return funds once pickup is confirmed. Contact Lymora if you need to cancel.",
    }, { status: 409 })
  }

  const amount = order.runner_funded_transfer_amount ?? 0
  if (amount <= 0) {
    return NextResponse.json({ error: 'No transfer amount on record' }, { status: 400 })
  }

  const { data: userRow } = await admin
    .from('users').select('full_name, email, phone').eq('id', user.id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = userRow as any

  const reference = `RETURN-${order.id}`

  // Create a Paystack payment request the runner pays from their side.
  // Falls back gracefully if Paystack is unreachable — the state stays
  // as runner_funded_awaiting_pickup so the runner can retry.
  let authUrl: string | undefined
  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: u?.email ?? `${u?.phone ?? user.id}@runner.campusrun.food`,
        amount: amount * 100, // kobo
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/order/${order.id}`,
        metadata: {
          purpose: 'runner_funded_return',
          order_id: order.id,
          order_ref: order.order_ref,
          reason,
        },
        channels: ['bank_transfer', 'ussd', 'card'],
      }),
    })
    const data = await res.json()
    if (data.status && data.data?.authorization_url) {
      authUrl = data.data.authorization_url
    } else {
      return NextResponse.json({
        error: 'Paystack rejected the return request. Try again or WhatsApp Lymora.',
      }, { status: 502 })
    }
  } catch {
    return NextResponse.json({
      error: "Couldn't reach Paystack. Check your internet and try again.",
    }, { status: 502 })
  }

  // Mark the order as returning. The webhook completes the transition
  // once the runner actually pays the link.
  await admin
    .from('orders')
    .update({
      status: 'runner_funded_returning',
      runner_funded_return_reason: reason,
    })
    .eq('id', order.id)

  return NextResponse.json({ success: true, authorization_url: authUrl, reference })
}
