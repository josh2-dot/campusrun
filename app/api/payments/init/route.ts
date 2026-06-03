// app/api/payments/init/route.ts
// Rate limited: max 2 active orders per customer at a time
// Daily cap: admin-configurable via app_config table (0 = unlimited)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/sentry'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'awaiting_runner', 'runner_assigned', 'preparing', 'picked_up']

export async function POST(request: NextRequest) {
  const { orderId, amount, email } = await request.json()

  if (!orderId || !amount || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── 1. Per-customer rate limit (existing) ────────────────────────────────
  const { count: activeCount } = await admin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', user.id)
    .in('status', ACTIVE_STATUSES)

  if ((activeCount ?? 0) >= 2) {
    return NextResponse.json({
      error: 'You already have 2 active orders. Please wait for them to be delivered before placing another.',
    }, { status: 429 })
  }

  // ── 2. Float capacity check ──────────────────────────────────────────────
  // Block new orders if accepting this one would drop float below the safety buffer.
  // Uses a rolling average of recent order costs to estimate impact.
  const { data: balanceRow }     = await admin.from('app_config').select('value').eq('key', 'float_balance').single()
  const { data: bufferRow }      = await admin.from('app_config').select('value').eq('key', 'float_safety_buffer').single()
  const { data: avgCostResult }  = await admin.rpc('estimate_order_net_cost')

  const floatBalance  = parseFloat(balanceRow?.value ?? '0')
  const safetyBuffer  = parseFloat(bufferRow?.value ?? '10000')
  const estCost       = parseFloat(String(avgCostResult ?? '3500'))

  if (floatBalance - estCost < safetyBuffer) {
    captureError(new Error('Float depleted, blocked order'), {
      tags: { event: 'float_depleted' },
      level: 'warning',
      extra: { floatBalance, estCost, safetyBuffer },
    })
    return NextResponse.json({
      error: `We're temporarily at capacity — back to taking orders very soon. Check our WhatsApp status for updates 🙏`,
      code: 'FLOAT_DEPLETED',
    }, { status: 503 })
  }

  // ── 3. Pre-order detection ──────────────────────────────────────────────
  // If restaurant has pre_order_enabled and we're inside the window, tag the
  // order as a pre-order and schedule it for the peak time. The watchdog
  // will activate it (broadcast to runners) at peak time.
  try {
    const { data: orderRow } = await admin
      .from('orders')
      .select('id, restaurant_id, food_total')
      .eq('id', orderId)
      .single()

    if (orderRow?.restaurant_id) {
      const { data: rest } = await admin
        .from('restaurants')
        .select('pre_order_enabled, peak_open_time, pre_order_window_minutes, post_peak_delay_minutes')
        .eq('id', orderRow.restaurant_id)
        .single()

      const { computeWindow } = await import('@/lib/pre-order')
      const state = computeWindow(new Date(), rest ?? {})

      if (state.phase === 'pre_order_open') {
        const poolDate = state.peakAt.toISOString().slice(0, 10)
        let { data: pool } = await admin
          .from('pre_order_pools')
          .select('id, total_orders, total_amount')
          .eq('restaurant_id', orderRow.restaurant_id)
          .eq('pool_date', poolDate)
          .maybeSingle()

        if (!pool) {
          const { data: newPool } = await admin
            .from('pre_order_pools')
            .insert({
              restaurant_id: orderRow.restaurant_id,
              pool_date:     poolDate,
              peak_time:     state.peakAt.toISOString(),
            })
            .select('id, total_orders, total_amount')
            .single()
          pool = newPool
        }

        if (pool) {
          await admin.from('orders').update({
            is_pre_order:      true,
            pre_order_pool_id: pool.id,
            scheduled_for:     state.peakAt.toISOString(),
          }).eq('id', orderId)

          await admin.from('pre_order_pools').update({
            total_orders: (pool.total_orders ?? 0) + 1,
            total_amount: (pool.total_amount ?? 0) + (orderRow.food_total ?? 0),
          }).eq('id', pool.id)
        }
      }
    }
  } catch (err) {
    console.error('[pre-order tagging]', err)
    // Non-fatal: order proceeds as immediate.
  }

  // ── 4. Paystack initialization ─────────────────────────────────────────
  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amount * 100,
        reference: `CR_${orderId}_${Date.now()}`,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/callback`,
        metadata: { order_id: orderId },
        channels: ['bank_transfer', 'ussd', 'card'],
      }),
    })

    const data = await res.json()

    if (!data.status) {
      return NextResponse.json({ error: data.message }, { status: 400 })
    }

    await supabase.from('payments').insert({
      order_id: orderId,
      paystack_ref: data.data.reference,
      amount,
      status: 'pending',
      channel: 'transfer',
    })

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    })
  } catch {
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}
