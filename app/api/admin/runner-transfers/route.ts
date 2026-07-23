// app/api/admin/runner-transfers/route.ts
//
// Audit view of runner transfers. No longer supports a mark-paid
// action — transfers now fire automatically via Paystack when the
// runner accepts (see app/api/payments/transfer/runner.ts). The
// admin page is read-only.
//
// Uses explicit lookups instead of PostgREST joins so this doesn't
// depend on the schema cache being current (see 001 → 003 fix arc).

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' }
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((profile as any)?.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }
  return { ok: true as const, userId: user.id }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const admin = createAdminClient()

  const { data: rowsRaw, error: queueError } = await admin
    .from('runner_transfer_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (queueError) {
    return NextResponse.json(
      { error: `Failed to load queue: ${queueError.message}`, runners: [], totalPending: 0 },
      { status: 500 }
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (rowsRaw ?? []) as any[]

  if (rows.length === 0) {
    return NextResponse.json({ runners: [], totalPending: 0 })
  }

  const runnerIds = Array.from(new Set(rows.map(r => r.runner_id).filter(Boolean)))
  const orderIds  = Array.from(new Set(rows.map(r => r.order_id).filter(Boolean)))

  const [{ data: usersData }, { data: ordersData }] = await Promise.all([
    admin.from('users').select('id, full_name, phone').in('id', runnerIds),
    admin.from('orders').select('id, status, delivery_address, restaurant_id').in('id', orderIds),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (usersData ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (ordersData ?? []) as any[]

  const restaurantIds = Array.from(new Set(orders.map(o => o.restaurant_id).filter(Boolean)))
  const { data: restaurantsData } = restaurantIds.length
    ? await admin.from('restaurants').select('id, name').in('id', restaurantIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurants = (restaurantsData ?? []) as any[]

  const userById = new Map(users.map(u => [u.id, u]))
  const orderById = new Map(orders.map(o => [o.id, o]))
  const restaurantById = new Map(restaurants.map(r => [r.id, r]))

  // Group by runner. Now that "pending" is a rare in-flight state (not
  // an admin-action state), the grouping still gives useful audit
  // structure — per-runner totals + a chronological transfer list.
  const byRunner = new Map<string, {
    runner_id: string
    runner_name: string
    runner_phone: string
    inFlightAmount: number
    inFlightCount: number
    completedAmount: number
    completedCount: number
    failedCount: number
    transfers: unknown[]
  }>()

  for (const r of rows) {
    const runner = userById.get(r.runner_id)
    if (!byRunner.has(r.runner_id)) {
      byRunner.set(r.runner_id, {
        runner_id: r.runner_id,
        runner_name: runner?.full_name ?? 'Unknown',
        runner_phone: runner?.phone ?? '',
        inFlightAmount: 0,
        inFlightCount: 0,
        completedAmount: 0,
        completedCount: 0,
        failedCount: 0,
        transfers: [],
      })
    }
    const group = byRunner.get(r.runner_id)!
    if (r.status === 'pending' || r.status === 'sent') {
      group.inFlightAmount += r.amount
      group.inFlightCount += 1
    } else if (r.status === 'success') {
      group.completedAmount += r.amount
      group.completedCount += 1
    } else if (r.status === 'failed' || r.status === 'reversed') {
      group.failedCount += 1
    }
    const order = orderById.get(r.order_id)
    const restaurant = order?.restaurant_id ? restaurantById.get(order.restaurant_id) : null
    group.transfers.push({
      id: r.id,
      order_id: r.order_id,
      order_ref: r.order_ref,
      amount: r.amount,
      status: r.status,
      created_at: r.created_at,
      paid_at: r.paid_at,
      paystack_ref: r.paystack_ref,
      paystack_transfer_code: r.paystack_transfer_code,
      failure_reason: r.failure_reason,
      bank_name: r.bank_name,
      account_number: r.account_number,
      account_name: r.account_name,
      restaurant_name: restaurant?.name ?? '',
      delivery_address: order?.delivery_address ?? '',
    })
  }

  const runners = Array.from(byRunner.values())
  const totalInFlight = runners.reduce((s, r) => s + r.inFlightAmount, 0)

  return NextResponse.json({ runners, totalInFlight })
}

