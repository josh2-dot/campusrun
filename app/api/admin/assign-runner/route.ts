// app/api/admin/assign-runner/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId, runnerId } = await request.json()
  if (!orderId || !runnerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, order_ref, customer_id, restaurant:restaurants(name)')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { data: runnerUser } = await admin
    .from('users')
    .select('full_name')
    .eq('id', runnerId)
    .single()

  const { error } = await admin
    .from('orders')
    .update({ runner_id: runnerId, status: 'runner_assigned' })
    .eq('id', orderId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const restaurantRaw = order.restaurant
  const restaurant = Array.isArray(restaurantRaw)
    ? restaurantRaw[0] as { name: string } | null
    : restaurantRaw as { name: string } | null

  await sendPushToUser(runnerId, {
    title: '📋 Order assigned to you',
    body: `Admin assigned ${order.order_ref} from ${restaurant?.name} to you`,
    url: `/order/${orderId}`,
    tag: 'new-order',
  })

  await sendPushToUser(order.customer_id, {
    title: '🛵 Runner assigned!',
    body: `${runnerUser?.full_name} is handling your order ${order.order_ref}`,
    url: `/track/${orderId}`,
    tag: 'runner-assigned',
  })

  return NextResponse.json({ success: true })
}
