// app/api/runner/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  const { orderId } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'runner') return NextResponse.json({ error: 'Only runners can accept orders' }, { status: 403 })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('orders')
    .update({ runner_id: user.id, status: 'runner_assigned' })
    .eq('id', orderId)
    .is('runner_id', null)
    .in('status', ['awaiting_runner', 'confirmed'])
    .select('*, customer:users!customer_id(full_name), restaurant:restaurants(name)')

  if (error || !data?.length) return NextResponse.json({ success: false, error: 'Order already taken' }, { status: 409 })

  const order = data[0]
  const restaurant = order.restaurant as { name: string } | null

  // Push to customer: runner assigned
  await sendPushToUser(order.customer_id, {
    title: '🛵 Runner on the way!',
    body: `${profile.full_name} is heading to ${restaurant?.name} for your order`,
    url: `/track/${orderId}`,
    tag: 'runner-assigned',
  })

  return NextResponse.json({ success: true, order: data[0] })
}
