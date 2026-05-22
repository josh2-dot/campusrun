// app/api/runner/update-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId, status } = await request.json()
  if (!orderId || status !== 'picked_up') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: order } = await admin.from('orders').select('id, status, runner_id, customer_id, order_ref').eq('id', orderId).single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.runner_id !== user.id) return NextResponse.json({ error: 'Not your order' }, { status: 403 })

  const validPriorStatuses = ['runner_assigned', 'awaiting_runner', 'preparing']
  if (!validPriorStatuses.includes(order.status)) {
    return NextResponse.json({ error: `Cannot mark as picked up from status: ${order.status}` }, { status: 409 })
  }

  const { data: updated, error } = await admin.from('orders').update({ status: 'picked_up' }).eq('id', orderId).select().single()
  if (error || !updated) return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })

  // Push to customer: food picked up
  await sendPushToUser(order.customer_id, {
    title: '🚀 Food picked up!',
    body: `Your order ${order.order_ref} is on its way. Share your delivery code when it arrives.`,
    url: `/track/${orderId}`,
    tag: 'picked-up',
  })

  return NextResponse.json({ success: true, order: updated })
}
