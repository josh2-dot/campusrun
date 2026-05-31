// app/api/runner/confirm-delivery/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId, code } = await request.json()
  if (!orderId || !code) return NextResponse.json({ error: 'Missing orderId or code' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: order } = await admin.from('orders').select('id, status, runner_id, customer_id, delivery_code, order_ref, food_total').eq('id', orderId).single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.runner_id !== user.id) return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  if (order.status !== 'picked_up') return NextResponse.json({ error: 'Order must be picked up before confirming delivery' }, { status: 409 })
  if (code.trim() !== order.delivery_code) return NextResponse.json({ success: false, error: 'Wrong code. Ask the customer to check their tracking page.' }, { status: 422 })

  const { data: updated, error } = await admin.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', orderId).select().single()
  if (error || !updated) return NextResponse.json({ error: 'Failed to confirm delivery' }, { status: 500 })

  // ── Debit float: food cost + runner cut went out today ──────────
  // Logged in float_ledger for audit. Future Paystack settlement will credit it back.
  const RUNNER_FLAT_EARNINGS = 300
  const cashOut = (order.food_total ?? 0) + RUNNER_FLAT_EARNINGS
  await admin.rpc('debit_float', {
    p_amount:   cashOut,
    p_order_id: orderId,
    p_reason:   'order_cashout',
    p_notes:    `Order ${order.order_ref}`,
  })

  // Push to customer: delivered
  await sendPushToUser(order.customer_id, {
    title: '🎉 Order delivered!',
    body: `Your order ${order.order_ref} has been delivered. Enjoy your meal!`,
    url: `/track/${orderId}`,
    tag: 'delivered',
  })

  // Push to runner: earnings confirmed
  await sendPushToUser(user.id, {
    title: '✅ Delivery complete!',
    body: `₦300 added to your earnings for order ${order.order_ref}`,
    url: '/dashboard',
    tag: 'earnings',
  })

  return NextResponse.json({ success: true, order: updated })
}
