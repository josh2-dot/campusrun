// app/api/messages/mark-read/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { orderId } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify membership
  const { data: order } = await admin
    .from('orders')
    .select('customer_id, runner_id')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  let myRole: 'customer' | 'runner'
  if (order.customer_id === user.id)      myRole = 'customer'
  else if (order.runner_id === user.id)   myRole = 'runner'
  else return NextResponse.json({ error: 'Not a participant' }, { status: 403 })

  // Mark messages from the other party as read
  const otherRole = myRole === 'customer' ? 'runner' : 'customer'

  await admin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('sender_role', otherRole)
    .is('read_at', null)

  return NextResponse.json({ success: true })
}
