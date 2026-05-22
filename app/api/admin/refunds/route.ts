// app/api/admin/refunds/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { orderId } = await request.json()
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const { data: order } = await admin.from('orders').select('status, refund_status').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'cancelled') return NextResponse.json({ error: 'Order is not cancelled' }, { status: 409 })
  if (order.refund_status === 'processed') return NextResponse.json({ error: 'Already processed' }, { status: 409 })

  const { error } = await admin.from('orders').update({
    refund_status: 'processed',
    refund_processed_at: new Date().toISOString(),
    refund_processed_by: user.id,
  }).eq('id', orderId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
