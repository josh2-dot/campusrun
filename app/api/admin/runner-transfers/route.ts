// app/api/admin/runner-transfers/route.ts
//
// GET  — list pending + recent-paid runner transfers, grouped by runner
// POST — mark selected transfer IDs as sent, stamp the linked order,
//        and advance the order state to runner_funded_awaiting_pickup
//
// Uses explicit lookups instead of PostgREST joins. The previous version
// used `.select('*, runner:users!runner_id(...), order:orders!order_id(...)')`
// which depends on PostgREST's schema cache detecting the foreign keys
// on runner_transfer_queue. When the migration is run against a live
// project, the schema cache doesn't automatically pick up the new FKs
// until someone runs `NOTIFY pgrst, 'reload schema'` or hits "Reload
// schema cache" in the Supabase dashboard. Until then, the joined
// select fails silently and the admin page shows nothing even when
// there are queued transfers. Explicit lookups don't have that failure
// mode.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

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

  // 1. Pull raw queue rows — no joins, so this works regardless of the
  //    PostgREST schema cache state.
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

  // If genuinely empty, return early — no need to hit the other tables.
  if (rows.length === 0) {
    return NextResponse.json({ runners: [], totalPending: 0 })
  }

  // 2. Explicit lookups. Batch by unique IDs to keep this O(3 queries)
  //    regardless of how many transfers exist.
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

  // 3. Group by runner. Same shape as before so the client doesn't change.
  const byRunner = new Map<string, {
    runner_id: string
    runner_name: string
    runner_phone: string
    pendingAmount: number
    pendingCount: number
    transfers: unknown[]
  }>()

  for (const r of rows) {
    const runner = userById.get(r.runner_id)
    if (!byRunner.has(r.runner_id)) {
      byRunner.set(r.runner_id, {
        runner_id: r.runner_id,
        runner_name: runner?.full_name ?? 'Unknown',
        runner_phone: runner?.phone ?? '',
        pendingAmount: 0,
        pendingCount: 0,
        transfers: [],
      })
    }
    const group = byRunner.get(r.runner_id)!
    if (r.status === 'pending') {
      group.pendingAmount += r.amount
      group.pendingCount += 1
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
      bank_name: r.bank_name,
      account_number: r.account_number,
      account_name: r.account_name,
      restaurant_name: restaurant?.name ?? '',
      delivery_address: order?.delivery_address ?? '',
    })
  }

  const runners = Array.from(byRunner.values())
  const totalPending = runners.reduce((s, r) => s + r.pendingAmount, 0)

  return NextResponse.json({ runners, totalPending })
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { transferIds, paystackRef } = await request.json() as {
    transferIds: string[]; paystackRef?: string
  }

  if (!Array.isArray(transferIds) || transferIds.length === 0) {
    return NextResponse.json({ error: 'No transfers selected' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: transfersRaw } = await admin
    .from('runner_transfer_queue')
    .select('id, order_id, runner_id, amount, order_ref')
    .in('id', transferIds)
    .eq('status', 'pending')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transfers = (transfersRaw ?? []) as any[]

  if (!transfers.length) {
    return NextResponse.json({ error: 'No pending transfers to mark' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await admin
    .from('runner_transfer_queue')
    .update({
      status: 'sent',
      paid_at: now,
      paid_by: gate.userId,
      paystack_ref: paystackRef?.trim() || null,
    })
    .in('id', transferIds)

  for (const t of transfers) {
    await admin
      .from('orders')
      .update({
        status: 'runner_funded_awaiting_pickup',
        runner_funded_transferred_at: now,
      })
      .eq('id', t.order_id)
      .eq('status', 'runner_funded_pending_transfer')

    await sendPushToUser(t.runner_id, {
      title: '💸 Funds sent — go buy',
      body: `₦${t.amount.toLocaleString()} for ${t.order_ref} is in your account. Head to the restaurant.`,
      url: `/order/${t.order_id}`,
      tag: 'funds-sent',
    })
  }

  return NextResponse.json({ success: true, marked: transfers.length })
}
