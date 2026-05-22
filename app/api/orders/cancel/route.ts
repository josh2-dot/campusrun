import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'awaiting_runner', 'runner_assigned', 'preparing']

export async function POST(request: NextRequest) {
  const { orderId, reason } = await request.json()
  if (!orderId || !reason) return NextResponse.json({ error: 'Missing orderId or reason' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, status, customer_id, runner_id, order_ref')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.customer_id !== user.id) return NextResponse.json({ error: 'Not your order' }, { status: 403 })

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    const isLate = order.status === 'picked_up' || order.status === 'delivered'
    return NextResponse.json({
      success: false,
      error: isLate
        ? 'Cannot cancel \u2014 your runner has already picked up the food.'
        : 'This order cannot be cancelled.',
    }, { status: 409 })
  }

  const { data: updated, error } = await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_by: 'customer',
      cancel_reason: reason,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error || !updated) return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })

  // ✅ NEW: if a runner was assigned, notify them immediately so they stop heading out
  if (order.runner_id) {
    await sendPushToUser(order.runner_id, {
      title: '\u274C Order cancelled',
      body: `Order ${order.order_ref} was cancelled by the customer. Head back \u2014 no delivery needed.`,
      url: '/dashboard',
      tag: 'order-cancelled',
    })
  }

  return NextResponse.json({ success: true, order: updated })
}
