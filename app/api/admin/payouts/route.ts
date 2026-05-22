// app/api/admin/payouts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const [{ data: profiles }, { data: delivered }, { data: payouts }, { data: requests }] = await Promise.all([
    admin.from('runner_profiles').select('user_id, total_earnings, users(full_name, phone)'),
    admin.from('orders').select('id, runner_id, runner_earnings, delivered_at, order_ref').eq('status', 'delivered').not('runner_id', 'is', null),
    admin.from('payouts').select('*, marked_by:users!marked_paid_by(full_name)').order('created_at', { ascending: false }),
    admin.from('payout_requests').select('*, runner:users!runner_id(full_name, phone)').order('created_at', { ascending: false }),
  ])

  const paidOrderIds = new Set(
    (payouts ?? []).flatMap(p => { try { return JSON.parse(p.note ?? '[]') } catch { return [] } })
  )

  const runnerSummaries = (profiles ?? []).map(r => {
    const unpaidOrders = (delivered ?? []).filter(o => o.runner_id === r.user_id && !paidOrderIds.has(o.id))
    return { ...r, unpaidOrders, unpaidAmount: unpaidOrders.reduce((s, o) => s + (o.runner_earnings ?? 300), 0), unpaidCount: unpaidOrders.length }
  }).filter(r => r.unpaidCount > 0 || (payouts ?? []).some(p => p.runner_id === r.user_id))

  return NextResponse.json({ runners: runnerSummaries, payouts: payouts ?? [], requests: requests ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const admin = createAdminClient()

  // Mark earnings payout
  if (body.action === 'mark_paid') {
    const { runnerId, orderIds, amount } = body
    const { error } = await admin.from('payouts').insert({
      runner_id: runnerId, amount, delivery_count: orderIds.length,
      marked_paid_at: new Date().toISOString(), marked_paid_by: user.id,
      note: JSON.stringify(orderIds),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Resolve payout request
  if (body.action === 'resolve_request') {
    const { requestId, status, note } = body
    const { error } = await admin.from('payout_requests').update({
      status, note: note || null, resolved_at: new Date().toISOString(),
    }).eq('id', requestId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
