// app/api/admin/runner-transfers/route.ts
//
// GET  — list pending + recent-paid runner transfers, grouped by runner
// POST — mark selected transfer IDs as sent, stamp the linked order,
//        and advance the order state to runner_funded_awaiting_pickup

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' }
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false as const, status: 403, error: 'Forbidden' }
  return { ok: true as const, userId: user.id }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('runner_transfer_queue')
    .select('*, runner:users!runner_id(full_name, phone), order:orders!order_id(status, delivery_address, restaurant:restaurants(name))')
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (rows ?? []) as any[]

  // Group by runner (matches the visual grouping in the restaurant
  // payments page — one card per recipient with all their pending
  // transfers underneath).
  const byRunner = new Map<string, {
    runner_id: string
    runner_name: string
    runner_phone: string
    pendingAmount: number
    pendingCount: number
    transfers: unknown[]
  }>()

  for (const r of list) {
    const runner = Array.isArray(r.runner) ? r.runner[0] : r.runner
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
    const orderData = Array.isArray(r.order) ? r.order[0] : r.order
    const restaurant = orderData?.restaurant
      ? (Array.isArray(orderData.restaurant) ? orderData.restaurant[0] : orderData.restaurant)
      : null
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
      delivery_address: orderData?.delivery_address ?? '',
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

  // Load the transfers we're about to mark paid — we need the order_ids
  // to advance order state atomically after.
  const { data: transfers } = await admin
    .from('runner_transfer_queue')
    .select('id, order_id, runner_id, amount, order_ref')
    .in('id', transferIds)
    .eq('status', 'pending')

  if (!transfers?.length) {
    return NextResponse.json({ error: 'No pending transfers to mark' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Mark queue rows paid
  await admin
    .from('runner_transfer_queue')
    .update({
      status: 'sent',
      paid_at: now,
      paid_by: gate.userId,
      paystack_ref: paystackRef?.trim() || null,
    })
    .in('id', transferIds)

  // Advance the linked orders to runner_funded_awaiting_pickup and stamp
  // transferred_at on each. Runner will see the "funds sent, go buy" UI.
  for (const t of transfers) {
    await admin
      .from('orders')
      .update({
        status: 'runner_funded_awaiting_pickup',
        runner_funded_transferred_at: now,
      })
      .eq('id', t.order_id)
      .eq('status', 'runner_funded_pending_transfer')

    // Push to runner: funds are in your account, go buy.
    await sendPushToUser(t.runner_id, {
      title: '💸 Funds sent — go buy',
      body: `₦${t.amount.toLocaleString()} for ${t.order_ref} is in your account. Head to the restaurant.`,
      url: `/order/${t.order_id}`,
      tag: 'funds-sent',
    })
  }

  return NextResponse.json({ success: true, marked: transfers.length })
}
