// app/api/admin/settlements/route.ts
//
// GET  — list runners with outstanding platform debt (delivery + plate
//        fees minus runner earnings, per delivered runner-funded order),
//        grouped by runner. Also returns settlement history.
// POST — record a settlement: mark selected orders as settled, insert
//        an audit row in platform_settlements.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.role !== 'admin') return { ok: false as const, status: 403 }
  return { ok: true as const, userId: user.id }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'Forbidden' }, { status: gate.status })

  const admin = createAdminClient()

  // Outstanding: any delivered runner-funded order where the runner
  // owes CampusRun money and hasn't settled yet.
  const { data: outstandingRaw } = await admin
    .from('orders')
    .select('id, order_ref, runner_id, platform_owed_amount, delivered_at, runner_funded_payment_confirmed_at')
    .eq('payment_model', 'runner_funded')
    .eq('status', 'delivered')
    .gt('platform_owed_amount', 0)
    .is('platform_settled_at', null)
    .order('delivered_at', { ascending: false })
    .limit(500)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outstanding = (outstandingRaw ?? []) as any[]

  // Recent settlements (last 30) for history view
  const { data: recentRaw } = await admin
    .from('platform_settlements')
    .select('id, runner_id, amount, order_count, bank_reference, received_at, note')
    .order('received_at', { ascending: false })
    .limit(30)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentSettlements = (recentRaw ?? []) as any[]

  // Fetch runner names for both lists
  const runnerIds = new Set<string>()
  outstanding.forEach(o => runnerIds.add(o.runner_id))
  recentSettlements.forEach(s => runnerIds.add(s.runner_id))

  const { data: usersData } = runnerIds.size
    ? await admin.from('users').select('id, full_name, phone').in('id', Array.from(runnerIds))
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (usersData ?? []) as any[]
  const userById = new Map(users.map(u => [u.id, u]))

  // Group outstanding by runner
  const byRunner = new Map<string, {
    runner_id: string
    runner_name: string
    runner_phone: string
    totalOwed: number
    orderCount: number
    orders: unknown[]
  }>()

  for (const o of outstanding) {
    const runner = userById.get(o.runner_id)
    if (!byRunner.has(o.runner_id)) {
      byRunner.set(o.runner_id, {
        runner_id: o.runner_id,
        runner_name: runner?.full_name ?? 'Unknown',
        runner_phone: runner?.phone ?? '',
        totalOwed: 0,
        orderCount: 0,
        orders: [],
      })
    }
    const g = byRunner.get(o.runner_id)!
    g.totalOwed += o.platform_owed_amount
    g.orderCount += 1
    g.orders.push({
      id: o.id,
      order_ref: o.order_ref,
      amount: o.platform_owed_amount,
      delivered_at: o.delivered_at,
    })
  }

  return NextResponse.json({
    outstanding: Array.from(byRunner.values()),
    settlements: recentSettlements.map(s => ({
      ...s,
      runner_name: userById.get(s.runner_id)?.full_name ?? 'Unknown',
    })),
    totalOutstanding: Array.from(byRunner.values()).reduce((sum, g) => sum + g.totalOwed, 0),
  })
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'Forbidden' }, { status: gate.status })

  const { runnerId, orderIds, bankReference, note } = await request.json() as {
    runnerId: string
    orderIds: string[]
    bankReference?: string
    note?: string
  }

  if (!runnerId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'runnerId and orderIds required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load orders to compute the total. Guard: must all belong to the
  // runner, all runner-funded, all delivered, and all still unsettled.
  const { data: ordersRaw } = await admin
    .from('orders')
    .select('id, runner_id, platform_owed_amount, payment_model, status, platform_settled_at')
    .in('id', orderIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (ordersRaw ?? []) as any[]

  const invalid = orders.filter(o =>
    o.runner_id !== runnerId ||
    o.payment_model !== 'runner_funded' ||
    o.status !== 'delivered' ||
    o.platform_settled_at !== null ||
    (o.platform_owed_amount ?? 0) <= 0
  )
  if (invalid.length > 0) {
    return NextResponse.json({
      error: `${invalid.length} order(s) can't be settled — already settled, wrong runner, or not delivered yet.`,
    }, { status: 400 })
  }

  const totalAmount = orders.reduce((s, o) => s + (o.platform_owed_amount ?? 0), 0)

  // Insert settlement row
  const { data: settlementRow, error: settErr } = await admin
    .from('platform_settlements')
    .insert({
      runner_id: runnerId,
      amount: totalAmount,
      order_count: orders.length,
      bank_reference: bankReference?.trim() || null,
      recorded_by: gate.userId,
      note: note?.trim() || null,
    })
    .select('id')
    .single()

  if (settErr || !settlementRow) {
    return NextResponse.json({ error: settErr?.message ?? 'Failed to record settlement' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settlementId = (settlementRow as any).id

  // Stamp orders
  const now = new Date().toISOString()
  await admin
    .from('orders')
    .update({
      platform_settled_at: now,
      platform_settlement_id: settlementId,
    })
    .in('id', orderIds)

  return NextResponse.json({
    success: true,
    settlementId,
    amountSettled: totalAmount,
    orderCount: orders.length,
  })
}
