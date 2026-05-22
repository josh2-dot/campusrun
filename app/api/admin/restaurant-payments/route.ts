// app/api/admin/restaurant-payments/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin') return null
  return user
}

/* ── GET — return the transfer queue grouped by restaurant ──
   Response:
   {
     restaurants: [{
       restaurant_id, restaurant_name, bank_name, account_number, account_name,
       pendingAmount, pendingCount,
       transfers: [{ id, order_ref, amount, status, created_at, paid_at, paid_ref }]
     }],
     totalPending: number
   }
*/
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: queue } = await admin
    .from('restaurant_transfer_queue')
    .select('*, restaurant:restaurants(id, name, bank_name, account_number, account_name)')
    .order('created_at', { ascending: false })

  // Group by restaurant
  const byRestaurant: Record<string, {
    restaurant_id:   string
    restaurant_name: string
    bank_name:       string | null
    account_number:  string | null
    account_name:    string | null
    pendingAmount:   number
    pendingCount:    number
    transfers:       unknown[]
  }> = {}

  for (const row of queue ?? []) {
    const r = row.restaurant as {
      id: string; name: string
      bank_name?: string; account_number?: string; account_name?: string
    } | null

    const rid = r?.id ?? row.restaurant_id
    if (!byRestaurant[rid]) {
      byRestaurant[rid] = {
        restaurant_id:   rid,
        restaurant_name: r?.name ?? 'Unknown',
        bank_name:       r?.bank_name ?? null,
        account_number:  r?.account_number ?? null,
        account_name:    r?.account_name ?? null,
        pendingAmount:   0,
        pendingCount:    0,
        transfers:       [],
      }
    }

    byRestaurant[rid].transfers.push({
      id:         row.id,
      order_ref:  row.order_ref,
      amount:     row.amount,
      status:     row.status,
      created_at: row.created_at,
      paid_at:    row.paid_at ?? null,
      paid_ref:   row.paid_ref ?? null,
    })

    if (row.status === 'pending') {
      byRestaurant[rid].pendingAmount += row.amount ?? 0
      byRestaurant[rid].pendingCount  += 1
    }
  }

  const restaurants = Object.values(byRestaurant)
    .sort((a, b) => b.pendingAmount - a.pendingAmount)

  const totalPending = restaurants.reduce((s, r) => s + r.pendingAmount, 0)

  return NextResponse.json({ restaurants, totalPending })
}

/* ── POST — mark one or more transfers as paid ──
   Body: { transferIds: string[], paidRef: string }
*/
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { transferIds, paidRef } = await request.json()
  if (!transferIds?.length) {
    return NextResponse.json({ error: 'No transfer IDs provided' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Mark queue entries as paid
  const { error: queueError } = await admin
    .from('restaurant_transfer_queue')
    .update({ status: 'paid', paid_at: now, paid_ref: paidRef?.trim() || null })
    .in('id', transferIds)

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 })
  }

  // Mirror onto the orders table for the payment proof card
  const { data: transfers } = await admin
    .from('restaurant_transfer_queue')
    .select('order_id, amount')
    .in('id', transferIds)

  if (transfers?.length) {
    await Promise.allSettled(
      transfers.map(t =>
        admin.from('orders').update({
          restaurant_paid:    true,
          restaurant_paid_at: now,
          transfer_ref:       paidRef?.trim() || null,
          transfer_amount:    t.amount,
          transferred_at:     now,
        }).eq('id', t.order_id)
      )
    )
  }

  return NextResponse.json({ success: true, count: transferIds.length })
}
