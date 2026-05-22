// app/api/admin/pre-orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export async function GET(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = createAdminClient()

  // Show pools from yesterday onward (catch overnight peaks too)
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: pools } = await admin
    .from('pre_order_pools')
    .select('*, restaurant:restaurants(*)')
    .gte('pool_date', since)
    .order('peak_time', { ascending: false })

  // Fetch all sub-orders for each pool
  const poolIds = (pools ?? []).map(p => p.id)
  let orders: unknown[] = []
  if (poolIds.length) {
    const { data: o } = await admin
      .from('orders')
      .select('id, order_ref, status, food_total, delivery_address, items, pre_order_pool_id, customer:users!customer_id(full_name, phone)')
      .in('pre_order_pool_id', poolIds)
      .order('created_at')
    orders = o ?? []
  }

  return NextResponse.json({ pools: pools ?? [], orders })
}

export async function POST(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { action, poolId } = await request.json()
  const admin = createAdminClient()

  if (action === 'mark_dispatched') {
    await admin.from('pre_order_pools').update({ status: 'dispatched' }).eq('id', poolId)
    return NextResponse.json({ success: true })
  }
  if (action === 'mark_completed') {
    await admin.from('pre_order_pools').update({ status: 'completed' }).eq('id', poolId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
